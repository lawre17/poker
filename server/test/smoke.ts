// Smoke test for the private Kadi engine HTTP API.
//
// Boots the express app in-process on an ephemeral 127.0.0.1 port and drives it
// over HTTP with fetch. Reuses the engine's own decideMove to pick a guaranteed
// legal move for whichever human is on turn.
//
// Asserts:
//  - the X-Internal-Secret guard returns 403 without the header
//  - a 2-human / 0-AI game reaches finished with a non-null winnerUserId
//  - every accepted move returns a non-empty states[]
//  - a 1-human-on-turn move WITH an AI seat can return multiple states (the
//    synchronous AI follow-up loop)
//
// Run: npm test

import type { AddressInfo } from 'node:net';
import { decideMove } from '../../src/game/ai.js';
import type { GameState, Move } from '../../src/game/types';
import { createApp } from '../src/index.js';
import { pruneRooms } from '../src/rooms.js';

const SECRET = 'test-secret-123';

let failed = false;
function assert(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failed = true;
    console.error(`  FAIL  ${label}`);
  }
}

interface Roster {
  userId: string;
  name: string;
  seatIndex: number;
  engineId: string;
  isAI: boolean;
}

async function main(): Promise<void> {
  const app = createApp(SECRET);
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  async function call(
    method: string,
    path: string,
    body?: unknown,
    secret: string | null = SECRET
  ): Promise<{ status: number; json: any }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (secret !== null) headers['X-Internal-Secret'] = secret;
    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  console.log(`Engine listening on ${base}`);

  // ---- 1. secret guard ----
  const noSecret = await call('POST', '/rooms', { hostUserId: 'x', hostName: 'X' }, null);
  assert(noSecret.status === 403, `missing secret -> 403 (got ${noSecret.status})`);
  const badSecret = await call('POST', '/rooms', { hostUserId: 'x', hostName: 'X' }, 'wrong');
  assert(badSecret.status === 403, `wrong secret -> 403 (got ${badSecret.status})`);

  // ---- 2. full 2-human / 0-AI game to completion ----
  console.log('\n[case A] 2 humans, 0 AI — play to finish');
  const created = await call('POST', '/rooms', {
    hostUserId: 'u-alice',
    hostName: 'Alice',
    aiOpponents: 0,
  });
  assert(created.status === 201, `create room -> 201 (got ${created.status})`);
  const code: string = created.json.code;
  const matchId: string = created.json.matchId;
  assert(typeof code === 'string' && code.length === 5, `room code is 5 chars (${code})`);
  assert(created.json.roster.length === 1, 'roster has just the host (1)');

  const joined = await call('POST', `/rooms/${code}/join`, {
    userId: 'u-bob',
    name: 'Bob',
  });
  assert(joined.status === 200, `bob join -> 200 (got ${joined.status})`);
  assert(joined.json.roster.length === 2, 'roster has 2 humans after join');

  // duplicate join rejected
  const dup = await call('POST', `/rooms/${code}/join`, { userId: 'u-bob', name: 'Bob' });
  assert(dup.status === 409, `duplicate join -> 409 (got ${dup.status})`);

  // non-host cannot start
  const notHost = await call('POST', `/rooms/${code}/start`, { userId: 'u-bob' });
  assert(notHost.status === 403, `non-host start -> 403 (got ${notHost.status})`);

  const started = await call('POST', `/rooms/${code}/start`, { userId: 'u-alice' });
  assert(started.status === 200, `host start -> 200 (got ${started.status})`);
  assert(
    Array.isArray(started.json.states) && started.json.states.length === 1,
    'start returns the initial state'
  );
  const initial: GameState = started.json.states[0];
  assert(initial.phase === 'playing', 'initial state is playing');

  const roster: Roster[] = started.json.roster;
  const userByEngineId: Record<string, string> = {};
  for (const r of roster) userByEngineId[r.engineId] = r.userId;

  // Drive: whoever is on turn computes a legal move via decideMove and POSTs it.
  let state: GameState = initial;
  let winnerUserId: string | null = null;
  let finished = false;
  let moveCount = 0;
  let everyMoveHadStates = true;

  while (!finished && moveCount < 500) {
    const cur = state.players[state.currentPlayerIndex];
    const userId = userByEngineId[cur.id];
    let move: Move;
    try {
      move = decideMove(state);
    } catch {
      move = { type: 'draw' };
    }
    const r = await call('POST', `/matches/${matchId}/move`, { userId, move });
    if (r.status === 422) {
      // No-op/illegal — fall back to a draw to make progress.
      const r2 = await call('POST', `/matches/${matchId}/move`, {
        userId,
        move: { type: 'draw' },
      });
      if (r2.status !== 200) {
        console.error('  move failed:', r2.status, r2.json);
        break;
      }
      if (!Array.isArray(r2.json.states) || r2.json.states.length === 0) {
        everyMoveHadStates = false;
      }
      state = r2.json.states[r2.json.states.length - 1];
      finished = r2.json.finished;
      winnerUserId = r2.json.winnerUserId;
      moveCount++;
      continue;
    }
    if (r.status !== 200) {
      console.error('  move failed:', r.status, r.json);
      break;
    }
    if (!Array.isArray(r.json.states) || r.json.states.length === 0) {
      everyMoveHadStates = false;
    }
    state = r.json.states[r.json.states.length - 1];
    finished = r.json.finished;
    winnerUserId = r.json.winnerUserId;
    moveCount++;
  }

  assert(finished, `game reached finished (after ${moveCount} moves)`);
  assert(everyMoveHadStates, 'every accepted move returned a non-empty states[]');
  assert(
    winnerUserId === 'u-alice' || winnerUserId === 'u-bob',
    `winnerUserId is a human (${winnerUserId})`
  );

  // state endpoint works
  const stateRes = await call('GET', `/matches/${matchId}/state`);
  assert(stateRes.status === 200, `GET state -> 200 (got ${stateRes.status})`);
  assert(stateRes.json.state.phase === 'finished', 'GET state reflects finished');

  // ---- 3. AI follow-up loop: 1 human + 1 AI ----
  console.log('\n[case B] 1 human + 1 AI — exercise synchronous AI follow-up');
  const createdB = await call('POST', '/rooms', {
    hostUserId: 'u-solo',
    hostName: 'Solo',
    aiOpponents: 1,
  });
  const codeB: string = createdB.json.code;
  const matchIdB: string = createdB.json.matchId;
  assert(createdB.json.roster.length === 2, 'roster has host + 1 AI seat');
  assert(
    createdB.json.roster.some((r: Roster) => r.isAI),
    'roster includes an AI seat'
  );

  const startedB = await call('POST', `/rooms/${codeB}/start`, { userId: 'u-solo' });
  assert(startedB.status === 200, `start (1 AI) -> 200 (got ${startedB.status})`);

  const rosterB: Roster[] = startedB.json.roster;
  const userByEngineIdB: Record<string, string> = {};
  for (const r of rosterB) userByEngineIdB[r.engineId] = r.userId;

  let stateB: GameState = startedB.json.states[0];
  let finishedB = false;
  let sawMultiState = false;
  let moveCountB = 0;

  while (!finishedB && moveCountB < 500) {
    const cur = stateB.players[stateB.currentPlayerIndex];
    if (cur.isAI) {
      // Shouldn't happen: after a human move the loop drains AI turns. Guard.
      console.error('  unexpected: AI on turn at top of loop');
      break;
    }
    const userId = userByEngineIdB[cur.id];
    let move: Move;
    try {
      move = decideMove(stateB);
    } catch {
      move = { type: 'draw' };
    }
    let r = await call('POST', `/matches/${matchIdB}/move`, { userId, move });
    if (r.status === 422) {
      r = await call('POST', `/matches/${matchIdB}/move`, {
        userId,
        move: { type: 'draw' },
      });
    }
    if (r.status !== 200) {
      console.error('  move failed:', r.status, r.json);
      break;
    }
    if (r.json.states.length > 1) sawMultiState = true;
    stateB = r.json.states[r.json.states.length - 1];
    finishedB = r.json.finished;
    moveCountB++;
  }

  assert(finishedB, `1-AI game finished (after ${moveCountB} human moves)`);
  assert(
    sawMultiState,
    'a single human move returned multiple states (human + AI follow-up)'
  );

  // ---- 4. prune reclaims finished/idle rooms ----
  console.log('\n[case C] pruneRooms reclaims idle rooms');
  // The finished case-A match is still fetchable before pruning.
  const beforePrune = await call('GET', `/matches/${matchId}/state`);
  assert(beforePrune.status === 200, `state before prune -> 200 (got ${beforePrune.status})`);
  // idleMs=0 prunes every room (all are idle by >0ms).
  const pruned = pruneRooms(0);
  assert(pruned >= 1, `pruneRooms(0) removed at least 1 room (got ${pruned})`);
  const afterPrune = await call('GET', `/matches/${matchId}/state`);
  assert(afterPrune.status === 404, `state after prune -> 404 (got ${afterPrune.status})`);

  server.close();

  if (failed) {
    console.error('\nSMOKE TEST FAILED');
    process.exit(1);
  } else {
    console.log('\nSMOKE TEST PASSED');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('SMOKE TEST ERROR:', err);
  process.exit(1);
});
