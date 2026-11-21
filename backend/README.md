# Lelije backend

The API for Lelije: families, children, daily missions, mission completion with parent approval, the Catch the Stars result, and progress reports. NestJS, Prisma, and a local Postgres in Docker.

There is no login. A family is identified by its family code (for example `LJ-82SRVP`), which the phone stores. Anyone who has the code can see that family's children, so treat it like a password.

Parent-only actions (approving a mission, answering a play-time request, changing the PIN) also need the family's 4-digit parent PIN. The server stores only a hash of it. Five wrong PINs lock parent actions for that family for 15 minutes.

## Run it

You need Node 24 and Docker.

```bash
cd backend
cp .env.example .env
docker compose up -d        # Postgres on port 5434
npm install
npx prisma migrate dev      # creates the tables
npm run start:dev           # http://localhost:3000/api
```

Check it with `curl http://localhost:3000/api/health`, which returns `{"ok":true}`.

After a reboot, run `docker compose up -d` and `npm run start:dev` again. To browse the data, run `npx prisma studio`.

## Settings

Set these in `backend/.env`. Restart the server after changing one.

| Name | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | none, required | Postgres connection string |
| `DAILY_POINTS_CAP` | `100` | Most points a child can earn in one day, missions and game together |
| `CORS_ORIGIN` | `http://localhost:5173` | Frontend addresses allowed to call the API, comma-separated. `*` allows any. |
| `PORT` | `3000` | Port the API listens on |

To test from a phone on the same Wi-Fi, set `CORS_ORIGIN` to the address the phone opens (for example `http://192.168.1.20:5173`), or to `*`.

## Routes

Every route starts with `/api`. Bodies are JSON. Errors look like `{ "message": "...", "error": "Bad Request", "statusCode": 400 }`.

| Route | What it does |
|---|---|
| `GET /health` | Confirms the server is up |
| `POST /families` | Creates a family with a parent PIN and returns its code |
| `GET /families/:code` | Returns a family and its children |
| `POST /families/:code/pin` | Sets or changes the parent PIN |
| `POST /children` | Adds a child to a family |
| `POST /missions` | Returns the child's missions for today |
| `POST /missions/complete` | Marks a mission done: camera missions pay at once, tap-to-confirm ones wait for a parent |
| `GET /families/:code/reviews` | Lists missions waiting for a parent |
| `POST /completions/:id/review` | A parent approves or rejects a waiting mission (needs the PIN) |
| `POST /games/result` | Records a Catch the Stars result and awards points |
| `POST /play-requests` | A child asks for play time |
| `GET /families/:code/play-requests` | Lists the family's play-time requests |
| `POST /play-requests/:id/answer` | A parent allows, postpones, or declines a request (needs the PIN) |
| `GET /families/:code/notifications` | Lists a parent or child's notifications, with the unread count |
| `POST /families/:code/notifications/read` | Marks that audience's notifications as read |
| `GET /progress?childId=` | One child's points, today's work, and streak |
| `GET /families/:code/progress` | That progress for every child in a family |

The examples below run in order. They use `jq` to save ids between steps; without `jq`, copy the values by hand.

```bash
API=http://localhost:3000/api
JSON='Content-Type: application/json'
```

### Create a family

```bash
FAMILY=$(curl -s -X POST $API/families -H "$JSON" -d '{"name":"Abebe family","pin":"0123"}')
echo $FAMILY
CODE=$(echo $FAMILY | jq -r .code)
PIN=0123
```

```json
{ "id": "0fab1a60-...", "name": "Abebe family", "code": "LJ-82SRVP", "createdAt": "2026-11-21T12:51:46.100Z", "hasPin": true }
```

- `name` is required and is cut to 40 characters.
- `pin` is required: exactly 4 digits, sent as a string (`"0123"`, not `123`).

### Get a family back by its code

```bash
curl -s $API/families/$CODE
```

Returns the family with a `children` array and `hasPin`. The code is not case-sensitive. An unknown code returns `404`.

### Set or change the parent PIN

