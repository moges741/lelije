# LeLije frontend

React + Vite app for the LeLije children's movement missions. Follows sections 5, 6 and 8 of the Build Contract.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
```

## Screens

| Route | Screen |
| --- | --- |
| `/` | Welcome, then language and age setup |
| `/missions` | Today's missions, points, streak |
| `/missions/:id` | Mission detail |
| `/missions/:id/play` | Camera setup and mission in progress, with self-confirm fallback |
| `/stars` | Catch the Stars |
| `/success` | Points earned and next mission |

## Working against mocks

The app runs with no AI or Backend code present.

- **Pose**: `lelije-pose` is a Vite alias. It resolves to `../ai/pose/index.js` when that file exists, otherwise to `src/lib/pose/mock.ts`, a stand-in with the same exports. In mock mode, press `J` (jump) or `A` (arms up), or tap the on-screen demo buttons.
- **API**: each call tries the real `/api/...` endpoint first and falls back to an on-device stand-in (`localStorage`) when it is unreachable.

| Variable | Default | Effect |
| --- | --- | --- |
| `VITE_POSE_MOCK` | `true` | `false` passes `mock: false` to the pose engine (real camera) |
| `VITE_API_PROXY` | unset | Dev proxy target for `/api`, for example `http://localhost:3000` |
| `VITE_API_BASE` | empty | Prefix for API calls when the API is on another origin |
| `VITE_API` | on | `off` skips the network and uses the local stand-in only |
| `VITE_GAME_MS` | `60000` | Catch the Stars length, for rehearsals |

## Layout

```
src/
  api/client.ts        Backend client with local fallback
  lib/pose/            Contract A types, loader, session hook, local stand-in
  context/             Language, child profile, missions, progress
  i18n/                en, am, om (no text is hard-coded in components)
  pages/               The screens above
  components/          Shared UI
  mocks/               Sample missions used when the API is unreachable
  styles/app.css       Design tokens and all styles
public/sw.js           Caches the shell, /models and /wasm
```
