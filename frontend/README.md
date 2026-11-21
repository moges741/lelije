# LeLije frontend

React + Vite app for the LeLije children's movement missions. Follows sections 5, 6 and 8 of the Build Contract.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
```

The app needs the Nest API from `../backend` (see its README). In development, Vite forwards `/api` to `http://localhost:3000`.

## Screens

| Route | Screen |
| --- | --- |
| `/` | Welcome: create a family, join one, or sign in |
| `/register/family` | Create a family: name and grown-up PIN |
| `/family` | The family code to share, and child profiles |
| `/register/child` | A child joins with the family code: pick or make a profile |
| `/login` | Sign in with the code: a grown-up enters the PIN, a child picks a profile |
| `/parent` | Family home: what is waiting (missions to approve, play requests), then each child |
| `/parent/review/:id` | Approve a tap-to-confirm mission or ask for a redo (PIN) |
| `/parent/play` | Answer play-time requests: allow, later, or not now (PIN) |
| `/parent/activity` | The last 7 days: a summary per child and everything they did |
| `/parent/notifications`, `/child/notifications` | Notifications; opening them marks them read |
| `/parent/settings` | Family code and changing the PIN |
| `/missions` | Today's missions, points, streak, play time, Catch the Stars |
| `/missions/:id` | Mission detail |
| `/missions/:id/play` | Camera setup and mission in progress, with a buttons fallback |
| `/stars` | Catch the Stars |
| `/success` | What the server decided: points earned, waiting for a grown-up, or not saved |
| `/child/play` | Ask for play time and see the answer |

## Rules the screens follow

- Camera missions are paid as soon as they are saved. Tap-to-confirm missions, and camera missions finished with buttons, wait for a grown-up.
- Points, the daily cap, the streak and the play-time answer always come from the server.
- The PIN is checked by the server on every parent action. Five wrong PINs lock parent actions for 15 minutes.
- Screens that wait on the other person (family home, play time, a child's missions with something pending) refresh every 10–20 seconds while visible.
- Today's missions are saved on the device. Without a connection the list still shows, but finishing a mission says it was not saved and offers a retry.

## Pose stand-in

`lelije-pose` is a Vite alias. It resolves to `../ai/pose/index.js` once that file exports `createPoseEngine` (Contract A), otherwise to `src/lib/pose/mock.ts`, a stand-in with the same exports. In mock mode, press `J` (jump) or `A` (arms up), or tap the on-screen buttons.

| Variable | Default | Effect |
| --- | --- | --- |
| `VITE_POSE_MOCK` | `true` | `false` passes `mock: false` to the pose engine (real camera) |
| `VITE_API_PROXY` | `http://localhost:3000` | Dev proxy target for `/api` |
| `VITE_API_BASE` | empty | Prefix for API calls when the API is on another origin |
| `VITE_GAME_MS` | `60000` | Catch the Stars length, for rehearsals |

## Layout

```
src/
  api/                 http.ts (fetch + failures), client.ts (every API route)
  types/               account, api (server responses), mission (Contract B), navigation
  lib/                 pose/, useRemote (load + refresh), time, outcome, progress, pin
  context/             Language, session, today's missions and progress
  i18n/                en, am, om (no text is hard-coded in components)
  pages/               The screens above
  components/          Shared UI, including the PIN prompt
  styles/app.css       Design tokens and all styles
public/sw.js           Caches the shell, /models and /wasm
```