```bash
curl -s -X POST $API/families/$CODE/pin -H "$JSON" -d '{"pin":"4567","currentPin":"0123"}'
```

Returns `{ "hasPin": true }`.

- To change a PIN, send the current one as `currentPin`. A wrong `currentPin` returns `403` and counts toward the lock.
- Families created before PINs existed have `hasPin: false`. They can set a first PIN once by sending only `pin`.

### Add a child

```bash
CHILD=$(curl -s -X POST $API/children -H "$JSON" \
  -d "{\"familyCode\":\"$CODE\",\"age\":8,\"language\":\"am\",\"nickname\":\"Liya\"}")
echo $CHILD
CHILD_ID=$(echo $CHILD | jq -r .id)
```

```json
{ "id": "7329551c-...", "familyId": "0fab1a60-...", "age": 8, "language": "am", "nickname": "Liya", "createdAt": "..." }
```

- `familyCode` and `age` are required. `age` is clamped to 4–14.
- `language` is `en`, `am`, or `om`; anything else is saved as `en`.
- `nickname` is optional and is cut to 20 characters.

### Get today's missions

```bash
MISSIONS=$(curl -s -X POST $API/missions -H "$JSON" \
  -d "{\"childId\":\"$CHILD_ID\",\"count\":3,\"cameraAvailable\":true}")
echo $MISSIONS
MISSION_ID=$(echo $MISSIONS | jq -r '.missions[0].id')
```

```json
{
  "missions": [
    {
      "id": "m_20261121_0",
      "title": "Star Jumps",
      "description": "Jump 10 times like you are reaching for the stars. Stay in a clear space.",
      "type": "physical",
      "durationMin": 3,
      "points": 15,
      "verification": "pose",
      "goal": { "detector": "jump", "count": 10 },
      "language": "en",
      "ageMin": 5,
      "ageMax": 12,
      "tags": ["indoor", "energy"]
    }
  ],
  "source": "fallback",
  "warnings": ["stub_generator"]
}
```

- Only `childId` is required. The child's saved age and language are used.
- Optional: `count` (default 3, clamped to 1–5), `cameraAvailable` (default false), `space`, `weather`, `interests`.
- The first call of the day generates and saves the list. Every later call that day returns the saved list, whatever options it sends.
- One family can generate at most 10 new lists per hour; after that the route returns `429`. Saved lists are not limited.

### Complete a mission

```bash
curl -s -X POST $API/missions/complete -H "$JSON" \
  -d "{\"childId\":\"$CHILD_ID\",\"missionId\":\"$MISSION_ID\",\"verifiedBy\":\"pose\",\"result\":{\"count\":10,\"durationMs\":42000}}"
```

```json
{ "completionId": "8fd1dac1-...", "missionId": "m_20261121_0", "verifiedBy": "pose", "status": "approved", "alreadyCompleted": false, "pointsAwarded": 15, "pointsToday": 15, "dailyCap": 100 }
```

A mission confirmed by tapping waits for a parent:

```bash
curl -s -X POST $API/missions/complete -H "$JSON" \
  -d "{\"childId\":\"$CHILD_ID\",\"missionId\":\"$(echo $MISSIONS | jq -r '.missions[1].id')\",\"verifiedBy\":\"self\"}"
```

```json
{ "completionId": "3f2cef75-...", "missionId": "m_20261121_1", "verifiedBy": "self", "status": "pending", "alreadyCompleted": false, "pointsAwarded": 0, "pointsToday": 15, "dailyCap": 100 }
```

- `verifiedBy` is `pose` or `self`. A camera mission may be confirmed with `self` (the fallback when the camera fails); a `self` mission cannot be claimed as `pose`.
- `verifiedBy: "pose"` is saved as `approved` and pays at once.
- `verifiedBy: "self"` is saved as `pending` with `pointsAwarded: 0`. The points arrive when a parent approves it.
- Points come from the saved mission. A `points` field in the body is ignored.
- Completing the same mission again that day returns `alreadyCompleted: true` and the existing `status`, and awards nothing.
- If a parent rejected it, completing it again is a redo: it is saved again as new, with `alreadyCompleted: false`.
- A mission that is not in the child's list for today returns `404`.
- `result` and `completedAt` are optional. The server's clock decides the day.
- At the daily cap, the mission is recorded with `pointsAwarded: 0`.

