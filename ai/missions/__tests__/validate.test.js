// @ts-check
import { describe, expect, it } from "vitest";
import { involvesHazard, LIMITS, validateMission, validateMissionList } from "../validate.js";

/**
 * A valid solo mission. Pass overrides to break or change one thing at a time.
 * @param {Record<string, unknown>} [overrides]
 */
function goodMission(overrides = {}) {
  return {
    title: "Story Time Reader",
    description: "Read a story for 15 minutes and share your favourite part.",
    type: "solo",
    roles: { child: "Reads and shares the best part", parent: "" },
    steps: ["Pick a story", "Read for 15 minutes", "Share your favourite part"],
    supervision_note: "",
    needs_parent: false,
    points: 15,
    ...overrides,
  };
}

/** @param {Record<string, unknown>} [overrides] */
function familyMission(overrides = {}) {
  return goodMission({
    title: "Table Helper",
    description: "Help set the table for the family meal.",
    type: "family",
    roles: { child: "Sets out the plates", parent: "Carries the food to the table" },
    steps: ["Wash your hands", "Set out the plates", "Call everyone to eat"],
    supervision_note: "The parent carries the food.",
    needs_parent: true,
    points: 20,
    ...overrides,
  });
}

/** @param {Record<string, unknown>} raw */
function expectValid(raw) {
  const result = validateMission(raw);
  if (!result.ok) throw new Error(`expected a valid mission, got: ${result.errors.join("; ")}`);
  return result.mission;
}

/** @param {unknown} raw */
function expectInvalid(raw) {
  const result = validateMission(raw);
  if (result.ok) throw new Error("expected the mission to be rejected");
  return result.errors.join("; ");
}

describe("validateMission: accepts good missions", () => {
  it("accepts a good mission and fills in the defaults", () => {
    const mission = expectValid(goodMission());
    expect(mission).toEqual({
      title: "Story Time Reader",
      description: "Read a story for 15 minutes and share your favourite part.",
      category: "real_world",
      type: "solo",
      interaction: "checklist",
      roles: { child: "Reads and shares the best part", parent: "" },
      steps: ["Pick a story", "Read for 15 minutes", "Share your favourite part"],
      activity: null,
      supervision_note: "",
      needs_parent: false,
      points: 15,
    });
  });

  it("trims text and collapses extra spaces", () => {
    const mission = expectValid(
      goodMission({ title: "  Story   Time  ", steps: [" Pick a story ", "Read\n it", "Share  it"] })
    );
    expect(mission.title).toBe("Story Time");
    expect(mission.steps).toEqual(["Pick a story", "Read it", "Share it"]);
  });

  it("does not change the input object", () => {
    const raw = goodMission({ title: "  Story Time  ", points: 99 });
    const copy = JSON.parse(JSON.stringify(raw));
    validateMission(raw);
    expect(raw).toEqual(copy);
  });

  it("treats a missing parent role, note and needs_parent as empty / false for solo missions", () => {
    const raw = goodMission({ roles: { child: "Reads" } });
    delete (/** @type {Record<string, unknown>} */ (raw).supervision_note);
    delete (/** @type {Record<string, unknown>} */ (raw).needs_parent);
    const mission = expectValid(raw);
    expect(mission.roles.parent).toBe("");
    expect(mission.supervision_note).toBe("");
    expect(mission.needs_parent).toBe(false);
  });

  it("keeps english_summary and drops unknown fields", () => {
    const mission = expectValid(
      goodMission({ english_summary: "The child reads a story.", id: "m_1", childName: "x", needs_translation: true })
    );
    expect(mission.english_summary).toBe("The child reads a story.");
    expect(mission).not.toHaveProperty("id");
    expect(mission).not.toHaveProperty("childName");
    expect(mission).not.toHaveProperty("needs_translation");
  });

  it("counts characters, not bytes, so Amharic text gets the full limit", () => {
    const amharicTitle = "ሀ".repeat(LIMITS.titleMax); // 60 characters, 180 bytes in UTF-8
    expect(expectValid(goodMission({ title: amharicTitle })).title).toBe(amharicTitle);
    expect(expectInvalid(goodMission({ title: amharicTitle + "ሀ" }))).toContain("title");
  });
});

