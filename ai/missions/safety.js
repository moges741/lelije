// @ts-check
// Child-safety filter for LeLije missions, parent missions, and story chapters (M2, Decision 4).
// Pure logic: no network, no storage, scans EVERY text field including quiz and story.

import { collectMissionTexts, involvesHazard } from "./validate.js";

/**
 * Patterns that must NEVER appear in child-facing content.
 * @type {Array<{ reason: string, pattern: RegExp }>}
 */
const BLOCKED_PATTERNS = [
  {
    reason: "contains violence or weapon language",
    pattern: /\b(kill(s|ed|ing)?|murder|stab(s|bed|bing)?|shoot(s|ing)?|gun(s)?|pistol|rifle|bomb(s)?|weapon(s)?|blood|bleed(ing)?|punch(es|ing)?|beat up|hurt yourself|fight(ing)? each other)\b/i,
  },
  {
    reason: "contains self-harm or dangerous stunt language",
    pattern: /\b(self[- ]?harm|suicide|choke|suffocate|swallow (soap|bleach|coins|batteries)|climb (the )?roof|jump off (the )?(roof|balcony|window)|play with (matches|lighter|electricity|outlets?))\b/i,
  },
  {
    reason: "contains alcohol, tobacco or drug language",
    pattern: /\b(alcohol|beer|wine|vodka|whiskey|tej|tella|areke|cigarette(s)?|smoke|smoking|vape|tobacco|khat|chat chew|marijuana|weed|cocaine|drugs?)\b/i,
  },
  {
    reason: "contains adult or inappropriate sexual language",
    pattern: /\b(sex(ual)?|naked|nude|porn|dating|kiss(ing)? strangers?|sexy)\b/i,
  },
  {
    reason: "encourages meeting strangers or leaving home unsupervised",
    pattern: /\b(talk to strangers?|meet a stranger|go with a stranger|sneak out|leave (the )?house alone|walk alone at night|don'?t tell your parents?|keep (a )?secret from your parents?)\b/i,
  },
  {
    reason: "contains manipulative mechanics, gambling, or purchases",
    pattern: /\b(buy now|spend money|credit card|in-app purchase|loot ?box|gambl(e|ing)|bet money|slot machine|lose your streak|streak (broken|lost)|don'?t break your streak|play forever|infinite loop)\b/i,
  },
  {
    reason: "contains shaming, bullying, or guilt language",
    pattern: /\b(stupid|idiot|loser|ugly|fat|lazy kid|worthless|shame on you|you failed badly|nobody likes you)\b/i,
  },
];

/** Patterns that indicate personal identifying information (PII). */
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{3}[\s.-]?\d{3,4}\b/;
const ADDRESS_PATTERN =
  /\b(\d{1,5}\s+[A-Za-z0-9.\s]{2,30}\s+(street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?)|kebele\s+\d+|woreda\s+\d+|house\s*(no\.?|#)\s*\d+|p\.?o\.?\s*box\s+\d+)\b/i;

const PARENT_APPROVAL_STEP_PATTERN =
  /\b(ask (your )?(parent|mom|mum|mother|dad|father|guardian|adult)|parent approves?|approved (friends?|place|area)|with permission|get permission|tell (your )?(parent|adult))\b/i;

/**
 * Checks whether a text string contains a phone number, email, or street/kebele address.
 * @param {string} text
 * @returns {{ hasPii: boolean, types: string[] }}
 */
export function containsPersonalInfo(text) {
  /** @type {string[]} */
  const types = [];
  if (typeof text !== "string" || text.trim() === "") return { hasPii: false, types };
  if (EMAIL_PATTERN.test(text)) types.push("email");
  if (PHONE_PATTERN.test(text)) types.push("phone");
  if (ADDRESS_PATTERN.test(text)) types.push("address");
  return { hasPii: types.length > 0, types };
}

/**
 * Removes emails, phone numbers, and street/kebele addresses from free-text inputs
 * (e.g. child interests before building an LLM prompt).
 * @param {string} text
 * @returns {string}
 */
export function stripPersonalInfo(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(new RegExp(EMAIL_PATTERN.source, "gi"), "")
    .replace(new RegExp(PHONE_PATTERN.source, "gi"), "")
    .replace(new RegExp(ADDRESS_PATTERN.source, "gi"), "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Scans an arbitrary array of text strings against the child-safety block list & PII check.
 * Useful for both missions and generated story chapters.
 * @param {string[]} texts
 * @returns {{ safe: boolean, reasons: string[] }}
 */
export function checkTextsSafe(texts) {
  /** @type {string[]} */
  const reasons = [];
  const joined = texts.filter((t) => typeof t === "string").join("\n");

  for (const rule of BLOCKED_PATTERNS) {
    if (rule.pattern.test(joined)) {
      reasons.push(rule.reason);
    }
  }

  const pii = containsPersonalInfo(joined);
  if (pii.hasPii) {
    reasons.push(`contains personal info (${pii.types.join(", ")})`);
  }

  return { safe: reasons.length === 0, reasons };
}

/**
 * Checks whether a mission is child-safe across every text field (including quiz & story)
 * and every structural safety rule.
 *
 * @param {Record<string, any>} mission
 * @returns {{ safe: boolean, reasons: string[] }}
 */
export function isSafe(mission) {
  if (!mission || typeof mission !== "object" || Array.isArray(mission)) {
    return { safe: false, reasons: ["mission must be an object"] };
  }

  const texts = collectMissionTexts(mission);
  const textCheck = checkTextsSafe(texts);
  /** @type {string[]} */
  const reasons = [...textCheck.reasons];

  // Steps count rule (2..5).
  if (!Array.isArray(mission.steps) || mission.steps.length < 2 || mission.steps.length > 5) {
    reasons.push("steps must have 2 to 5 items");
  }

  // Family, cooking/hazard, and outdoor missions MUST require parent involvement.
  const isFamily = mission.type === "family";
  const isOutdoor = mission.type === "outdoor";
  const hasHazard = involvesHazard(mission);

  if ((isFamily || isOutdoor || hasHazard) && mission.needs_parent !== true) {
    reasons.push("family, cooking/hazard, and outdoor missions must have needs_parent: true");
  }

  if (isFamily) {
    if (!mission.roles?.parent || String(mission.roles.parent).trim() === "") {
      reasons.push("family missions require roles.parent");
    }
    if (!mission.supervision_note || String(mission.supervision_note).trim() === "") {
      reasons.push("family missions require supervision_note");
    }
  }

  // Outdoor missions must include an explicit parent-approval step (or english_summary note for am/om).
  if (isOutdoor) {
    const stepAndSummary = [
      ...(Array.isArray(mission.steps) ? mission.steps : []),
      mission.english_summary || "",
      mission.supervision_note || "",
    ].join(" ");
    if (!PARENT_APPROVAL_STEP_PATTERN.test(stepAndSummary)) {
      reasons.push("outdoor missions must include a parent-approval step");
    }
  }

  return { safe: reasons.length === 0, reasons };
}
