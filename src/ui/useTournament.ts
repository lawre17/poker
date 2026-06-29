import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../api/auth';
import { Roster } from '../api/matches';
import {
  getTournament,
  leaveTournament,
  startTournament,
  TournamentSummary,
} from '../api/tournaments';
import {
  ReverbClient,
  TournamentFinishedPayload,
} from '../realtime/reverb';

export type TournamentConnStatus =
  | 'connecting'
  | 'connected'
  | 'subscribed'
  | 'closed';

interface UseTournamentArgs {
  tournamentId: string;
  // Seed summary from the create/join response so the board renders instantly.
  initial?: TournamentSummary | null;
}

/**
 * Live tournament state: the authoritative summary (pushed over the tournament
 * channel + polled as a self-heal), the caller's current table to play
 * (`myMatchId`), and the final result once a champion is crowned.
 */
export function useTournament({ tournamentId, initial }: UseTournamentArgs) {
  const { token, user, refreshMe } = useAuth();
  const [summary, setSummary] = useState<TournamentSummary | null>(
    initial ?? null
  );
  const [myMatchId, setMyMatchId] = useState<string | null>(null);
  const [finished, setFinished] = useState<TournamentFinishedPayload | null>(
    null
  );
  const [status, setStatus] = useState<TournamentConnStatus>('connecting');
  // Rosters seen in matchReady, so entering a table renders with names at once.
  const [tableRosters, setTableRosters] = useState<Record<string, Roster>>({});

  const selfUserId = user != null ? Number(user.id) : -1;

  const refresh = useCallback(() => {
    getTournament(tournamentId)
      .then((res) => {
        setSummary(res.tournament);
        setMyMatchId(res.myMatchId);
        if (res.tournament.status === 'finished') {
          // Refresh the wallet in case a prize landed.
          void refreshMe();
        }
      })
      .catch(() => {});
  }, [tournamentId, refreshMe]);

  // Tournament channel.
  useEffect(() => {
    if (!token) return;
    const client = new ReverbClient(
      tournamentId,
      token,
      {
        onTournamentUpdate: (p) => setSummary(p.tournament),
        onTournamentMatchReady: (p) => {
          setTableRosters((prev) => {
            const next = { ...prev };
            for (const t of p.tables) next[t.matchId] = t.roster;
            return next;
          });
          const mine = p.tables.find((t) => t.userIds.includes(selfUserId));
          setMyMatchId(mine ? mine.matchId : null);
        },
        onTournamentFinished: (p) => {
          setFinished(p);
          void refreshMe();
        },
        onStatus: setStatus,
      },
      `private-tournament.${tournamentId}`
    );
    client.connect();
    return () => client.close();
  }, [tournamentId, token, selfUserId, refreshMe]);

  // Initial + periodic self-heal poll, plus an immediate pull on foreground.
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (finished || summary?.status === 'finished') return;
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh, finished, summary?.status]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const busyRef = useRef(false);
  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const res = await startTournament(tournamentId);
      setSummary(res);
    } catch {
      /* surfaced by the caller via a refresh */
    } finally {
      busyRef.current = false;
    }
  }, [tournamentId]);

  const leave = useCallback(async () => {
    await leaveTournament(tournamentId).catch(() => {});
  }, [tournamentId]);

  const myStatus =
    summary?.players.find((p) => p.userId === selfUserId)?.status ?? null;

  return {
    summary,
    myMatchId,
    setMyMatchId,
    tableRosters,
    finished,
    status,
    myStatus,
    selfUserId,
    start,
    leave,
    refresh,
  };
}
