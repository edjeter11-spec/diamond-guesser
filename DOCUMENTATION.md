# Diamond Guesser — Project Documentation

> Single-file PWA baseball pitch-prediction game. HTML/CSS/JS only, Firebase backend, MLB Stats API as the live data source.

---

## 1. Project Purpose & Architecture

### What it is
**Diamond Guesser** is a real-time fantasy/prediction game for live MLB games. Players predict the next pitch (ball/strike, pitch type, at-bat outcome) before it actually happens on the broadcast, scoring points for correct calls. Solo, friends-multiplayer (up to ~8 players via room codes), and a simulated "Practice Mode" are all supported.

### Architecture at a glance
```
┌─────────────────────────────────────────────┐
│  Browser (PWA — index.html, sw.js)          │
│  ┌────────────────────────────────────┐     │
│  │ UI screens: Auth / Home / Lobby /  │     │
│  │ Game (single index.html, ~5,800ln) │     │
│  └────────────────────────────────────┘     │
└──────┬───────────────────┬──────────────────┘
       │                   │
       ▼                   ▼
 ┌─────────────┐    ┌───────────────────┐
 │ MLB StatsAPI│    │ Firebase          │
 │ (public)    │    │  - Auth (email +  │
 │ live feed,  │    │    anonymous)     │
 │ schedule    │    │  - Realtime DB    │
 └─────────────┘    │    (rooms, users, │
                    │    leagues, bets, │
                    │    chat)          │
                    └───────────────────┘
```

There is **no custom backend, no server code**. Everything runs client-side. State that needs to persist or sync across players lives in Firebase Realtime Database. Live game data is polled from `statsapi.mlb.com`.

### Tech stack
| Layer | Tech |
|-------|------|
| UI | Vanilla HTML/CSS/JS in a single file (`index.html`) |
| Auth | Firebase Auth v9 compat (email/password + anonymous) |
| Realtime sync | Firebase Realtime Database v9 compat |
| Live data | MLB Stats API (`statsapi.mlb.com`), no auth required |
| PWA | Service worker (`sw.js`) + `manifest.json` |
| Hosting | Vercel (no-cache headers; see `vercel.json`) |
| Fonts | Google Fonts: Chakra Petch + Inter |

---

## 2. File Structure & Key Modules

### Files in repo
| File | Purpose |
|------|---------|
| `index.html` | **The entire app** — markup, CSS, JS in one file (~342 KB, ~5,800 lines) |
| `sw.js` | Service worker — network-first cache (`dg-v6-direct-fetch`) + notification click handler |
| `manifest.json` | PWA manifest (standalone, portrait, baseball emoji icon as inline SVG data-URI) |
| `vercel.json` | Sets `Cache-Control: no-cache, no-store, must-revalidate` on every path so updates ship instantly |
| `.gitignore` | Just `.vercel` |
| `.vercel/` | Vercel project link (gitignored) |

### Logical sections inside `index.html`
| Lines | Section |
|---|---|
| 1–20 | `<head>` — meta, manifest, Firebase compat scripts |
| 21–725 | `<style>` — full theme CSS (CSS vars, glass cards, animations) |
| 727–1292 | `<body>` — six "screens" toggled by adding `.active` class |
| 1294–5767 | `<script>` — all game logic |
| 5769+ | Floating chat panel markup |

