# Kadi Engine (private localhost HTTP)

A **private** authoritative engine for the Kadi card game, exposed as a small
HTTP API on `127.0.0.1`. It is called **only by the Laravel backend** over
localhost — game clients never touch it. The service holds no rules of its own:
all logic comes from the imported engine (`../src/game/`: `createGame`,
`applyMove`, `decideMove`).

There is **no WebSocket server, no Reverb client, and no outbound HTTP**. Laravel
owns all client broadcasting, move pacing, and coin awards. This service just:

- holds rooms / matches in memory,
- applies a human move authoritatively, then **synchronously** applies every
  following AI move,
- returns the resulting list of `GameState`s.

Node + TypeScript + Express, run directly via `tsx` (no build step).

## Running

```bash
cd server
npm install
npm run dev      # tsx watch (auto-reload)
# or
npm start        # tsx, one-shot
```

Binds to `http://127.0.0.1:3001` by default (`PORT` env to change). Because it
binds to loopback only, it is not reachable off the host.

### Test

```bash
cd server
npm test         # boots the app in-process and drives the HTTP API to a finish
```

## Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `3001` | HTTP listen port (bound to `127.0.0.1`) |
| `INTERNAL_SECRET` | `dev-kadi-secret-change-me` | Required value of the `X-Internal-Secret` request header |

## Auth

Every request must carry the header `X-Internal-Secret: <INTERNAL_SECRET>`.
Requests without a matching secret get `403 Forbidden`. This is the only
gate — Laravel is the sole trusted caller and is responsible for authenticating
end users before relaying their actions here.

## HTTP API

All bodies and responses are JSON.

A **roster** is `[{ userId, name, seatIndex, engineId, isAI }]`. Engine ids
follow seat order: humans are `p0, p1, …`, AI seats are `ai0, ai1, …`. The
`engineId <-> userId` mapping is what resolves a winning engine id back to a real
user.

### `POST /rooms`

Create a room. Host takes seat 0; `aiOpponents` (clamped 0–3) AI seats are
reserved.

- Body: `{ hostUserId, hostName, settings?, aiOpponents? }`
- `201` → `{ code, matchId, roster }` (`code` is a 5-char uppercase code,
  `matchId` is a uuid)

### `POST /rooms/:code/join`

Add a human at the next human seat.

- Body: `{ userId, name }`
- `200` → `{ matchId, roster }`
- `404` room not found · `409` already started / full / user already joined

### `POST /rooms/:code/start`

Host starts the game. Builds the `PlayerConfig[]` from the roster (humans by seat
order, then the AI seats) and calls `createGame`.

- Body: `{ userId }`
- `200` → `{ matchId, states: [<initial GameState>], roster }`
- `403` non-host · `404` room not found · `409` already started / < 2 players

### `POST /matches/:matchId/move`

Apply a human `Move`. Verifies it's that user's turn, applies it, then — while the
game is live and the current seat is an AI — synchronously applies
`decideMove(state)` and appends each resulting state. **No timers**; Laravel paces
the broadcast of the returned states.

- Body: `{ userId, move }` (`move` is the engine `Move`:
  `play` / `playSequence` / `draw` / `skipTurn` / `announceKadi`)
- `200` → `{ states, finished, winnerUserId }`
  - `states` — the human's resulting state plus one per AI follow-up step
    (always non-empty)
  - `finished` — whether the game ended
  - `winnerUserId` — the human winner's id, or `null` (unfinished, or an AI won)
- `404` match not found · `409` not in progress / not your turn · `422` illegal
  move (see below)

### `GET /matches/:matchId/state`

- `200` → `{ state, roster }`
- `404` match not found

## Notes / behaviour

- **No-op illegal moves (422):** `applyMove` throws on most illegal moves, but
  for some it returns the *same* state object unchanged (e.g. playing while
  awaiting an announce). A `next === prev` result on a non-finished state is
  treated as a rejection and returned as `422` with the engine's message.
- **Synchronous AI loop:** after a human move, every consecutive AI seat is
  resolved in the same request and each step appended to `states[]`. A
  one-human-vs-AI game therefore returns multiple states from a single move.
- **Winner resolution:** `winnerUserId` is resolved from `state.winnerId`
  (an engine id) via the roster, and is `null` when an AI seat won — coins are a
  Laravel concern and humans-only.
- **In-memory only:** rooms/matches live in process memory and are lost on
  restart.

## Known v1 limitations

- The full `GameState` (including every player's hand) is returned. Laravel is
  responsible for redacting hands per-player before relaying to clients.
- No turn timeout: a match waits indefinitely on whichever human is on turn.
