// Private localhost HTTP "engine" for the Kadi card game.
//
// This Node service is called ONLY by the Laravel backend over localhost HTTP.
// It has no WebSocket server and makes no outbound calls: Laravel handles all
// client broadcasting, pacing, and coin awards. This service just holds rooms /
// matches in memory, applies moves authoritatively (a human move plus every
// following AI move, synchronously), and returns the resulting states.
//
// All requests must carry `X-Internal-Secret: <INTERNAL_SECRET>` or get a 403.
// The server binds to 127.0.0.1 only.

import express, { type NextFunction, type Request, type Response } from 'express';
import {
  applyHumanMove,
  createRoom,
  EngineApiError,
  getState,
  joinRoom,
  startGame,
} from './rooms.js';

const PORT = Number(process.env.PORT ?? 3001);
const INTERNAL_SECRET =
  process.env.INTERNAL_SECRET ?? 'dev-kadi-secret-change-me';

export function createApp(secret: string = INTERNAL_SECRET) {
  const app = express();
  app.use(express.json());

  // Shared-secret guard. Laravel is the only caller; clients never touch this.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.header('X-Internal-Secret') !== secret) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    next();
  });

  // POST /rooms — create a room. Host takes seat 0; aiOpponents AI seats reserved.
  app.post('/rooms', (req: Request, res: Response) => {
    const { hostUserId, hostName, settings, aiOpponents } = req.body ?? {};
    if (!hostUserId || !hostName) {
      res.status(400).json({ error: 'hostUserId and hostName are required.' });
      return;
    }
    const result = createRoom({
      hostUserId: String(hostUserId),
      hostName: String(hostName),
      settings,
      aiOpponents,
    });
    res.status(201).json(result);
  });

  // POST /rooms/:code/join — add a human at the next human seat.
  app.post('/rooms/:code/join', (req: Request, res: Response) => {
    const { userId, name } = req.body ?? {};
    if (!userId || !name) {
      res.status(400).json({ error: 'userId and name are required.' });
      return;
    }
    const result = joinRoom(String(req.params.code), {
      userId: String(userId),
      name: String(name),
    });
    res.json(result);
  });

  // POST /rooms/:code/start — host starts the game; returns the initial state.
  app.post('/rooms/:code/start', (req: Request, res: Response) => {
    const { userId } = req.body ?? {};
    if (!userId) {
      res.status(400).json({ error: 'userId is required.' });
      return;
    }
    const result = startGame(String(req.params.code), String(userId));
    res.json(result);
  });

  // POST /matches/:matchId/move — apply a human move + all following AI moves.
  app.post('/matches/:matchId/move', (req: Request, res: Response) => {
    const { userId, move } = req.body ?? {};
    if (!userId || !move) {
      res.status(400).json({ error: 'userId and move are required.' });
      return;
    }
    const result = applyHumanMove(String(req.params.matchId), String(userId), move);
    res.json(result);
  });

  // GET /matches/:matchId/state — current state + roster.
  app.get('/matches/:matchId/state', (req: Request, res: Response) => {
    const result = getState(String(req.params.matchId));
    res.json(result);
  });

  // Map EngineApiError -> its status; everything else -> 500.
  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof EngineApiError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('[kadi] unhandled error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  );

  return app;
}

// Boot only when run directly (not when imported by tests).
const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const app = createApp();
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[kadi] private engine listening on http://127.0.0.1:${PORT}`);
  });
}