### The six screens (mutually exclusive via `.screen.active`)
1. `screenAuth` — login / signup / continue-as-guest forms
2. `screenHome` — balance card, games list (today's MLB schedule), streak calendar, badges, league card, pregame bets
3. `screenLobby` — multiplayer room (create/join, player slots, delay slider, pick game)
4. `screenGame` — the live prediction UI (scores, pitch buttons, history tabs, scoring summary)
5. Modals: `modeModal` (solo vs friends), `soloModal` (live vs sim)
6. Floating chat panel (multiplayer only)

### Key JS modules (by `/* ═══ … ═══ */` banners)
- **FIREBASE CONFIG** (~1297) — `firebase.initializeApp(...)`, exposes `db`, `auth`
- **AUTH** (~1317) — signup/login/guest handlers, `onAuthStateChanged` (the master entry point)
- **STATE** (~1441) — the giant `S` object (current game, scores, streaks, multiplayer flags)
- **TABS** (~1458) — pitch log / scoring summary tab toggling
- **HOME — GAMES LIST** (~1470) — `loadGames()`, `renderGameList()`, `makeGameCard()`
- **MULTIPLAYER** (~1546) — `joinRoom`, `genCode`, `setupPresence`, `tryRejoinRoom`
- **GAME LOGIC** (`startGame` ~1983) — pitch fetching, prediction handling, scoring
- **STREAKS** (~5176) — daily streak calendar, persisted to localStorage + Firebase
- **BADGES** (~5242) — achievement tracking
- **LEAGUES** (~5366) — code-based league system, history, leaderboard
- **PREGAME BETS** (~5407) — `placeBet`, `checkBetResults` (2× payout)
- **SOCIAL / FRIENDS** (~5739) — friends list (localStorage)
- **CHAT** (5769+) — multiplayer chat panel

---

## 3. Firebase Setup & Authentication Flow

### Firebase project
- **Project ID:** `diamond-guesser`
- **DB URL:** `https://diamond-guesser-default-rtdb.firebaseio.com`
- Config (`apiKey`, etc.) is **embedded in `index.html`** (lines 1299–1307). This is normal for Firebase web apps — the `apiKey` is a public identifier, not a secret. Real security comes from Firebase Realtime DB **rules** (must be configured in the Firebase console — not in this repo).

### Auth flow
1. Page loads → `onAuthStateChanged` fires (line 1358).
2. **If user is signed in:**
   - `currentUser` is populated.
   - `users/{uid}` is read; if missing, a default record is created (`{name, balance:0, gamesPlayed:0, ...}`).
   - Home screen state is hydrated (balance, accuracy, level: Rookie → Pro → All-Star → MVP based on balance).
   - `tryRejoinRoom()` checks `localStorage.dg_room` and restores any active multiplayer session.
3. **If signed out:** `screenAuth` is shown.

### Three auth methods
| Method | Backed by | Notes |
|---|---|---|
| Email/password signup | `createUserWithEmailAndPassword` | Sets `displayName` via `updateProfile`, then writes `users/{uid}` |
| Email/password login | `signInWithEmailAndPassword` | |
| Guest | `signInAnonymously` | Treated as logged in; logout button is hidden, mini-bar shows "Sign In" upgrade link |

### Realtime DB schema (inferred from writes)
```
users/{uid}
  name, balance, gamesPlayed, bestStreak, totalCorrect, totalPredictions,
  accuracy, lastPlayed, created, streak, streakDays[], badges[]

bets/{uid}/{gameId}
  team, amount, awayName, homeName, placed

leagues/{code}
  name, created, createdBy
  members/{playerId}: { name, totalScore, gamesPlayed, joinedAt }
  history[]: { uid, name, score, gameId, date }

rooms/{code}
  playerCount, globalDelay, game: { gameId, away, home, awayId, homeId }
  players/{playerId}: { name, score, online, lastSeen, ... }
  chat[]: { name, text, ts }

.info/connected            (Firebase built-in for presence)
```

### Local persistence
| `localStorage` key | Purpose |
|---|---|
| `dg_name` | cached display name |
| `dg_pid` | random 8-char player ID generated once per browser; **shared across all users on that device** |
| `dg_lb` | leaderboard cache |
| `dg_room` | active multiplayer room session (for reload-rejoin) |
| `dg_streak_{uid}` | per-user streak data |
| `dg_badges_{uid}` | per-user badge data |
| `dg_friends_{uid}` | per-user friends list |
| `dg_league_{uid}` | which league code the user belongs to |

---

## 4. Game Mechanics & Multiplayer Logic

### Solo gameplay (`startGame`, line 1983)
1. User taps a game card → `showModeModal` (solo/friends choice).
2. Solo path: `startGame(gameId, awayName, homeName, awayId, homeId)`.
3. Game enters `screenGame`. The app polls MLB Stats API for the live feed at intervals (`S.fetchInterval`, `S.queueInterval`).
4. As pitches are delivered, the player must pre-pick:
   - **Pitch type** (ball / strike etc.)
   - **At-bat outcome** (hit / out / RBI etc.)
5. Correct picks award points to `S.userScore`; incorrect picks award points to a "CPU" (always-correct baseline).
6. State tracked: `streak`, `bestStreak`, `correctCount`, `totalPredictions`, runners on base, count, outs, inning, pitch history.
7. On game end, `saveUserBalance(pointsEarned)` and `saveUserStats()` push to Firebase.

### Practice Mode (`startPractice`)
- Simulated pitches from a built-in pitch script. Three speeds: Manual / Auto (10s) / Fast (5s). Useful for offline play. Does **not** award real balance.

### Multiplayer (room codes)
- `genCode()` produces a 4-char code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no confusing chars).
- `joinRoom(code, isHost, isRejoin)` creates `rooms/{code}` listeners:
  - `playerCount` — host-set slot capacity
  - `globalDelay` — broadcast delay slider (0–60s; any player can change)
  - `players` — live player list with `online`/`lastSeen` heartbeats
  - `game` — once host picks a game, all clients start it
  - `chat` — message stream
