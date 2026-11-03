// Mouth shapes for the Ask Jon avatar. Pure functions: no DOM, so they can be
// tested in node. A shape is { open, wide, teeth } in 0..1.

export const SHAPES = {
  rest: { open: 0.04, wide: 0.5, teeth: 0 },
  closed: { open: 0, wide: 0.45, teeth: 0 }, // m b p
  open: { open: 0.85, wide: 0.6, teeth: 0.3 }, // a
  mid: { open: 0.5, wide: 0.7, teeth: 0.5 }, // e i y
  round: { open: 0.55, wide: 0.25, teeth: 0 }, // o u w
  lip: { open: 0.18, wide: 0.55, teeth: 1 }, // f v
  tongue: { open: 0.35, wide: 0.55, teeth: 0.7 }, // t d n l s z th
  small: { open: 0.28, wide: 0.5, teeth: 0.3 }, // everything else
};

export function shapeForChar(ch) {
  const c = (ch || "").toLowerCase();
  if (!/[a-z]/.test(c)) return "rest";
  if ("mbp".includes(c)) return "closed";
  if (c === "a") return "open";
  if ("eiy".includes(c)) return "mid";
  if ("ouw".includes(c)) return "round";
  if ("fv".includes(c)) return "lip";
  if ("tdnlsz".includes(c)) return "tongue";
  return "small";
}

/**
 * Turns per-character timings into a timeline of { t, shape }. Consecutive
 * identical shapes merge, and a short pause stays open rather than snapping
 * shut, so the mouth doesn't flap on every space.
 */
export function timelineFromAlignment({ chars, starts, ends }) {
  const out = [];
  for (let i = 0; i < chars.length; i++) {
    let shape = shapeForChar(chars[i]);
    const gap = (ends[i] ?? starts[i]) - starts[i];
    if (shape === "rest" && gap < 0.12 && /\s/.test(chars[i])) continue;
    if (out.length && out[out.length - 1].shape === shape) continue;
    out.push({ t: starts[i], shape });
  }
  const end = ends[ends.length - 1] ?? 0;
  out.push({ t: end, shape: "rest" });
  return out;
}

/** Rough timings when the voice gives us none (the browser's speech engine). */
export function estimateAlignment(text, charsPerSecond = 14) {
  const chars = [...text];
  const starts = [];
  const ends = [];
  let t = 0;
  for (const ch of chars) {
    const d = /[,.;:!?]/.test(ch) ? 0.18 : 1 / charsPerSecond;
    starts.push(t);
    t += d;
    ends.push(t);
  }
  return { chars, starts, ends };
}

/** The shape due at time t (seconds). */
export function shapeAt(timeline, t) {
  let lo = 0;
  let hi = timeline.length - 1;
  if (!timeline.length || t < timeline[0].t) return "rest";
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (timeline[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return timeline[lo].shape;
}
