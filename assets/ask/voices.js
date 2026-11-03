// Picks a male English voice from the browser's speech engine. Browsers don't
// say which voices are male, so this goes by the names the major engines ship.
// Best first. macOS novelty voices (Fred, Ralph, Albert, Junior, Zarvox) are left out.
const MALE_NAMES = [
  "microsoft andrew", "microsoft brian", "microsoft guy", "microsoft christopher", "microsoft eric",
  "microsoft roger", "microsoft steffan", "microsoft davis", "microsoft tony",
  "google us english male", "aaron", "evan", "nathan", "tom", "alex", "daniel", "arthur", "oliver",
  "google uk english male", "microsoft david", "microsoft mark", "reed", "eddy", "rocko", "gordon", "rishi",
];
const FEMALE_HINT = /female|samantha|victoria|karen|moira|tessa|zira|aria|jenny|susan|allison|ava|fiona|serena|kathy/i;

/** Returns the best male English voice, or null if the engine offers none. */
export function pickMaleVoice(voices) {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang) && !FEMALE_HINT.test(v.name));
  const score = (v) => {
    const name = v.name.toLowerCase();
    const rank = MALE_NAMES.findIndex((m) => name.includes(m));
    if (rank < 0) return -1;
    // The list order decides; a US accent or an enhanced build only breaks ties.
    const us = /^en[-_]US/i.test(v.lang) ? 2 : 0;
    const enhanced = /enhanced|premium|natural|online/i.test(v.name) ? 1 : 0;
    return (MALE_NAMES.length - rank) * 10 + us + enhanced;
  };
  const ranked = english.map((v) => ({ v, s: score(v) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s);
  return ranked[0]?.v ?? null;
}