describe("validateMission: rejects malformed missions", () => {
  it("rejects things that are not objects", () => {
    for (const raw of [null, undefined, "mission", 42, [goodMission()]]) {
      expect(expectInvalid(raw)).toContain("mission must be an object");
    }
  });

  it("rejects a missing, empty or non-string title", () => {
    const missing = goodMission();
    delete (/** @type {Record<string, unknown>} */ (missing).title);
    expect(expectInvalid(missing)).toContain("title is required");
    expect(expectInvalid(goodMission({ title: "   " }))).toContain("title must not be empty");
    expect(expectInvalid(goodMission({ title: 123 }))).toContain("title must be a string");
  });

  it("rejects a title over 60 or a description over 200 characters", () => {
    expect(expectInvalid(goodMission({ title: "a".repeat(61) }))).toContain("title must be at most 60");
    expect(expectInvalid(goodMission({ description: "a".repeat(201) }))).toContain(
      "description must be at most 200"
    );
  });

  it("rejects an unknown or missing type", () => {
    expect(expectInvalid(goodMission({ type: "physical" }))).toContain("type must be one of");
    const missing = goodMission();
    delete (/** @type {Record<string, unknown>} */ (missing).type);
    expect(expectInvalid(missing)).toContain("type is required");
  });

  it("rejects fewer than 2 or more than 5 steps", () => {
    expect(expectInvalid(goodMission({ steps: ["Only one"] }))).toContain("steps must have 2 to 5");
    expect(expectInvalid(goodMission({ steps: ["1", "2", "3", "4", "5", "6"] }))).toContain(
      "steps must have 2 to 5"
    );
    expect(expectInvalid(goodMission({ steps: "Read a story" }))).toContain("steps must be an array");
  });

  it("rejects empty or non-string steps", () => {
    expect(expectInvalid(goodMission({ steps: ["Pick a story", ""] }))).toContain("steps[1]");
    expect(expectInvalid(goodMission({ steps: ["Pick a story", 7] }))).toContain("steps[1] must be a string");
  });

  it("rejects missing roles or a missing child role", () => {
    expect(expectInvalid(goodMission({ roles: undefined }))).toContain("roles must be an object");
    expect(expectInvalid(goodMission({ roles: { parent: "Helps" } }))).toContain("roles.child is required");
  });

  it("rejects points that are not a number and needs_parent that is not a boolean", () => {
    expect(expectInvalid(goodMission({ points: "20" }))).toContain("points must be a number");
    expect(expectInvalid(goodMission({ points: Number.NaN }))).toContain("points must be a number");
    expect(expectInvalid(goodMission({ needs_parent: "yes" }))).toContain("needs_parent must be true or false");
  });

  it("rejects an unknown category or interaction", () => {
    expect(expectInvalid(goodMission({ category: "screen_time" }))).toContain("category must be one of");
    expect(expectInvalid(goodMission({ interaction: "video" }))).toContain("interaction must be one of");
  });

  it("reports every problem at once", () => {
    const errors = expectInvalid(goodMission({ title: "", type: "x", points: "many" }));
    expect(errors).toContain("title");
    expect(errors).toContain("type");
    expect(errors).toContain("points");
  });
});

describe("validateMission: points", () => {
  it("clamps points to 10..30 and rounds to a whole number", () => {
    expect(expectValid(goodMission({ points: 5 })).points).toBe(10);
    expect(expectValid(goodMission({ points: -40 })).points).toBe(10);
    expect(expectValid(goodMission({ points: 99 })).points).toBe(30);
    expect(expectValid(goodMission({ points: 17.6 })).points).toBe(18);
    expect(expectValid(goodMission({ points: 10 })).points).toBe(10);
    expect(expectValid(goodMission({ points: 30 })).points).toBe(30);
  });
});

