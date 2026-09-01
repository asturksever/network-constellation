// Colour generation for the scene.
//
// A force graph is not a scatter plot: identity is carried by spatial position
// and an always-on hub label, so hue is reinforcement rather than the only
// channel. That lets the palette run wider than the three all-pairs-safe slots
// a chart would be limited to — but it still has to be built, not guessed.
//
// Hues are placed by the golden angle (137.508°) in domain-size order, so the
// largest lobes land maximally far apart on the wheel and smaller ones fill the
// gaps. Lightness and chroma are held constant in OKLCH, which keeps every
// domain equally legible on the dark ground; nothing shouts louder than its
// neighbour just because of where it sits on the wheel.

export const GROUND = '#080b0e';
const GOLDEN_ANGLE = 137.508;

/* ---------- OKLCH -> sRGB ---------- */

function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ];
}

const gamma = u => (u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055);
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const hex2 = v => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');

export function oklch(L, C, h) {
  const [r, g, b] = oklchToRgb(L, C, h).map(gamma);
  return '#' + hex2(r) + hex2(g) + hex2(b);
}

/** Pull chroma in until the colour actually fits in sRGB — no silent clipping. */
export function oklchSafe(L, C, h) {
  let c = C;
  for (let i = 0; i < 24; i++) {
    const rgb = oklchToRgb(L, c, h);
    if (rgb.every(v => v >= -0.001 && v <= 1.001)) break;
    c -= 0.005;
    if (c <= 0) { c = 0; break; }
  }
  return oklch(L, c, h);
}

/* ---------- the domain palette ---------- */

/**
 * `count` hues, golden-angle spaced, in the order domains are passed in
 * (largest first). Tuned for the #080b0e ground: L 0.70 clears 3:1 contrast
 * with room to spare, C 0.145 stays inside sRGB at every hue.
 */
export function domainHues(count, { start = 258 } = {}) {
  // Hue alone runs out around a dozen categories — past that, golden-angle
  // neighbours converge. Cycling three lightness bands alongside the hue gives
  // the palette a second dimension, so two domains that land close on the wheel
  // are pulled apart in lightness instead. Bands cycle by index, which is
  // arbitrary with respect to domain size: cluster size is already visible in
  // the graph, so lightness must not double-encode it.
  const BANDS = [
    { L: 0.78, C: 0.140 },
    { L: 0.68, C: 0.155 },
    { L: 0.58, C: 0.145 }
  ];
  const out = [];
  for (let i = 0; i < count; i++) {
    const band = BANDS[i % BANDS.length];
    out.push(oklchSafe(band.L, band.C, (start + i * GOLDEN_ANGLE) % 360));
  }
  return out;
}

/** Ordinal ramp for the seniority view: bright at the top, receding to unstated. */
export function seniorityRamp() {
  return [
    oklchSafe(0.86, 0.150, 92),   // Founder & C-suite
    oklchSafe(0.79, 0.155, 66),   // VP, Head & Director
    oklchSafe(0.72, 0.160, 40),   // Manager & Lead
    oklchSafe(0.66, 0.150, 18),   // Senior IC
    oklchSafe(0.60, 0.130, 350),  // Individual contributor
    oklchSafe(0.54, 0.105, 322),  // Student & Early career
    '#39434c'                     // Unstated — deliberately achromatic
  ];
}

/** rgba() string from a hex, for link tinting. */
export function fade(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Blend two hex colours; t=0 returns a, t=1 returns b. */
export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = sh => Math.round((((pa >> sh) & 255) * (1 - t)) + (((pb >> sh) & 255) * t));
  return '#' + hex2(ch(16) / 255) + hex2(ch(8) / 255) + hex2(ch(0) / 255);
}
