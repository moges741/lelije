// @ts-check
import { describe, expect, it } from "vitest";
import { containsPersonalInfo, isSafe, stripPersonalInfo } from "../safety.js";
import { validateMission } from "../validate.js";

function baseMission(overrides = {}) {
  return {
    title: "Evening Story Helper",
    description: "Read a short story aloud and talk about it together.",
    type: "solo",
    roles: { child: "Reads the story aloud", parent: "" },
    steps: ["Pick a favourite book", "Read for 15 minutes", "Share one thing you learned"],
    supervision_note: "",
    needs_parent: false,
    points: 15,
    ...overrides,
  };
}

describe("Decisions 2 & 3: outdoor needs_parent and 7 interaction shapes", () => {
  it("forces needs_parent: true on outdoor missions", () => {
    const res = validateMission(
      baseMission({
        type: "outdoor",
        needs_parent: false,
        roles: { child: "Plays football", parent: "Approves friends and place" },
        steps: ["Ask your parent for permission and approved friends", "Play for 20 minutes and return"],
        supervision_note: "Parent approves the friends and area.",
      })
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.mission.needs_parent).toBe(true);
  });

  it("validates quiz interaction (exactly 3 questions, 3 options, answerIndex 0..2)", () => {
    const quiz = [
      { q: "Which mountain range is home to gelada monkeys?", options: ["Simien", "Alps", "Andes"], answerIndex: 0 },
      { q: "What grain is traditional injera made from?", options: ["Rice", "Teff", "Oats"], answerIndex: 1 },
      { q: "What flower blooms in yellow after the rains?", options: ["Rose", "Tulip", "Meskel flower"], answerIndex: 2 },
    ];
    const ok = validateMission(baseMission({ interaction: "quiz", quiz }));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.mission.quiz).toHaveLength(3);

    // Wrong question count rejected
    expect(validateMission(baseMission({ interaction: "quiz", quiz: quiz.slice(0, 2) })).ok).toBe(false);
    // Out-of-range answerIndex rejected
    const badIdx = quiz.map((item, i) => (i === 0 ? { ...item, answerIndex: 3 } : item));
    expect(validateMission(baseMission({ interaction: "quiz", quiz: badIdx })).ok).toBe(false);
  });

  it("validates story, timer, scavenger, and family_challenge interactions", () => {
    const storyRes = validateMission(
      baseMission({
        interaction: "story",
        story: {
          opening: "A cheerful hoopoe bird visits the sunny courtyard garden.",
          choices: [["Follow the garden path", "Help water the herbs"]],
        },
      })
    );
    expect(storyRes.ok).toBe(true);

    const timerOk = validateMission(baseMission({ interaction: "timer", duration_sec: 600 }));
    expect(timerOk.ok).toBe(true);
    expect(validateMission(baseMission({ interaction: "timer", duration_sec: 30 })).ok).toBe(false);
    expect(validateMission(baseMission({ interaction: "timer", duration_sec: 2000 })).ok).toBe(false);

    const scavOk = validateMission(
      baseMission({ interaction: "scavenger", items: ["A smooth stone", "A green leaf", "A yellow flower"] })
    );
    expect(scavOk.ok).toBe(true);
    expect(validateMission(baseMission({ interaction: "scavenger", items: ["Only one", "Only two"] })).ok).toBe(false);

    const famChallenge = validateMission(
      baseMission({
        type: "family",
        interaction: "family_challenge",
        roles: { child: "Leads the clapping rhythm", parent: "Joins and claps along" },
        supervision_note: "Play together in a clear room.",
      })
    );
    expect(famChallenge.ok).toBe(true);
  });
});

describe("M2 safety.js: scans every text field including quiz and story", () => {
  it("accepts a safe solo mission and safe outdoor mission with parent approval", () => {
    expect(isSafe(baseMission()).safe).toBe(true);
    expect(
      isSafe(
        baseMission({
          type: "outdoor",
          needs_parent: true,
          roles: { child: "Plays hopscotch", parent: "Approves friends" },
          steps: ["Ask your parent for permission and approved friends", "Play Segno Maksegno for 20 minutes"],
          supervision_note: "Parent approves place and time.",
        })
      ).safe
    ).toBe(true);
  });

  it("rejects unsafe text hidden inside quiz options or story choices (Decision 4)", () => {
    const unsafeQuiz = baseMission({
      interaction: "quiz",
      quiz: [
        { q: "Fun riddle 1", options: ["Sun", "Moon", "Buy now with credit card"], answerIndex: 0 },
        { q: "Fun riddle 2", options: ["A", "B", "C"], answerIndex: 1 },
        { q: "Fun riddle 3", options: ["A", "B", "C"], answerIndex: 2 },
      ],
    });
    const r1 = isSafe(unsafeQuiz);
    expect(r1.safe).toBe(false);
    expect(r1.reasons.join(" ")).toContain("manipulative");

    const unsafeStory = baseMission({
      interaction: "story",
      story: {
        opening: "A sunny day in the garden.",
        choices: [["Play nicely", "Sneak out and talk to strangers"]],
      },
    });
    const r2 = isSafe(unsafeStory);
    expect(r2.safe).toBe(false);
    expect(r2.reasons.join(" ")).toContain("strangers");
  });

  it("enforces outdoor parent-approval step and needs_parent rule", () => {
    const noApproval = baseMission({
      type: "outdoor",
      needs_parent: true,
      steps: ["Go outside to the field", "Kick the ball for 20 minutes"],
    });
    const r = isSafe(noApproval);
    expect(r.safe).toBe(false);
    expect(r.reasons.join(" ")).toContain("parent-approval");

    const noFlag = baseMission({
      type: "outdoor",
      needs_parent: false,
      steps: ["Ask your parent for permission", "Play in the yard"],
    });
    expect(isSafe(noFlag).safe).toBe(false);
  });

  it("detects and strips emails, phone numbers, and street/kebele addresses", () => {
    expect(containsPersonalInfo("Call +251 911 234 567 or email kid@example.com").types).toEqual([
      "email",
      "phone",
    ]);
    expect(containsPersonalInfo("Meet at Kebele 14 House No 22").hasPii).toBe(true);
    const cleaned = stripPersonalInfo("drawing kid@example.com +251-911-223344 football");
    expect(cleaned).toBe("drawing football");
  });
});
