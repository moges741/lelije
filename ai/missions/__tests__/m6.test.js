// @ts-check
import { describe, expect, it } from "vitest";
import { getActivityCatalog } from "../../pose/catalog.js";
import { buildExerciseMission } from "../exercise.js";
import {
  handleActivities,
  handleGenerate,
  handleHealth,
  handleValidate,
  MAX_BODY_BYTES,
  mountAiRoutes,
} from "../http.js";
import { logEvent } from "../logger.js";
import { toClientView, toDbRow } from "../mappers.js";
import { validateParentMission } from "../parentMission.js";
import { isSafe } from "../safety.js";
import { generateWeeklySummary } from "../summary.js";

function mockRes() {
  const state = { statusCode: 0, body: /** @type {any} */ (null) };
  return {
    state,
    status(/** @type {number} */ code) {
      state.statusCode = code;
      return {
        json(/** @type {any} */ payload) {
          state.body = payload;
        },
      };
    },
  };
}

describe("M6 exercise.js", () => {
  it("builds valid safe exercise missions for all 7 games with age-band targets and translation flags", () => {
    for (const item of getActivityCatalog()) {
      const young = buildExerciseMission({ age: 6, game: item.id, language: "en" });
      const older = buildExerciseMission({ age: 12, game: item.id, language: "en" });
      expect(young.category).toBe("exercise");
      expect(young.interaction).toBe("camera");
      expect(young.activity?.target).toBeLessThanOrEqual(older.activity?.target ?? 0);
      expect(isSafe(young).safe).toBe(true);
      expect(young).not.toHaveProperty("needs_translation");

      const am = buildExerciseMission({ age: 8, game: item.id, language: "am" });
      expect(am.needs_translation).toBe(true);
      const om = buildExerciseMission({ age: 8, game: item.id, language: "om" });
      expect(om.needs_translation).toBe(true);
    }
  });
});

describe("M6 mappers.js", () => {
  it("hides quiz answerIndex for child role and preserves it for parent role", () => {
    const quizMission = /** @type {any} */ ({
      title: "Ethiopia Fun Quiz",
      description: "Answer three fun questions.",
      category: "real_world",
      type: "solo",
      interaction: "quiz",
      roles: { child: "Answers questions", parent: "" },
      steps: ["Read each question", "Pick your answer"],
      activity: null,
      supervision_note: "",
      needs_parent: false,
      points: 15,
      english_summary: "Internal summary",
      quiz: [
        { q: "Q1", options: ["A", "B", "C"], answerIndex: 1 },
        { q: "Q2", options: ["A", "B", "C"], answerIndex: 2 },
        { q: "Q3", options: ["A", "B", "C"], answerIndex: 0 },
      ],
    });

    const childView = /** @type {any} */ (toClientView(quizMission, { role: "child" }));
    expect(childView).not.toHaveProperty("english_summary");
    expect(childView.quiz[0]).not.toHaveProperty("answerIndex");

    const parentView = /** @type {any} */ (toClientView(quizMission, { role: "parent" }));
    expect(parentView.quiz[0].answerIndex).toBe(1);

    const row = toDbRow(quizMission, { id: "m_1", familyId: "fam_1", language: "en" });
    expect(row.id).toBe("m_1");
    expect(row.family_id).toBe("fam_1");
    expect(row.child_role).toBe("Answers questions");
  });
});

describe("M6 validateParentMission", () => {
  const validParent = () => ({
    title: "Water Courtyard Herbs",
    description: "Water the rosemary and basil pots gently.",
    type: "solo",
    interaction: "checklist",
    roles: { child: "Waters the pots", parent: "" },
    steps: ["Fill the watering jug", "Water each herb pot"],
    supervision_note: "",
    needs_parent: false,
    points: 20,
  });

  it("accepts clean parent missions and rejects camera, out-of-range points, and PII", () => {
    expect(validateParentMission(validParent()).ok).toBe(true);
    expect(validateParentMission({ ...validParent(), interaction: "camera" }).ok).toBe(false);
    expect(validateParentMission({ ...validParent(), points: 50 }).ok).toBe(false);
    expect(validateParentMission({ ...validParent(), description: "Call 0911-223344 when done" }).ok).toBe(false);
    expect(validateParentMission({ ...validParent(), description: "Email parent@example.com" }).ok).toBe(false);
  });
});

describe("M6 summary, logger & http routes", () => {
  it("generates guilt-free weekly summaries in en, am, and om", async () => {
    const en = await generateWeeklySummary({ language: "en", completedMissions: 3, exerciseSessions: 2, totalPoints: 95 });
    expect(en.source).toBe("fallback");
    expect(en.summary).toContain("95");
    const am = await generateWeeklySummary({ language: "am", completedMissions: 2, exerciseSessions: 1, totalPoints: 50 });
    expect(am.needs_translation).toBe(true);
  });

  it("strips secrets and PII from structured log records", () => {
    let written = "";
    logEvent(
      "info",
      "test.event",
      { requestId: "req_1", apiKey: "secret-123", childName: "Abebe", email: "a@b.com", count: 3 },
      (line) => {
        written = line;
      }
    );
    expect(written).not.toContain("secret-123");
    expect(written).not.toContain("Abebe");
    expect(written).not.toContain("a@b.com");
    expect(written).toContain("req_1");
  });

  it("mounts Express-compatible routes and rejects bodies over 5 KB with HTTP 413", async () => {
    /** @type {string[]} */
    const routes = [];
    const fakeRouter = {
      get: (/** @type {string} */ p) => routes.push(`GET ${p}`),
      post: (/** @type {string} */ p) => routes.push(`POST ${p}`),
    };
    mountAiRoutes(fakeRouter, { prefix: "/ai" });
    expect(routes).toEqual([
      "POST /ai/generate",
      "POST /ai/validate",
      "GET /ai/health",
      "GET /ai/activities",
      "POST /ai/story",
      "POST /ai/summary",
    ]);

    const resHealth = mockRes();
    handleHealth({}, resHealth);
    expect(resHealth.state.statusCode).toBe(200);
    expect(resHealth.state.body.ok).toBe(true);

    const resAct = mockRes();
    handleActivities({}, resAct);
    expect(resAct.state.statusCode).toBe(200);
    expect(resAct.state.body.activities).toHaveLength(7);

    // Oversized body (> 5 KB) rejected with 413
    const resBig = mockRes();
    await handleGenerate({ body: { age: 8, padding: "x".repeat(MAX_BODY_BYTES + 100) } }, resBig);
    expect(resBig.state.statusCode).toBe(413);

    // Valid generate
    const resGen = mockRes();
    await handleGenerate({ body: { age: 8, count: 2, language: "en" } }, resGen);
    expect(resGen.state.statusCode).toBe(200);
    expect(resGen.state.body.missions).toHaveLength(2);

    // Validate parent mission with PII rejected 422
    const resVal = mockRes();
    await handleValidate(
      {
        body: {
          mode: "parent",
          mission: {
            title: "Call me",
            description: "Call +251 911 234 567",
            type: "solo",
            roles: { child: "Reads" },
            steps: ["Step 1", "Step 2"],
            points: 15,
          },
        },
      },
      resVal
    );
    expect(resVal.state.statusCode).toBe(422);
  });
});
