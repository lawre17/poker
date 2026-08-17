# Kadi

A mobile card game — **Kadi**, the East-African "shedding" card game — built with React Native, Expo, and TypeScript. Play against AI opponents locally, or (historically) against other people online for coins.

> **Project status: archived.** The online backend (Laravel API + a Node game service) has been retired, so online multiplayer, accounts, and coins no longer function. What remains here is the full app source: a pure, well-tested TypeScript game engine, the React Native UI, and an AI opponent. The Laravel backend that powered accounts, coins, and matchmaking lives in a companion repo, [**lawre17/kadi-api**](https://github.com/lawre17/kadi-api), kept public for reference. The repository was originally scaffolded under the name `poker`, but the game it implements is Kadi, not Western poker.

## What is Kadi?

Kadi is a fast, tactical shedding game (in the same family as Crazy Eights / UNO) played across East Africa. You race to empty your hand, but special cards let you attack, block, skip, reverse, and change suit — and you must announce **"Kadi"** before you can win.

### Rules this app implements

- **Deck:** standard 52 cards, no jokers. Deal **4 cards** for ≤3 players, **3 cards** for 4+.
- **Matching:** play a card matching the top card's **suit (flower)** or **rank**.
- **Special cards:**
  - `2` — next player picks 2
  - `3` — next player picks 3
  - `8` / `Q` — question (must be answered)
  - `J` — skip
  - `K` — reverse
  - `A` — change suit **and** block/cancel a pending penalty (wild)
- **Questions (8 / Q):** answered by a card of the question's suit, by any other question, or by a wild Ace.
- **Penalties:** counter a `2` with a `2`, a `3` with a `3` (the penalty passes on and grows). An Ace cancels a penalty. "Add-it-up" penalty **stacking is an optional setting, off by default.**
- **Sequence play ("throwing"):** on a clean turn you may lay a connected run of cards at once — the first matches the top card, each following card connects to the one before it (shared suit or rank; Ace is wild). Every card's power fires in order.
- **Winning (Niko Kadi):** empty your hand to win, but you must have announced **"Kadi"** on an earlier turn, your **last card must not be special** (end on 4, 5, 6, 7, 9, or 10), and no other player may be "cardless" at the time. You can't win on the same turn you announce.
- **Cardless rule:** you *may* play your last card even when it's an invalid finish (special card, or you never announced) — the card's power still fires, but instead of winning you become **cardless** and must draw back in on your next turn. While anyone is cardless, nobody can win.

The engine is validated by **8,000+ automated game simulations** (2–5 players) that all terminate cleanly, plus targeted rule tests.

## Features

- 🎴 Single-player vs. AI (2–5 players), with an AI opponent that plays the full ruleset
- 🧠 **Assisted** mode (highlights playable cards, blocks illegal plays) or **Manual** mode (free selection, engine rejects illegal moves)
- 🔔 Full Niko Kadi flow, including the "Still Kadi" draw that keeps your declared status
- 💬 In-game text chat with quick presets and floating chat bubbles
- 🔊 Synthesized sound effects and haptic feedback
- 📱 Ships as a standalone Android APK
- 🌐 *(retired)* Online multiplayer, accounts, and a +100-coins-per-win economy

## Tech stack

| Layer | Tech |
|---|---|
| App | React Native 0.81, React 19, **Expo SDK 54**, TypeScript |
| Game engine | Pure TypeScript (`src/game/`), no framework dependencies |
| State/data | `@tanstack/react-query`, `expo-secure-store` |
| Audio/haptics | `expo-audio`, `expo-haptics` |
| Game service | Node + Express + `tsx`, reusing the same `src/game/` engine authoritatively (`server/`) |
| Backend | Laravel (Sanctum auth, coins ledger) + Reverb websockets — separate repo: [**lawre17/kadi-api**](https://github.com/lawre17/kadi-api) |

## Project structure

```
src/
  game/            Pure game engine (framework-free, fully testable)
    types.ts       Card / GameState / Move types
    deck.ts        Deck + dealing
    rules.ts       Legality: isPlayable, cardsConnect, canAddCard
    engine.ts      applyMove / applySequence — the authoritative state machine
    ai.ts          AI move selection
  ui/              React Native screens & components (GameScreen, HomeScreen, ...)
  api/             Client for the (retired) backend: auth, matches, tournaments
  realtime/        Reverb (Pusher-protocol) websocket client
server/            Node game service that reused the engine authoritatively (retired)
scripts/           Simulation harness + rule tests + build/deploy helpers
docs/ONLINE_DESIGN.md   Original architecture doc for the online build
```

## Running it

Requires Node.js and the Expo tooling.

```bash
npm install
npm start          # Expo dev server (press "a" for Android, "w" for web)
```

> **Note:** the app UI is gated behind account login, which talked to the now-retired backend — so the app won't get past its login screen without a backend. The pieces that run fully standalone today are the **game engine and its test/simulation harness** (below). Re-enabling turnkey offline play would mean adding a guest entry point that boots straight into a vs-AI `GameScreen`.

### Simulations & tests

The engine runs headless — no device or backend needed:

```bash
npx tsx scripts/simulate.ts        # ~8000 AI games, expect 0 stalls
npx tsx scripts/questions.test.ts  # question-answer rules
npx tsx scripts/kadi-win.test.ts   # Niko Kadi win conditions
npx tsx scripts/cardless.test.ts   # cardless / lone-Ace rule
npx tsx scripts/still-kadi.test.ts # "Still Kadi" draw
```

### Building the Android APK

```bash
cd android && JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 \
  ANDROID_HOME=$HOME/Android/Sdk ./gradlew assembleRelease
```

The signed APK lands in `android/app/build/outputs/apk/release/`.

## License

MIT — see [LICENSE](LICENSE).
