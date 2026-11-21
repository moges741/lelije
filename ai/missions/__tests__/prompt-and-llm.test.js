// @ts-check
import { describe, expect, it } from "vitest";
import { generateMissions as apiGenerateMissions } from "../../api/missions.js";
import { generateMissions, GENERATION_BUDGET } from "../llm.js";
import { buildMissionPrompt } from "../prompt.js";

function sampleAiMission(title, extra = {}) {
  return {
    title,
    description: "Help prepare fresh fruit for the family table together.",
    category: "real_world",
    type: "solo",
    interaction: "checklist",
    roles: { child: "Washes the fruit with clean water", parent: "" },
    steps: ["Wash your hands with soap", "Rinse the fruit in a bowl", "Arrange it neatly on a plate"],
    activity: null,
    supervision_note: "",
    needs_parent: false,
    points: 15,
    english_summary: "Child rinses fruit in clean water and places it on a plate.",
    ...extra,
  };
}

describe("M3 prompt.js", () => {
  it("strips PII from interests and requests only real_world Ethiopian missions with english_summary", () => {
    const prompt = buildMissionPrompt({
      age: 7,
      language: "am",
      interests: ["drawing", "test@example.com", "+251 911 234 567", "football"],
      count: 3,
      excludeTitles: ["Story Time Reader"],
    });

    expect(prompt.sanitisedInterests).toEqual(["drawing", "football"]);
    expect(prompt.user).not.toContain("test@example.com");
    expect(prompt.user).not.toContain("911");
    expect(prompt.system).toContain("real_world");
    expect(prompt.system).toContain("english_summary");
    expect(prompt.system).toContain("Ethiopia");
    expect(prompt.user).toContain("Amharic");
  });
});

describe("M4 llm.js & M5 api/missions.js", () => {
  it("supports Gemini, Anthropic, and OpenAI adapters via fetch and strips english_summary", async () => {
    const payload = JSON.stringify({
      missions: [
        sampleAiMission("Fruit Bowl Artist"),
        sampleAiMission("Story Sketchbook"),
        sampleAiMission("Courtyard Sweeper"),
      ],
    });

    // Gemini
    const gemRes = await generateMissions({
      age: 9,
      language: "en",
      count: 3,
      _env: { AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-key" },
      _fetch: async () =>
        /** @type {any} */ ({
          ok: true,
          json: async () => ({ candidates: [{ content: { parts: [{ text: payload }] } }] }),
        }),
    });
    expect(gemRes.source).toBe("ai");
    expect(gemRes.missions).toHaveLength(3);
    expect(gemRes.missions[0]).not.toHaveProperty("english_summary");

    // Anthropic
    const anthRes = await generateMissions({
      age: 9,
      language: "en",
      count: 2,
      _env: { AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key" },
      _fetch: async () =>
        /** @type {any} */ ({
          ok: true,
          json: async () => ({ content: [{ type: "text", text: payload }] }),
        }),
    });
    expect(anthRes.source).toBe("ai");
    expect(anthRes.missions).toHaveLength(2);

    // OpenAI
    const oaiRes = await generateMissions({
      age: 9,
      language: "en",
      count: 2,
      _env: { AI_PROVIDER: "openai", OPENAI_API_KEY: "test-key" },
      _fetch: async () =>
        /** @type {any} */ ({
          ok: true,
          json: async () => ({ choices: [{ message: { content: payload } }] }),
        }),
    });
    expect(oaiRes.source).toBe("ai");
    expect(oaiRes.missions).toHaveLength(2);
  });

  it("never throws on AI failure and always returns exact count via fallback", async () => {
    const res = await generateMissions({
      age: 8,
      language: "en",
      count: 4,
      _env: { AI_PROVIDER: "openai", OPENAI_API_KEY: "test-key" },
      _fetch: async () => {
        throw new Error("network down");
      },
    });
    expect(res.source).toBe("fallback");
    expect(res.missions).toHaveLength(4);
    expect(typeof res.generatedAt).toBe("string");
  });

  it("skips retry when fewer than 2 seconds remain in the 8-second total budget", async () => {
    let calls = 0;
    let fakeClock = 0;
    const res = await generateMissions({
      age: 8,
      language: "en",
      count: 2,
      _env: { AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-key" },
      _now: () => fakeClock,
      _fetch: async () => {
        calls += 1;
        fakeClock += GENERATION_BUDGET.totalBudgetMs - 1000; // only 1s left (< 2s retry floor)
        throw new Error("timeout");
      },
    });
    expect(calls).toBe(1);
    expect(res.source).toBe("fallback");
    expect(res.missions).toHaveLength(2);
  });

  it("supports MOCK_AI and includeExercise through ai/api/missions.js", async () => {
    const res = await apiGenerateMissions({
      age: 10,
      language: "en",
      count: 3,
      includeExercise: true,
      mock: true,
    });
    expect(res.source).toBe("mock");
    expect(res.missions).toHaveLength(3);
    expect(res.missions[0].category).toBe("exercise");
    expect(res.missions[0].interaction).toBe("camera");
  });
});
