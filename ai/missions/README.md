# `ai/missions` — Mission Generation, Safety, Storyteller & HTTP Contract

Server-side mission validation, child-safety filtering, Ethiopian prompt engineering, multi-provider LLM adapters (`anthropic` | `gemini` | `openai`), deterministic exercise builder, storyteller, and Express-compatible HTTP routes.

## Quick Start (Backend Integration)

```ts
import {
  generateMissions,
  validateMission,
  validateParentMission,
  isSafe,
  buildExerciseMission,
  generateStoryChapter,
  companionLine,
  generateWeeklySummary,
  toDbRow,
  toClientView,
  mountAiRoutes,
} from "../ai/api/missions.js";
```

TypeScript declarations live in `ai/index.d.ts`, `ai/missions/index.d.ts`, and `ai/pose/index.d.ts`.

## Environment Variables

| Variable | Description |
| --- | --- |
| `AI_PROVIDER` | Optional: `"gemini"`, `"anthropic"`, or `"openai"`. Auto-detects from keys if unset. |
| `GEMINI_API_KEY` | Google Gemini API key (`https://ai.google.dev/api/generate-content`). |
| `ANTHROPIC_API_KEY` | Anthropic Messages API key (`https://docs.anthropic.com/en/api/messages`). |
| `OPENAI_API_KEY` | OpenAI Chat Completions key (`https://platform.openai.com/docs/api-reference/chat/create`). |
| `AI_MODEL` | Optional model override. |
| `MOCK_AI` | Set to `"true"` to bypass network calls and return deterministic local fallbacks. |

## Mission Schema (`validate.js`)

- **Over-limit text is rejected, never truncated.**
- `type`: `"solo" | "family" | "outdoor"`
- `category`: `"real_world" | "exercise"`
- `needs_parent`: automatically forced `true` for `family`, `outdoor`, and any cooking/heat/knife/chemical mission.
- `interaction`: `"checklist" | "camera" | "timer" | "quiz" | "story" | "scavenger" | "family_challenge"`
  - `quiz`: `quiz` array of exactly 3 `{ q (<=120), options: [3 strings <=60], answerIndex: 0|1|2 }`
  - `story`: `story: { opening (<=400), choices: 1..2 pairs of strings <=80 }`
  - `timer`: `duration_sec` integer `60..1800`
  - `scavenger`: `items` array of `3..5` strings `<=60`
  - `camera`: `activity: { game, target }` (ONLY for `exercise`; `real_world` must NOT use `camera`)
  - `checklist` and `family_challenge`: no extra fields required.

## Safety Filter (`safety.js`)

`isSafe(mission) -> { safe, reasons }` scans **every** text field (including `quiz` questions/options, `story` opening/choices, `items`, `steps`, `roles`, `supervision_note`, `english_summary`):
- Rejects violence, self-harm, drugs/alcohol, adult content, stranger danger, manipulative mechanics (gambling, purchases, streak guilt, infinite loops), shaming, and personal identifying information (emails, phone numbers, street/kebele addresses).
- Enforces `needs_parent: true` for family, cooking/hazard, and outdoor missions, plus an explicit parent-approval step for outdoor missions and 2–5 steps.

## Core Functions

- `generateMissions({ age, interests, language, recentActivity, count, types, excludeTitles, requestId, includeExercise })`
  - Never throws. Always returns `{ source, languageFallback, generatedAt, missions }` with **exact `count`** validated, safe missions.
  - 8 s total budget (`5 s` per LLM call; retries once only if `>= 2 s` remain). Strips `english_summary` and removes PII from `interests`.
- `buildExerciseMission({ age, game, language })` — No LLM. Uses `ai/pose/catalog.js` with age-band target scaling (`6–7`, `8–9`, `10–12`) and `en`/`am`/`om` templates (`am`/`om` marked `needs_translation: true`).
- `validateParentMission(raw)` — Enforces length limits, points `10..30`, forbids `camera`, rejects phone/email/address, and runs `isSafe()`.
- `toDbRow(mission, meta)` — PostgreSQL snake_case row mapper.
- `toClientView(mission, { role })` — Strips `english_summary` and hides `quiz[*].answerIndex` when `role === "child"`.
- `generateWeeklySummary({ age, language, completedMissions, exerciseSessions, totalPoints })` — Warm, guilt-free summary with `en`/`am`/`om` fallbacks.
- `generateStoryChapter({ age, language, interests, companionName, region, chapter, previousChoice })` — 80–120 word calm Ethiopian story chapter (`highlands | rift_valley | simien`, chapters `1..2`), 5 s timeout then `fallback_story.json`.
- `companionLine({ event, language, mood })` — Scripted phrase table (no LLM).

## HTTP Endpoints (`http.js`)

Mount onto any Express-compatible router with `mountAiRoutes(router, { prefix: "/ai" })`. Every POST route rejects request bodies larger than **5 KB (5120 bytes)** with HTTP `413`.

### `GET /health`
```json
{
  "ok": true,
  "service": "lelije-ai",
  "mockMode": false,
  "providerConfigured": false,
  "provider": "fallback",
  "activitiesCount": 7
}
```

### `GET /activities`
Returns `{ "activities": [ ...7 catalog items... ] }`.

### `POST /generate`
Request:
```json
{
  "age": 8,
  "language": "en",
  "interests": ["drawing", "football"],
  "count": 3,
  "types": ["solo", "family", "outdoor"],
  "includeExercise": true,
  "role": "child"
}
```
Response (`200 OK`):
```json
{
  "source": "fallback",
  "languageFallback": false,
  "generatedAt": "2026-11-21T15:00:00.000Z",
  "missions": [ /* 3 validated, safe client-view missions */ ]
}
```

### `POST /validate`
Request (standard or `{ "mode": "parent", "mission": { ... } }`):
```json
{
  "mode": "parent",
  "mission": {
    "title": "Water the Courtyard Herbs",
    "description": "Help water the rosemary and basil pots in the morning.",
    "type": "solo",
    "interaction": "checklist",
    "roles": { "child": "Waters each pot gently", "parent": "" },
    "steps": ["Fill the small watering jug", "Water each herb pot gently"],
    "supervision_note": "",
    "needs_parent": false,
    "points": 15
  }
}
```
Response: `200 { "ok": true, "mission": { ... } }` or `422 { "ok": false, "errors": [ ... ] }`.

### `POST /story`
Request:
```json
{
  "age": 8,
  "language": "en",
  "companionName": "Lomi",
  "region": "simien",
  "chapter": 1
}
```
Response (`200 OK`):
```json
{
  "source": "fallback",
  "text": "Across the breathtaking terraces of the Simien Mountains...",
  "choices": [
    "Sketch the peaceful gelada monkeys in your nature book",
    "Spot colourful mountain birds soaring over the meadow"
  ],
  "endsWith": "choice"
}
```

### `POST /summary`
Request:
```json
{
  "age": 8,
  "language": "en",
  "completedMissions": 4,
  "exerciseSessions": 3,
  "totalPoints": 135
}
```
Response (`200 OK`):
```json
{
  "source": "fallback",
  "language": "en",
  "headline": "A Joyful Active Week!",
  "summary": "This week included 4 real-world missions and 3 movement games, earning 135 points together.",
  "suggestion": "Try a 60-second Eskista or Catch the Stars session together after school."
}
```