### List missions waiting for a parent

```bash
curl -s $API/families/$CODE/reviews
COMPLETION_ID=$(curl -s $API/families/$CODE/reviews | jq -r '.[0].id')
```

```json
[
  { "id": "3f2cef75-...", "childId": "7329551c-...", "nickname": "Liya", "missionId": "m_20261121_1", "title": "Touch the Sky", "points": 10, "verifiedBy": "self", "status": "pending", "day": "2026-11-21", "completedAt": "2026-11-21T14:09:07.210Z" }
]
```

Every pending completion of every child in the family, oldest first. `points` is what the mission pays if approved.

### Approve or reject a mission

```bash
curl -s -X POST $API/completions/$COMPLETION_ID/review -H "$JSON" \
  -d "{\"familyCode\":\"$CODE\",\"pin\":\"$PIN\",\"decision\":\"approve\"}"
```

```json
{ "id": "3f2cef75-...", "childId": "7329551c-...", "missionId": "m_20261121_1", "day": "2026-11-21", "dailyCap": 100, "status": "approved", "alreadyReviewed": false, "pointsAwarded": 10, "pointsForDay": 25 }
```

- `decision` is `approve` or `reject`. `familyCode` and `pin` are required.
- Approving awards the mission's points, limited by the daily cap of the day the mission was done. `pointsForDay` is that day's total.
- Rejecting ("ask to redo") awards nothing, and the child can complete the mission again.
- Reviewing a completion that is no longer pending returns `alreadyReviewed: true` and changes nothing.
- A wrong PIN returns `403`. After five wrong PINs, parent actions return `429` for 15 minutes.
- A completion that belongs to another family returns `404`.

### Record a game result

```bash
curl -s -X POST $API/games/result -H "$JSON" \
  -d "{\"childId\":\"$CHILD_ID\",\"game\":\"catch-the-stars\",\"result\":{\"score\":42,\"starsCaught\":30,\"goldenCaught\":3,\"jumps\":6,\"armsUp\":21,\"durationMs\":60000}}"
```

```json
{ "game": "catch-the-stars", "score": 42, "alreadyRecorded": false, "pointsAwarded": 21, "pointsToday": 46, "dailyCap": 100 }
```

- All six `result` fields are required and must be non-negative numbers.
- Points are 1 per 2 score, at most 30, and count toward the daily cap.
- Only a child's first result of the day counts. A later one returns `alreadyRecorded: true`.

### Ask for play time

```bash
PLAY=$(curl -s -X POST $API/play-requests -H "$JSON" -d "{\"childId\":\"$CHILD_ID\"}")
echo $PLAY
PLAY_ID=$(echo $PLAY | jq -r .id)
```

```json
{ "id": "bf506dc8-...", "childId": "7329551c-...", "nickname": "Liya", "status": "sent", "requestedAt": "2026-11-21T14:24:24.662Z", "answeredAt": null, "alreadyAsked": false }
```

- A child has at most one unanswered request. Asking again while one is waiting returns the same request with a fresh `requestedAt` and `alreadyAsked: true`.
- After a parent answers, asking again creates a new request.

### List the family's play-time requests

```bash
curl -s $API/families/$CODE/play-requests
```

Returns the family's requests, newest first, at most 50. Each item has the same fields as above, without `alreadyAsked`.

### Answer a play-time request

```bash
curl -s -X POST $API/play-requests/$PLAY_ID/answer -H "$JSON" \
  -d "{\"familyCode\":\"$CODE\",\"pin\":\"$PIN\",\"answer\":\"allowed\"}"
```

```json
{ "id": "bf506dc8-...", "childId": "7329551c-...", "nickname": "Liya", "status": "allowed", "requestedAt": "2026-11-21T14:24:24.662Z", "answeredAt": "2026-11-21T14:24:26.695Z", "alreadyAnswered": false }
```

