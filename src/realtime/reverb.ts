import { GameState } from '../game/types';
import { Roster } from '../api/matches';
import { API_BASE } from '../api/client';

// Reverb (Pusher protocol) client built on the RN global WebSocket. No
// pusher-js / laravel-echo — the raw protocol is small and verified.

const REVERB_KEY = process.env.EXPO_PUBLIC_REVERB_KEY ?? 'jvewsd30okhnkoxoxuow';

// Derive the ws + broadcasting-auth hosts from the API base so there's one
// source of truth. API_BASE looks like "https://host/api".
const HOST = API_BASE.replace(/^https?:\/\//, '').replace(/\/api\/?$/, '');
const WS_URL = `wss://${HOST}/app/${REVERB_KEY}?protocol=7&client=js&version=8.4.0`;
const AUTH_URL = `https://${HOST}/broadcasting/auth`;

export interface GameStatePayload {
  state: GameState;
}
export interface RoomStatePayload {
  roster: Roster;
}
export interface AwardedPayload {
  winnerUserId: number | null;
  coins: number;
}
export interface ChatPayload {
  fromUserId: string | number;
  fromName: string;
  text: string;
}

export interface ReverbCallbacks {
  onGameState?: (payload: GameStatePayload) => void;
  onRoomState?: (payload: RoomStatePayload) => void;
  onAwarded?: (payload: AwardedPayload) => void;
  onChat?: (payload: ChatPayload) => void;
  onStatus?: (status: 'connecting' | 'connected' | 'subscribed' | 'closed') => void;
}

interface PusherMessage {
  event: string;
  channel?: string;
  data?: unknown;
}

const MAX_BACKOFF_MS = 8000;
const BASE_BACKOFF_MS = 1000;
// Heartbeat: ping this often, and if no message arrives within the dead window,
// assume the socket died silently (common on mobile) and force a reconnect.
const HEARTBEAT_MS = 20000;
const DEAD_AFTER_MS = 32000;

export class ReverbClient {
  private ws: WebSocket | null = null;
  private socketId: string | null = null;
  private closed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = 0;
  private readonly channel: string;

  constructor(
    private matchId: string,
    private token: string,
    private callbacks: ReverbCallbacks
  ) {
    this.channel = `private-match.${matchId}`;
  }

  connect(): void {
    this.closed = false;
    this.open();
  }

  private open(): void {
    this.callbacks.onStatus?.('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onmessage = (e) => this.handleMessage(e);
    ws.onclose = () => {
      this.stopHeartbeat();
      this.callbacks.onStatus?.('closed');
      if (!this.closed) this.scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose fires after onerror; reconnect is handled there.
    };
  }

  // Proactively ping so the connection stays active, and detect a socket that
  // has died without firing onclose (mobile networks do this): if nothing has
  // arrived within DEAD_AFTER_MS, drop it and reconnect.
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastActivity = Date.now();
    this.heartbeatTimer = setInterval(() => {
      if (this.closed) return;
      if (Date.now() - this.lastActivity > DEAD_AFTER_MS) {
        // Presumed dead — tear down and reconnect from scratch.
        this.stopHeartbeat();
        if (this.ws) {
          this.ws.onclose = null;
          try {
            this.ws.close();
          } catch {
            /* ignore */
          }
          this.ws = null;
        }
        this.callbacks.onStatus?.('closed');
        this.scheduleReconnect();
        return;
      }
      this.send({ event: 'pusher:ping' });
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleMessage(e: WebSocketMessageEvent): void {
    // Any inbound frame proves the socket is alive.
    this.lastActivity = Date.now();

    let msg: PusherMessage;
    try {
      msg = JSON.parse(typeof e.data === 'string' ? e.data : '');
    } catch {
      return;
    }

    switch (msg.event) {
      case 'pusher:connection_established': {
        const data = this.parseData<{ socket_id: string }>(msg.data);
        this.socketId = data?.socket_id ?? null;
        this.reconnectAttempts = 0;
        this.callbacks.onStatus?.('connected');
        this.startHeartbeat();
        void this.subscribe();
        return;
      }
      case 'pusher:ping':
        this.send({ event: 'pusher:pong' });
        return;
      case 'pusher:pong':
        // Our heartbeat was answered — nothing to do (activity already noted).
        return;
      case 'pusher_internal:subscription_succeeded':
        if (msg.channel === this.channel) {
          this.callbacks.onStatus?.('subscribed');
        }
        return;
      case 'gameState': {
        const payload = this.parseData<GameStatePayload>(msg.data);
        if (payload) this.callbacks.onGameState?.(payload);
        return;
      }
      case 'roomState': {
        const payload = this.parseData<RoomStatePayload>(msg.data);
        if (payload) this.callbacks.onRoomState?.(payload);
        return;
      }
      case 'awarded': {
        const payload = this.parseData<AwardedPayload>(msg.data);
        if (payload) this.callbacks.onAwarded?.(payload);
        return;
      }
      case 'chat': {
        const payload = this.parseData<ChatPayload>(msg.data);
        if (payload) this.callbacks.onChat?.(payload);
        return;
      }
      default:
        return;
    }
  }

  // Reverb sends event `data` as a JSON-encoded string; parse defensively in
  // case a server ever sends it pre-parsed.
  private parseData<T>(data: unknown): T | null {
    if (data == null) return null;
    if (typeof data === 'string') {
      try {
        return JSON.parse(data) as T;
      } catch {
        return null;
      }
    }
    return data as T;
  }

  private async subscribe(): Promise<void> {
    if (!this.socketId) return;
    let auth: string;
    try {
      const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          socket_id: this.socketId,
          channel_name: this.channel,
        }),
      });
      if (!res.ok) {
        this.scheduleReconnect();
        return;
      }
      const json = (await res.json()) as { auth: string };
      auth = json.auth;
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.send({
      event: 'pusher:subscribe',
      data: { auth, channel: this.channel },
    });
  }

  private send(obj: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;
    const delay = Math.min(
      MAX_BACKOFF_MS,
      BASE_BACKOFF_MS * 2 ** this.reconnectAttempts
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) this.open();
    }, delay);
  }

  close(): void {
    this.closed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }
}
