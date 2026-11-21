// @ts-check
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  companionLine,
  countWords,
  generateStoryChapter,
  STORY_LIMITS,
  STORY_REGIONS,
  validateStoryChapter,
} from "../storyteller.js";

const fallbackStory = JSON.parse(readFileSync(new URL("../fallback_story.json", import.meta.url), "utf8"));

describe("S1 fallback_story.json", () => {
  it("provides 3 regions x 2 chapters in en, am, om with 80-120 words and safe positive text", () => {
    for (const lang of ["en", "am", "om"]) {
      for (const region of STORY_REGIONS) {
        const chapters = fallbackStory[lang][region];
        expect(chapters, `${lang}/${region}`).toHaveLength(2);
        for (const ch of chapters) {
          const words = countWords(ch.text);
          expect(words, `${lang}/${region}/ch${ch.chapter} (${words} words)`).toBeGreaterThanOrEqual(
            STORY_LIMITS.minWords
          );
          expect(words, `${lang}/${region}/ch${ch.chapter} (${words} words)`).toBeLessThanOrEqual(
            STORY_LIMITS.maxWords
          );
          expect(validateStoryChapter(ch.text, ch.choices).ok).toBe(true);
          if (lang !== "en") expect(ch.needs_translation).toBe(true);
        }
      }
    }
  });
});

describe("S1 generateStoryChapter & companionLine", () => {
  it("falls back cleanly on LLM error or frightening output and personalises companionName", async () => {
    const res = await generateStoryChapter({
      age: 8,
      language: "en",
      region: "simien",
      chapter: 1,
      companionName: "Buna",
      _env: { AI_PROVIDER: "openai", OPENAI_API_KEY: "test" },
      _fetch: async () => {
        throw new Error("timeout");
      },
    });
    expect(res.source).toBe("fallback");
    expect(res.text).toContain("Buna");
    expect(res.choices).toHaveLength(2);
    expect(res.endsWith).toBe("choice");

    // Frightening LLM output must be rejected and replaced by safe fallback.
    const scaryText =
      "A terrifying ghost and scary monster chased everyone through the haunted forest " +
      "word ".repeat(85);
    const safeRes = await generateStoryChapter({
      age: 7,
      region: "highlands",
      chapter: 2,
      _env: { AI_PROVIDER: "openai", OPENAI_API_KEY: "test" },
      _fetch: async () =>
        /** @type {any} */ ({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ text: scaryText, choices: [], endsWith: "rest" }) } }],
          }),
        }),
    });
    expect(safeRes.source).toBe("fallback");
    expect(safeRes.endsWith).toBe("rest");
  });

  it("returns scripted companion lines across en, am, om without any LLM", () => {
    const en = companionLine({ event: "combo", language: "en", mood: "cheer" });
    expect(en.text.length).toBeGreaterThan(5);
    expect(en).not.toHaveProperty("needs_translation");

    const am = companionLine({ event: "finish", language: "am", mood: "happy" });
    expect(am.needs_translation).toBe(true);

    const om = companionLine({ event: "freeze", language: "om", mood: "calm" });
    expect(om.needs_translation).toBe(true);
  });
});