- `answer` is `allowed`, `later`, or `declined`. `familyCode` and `pin` are required.
- Each answer closes the request, `later` included. The child can then ask again.
- Answering a request that is already answered returns `alreadyAnswered: true` and changes nothing.
- A request that belongs to another family returns `404`.

### List notifications

The server writes a notification when something happens. A parent gets `mission_pending` and `play_sent`. The child gets `mission_approved`, `mission_rejected`, and `play_answered`. Asking again while a request is still open, or repeating an action, does not add another one.

```bash
curl -s "$API/families/$CODE/notifications?audience=parent"
curl -s "$API/families/$CODE/notifications?audience=child&childId=$CHILD_ID"
```

```json
{
  "unread": 1,
  "notifications": [
    { "id": "9c1e...", "audience": "parent", "kind": "play_sent", "childId": "7329551c-...", "nickname": "Liya", "read": false, "at": "2026-11-21T15:01:12.441Z" }
  ]
}
```

Newest first, at most 50. A child only sees their own. `audience` must be `parent` or `child`, and a child list needs `childId`.

### Mark notifications read

```bash
curl -s -X POST $API/families/$CODE/notifications/read -H "$JSON" \
  -d "{\"audience\":\"child\",\"childId\":\"$CHILD_ID\"}"
```

```json
{ "marked": 2 }
```

Marks every unread notification for that audience. A parent body is `{ "audience": "parent" }`. Marking again returns `{ "marked": 0 }`.

### Get a child's progress

```bash
curl -s "$API/progress?childId=$CHILD_ID"
```

```json
{
  "childId": "7329551c-...",
  "nickname": "Liya",
  "totalPoints": 46,
  "pointsToday": 46,
  "dailyCap": 100,
  "streak": 1,
  "today": {
    "day": "2026-11-21",
    "missionsTotal": 3,
    "missionsCompleted": [
      { "missionId": "m_20261121_0", "title": "Star Jumps", "points": 15, "verifiedBy": "pose", "completedAt": "2026-11-21T12:51:46.202Z" },
      { "missionId": "m_20261121_1", "title": "Touch the Sky", "points": 10, "verifiedBy": "self", "completedAt": "2026-11-21T14:09:07.210Z" }
    ],
    "missionsPending": [],
    "missionsToRedo": [],
    "game": { "game": "catch-the-stars", "score": 42, "points": 21 },
    "playRequest": { "id": "bf506dc8-...", "status": "allowed", "requestedAt": "2026-11-21T14:24:24.662Z", "answeredAt": "2026-11-21T14:24:26.695Z" }
  }
}
```

- `missionsCompleted` holds approved missions only.
- `missionsPending` holds missions waiting for a parent, as `{ missionId, title, points, completedAt }`, where `points` is what approval will pay.
- `missionsToRedo` holds rejected missions, as `{ missionId, title }`.
- `playRequest` is the child's request that is still waiting, or else today's latest answered one. It is `null` when there is neither.
- Points and the streak count approved missions and games only.
- `streak` counts consecutive days with an approved mission or a game. If nothing is done yet today, it counts up to yesterday.

### Get the family report

```bash
curl -s $API/families/$CODE/progress
```

```json
{ "family": { "name": "Abebe family", "code": "LJ-82SRVP" }, "children": [ { "childId": "...", "nickname": "Liya", "totalPoints": 36, "...": "..." } ] }
```

Each item in `children` has the same shape as a child's progress.

## How days work

A day is the calendar date in Africa/Addis_Ababa. Missions, the once-per-day rules, the daily cap, and streaks all use it.

## Connecting the AI missions module

Missions currently come from a stand-in, `src/missions/generate-missions.stub.ts`: six fixed English missions, returned with `"source": "fallback"` and `"warnings": ["stub_generator"]`.

When `ai/missions/index.js` is on `main`, replace the import of `generateMissions` in `src/missions/missions.service.ts`. The stand-in takes the same input and returns the same output as Contract B, so no route or table changes. `ANTHROPIC_API_KEY` and `LLM_MODEL` then go in `backend/.env`.