- **Presence:** `setupPresence()` uses `.info/connected` + `onDisconnect()` to mark players offline on disconnect; combined with `lastSeen` timestamps it survives reloads (15s grace).
- **Reload persistence:** `localStorage.dg_room` + `tryRejoinRoom()` rejoins a game in progress when the page is refreshed.
- **Hot Seat / Podium UI:** Special scoreboard layouts for 3–4 players, with last-place "hot seat" callouts and pick reveals between pitches.

### Streaks, badges, leagues, bets
- **Streaks** (line 5176): daily play streak tracked in localStorage and mirrored to Firebase (`users/{uid}/streak`, `streakDays`).
- **Badges** (line 5242): unlocked achievements based on stats (`gamesPlayed`, `bestStreak`, `bestGameScore`, `bestAccuracy`, `homersCalled`, `mpWins`).
- **Leagues** (line 5366): code-based mini-leaderboards; `createLeague` writes `leagues/{code}` with the creator as first member; all members' totalScores are sorted client-side.
- **Pregame bets** (line 5407): wager points on a team to win; payout is 2× on correct calls. Resolution happens client-side in `checkBetResults` by reading the cached game and matching final scores.

---

## 5. Security Audit Findings

> Full audit was completed in the prior session; this section consolidates findings against the file as it stands today.

### CRITICAL — Stored XSS via user-controlled `displayName`
Across the app, user-controlled strings are inserted directly into `innerHTML` without escaping. A malicious `displayName` (or league name, friend record, chat sender, etc.) containing HTML/JS will be executed in every other user's browser when rendered.

Confirmed unsafe sinks (line numbers approximate):
| Location | Field | Code |
|---|---|---|
| ~5401 | `d.name` (league name) | `'<span ...>'+d.name+'</span>'` |
| ~5402 | `m.name` (league member) | `'<span class="lg-name">'+m.name+...` |
| ~5755 | `f.name` (friend) | `'<span style="...">'+f.name+'</span>'` |
| Chat (5769+) | `msg.name` | only `msg.text` is escaped, sender name is not |
| Multiplayer dugout, scout cards, leaderboard rows (`e.name` ~3438, ~5684) | various | raw concatenation |

**Impact:** any signed-up user can pick `<img src=x onerror="...">` as their display name and execute JS in every leaderboard, league, room, or chat that includes them. Attacker can steal balance, hijack actions, or persist via Firebase writes.

**Fix shape (not applied here — audit-only):** route every user-controlled string through an `escapeHtml(s)` helper before concatenation, or use `textContent`/DOM APIs instead of `innerHTML` strings.

### HIGH — Realtime DB rules cannot be verified from this repo
The DB rules live in the Firebase console, not in source. Without rules locking writes to `users/{uid}` to that uid, **any signed-in user can edit any other user's `balance`, `bestStreak`, `badges`, etc.** by writing arbitrary paths via the public `apiKey`. This must be confirmed in the console.

Suggested rule shape:
```
"users":   { "$uid":  { ".write": "$uid === auth.uid" } }
"bets":    { "$uid":  { ".write": "$uid === auth.uid" } }
"leagues": { "$code": { ".write": "auth != null" } }   // server-trusted member updates ideally
"rooms":   { "$code": { ".write": "auth != null" } }
```

### MEDIUM — Bet resolution is fully client-side
`checkBetResults` (~5425) trusts `cachedGames` and writes a `2×` payout directly to `users/{uid}/balance`. A user can call this manually from devtools and credit themselves. Same applies to `saveUserBalance`. **Without strict DB rules + server-side validation (Cloud Functions), balances are not trustworthy.**

