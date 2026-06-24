# Kadi Online — Architecture & Build Plan

Status: **design locked** · Last updated: 2026-06-24

Adds three things to the existing single-player Kadi app:

1. **User accounts** (register / login)
2. **Coins** — earn **+100 on every win**
3. **Online multiplayer** — play over the internet (same-wifi/offline-LAN is a later phase)

## Decisions locked

| Decision | Choice | Why |
|---|---|---|
| Backend stack | **Laravel** | System-of-record: auth, coins, matchmaking. Owner's strongest stack. |
| Game authority | **Option C — Node game service** | Reuses the TS engine verbatim AND keeps server authority (cheat-proof coins). |
| First milestone | Cloud-only (internet required) | Offline-LAN deferred to Phase 5. |
| Build order | Multiplayer-first, full design up front | Networking is the hardest, most structural part. |

## The core constraint: who runs the rules?

PHP cannot run the TypeScript engine (`src/game/`), which is pure, deterministic,
and validated by 8,000 sims. Reimplementing Kadi's rules in PHP would duplicate
and risk drift on that validated logic. So **we reuse the TS engine** — the only
question was *where it runs authoritatively*. Options considered:

- **A. Reimplement rules in PHP** — rejected: throws away a validated engine.
- **B. Host-client authority** — one phone runs the engine; Laravel relays.
  Lightest, but the host is trusted, so coin-fraud is possible.
- **C. Node game service (CHOSEN)** — a thin Node process imports `src/game/`
  and runs `applyMove` authoritatively; Laravel owns accounts/coins/matchmaking.
  Server authority + zero rule reimplementation.

The Node service contains **no game logic of its own** — it imports the existing
engine, holds rooms in memory, runs `applyMove` per move, broadcasts state, and
calls Laravel to award coins on a win.

## System shape (Option C)

```
┌─────────────┐   REST (Sanctum token)   ┌──────────────────────────┐
│ Expo client │ ───── login, coins, ────► │ Laravel API              │
│ (RN app)    │       rooms, profile      │  • Sanctum auth (mobile) │
│             │                           │  • users, coins, matches │
│  src/game/  │ ◄── WebSocket (state) ──┐ │  • /internal/award-win   │◄┐
└─────────────┘     moves ──────────────┘ └──────────────────────────┘ │
       │                                                                │
       │            WebSocket (moves/state)        ┌───────────────────┐│
       └──────────────────────────────────────────► Node game service ││
                                                   │  • imports        ││
                                                   │    src/game/      ││
                                                   │  • applyMove auth ││
                                                   │  • rooms in RAM   │┘
                                                   └───────────────────┘
                                                    award-win callback ─┘
```

The client keeps `src/game/` for **rendering and optimistic UI**, but the Node
service's `applyMove` is the **source of truth** — same engine, two roles, no drift.

## Data model (Laravel / MySQL)

- **users** — id, name, email, password, `coins` (default 0), `wins`, `losses`, timestamps.
  Fresh single-tenant app — token auth, not the multitenancy cookie pattern.
- **matches** — id, status (`lobby`/`playing`/`finished`), host_user_id,
  settings (stacking/assisted), winner_user_id, started/finished_at.
- **match_players** — match_id, user_id, seat_index, is_ai, result.
- **coin_transactions** — user_id, match_id, amount (+100), reason.
  Ledger → balances are auditable and idempotent (never double-award a match).

## Auth (mobile)

Laravel **Sanctum personal-access-tokens** (not the cookie/SPA flow). Client stores
the token in `expo-secure-store`, sends `Authorization: Bearer …`. Covered by the
`expo-data-fetching` skill (fetch wrapper + SecureStore + React Query).
**Registration is enabled** here (unlike the owner's other Laravel project).

## Realtime protocol

- Client → server: `joinRoom`, `move` (existing `Move` type — already serializable), `leave`.
- Server → clients: `roomState` (lobby/players), `gameState` (full `GameState`
  after each `applyMove`), `error`.
- Send the **whole `GameState`** each turn (it's small); optimize to deltas only if needed.

## Engine changes needed (small — already shaped right)

1. **Extract authority out of the client.** Add a **networked mode** to `useGame`:
   human moves are *sent*; state arrives *from the server*. The hook's public API
   stays nearly identical, so `GameScreen` barely changes.
2. **AI runs server-side** in networked games (`decideMove` is pure — moves with the engine).
3. **Win → coins.** Server detects `phase==='finished'` + `winnerId`, maps to a user,
   calls Laravel `/internal/award-win` (idempotent via match_id): +100 coins, ledger
   entry, broadcast new balance.

## Client additions

- **Auth screens** (login/register) gating Home.
- **Lobby/matchmaking**: create room → share code, or quick match; ready-up; start.
- **Networked game**: `GameScreen` driven by server `gameState`.
- Single-player vs AI stays as-is (offline). Coin policy for offline wins: TBD
  (lean multiplayer-only, or a smaller offline reward — offline wins are trivially fakeable).

## Phased build plan

- **Phase 1 — Laravel backend**: new app, Sanctum auth, users+coins+matches+ledger
  migrations, REST endpoints (`/register`, `/login`, `/me`, `/matches`…),
  `/internal/award-win`. Testable with curl; no app changes yet.
- **Phase 2 — Node game service**: WebSocket server importing `src/game/`, in-RAM
  rooms, authoritative `applyMove`, server-side AI, award-win callback. Drive it with
  a script reusing `scripts/simulate.ts` over the wire.
- **Phase 3 — Client auth + coins**: login/register screens, SecureStore token, Home
  shows coins/wins. (Accounts + coins work end-to-end here.)
- **Phase 4 — Client multiplayer**: lobby, networked `useGame`, real 2-human cloud game.
- **Phase 5 (later) — offline-LAN**: reuse the Node service as a LAN host (or fall back
  to host-client mode). Coins sync when back online.

## Open flags

- **Hosting**: needs a deployed Laravel app + Node service + a WS endpoint
  (Reverb or plain ws). Decide target (VPS vs existing infra) before Phase 1 ships.
- **Expo version**: `package.json` is SDK **54**; `AGENTS.md` says read **v56** docs.
  Reconcile before writing client code in Phase 3.
- **Offline-win coin policy**: multiplayer-only vs smaller offline reward — decide before Phase 3.