describe("validateMission: needs_parent rules", () => {
  it("forces needs_parent to true for every family mission", () => {
    expect(expectValid(familyMission({ needs_parent: false })).needs_parent).toBe(true);
  });

  it("requires a parent role and a supervision note on family missions", () => {
    expect(expectInvalid(familyMission({ roles: { child: "Sets out the plates", parent: "" } }))).toContain(
      "roles.parent is required for family missions"
    );
    expect(expectInvalid(familyMission({ supervision_note: "" }))).toContain(
      "supervision_note is required for family missions"
    );
  });

  it("forces needs_parent to true when a step involves cooking, heat, knives or cleaning chemicals", () => {
    const hazards = [
      "Cook the lentils",
      "Stand next to the stove",
      "Chop the onions with a knife",
      "Pour the boiling water",
      "Clean the floor with bleach",
    ];
    for (const step of hazards) {
      const mission = expectValid(goodMission({ steps: ["Wash your hands", step] }));
      expect(mission.needs_parent, step).toBe(true);
    }
  });

  it("uses english_summary to spot hazards in missions written in other languages", () => {
    const mission = expectValid(
      goodMission({
        title: "ሽሮ ማዘጋጀት",
        steps: ["እጅህን ታጠብ", "ሽሮውን አዘጋጅ"],
        english_summary: "The child helps to cook shiro on the stove.",
      })
    );
    expect(mission.needs_parent).toBe(true);
  });

  it("leaves needs_parent false for a harmless solo mission", () => {
    expect(expectValid(goodMission()).needs_parent).toBe(false);
    expect(involvesHazard(goodMission())).toBe(false);
  });

  it("does not treat words that merely contain a hazard word as hazards", () => {
    // "shot", "photo" and "cute" contain "hot" / "cut" but are not hazards.
    const mission = expectValid(goodMission({ steps: ["Take your best shot at a cute drawing", "Show it"] }));
    expect(mission.needs_parent).toBe(false);
  });
});

describe("validateMission: category, interaction and activity", () => {
  const exercise = () =>
    goodMission({
      title: "Star Jumps",
      description: "Jump in front of the camera.",
      category: "exercise",
      interaction: "camera",
      activity: { game: "catch_the_stars", target: 10 },
      steps: ["Clear some space", "Do the exercise in front of the camera", "Drink some water"],
    });

  it("accepts a valid exercise mission", () => {
    const mission = expectValid(exercise());
    expect(mission.category).toBe("exercise");
    expect(mission.interaction).toBe("camera");
    expect(mission.activity).toEqual({ game: "catch_the_stars", target: 10 });
  });

  it("rejects an exercise mission without the camera or without an activity", () => {
    expect(expectInvalid({ ...exercise(), interaction: "checklist" })).toContain(
      'exercise missions must use interaction "camera"'
    );
    expect(expectInvalid({ ...exercise(), activity: null })).toContain("exercise missions need an activity");
  });

  it("rejects a real_world mission that uses the camera or carries an activity", () => {
    expect(expectInvalid(goodMission({ interaction: "camera" }))).toContain(
      'real_world missions cannot use interaction "camera"'
    );
    expect(expectInvalid(goodMission({ activity: { game: "catch_the_stars", target: 5 } }))).toContain(
      "activity is only allowed on exercise missions"
    );
  });

  it("rejects a malformed activity", () => {
    expect(expectInvalid({ ...exercise(), activity: { game: "catch_the_stars", target: 0 } })).toContain(
      "activity.target"
    );
    expect(expectInvalid({ ...exercise(), activity: { game: "catch_the_stars", target: 2.5 } })).toContain(
      "activity.target"
    );
    expect(expectInvalid({ ...exercise(), activity: { target: 10 } })).toContain("activity.game is required");
    expect(expectInvalid({ ...exercise(), activity: "jump" })).toContain("activity must be an object or null");
  });
});

describe("validateMissionList", () => {
  it("separates valid missions from rejected ones and keeps the order", () => {
    const { missions, rejected } = validateMissionList([
      goodMission({ title: "First" }),
      goodMission({ title: "" }),
      goodMission({ title: "Third" }),
      "not a mission",
    ]);
    expect(missions.map((mission) => mission.title)).toEqual(["First", "Third"]);
    expect(rejected.map((entry) => entry.index)).toEqual([1, 3]);
    expect(rejected[0].errors.join(" ")).toContain("title");
  });

  it("never throws when the input is not a list", () => {
    for (const raw of [null, undefined, "text", { missions: [] }]) {
      const { missions, rejected } = validateMissionList(raw);
      expect(missions).toEqual([]);
      expect(rejected).toHaveLength(1);
    }
  });
});
