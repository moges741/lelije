// @ts-check
// Deterministic exercise mission builder (NO LLM) backed by ai/pose/catalog.js (M6).
// Scales targets by age band (6-7, 8-9, 10-12) and provides en/am/om templates
// with am/om flagged needs_translation: true until human-translated.

import { clampActivityTarget, getActivityById, getActivityCatalog } from "../pose/catalog.js";
import { validateMission } from "./validate.js";

/** @typedef {import("../pose/catalog.js").ActivityId} ActivityId */
/** @typedef {import("./validate.js").Mission} Mission */

/**
 * Age-band target multipliers relative to catalog min/default/max.
 * @param {number} age
 * @param {import("../pose/catalog.js").ActivityCatalogItem} entry
 * @returns {number}
 */
export function targetForAgeBand(age, entry) {
  const clampedAge = Math.max(6, Math.min(12, Math.round(Number.isFinite(age) ? age : 8)));
  let raw = entry.defaultTarget;
  if (clampedAge <= 7) {
    raw = Math.round(entry.minTarget + (entry.defaultTarget - entry.minTarget) * 0.4);
  } else if (clampedAge <= 9) {
    raw = entry.defaultTarget;
  } else {
    raw = Math.round(entry.defaultTarget + (entry.maxTarget - entry.defaultTarget) * 0.45);
  }
  return clampActivityTarget(entry, raw);
}