### MEDIUM — Cross-account contamination via `dg_pid`
`localStorage.dg_pid` is generated once per browser and reused across every account that signs in on that device. It's used as the multiplayer player ID and as a key in `leagues/{code}/members/{playerId}`. Two users sharing a browser will overwrite each other's league membership and chat identity.

**Fix shape:** key `dg_pid` per uid, or use `currentUser.uid` directly.

### LOW — `bet-team` button injects team names into inline JS handlers
`renderBets` (~5451):
```
'<button ... onclick="placeBet('+gId+',\''+aw.replace(/'/g,'')+'\',50)">'
```
Single quotes are stripped, but other characters (newlines, HTML entities, double quotes if a team name ever contained them) could break the handler. MLB team names are trusted today but the pattern is fragile.

### LOW — `iframe` / stress-test URL params
`checkStressUrlParams()` (called at ~1406) silently changes startup behavior. Worth confirming it cannot be triggered by a hostile referrer to skip auth flows or auto-bet.

### Not findings (called out for completeness)
- **Firebase `apiKey` in HTML:** *not a vulnerability.* Firebase web `apiKey`s are public identifiers; security must come from DB rules + Auth.
- **MLB Stats API:** public, no key, no auth — fine.
- **CORS:** the app only fetches `statsapi.mlb.com` (CORS-enabled) and Firebase SDKs. No custom CORS surface.
- **Service worker:** network-first; can't be poisoned by a stale cache because every response is re-fetched first.

### Input validation summary
| Input | Validated? | Where |
|---|---|---|
| Signup name | only `trim()` non-empty | client |
| Signup email | only non-empty (no format check beyond browser `type=email`) | client |
| Password | `>= 6 chars` | client |
| Chat message | `maxlength=200` (DOM), `text` is escaped on render | client |
| Display name change (~1834) | none | client |
| League code | none — relies on Firebase path semantics | client |
| Room code | generated, not user-typed for create; user-typed for join (no length check) | client |

---

## 6. Deployment Notes

### Hosting
- **Vercel.** `vercel.json` aggressively disables caching (`no-cache, no-store, must-revalidate`) for every path so service-worker + HTML updates ship instantly. The SW (`dg-v6-direct-fetch`) is also network-first to reinforce this.
- Deploy command (per global CLAUDE.md): `vercel --prod --yes`.

### Configuration external to repo
| Where | What lives there |
|---|---|
| Firebase Console → Auth | enabled providers (Email/Password, Anonymous) |
| Firebase Console → Realtime DB → Rules | **the actual security model** — not in git |
| Firebase Console → Project Settings | the config object that's also pasted at line 1299 |
| Vercel Dashboard | domain binding, deploy hooks |

### Local dev
No build step. Open `index.html` directly via a local web server (the SW won't register from `file://`):
```
npx serve .
```
Then hit `http://localhost:3000/`. To test on a phone on the same Wi-Fi, use `npx serve --host 0.0.0.0`.

### Updating
1. Edit `index.html`.
2. Bump the SW cache name in `sw.js` if you want clients to drop cached assets immediately (`dg-v6-…` → `dg-v7-…`).
3. `git add . && git commit -m "…" && git push` and let Vercel auto-deploy, or `vercel --prod --yes`.

### Things that will bite future maintainers
- **Single 342 KB HTML file.** No bundler, no source maps. Use line-number search + the `/* ═══ … ═══ */` banners as your map.
- **Firebase compat (v9.23 compat) SDK** — uses the v8-style API (`firebase.database()`). Don't mix v9 modular syntax in.
- **`dg_pid` cross-account leak** (see audit) — surfaces as confusing league/multiplayer state when multiple accounts share a browser.
- **Balance is client-trusted.** Until DB rules + a Cloud Function validate `balance` writes, any "economy" features are advisory only.
- **No tests.** Manual QA only. Practice Mode is the only deterministic playthrough surface.
- **PWA cache name.** If users report stale UI, check the `CACHE` const in `sw.js` was bumped.

### Onboarding TL;DR
> Open `index.html`. Search for `/* ═══` to jump between modules. Auth state changes (`onAuthStateChanged` ~1358) are the master entry point. Multiplayer is just a Firebase Realtime DB tree under `rooms/{code}`. Live data comes from `statsapi.mlb.com`. Before shipping anything that touches `balance`, lock down DB rules and add an `escapeHtml` pass over every user-controlled `innerHTML` sink.
