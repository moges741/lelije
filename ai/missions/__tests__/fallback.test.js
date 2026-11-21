// @ts-check
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateMission } from "../validate.js";

/** @type {Record<string, Record<string, any>[]>} */
const fallback = JSON.parse(readFileSync(new URL("../fallback.json", import.meta.url), "utf8"));

const LANGUAGES = ["en", "am", "om"];

/**
 * @param {Record<string, any>[]} list
 * @param {string} type
 */
const countType = (list, type) => list.filter((mission) => mission.type === type).length;

describe("fallback.json", () => {
  it("has a list for English, Amharic and Afaan Oromoo", () => {
    expect(Object.keys(fallback).sort()).toEqual(["am", "en", "om"]);
    for (const language of LANGUAGES) expect(Array.isArray(fallback[language])).toBe(true);
  });

  it("has at least 6 solo, 8 family and 5 outdoor missions in English", () => {
    expect(countType(fallback.en, "solo")).toBeGreaterThanOrEqual(6);
    expect(countType(fallback.en, "family")).toBeGreaterThanOrEqual(8);
    expect(countType(fallback.en, "outdoor")).toBeGreaterThanOrEqual(5);
  });

  it("gives Amharic and Afaan Oromoo the same number of missions as English", () => {
    expect(fallback.am).toHaveLength(fallback.en.length);
    expect(fallback.om).toHaveLength(fallback.en.length);
  });

  it("flags only untranslated copies with needs_translation", () => {
    for (const mission of fallback.en) expect(mission).not.toHaveProperty("needs_translation");
    for (const language of ["am", "om"]) {
      for (const mission of fallback[language]) {
        // A translated entry simply has the flag removed; an English copy must still carry it.
        const stillEnglish = fallback.en.some((english) => english.title === mission.title);
        if (stillEnglish) expect(mission.needs_translation, `${language}: ${mission.title}`).toBe(true);
      }
    }
  });

  for (const language of LANGUAGES) {
    describe(`"${language}" missions`, () => {
      it("are all valid and already normalised", () => {
        for (const entry of fallback[language]) {
          const result = validateMission(entry);
          if (!result.ok) {
            throw new Error(`${language}: "${entry.title}" is invalid: ${result.errors.join("; ")}`);
          }
          // Validation must not need to change anything (no clamping, no forced needs_parent).
          const { needs_translation: _flag, ...stored } = entry;
          expect(result.mission, `${language}: ${entry.title}`).toEqual(stored);
        }
      });

      it("are all real-world checklist missions", () => {
        for (const mission of fallback[language]) {
          expect(mission.category, mission.title).toBe("real_world");
          expect(mission.interaction, mission.title).toBe("checklist");
          expect(mission.activity, mission.title).toBeNull();
        }
      });

      it("have unique titles", () => {
        const titles = fallback[language].map((mission) => mission.title);
        expect(new Set(titles).size).toBe(titles.length);
      });

      it("always involve the parent in family missions", () => {
        for (const mission of fallback[language].filter((m) => m.type === "family")) {
          expect(mission.needs_parent, mission.title).toBe(true);
          expect(mission.roles.parent, mission.title).not.toBe("");
          expect(mission.supervision_note, mission.title).not.toBe("");
        }
      });

      it("give every outdoor mission needs_parent true plus a parent-approval role and note", () => {
        for (const mission of fallback[language].filter((m) => m.type === "outdoor")) {
          expect(mission.needs_parent, mission.title).toBe(true);
          expect(mission.roles.parent, mission.title).not.toBe("");
          expect(mission.supervision_note, mission.title).not.toBe("");
        }
      });
    });
  }

  it("names approved friends and a time limit in every English outdoor mission", () => {
    for (const mission of fallback.en.filter((m) => m.type === "outdoor")) {
      const text = [mission.title, mission.description, ...mission.steps, mission.supervision_note].join(" ");
      expect(text, mission.title).toMatch(/approved friends/i);
      expect(text, mission.title).toMatch(/\d+ minutes?/i);
    }
  });
});