/** @type {Record<ActivityId, { en: { title: string, description: string, childRole: string, steps: string[] }, am: { title: string, description: string, childRole: string, steps: string[] }, om: { title: string, description: string, childRole: string, steps: string[] } }>} */
const TEMPLATES = {
  catch_the_stars: {
    en: {
      title: "Catch the Stars",
      description: "Jump to catch glowing stars and raise both arms to catch fluffy clouds.",
      childRole: "Jumps for stars and raises both arms for clouds",
      steps: [
        "Clear a small safe space in front of the screen",
        "Stand back so your whole body fits in the frame",
        "Jump for stars and lift both arms for clouds until time is up",
      ],
    },
    am: {
      title: "ኮከቦችን ያዝ (Catch the Stars)",
      description: "ኮከቦችን ለመያዝ ዝለል፤ ደመናዎችን ለመያዝ ሁለቱንም እጆችህን አንሳ።",
      childRole: "ለኮከብ ይዘላል፣ ለደመና ሁለቱንም እጆች ያነሳል",
      steps: [
        "ከስክሪኑ ፊት ትንሽ ነፃ ቦታ አዘጋጅ",
        "ሙሉ ሰውነትህ እንዲታይ ወደ ኋላ ቆም",
        "ሰዓቱ እስኪያልቅ ኮከቦችንና ደመናዎችን ያዝ",
      ],
    },
    om: {
      title: "Urjiilee Qabi (Catch the Stars)",
      description: "Urjiilee qabuuf utaali, duumessa qabuuf harka kee lamaan ol kaasi.",
      childRole: "Urjiileef ni utaala, duumessaaf harka lamaan ol kaasa",
      steps: [
        "Fuula iskiriinii dura iddoo xiqqoo qopheessi",
        "Qaamni kee guutuun akka mul'atu duubatti siqi",
        "Hamma yeroon dhumutti urjiilee fi duumessa qabi",
      ],
    },
  },
  squats: {
    en: {
      title: "Frog Squat Power",
      description: "Bend your knees low like a springy frog and stand up tall to reach your goal.",
      childRole: "Completes steady squats with good balance",
      steps: [
        "Clear space around your feet",
        "Bend your knees low and stand back up tall",
        "Drink a glass of water when you finish",
      ],
    },
    am: {
      title: "የእንቁራሪት ስኩዋት (Frog Squats)",
      description: "እንደ እንቁራሪት ጉልበትህን አጥፈህ ቀጥ ብለህ ተነሳ።",
      childRole: "በሚዛን ስኩዋት ያደርጋል",
      steps: ["ዙሪያህን ነፃ ቦታ አዘጋጅ", "ጉልበትህን አጥፈህ ቀጥ ብለህ ተነሳ", "ስትጨርስ ውሃ ጠጣ"],
    },
    om: {
      title: "Iskuwaatii Raachaa (Frog Squats)",
      description: "Akka raachaatti jilba kee gadi qabiitii ol ka'i.",
      childRole: "Madaallii gaariin iskuwaatii hojjeta",
      steps: ["Naannoo kee qulqulleessi", "Jilba gadi qabiitii ol ka'i", "Yoo xumurte bishaan dhugi"],
    },
  },
  jumping_jacks: {
    en: {
      title: "Sunshine Jumping Jacks",
      description: "Jump wide with your arms overhead like sunshine rays, then hop back together.",
      childRole: "Does energetic jumping jacks in a safe space",
      steps: [
        "Check that nothing is in the way of your arms",
        "Jump feet wide with arms up, then hop back together",
        "Take three slow deep breaths when you finish",
      ],
    },
    am: {
      title: "የፀሐይ ጃምፒንግ ጃክስ (Jumping Jacks)",
      description: "እጆችህን ወደ ላይ እና እግሮችህን ወደ ጎን ዘርግተህ ዝለል።",
      childRole: "በደህና ቦታ ጃምፒንግ ጃክስ ያደርጋል",
      steps: ["እጆችህ የሚነኩት ነገር አለመኖሩን አረጋግጥ", "እጅህን አንስተህ እግርህን ዘርግተህ ዝለል", "ስትጨርስ በቀስታ ተንፍስ"],
    },
    om: {
      title: "Utaalcha Aduu (Jumping Jacks)",
      description: "Harka kee ol kaasii miila kee bal'isuun utaali.",
      childRole: "Iddoo nagaa keessatti jumping jacks hojjeta",
      steps: ["Wanti harka kee gufachiisu akka hin jirre mirkaneessi", "Harka ol kaasii miila bal'isi", "Yoo xumurte hafuura dheeraa baafadhu"],
    },
  },
  freeze_dance: {
    en: {
      title: "Happy Freeze Dance",
      description: "Dance freely when the music plays and freeze like a statue when you hear the beep.",
      childRole: "Dances joyfully and holds still during every freeze",
      steps: [
        "Clear space to dance safely",
        "Dance when the screen says DANCE",
        "Freeze like a statue when you hear FREEZE",
      ],
    },
    am: {
      title: "የፍሪዝ ዳንስ ጨዋታ (Freeze Dance)",
      description: "ሙዚቃው ሲጫወት ደንስ፤ ድምፁ ሲቆም እንደ ሐውልት ቀጥ በል።",
      childRole: "ይደንሳል እና ፍሪዝ ሲባል ሳይንቀሳቀስ ይቆማል",
      steps: ["ለመደነስ ነፃ ቦታ አዘጋጅ", "ዳንስ ሲል በደስታ ደንስ", "ፍሪዝ ሲል እንደ ሐውልት ቀጥ በል"],
    },
    om: {
      title: "Shubbisa Dhaabbii (Freeze Dance)",
      description: "Yeroo muuziqaan taphatu shubbisi, yeroo sagaleen dhaabbatu akka siidaatti dhaabbadhu.",
      childRole: "Gammachuun shubbisa, yeroo freeze hin socho'u",
      steps: ["Iddoo shubbisaaf mijatu qopheessi", "Yeroo DANCE jedhu shubbisi", "Yeroo FREEZE jedhu akka siidaatti dhaabbadhu"],
    },
  },
  tree_balance: {
    en: {
      title: "Tall Tree Balance",
      description: "Lift one foot and balance calmly like a strong Ethiopian acacia tree.",
      childRole: "Balances steadily on one leg and switches sides",
      steps: [
        "Stand tall with space around you",
        "Lift one foot off the floor and hold your balance",
        "Switch legs whenever you like until you reach your goal",
      ],
    },
    am: {
      title: "የዛፍ ሚዛን ጨዋታ (Tree Balance)",
      description: "አንድ እግርህን አንስተህ እንደ ጠንካራ ዛፍ ሚዛንህን ጠብቅ።",
      childRole: "በአንድ እግር ሚዛኑን ይጠብቃል",
      steps: ["ዙሪያህ ነፃ መሆኑን አረጋግጥ", "አንድ እግርህን አንስተህ ሚዛንህን ጠብቅ", "እግርህን እየቀያየርክ ግብህን ድረስ"],
    },
    om: {
      title: "Madaallii Mukaa (Tree Balance)",
      description: "Miila kee tokko ol fuudhii akka muka cimaatti dhaabbadhu.",
      childRole: "Miila tokko irratti tasgabbiin madaallii eega",
      steps: ["Iddoo bal'aa keessa dhaabbadhu", "Miila tokko ol fuudhii madaallii kee eegi", "Yoo barbaadde miila jijjiiri"],
    },
  },
  eskista: {
    en: {
      title: "Eskista Shoulder Rhythm",
      description: "Bounce your shoulders to the joyful Ethiopian Eskista rhythm.",
      childRole: "Moves shoulders rhythmically to hit the beat target",
      steps: [
        "Stand tall in view of the camera",
        "Bounce your shoulders up and down to the beat",
        "Smile and celebrate when you finish the rhythm",
      ],
    },
    am: {
      title: "የእስክስታ ትከሻ ምት (Eskista)",
      description: "በኢትዮጵያ የእስክስታ ምት ትከሻህን በደስታ አንቀሳቅስ።",
      childRole: "ትከሻውን በምት ያንቀሳቅሳል",
      steps: ["ከካሜራው ፊት ቀጥ ብለህ ቆም", "ትከሻህን በምት ወደ ላይና ወደ ታች አንቀሳቅስ", "ስትጨርስ በደስታ ፈገግ በል"],
    },
    om: {
      title: "Rukuttaa Gateettii Eskista (Eskista)",
      description: "Gateettii kee akka shubbisa aadaa Eskistaatti sochoosi.",
      childRole: "Gateettii isaa rukuttaa waliin sochoosa",
      steps: ["Kaameraa dura sirriitti dhaabbadhu", "Gateettii kee rukuttaa waliin ol fi gadi sochoosi", "Yoo xumurte gammadi"],
    },
  },
  floor_is_lava: {
    en: {
      title: "Floor Is Lava Adventure",
      description: "Jump over glowing lava waves and squat under overhead beams for 60 fun seconds.",
      childRole: "Jumps over lava waves and ducks under beams",
      steps: [
        "Clear space in front of the screen",
        "Jump when a glowing lava wave rolls toward you",
        "Squat low to duck under overhead beams",
      ],
    },
    am: {
      title: "መሬቱ ላቫ ነው (Floor Is Lava)",
      description: "ከላቫ ሞገዶች በላይ ዝለል፤ ከላይ ከሚመጡ እንቅፋቶች በታች ጎንበስ በል።",
      childRole: "ከላቫ ይዘላል፤ ከእንቅፋት በታች ይጎነብሳል",
      steps: ["ከስክሪኑ ፊት ነፃ ቦታ አዘጋጅ", "ላቫ ሲመጣ ወደ ላይ ዝለል", "ከላይ እንቅፋት ሲመጣ ዝቅ ብለህ እለፍ"],
    },
    om: {
      title: "Lafti Laavaadha (Floor Is Lava)",
      description: "Dambalii laavaa irra utaali, utubaa olii jala ammoo gadi jedhi.",
      childRole: "Laavaa irra ni utaala, utubaa jala ni gadi jedha",
      steps: ["Fuula iskiriinii dura iddoo qopheessi", "Yeroo laavaan dhufu ol utaali", "Yeroo utubaan olii dhufu gadi jedhi"],
    },
  },
};

