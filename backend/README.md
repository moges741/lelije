# Lelije backend

The API for Lelije: families, children, daily missions, mission completion, the Catch the Stars result, and progress reports. NestJS, Prisma, and a local Postgres in Docker.

There is no login. A family is identified by its family code (for example `LJ-82SRVP`), which the phone stores. Anyone who has the code can see that family's children, so treat it like a password.

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
| `POST /families` | Creates a family and returns its code |
| `GET /families/:code` | Returns a family and its children |
| `POST /children` | Adds a child to a family |
| `POST /missions` | Returns the child's missions for today |
| `POST /missions/complete` | Marks a mission done and awards its points |
| `POST /games/result` | Records a Catch the Stars result and awards points |
| `GET /progress?childId=` | One child's points, today's work, and streak |
| `GET /families/:code/progress` | That progress for every child in a family |

The examples below run in order. They use `jq` to save ids between steps; without `jq`, copy the values by hand.

```bash
API=http://localhost:3000/api
JSON='Content-Type: application/json'
```

### Create a family

```bash
FAMILY=$(curl -s -X POST $API/families -H "$JSON" -d '{"name":"Abebe family"}')
echo $FAMILY
CODE=$(echo $FAMILY | jq -r .code)
```

```json
{ "id": "0fab1a60-...", "name": "Abebe family", "code": "LJ-82SRVP", "createdAt": "2026-11-21T12:51:46.100Z" }
```

`name` is required and is cut to 40 characters.

### Get a family back by its code

```bash
curl -s $API/families/$CODE
```

Returns the family with a `children` array. The code is not case-sensitive. An unknown code returns `404`.

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
{ "missionId": "m_20261121_0", "verifiedBy": "pose", "alreadyCompleted": false, "pointsAwarded": 15, "pointsToday": 15, "dailyCap": 100 }
```

- `verifiedBy` is `pose` or `self`. A camera mission may be confirmed with `self` (the fallback when the camera fails); a `self` mission cannot be claimed as `pose`.
- Points come from the saved mission. A `points` field in the body is ignored.
- Completing the same mission again that day returns `alreadyCompleted: true` and awards nothing.
- A mission that is not in the child's list for today returns `404`.
- `result` and `completedAt` are optional. The server's clock decides the day.
- At the daily cap, the mission is recorded with `pointsAwarded: 0`.

### Record a game result

```bash
curl -s -X POST $API/games/result -H "$JSON" \
  -d "{\"childId\":\"$CHILD_ID\",\"game\":\"catch-the-stars\",\"result\":{\"score\":42,\"starsCaught\":30,\"goldenCaught\":3,\"jumps\":6,\"armsUp\":21,\"durationMs\":60000}}"
```

```json
{ "game": "catch-the-stars", "score": 42, "alreadyRecorded": false, "pointsAwarded": 21, "pointsToday": 36, "dailyCap": 100 }
```

- All six `result` fields are required and must be non-negative numbers.
- Points are 1 per 2 score, at most 30, and count toward the daily cap.
- Only a child's first result of the day counts. A later one returns `alreadyRecorded: true`.

### Get a child's progress

```bash
curl -s "$API/progress?childId=$CHILD_ID"
```

```json
{
  "childId": "7329551c-...",
  "nickname": "Liya",
  "totalPoints": 36,
  "pointsToday": 36,
  "dailyCap": 100,
  "streak": 1,
  "today": {
    "day": "2026-11-21",
    "missionsTotal": 3,
    "missionsCompleted": [
      { "missionId": "m_20261121_0", "title": "Star Jumps", "points": 15, "verifiedBy": "pose", "completedAt": "2026-11-21T12:51:46.202Z" }
    ],
    "game": { "game": "catch-the-stars", "score": 42, "points": 21 }
  }
}
```

`streak` counts consecutive days with a completed mission or a game. If nothing is done yet today, it counts up to yesterday.

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