/**
 * Builds a validated exercise mission without calling any LLM.
 *
 * @param {object} [options]
 * @param {number} [options.age]  Child age 6..12 (default 8).
 * @param {ActivityId} [options.game]  Catalog activity id (defaults to "catch_the_stars").
 * @param {"en" | "am" | "om"} [options.language]
 * @param {number} [options.target]  Optional override (clamped to catalog limits).
 * @returns {Mission}
 */
export function buildExerciseMission(options = {}) {
  const age = options.age ?? 8;
  const language = options.language === "am" || options.language === "om" ? options.language : "en";
  const catalogEntry = (options.game ? getActivityById(options.game) : null) ?? getActivityCatalog()[0];
  const target =
    typeof options.target === "number"
      ? clampActivityTarget(catalogEntry, options.target)
      : targetForAgeBand(age, catalogEntry);

  const tpl = TEMPLATES[catalogEntry.id][language];
  const raw = {
    title: tpl.title,
    description: tpl.description,
    category: "exercise",
    type: "solo",
    interaction: "camera",
    roles: { child: tpl.childRole, parent: "" },
    steps: tpl.steps,
    activity: { game: catalogEntry.id, target },
    supervision_note: "",
    needs_parent: false,
    points: 20,
  };

  const validated = validateMission(raw);
  if (!validated.ok) {
    throw new Error(`Invalid built-in exercise template for ${catalogEntry.id}: ${validated.errors.join("; ")}`);
  }

  /** @type {Mission} */
  const mission = { ...validated.mission };
  if (language === "am" || language === "om") {
    mission.needs_translation = true;
  }
  return mission;
}
