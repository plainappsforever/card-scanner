// COPIED from Offscan (~/Developer/pdf-scanner, commit 79218b7, same owner; D11) for the fallback camera and photo imports.
// Document corner detection for the fallback camera and photo imports (SPEC §5.4). Input: a grayscale thumbnail (long
// edge ≤ 384, native grayThumbnail). Output: the document quad (normalised, [TL, TR, BR, BL]) with a score, or null.
// Deterministic. Pipeline: blur → Sobel → non-maximum suppression + hysteresis → Hough lines (votes only from pixels whose
// gradient agrees with the line normal) → convex quads from two roughly-parallel line pairs → score by edge support and
// paper/background contrast along the sides → least-squares refinement of each side on its edge pixels.
// Self-contained (no imports) so Node can run it directly for measurements.

export type GrayImage = { width: number; height: number; data: Uint8Array };
export type DetectPoint = { x: number; y: number };
export type Detection = { quad: [DetectPoint, DetectPoint, DetectPoint, DetectPoint]; score: number };

/** Tunable constants (P3 tuning set; frozen after P3). */
export const DETECT = {
  maxLines: 28,
  minScore: 0.42,
  thetaBins: 180,
  angleTolerance: (14 * Math.PI) / 180,
  minSideFraction: 0.12,
  pairMaxAngle: (40 * Math.PI) / 180,
  crossMinAngle: (35 * Math.PI) / 180,
  margin: 0.04,
  minArea: 0.1,
  /** Weakest side's paper/background separation below which a quad scores 0, and the ramp to full score (review S4). */
  minSeparation: 0.2,
  separationRamp: 0.4,
  /** Lowest high-hysteresis threshold of the Sobel magnitude. */
  edgeFloor: 24,
  /** Least step |I(p+4n) − I(p−4n)| for a pixel to support a side. */
  minStep: 8,
  /** Mean side contrast (gray levels) that counts as full contrast. */
  fullContrast: 20,
  /** Lower clamp of the image's step scale (Edges.scale). */
  minStepScale: 12,
  /** Step (gray levels) at which a pixel's Hough vote saturates. */
  houghScale: 40,
  /** Gray levels by which the inside band must clear the outside band to count as separated. */
  minBandGap: 3,
  /** Score factor for a quad darker than its surroundings (bright paper prior). */
  darkQuadFactor: 0.85,
} as const;

type Line = { theta: number; rho: number; votes: number; nx: number; ny: number };

function blur(src: Uint8Array, w: number, h: number): Float32Array {
  // Separable [1 4 6 4 1] / 16, edges clamped.
  const k = [1, 4, 6, 4, 1];
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) s += k[i + 2] * src[y * w + Math.min(w - 1, Math.max(0, x + i))];
      tmp[y * w + x] = s / 16;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) s += k[i + 2] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
      out[y * w + x] = s / 16;
    }
  return out;
}

type Edges = {
  gx: Float32Array;
  gy: Float32Array;
  mag: Float32Array;
  edge: Uint8Array;
  img: Float32Array;
  /**
   * The image's own step scale (review S4): 95th percentile of the step strength over edge pixels, clamped to
   * [DETECT.minStepScale, 80]. A white page on a white table has borders of 6–15 gray levels; absolute thresholds made
   * for 80-level borders lost them. Hough weights, side hits and the contrast term are relative to it.
   */
  scale: number;
};

export function edges(g: GrayImage): Edges {
  const { width: w, height: h } = g;
  const img = blur(g.data, w, h);
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = img[i - w - 1], b = img[i - w], c = img[i - w + 1], d = img[i - 1], f = img[i + 1], gg = img[i + w - 1], hh = img[i + w], ii = img[i + w + 1];
      const sx = c + 2 * f + ii - a - 2 * d - gg;
      const sy = gg + 2 * hh + ii - a - 2 * b - c;
      gx[i] = sx;
      gy[i] = sy;
      mag[i] = Math.hypot(sx, sy);
    }
  // Thresholds from the magnitude distribution (deterministic histogram percentile).
  let max = 0;
  for (let i = 0; i < mag.length; i++) if (mag[i] > max) max = mag[i];
  const bins = 512;
  const hist = new Uint32Array(bins);
  let nonzero = 0;
  for (let i = 0; i < mag.length; i++) {
    if (mag[i] <= 0) continue;
    hist[Math.min(bins - 1, Math.floor((mag[i] / (max || 1)) * bins))]++;
    nonzero++;
  }
  let cum = 0;
  let p = 0;
  for (; p < bins; p++) {
    cum += hist[p];
    if (cum >= 0.7 * nonzero) break;
  }
  const high = Math.max(DETECT.edgeFloor, (p / bins) * max);
  const low = high * 0.4;
  // Non-maximum suppression along the gradient direction (4 sectors).
  const nms = new Uint8Array(w * h); // 0 none, 1 weak, 2 strong
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m < low) continue;
      const ang = Math.atan2(gy[i], gx[i]);
      const s = Math.round(((ang + Math.PI) / Math.PI) * 4) % 4; // 0: horizontal gradient, 1: diag, 2: vertical, 3: anti-diag
      let a: number, b: number;
      if (s === 0) {
        a = mag[i - 1];
        b = mag[i + 1];
      } else if (s === 1) {
        a = mag[i - w - 1];
        b = mag[i + w + 1];
      } else if (s === 2) {
        a = mag[i - w];
        b = mag[i + w];
      } else {
        a = mag[i - w + 1];
        b = mag[i + w - 1];
      }
      if (m >= a && m > b) nms[i] = m >= high ? 2 : 1;
    }
  // Hysteresis: weak pixels connected to strong ones.
  const edge = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let i = 0; i < nms.length; i++)
    if (nms[i] === 2) {
      edge[i] = 1;
      stack.push(i);
    }
  while (stack.length) {
    const i = stack.pop() as number;
    for (const d of [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1]) {
      const j = i + d;
      if (j >= 0 && j < nms.length && nms[j] === 1 && !edge[j]) {
        edge[j] = 1;
        stack.push(j);
      }
    }
  }
  const e = { gx, gy, mag, edge, img, scale: 80 };
  const steps = new Uint32Array(256);
  let count = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!edge[i]) continue;
      steps[Math.min(255, Math.round(stepStrength(e, w, h, x, y, i)))]++;
      count++;
    }
  let seen = 0;
  let p95 = 255;
  for (let v = 0; v < 256; v++) {
    seen += steps[v];
    if (seen >= 0.95 * count) {
      p95 = v;
      break;
    }
  }
  e.scale = count === 0 ? 80 : Math.min(80, Math.max(DETECT.minStepScale, p95));
  return e;
}

/** |I(p + 4·n) − I(p − 4·n)| on the blurred image, n = unit gradient direction at pixel i. */
function stepStrength(e: Edges, w: number, h: number, x: number, y: number, i: number): number {
  const g = e.mag[i] || 1;
  const nx = e.gx[i] / g;
  const ny = e.gy[i] / g;
  // Samples are clamped to the image, so a border close to the frame still gets its weight.
  const ax = Math.min(w - 1, Math.max(0, Math.round(x + 4 * nx)));
  const ay = Math.min(h - 1, Math.max(0, Math.round(y + 4 * ny)));
  const bx = Math.min(w - 1, Math.max(0, Math.round(x - 4 * nx)));
  const by = Math.min(h - 1, Math.max(0, Math.round(y - 4 * ny)));
  return Math.abs(e.img[ay * w + ax] - e.img[by * w + bx]);
}

export function houghLines(e: Edges, w: number, h: number): Line[] {
  const T = DETECT.thetaBins;
  const diag = Math.ceil(Math.hypot(w, h));
  const R = 2 * diag + 1;
  const acc = new Float32Array(T * R);
  const cos = new Float64Array(T);
  const sin = new Float64Array(T);
  for (let t = 0; t < T; t++) {
    cos[t] = Math.cos((t * Math.PI) / T);
    sin[t] = Math.sin((t * Math.PI) / T);
  }
  const tol = DETECT.angleTolerance;
  const span = Math.ceil((tol / Math.PI) * T);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!e.edge[i]) continue;
      // The line normal is the gradient direction (mod π).
      let a = Math.atan2(e.gy[i], e.gx[i]);
      if (a < 0) a += Math.PI;
      const center = Math.round((a / Math.PI) * T);
      // Step-edge weight: brightness difference 4 px to either side along the gradient. A paper border is a step (one side
      // paper, other side background); a text stroke or a ruled table line is thin (paper on both sides) and gets ~0.
      const weight = Math.min(stepStrength(e, w, h, x, y, i), DETECT.houghScale) / DETECT.houghScale;
      if (weight <= 0.05) continue;
      for (let d = -span; d <= span; d++) {
        const t = (((center + d) % T) + T) % T;
        const rho = Math.round(x * cos[t] + y * sin[t]) + diag;
        acc[t * R + rho] += weight;
      }
    }
  // Peaks: local maxima over a (±3 bins, ±4 px) window, best first.
  const peaks: Line[] = [];
  const minVotes = 0.05 * Math.min(w, h);
  for (let t = 0; t < T; t++)
    for (let r = 0; r < R; r++) {
      const v = acc[t * R + r];
      if (v < minVotes) continue;
      let isMax = true;
      for (let dt = -3; dt <= 3 && isMax; dt++)
        for (let dr = -4; dr <= 4; dr++) {
          if (!dt && !dr) continue;
          let tt = t + dt;
          let rr = r + dr;
          if (tt < 0) {
            tt += T;
            rr = R - 1 - rr;
          } else if (tt >= T) {
            tt -= T;
            rr = R - 1 - rr;
          }
          if (rr < 0 || rr >= R) continue;
          const o = acc[tt * R + rr];
          if (o > v || (o === v && tt * R + rr < t * R + r)) {
            isMax = false;
            break;
          }
        }
      if (isMax) peaks.push({ theta: (t * Math.PI) / T, rho: r - diag, votes: v, nx: cos[t], ny: sin[t] });
    }
  peaks.sort((a, b) => b.votes - a.votes || a.theta - b.theta || a.rho - b.rho);
  // Diversity: many parallel internal lines (text rows, table rules) must not crowd out the other orientation. Per 12°
  // orientation bucket keep the 4 strongest lines plus the outermost two (min/max offset) with ≥ 25 % of the bucket's best
  // votes — a page border is the outermost line of its direction.
  const buckets = new Map<number, Line[]>();
  for (const l of peaks) {
    const b = Math.floor((l.theta / Math.PI) * 15) % 15;
    const list = buckets.get(b) ?? [];
    list.push(l);
    buckets.set(b, list);
  }
  const keep = new Set<Line>();
  for (const list of buckets.values()) {
    list.slice(0, 4).forEach((l) => keep.add(l));
    const strong = list.filter((l) => l.votes >= 0.25 * list[0].votes);
    // Offsets compared in one orientation: the signed distance of the line from the image centre.
    const offset = (l: Line) => l.rho - (w / 2) * l.nx - (h / 2) * l.ny;
    const byOffset = [...strong].sort((a, b) => offset(a) - offset(b) || b.votes - a.votes);
    if (byOffset.length) {
      keep.add(byOffset[0]);
      keep.add(byOffset[byOffset.length - 1]);
    }
  }
  return peaks.filter((l) => keep.has(l)).slice(0, DETECT.maxLines);
}

function intersect(a: Line, b: Line): DetectPoint | null {
  const det = a.nx * b.ny - a.ny * b.nx;
  if (Math.abs(det) < 1e-9) return null;
  return { x: (a.rho * b.ny - b.rho * a.ny) / det, y: (a.nx * b.rho - b.nx * a.rho) / det };
}

function angleBetween(a: Line, b: Line): number {
  const d = Math.abs(a.theta - b.theta);
  return Math.min(d, Math.PI - d);
}

const cross = (o: DetectPoint, a: DetectPoint, b: DetectPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** [TL, TR, BR, BL] by the SPEC §5.2 rule; null on a role conflict. */
function order(points: DetectPoint[]): [DetectPoint, DetectPoint, DetectPoint, DetectPoint] | null {
  const pick = (key: (p: DetectPoint) => number, max: boolean) => {
    let best = 0;
    for (let i = 1; i < 4; i++) {
      const a = key(points[i]);
      const b = key(points[best]);
      if ((max ? a > b : a < b) || (a === b && (points[i].y < points[best].y || (points[i].y === points[best].y && points[i].x < points[best].x)))) best = i;
    }
    return best;
  };
  const tl = pick((p) => p.x + p.y, false);
  const br = pick((p) => p.x + p.y, true);
  const tr = pick((p) => p.x - p.y, true);
  const bl = pick((p) => p.x - p.y, false);
  if (new Set([tl, tr, br, bl]).size !== 4) return null;
  return [points[tl], points[tr], points[br], points[bl]];
}

function validQuad(q: DetectPoint[], w: number, h: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    if (c === 0) return false;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  for (let i = 0; i < 4; i++) {
    const p = q[(i + 3) % 4], c = q[i], n = q[(i + 1) % 4];
    const ax = p.x - c.x, ay = p.y - c.y, bx = n.x - c.x, by = n.y - c.y;
    const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
    const ang = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (ang < 30 || ang > 150) return false;
  }
  let area = 0;
  for (let i = 0; i < 4; i++) area += q[i].x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * q[i].y;
  return Math.abs(area) / 2 >= DETECT.minArea * w * h;
}

/** Edge support and contrast of one side; returns support fraction and mean inside−outside brightness difference. */
export function sideScore(e: Edges, w: number, h: number, a: DetectPoint, b: DetectPoint, inward: DetectPoint) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(12, Math.min(60, Math.round(len / 4)));
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  // Orient the normal towards the quad's inside.
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const s = (inward.x - mid.x) * nx + (inward.y - mid.y) * ny >= 0 ? 1 : -1;
  let hits = 0;
  let samples = 0;
  let contrast = 0;
  let contrastN = 0;
  let sepBright = 0;
  let sepDark = 0;
  const stepAt: number[] = [];
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
    samples++;
    // Strongest step among edge pixels within ±2 px whose gradient is aligned with the side's normal.
    let best = 0;
    for (let d = -2; d <= 2 && best <= DETECT.minStep; d++) {
      const xi = Math.round(x + nx * d);
      const yi = Math.round(y + ny * d);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue;
      const i = yi * w + xi;
      if (!e.edge[i]) continue;
      const g = Math.hypot(e.gx[i], e.gy[i]) || 1;
      if (Math.abs((e.gx[i] * nx + e.gy[i] * ny) / g) > 0.85) best = Math.max(best, stepStrength(e, w, h, xi, yi, i));
    }
    stepAt.push(best);
    // Separation of the inside band from the outside band (3, 6 and 9 px each way): a border separates paper from
    // background at every distance; a thin internal line (text, table rule) has paper again a few pixels out.
    let inMin = 255;
    let inMax = 0;
    let outMin = 255;
    let outMax = 0;
    let complete = true;
    for (const dist of [3, 6, 9]) {
      const ix = Math.round(x + nx * s * dist);
      const iy = Math.round(y + ny * s * dist);
      const ox = Math.round(x - nx * s * dist);
      const oy = Math.round(y - ny * s * dist);
      if (ix < 0 || iy < 0 || ix >= w || iy >= h || ox < 0 || oy < 0 || ox >= w || oy >= h) {
        complete = false;
        break;
      }
      const vi = e.img[iy * w + ix];
      const vo = e.img[oy * w + ox];
      inMin = Math.min(inMin, vi);
      inMax = Math.max(inMax, vi);
      outMin = Math.min(outMin, vo);
      outMax = Math.max(outMax, vo);
    }
    if (complete) {
      const brighter = inMin - outMax;
      const darker = outMin - inMax;
      contrast += brighter > 0 ? brighter : darker > 0 ? -darker : 0;
      contrastN++;
      // A gap of a few levels is needed: under a lighting gradient a ruled line has "brighter" paper on one side.
      if (brighter > DETECT.minBandGap) sepBright++;
      else if (darker > DETECT.minBandGap) sepDark++;
    }
  }
  // A sample supports the side when its step reaches DETECT.minStep — or half of this side's own paper/background contrast
  // (at least 3 levels), so the faint border of a white page on a white table still counts (review S4).
  const meanContrast = contrastN ? Math.abs(contrast / contrastN) : 0;
  const threshold = Math.min(DETECT.minStep, Math.max(3, 0.5 * meanContrast));
  for (const st of stepAt) if (st > threshold) hits++;
  return {
    support: samples ? hits / samples : 0,
    contrast: contrastN ? contrast / contrastN : 0,
    samples,
    // Share of the side where the inside band is entirely brighter (darker) than the outside band (review S4).
    sepBright: contrastN ? sepBright / contrastN : 0,
    sepDark: contrastN ? sepDark / contrastN : 0,
    bands: contrastN,
  };
}

export function scoreQuad(e: Edges, w: number, h: number, q: DetectPoint[]): number {
  const centre = { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 };
  let support = 0;
  let minSupport = 1;
  let contrast = 0;
  const sides = [0, 1, 2, 3].map((i) => sideScore(e, w, h, q[i], q[(i + 1) % 4], centre));
  for (const s of sides) {
    support += s.support / 4;
    minSupport = Math.min(minSupport, s.support);
    contrast += Math.abs(s.contrast) / 4;
  }
  // Paper is separated from its surroundings on most sides, with one polarity (brighter — or darker — than its
  // surroundings all round); texture and internal lines are not. Review S4: the share of each side where the bands
  // separate is scale-free, so a 6–15 level border of a white page on a white table counts like a strong one; the raw
  // contrast alone made such pages fall under minScore.
  const bright = sides.reduce((a, s) => a + s.sepBright, 0);
  const dark = sides.reduce((a, s) => a + s.sepDark, 0);
  const polarity = bright >= dark ? 1 : -1;
  const sameSign = sides.filter((s) => polarity * s.contrast > 2).length;
  const separation = Math.max(bright, dark) / 4;
  // Paper is usually brighter than what it lies on: a quad darker than its surroundings (a photo or a dark box printed on
  // the page, or a page on a whiter table) keeps a mild penalty, so a page's inner photo does not beat the page.
  const polarityTerm = polarity > 0 ? 1 : DETECT.darkQuadFactor;
  const contrastTerm = Math.max(Math.min(1, contrast / DETECT.fullContrast), separation) * (0.6 + 0.1 * sameSign) * polarityTerm;
  // Larger quads win ties: the page's outline encloses its internal structures (tables, headings, a partly hidden edge).
  let area = 0;
  for (let i = 0; i < 4; i++) area += q[i].x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * q[i].y;
  const areaTerm = 0.8 + 0.2 * Math.sqrt(Math.min(1, Math.abs(area) / 2 / (w * h)));
  return support * (0.4 + 0.6 * Math.min(1, minSupport / 0.35)) * contrastTerm * areaTerm * separationTerm(sides);
}

/**
 * Review S4 (P5b round 2): EVERY side must separate the page from its surroundings along most of its length (inside band
 * entirely brighter — or, for a dark page, darker — than the outside band). A page crossing the image border has no
 * fourth side inside the frame; the best quad then closes on a text row or table rule, with paper on both sides of it —
 * the weakest side's separation is low and the quad is no longer confident (null; the UI offers the whole image).
 */
function separationTerm(sides: { sepBright: number; sepDark: number; bands: number }[]): number {
  const bright = sides.reduce((a, s) => a + s.sepBright, 0);
  const dark = sides.reduce((a, s) => a + s.sepDark, 0);
  const sep = sides.filter((s) => s.bands >= 4).map((s) => (bright >= dark ? s.sepBright : s.sepDark));
  if (sep.length === 0) return 0;
  const weakest = Math.min(...sep);
  return Math.min(1, Math.max(0, (weakest - DETECT.minSeparation) / DETECT.separationRamp));
}

/** Total-least-squares refit of a side on edge pixels within 2.5 px of it; null when too few. */
function refitSide(e: Edges, w: number, a: DetectPoint, b: DetectPoint, h: number): Line | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const pts: DetectPoint[] = [];
  const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - 3));
  const x1 = Math.min(w - 1, Math.ceil(Math.max(a.x, b.x) + 3));
  const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - 3));
  const y1 = Math.min(h - 1, Math.ceil(Math.max(a.y, b.y) + 3));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (!e.edge[i]) continue;
      const d = (x - a.x) * nx + (y - a.y) * ny;
      const t = ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (len * len);
      if (Math.abs(d) <= 2.5 && t > 0.05 && t < 0.95) pts.push({ x, y });
    }
  if (pts.length < 8) return null;
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= pts.length;
  my /= pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  // Normal = eigenvector of the smaller eigenvalue of the scatter matrix.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy) + Math.PI / 2;
  const lnx = Math.cos(theta);
  const lny = Math.sin(theta);
  return { theta, rho: mx * lnx + my * lny, votes: pts.length, nx: lnx, ny: lny };
}

/** Finds the document in a grayscale thumbnail. Null = no plausible document (the UI offers the whole image). */
export function detectDocument(g: GrayImage): Detection | null {
  const { width: w, height: h } = g;
  if (w < 16 || h < 16) return null;
  const e = edges(g);
  const lines = houghLines(e, w, h);
  const minDist = DETECT.minSideFraction * Math.min(w, h);
  const pairs: [Line, Line][] = [];
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i];
      const b = lines[j];
      if (angleBetween(a, b) > DETECT.pairMaxAngle) continue;
      // Distance between the two lines at the image centre.
      const cx = w / 2;
      const cy = h / 2;
      const da = cx * a.nx + cy * a.ny - a.rho;
      const db = cx * b.nx + cy * b.ny - b.rho;
      const sameDir = a.nx * b.nx + a.ny * b.ny > 0 ? 1 : -1;
      if (Math.abs(da - sameDir * db) < minDist) continue;
      pairs.push([a, b]);
    }
  let best: { q: DetectPoint[]; score: number } | null = null;
  const m = DETECT.margin;
  for (let i = 0; i < pairs.length; i++)
    for (let j = i + 1; j < pairs.length; j++) {
      const [a, b] = pairs[i];
      const [c, d] = pairs[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (Math.min(angleBetween(a, c), angleBetween(a, d), angleBetween(b, c), angleBetween(b, d)) < DETECT.crossMinAngle) continue;
      const pts = [intersect(a, c), intersect(a, d), intersect(b, c), intersect(b, d)];
      if (pts.some((p) => !p || p.x < -m * w || p.y < -m * h || p.x > (1 + m) * w || p.y > (1 + m) * h)) continue;
      const q = order(pts as DetectPoint[]);
      if (!q || !validQuad(q, w, h)) continue;
      const score = scoreQuad(e, w, h, q);
      if (!best || score > best.score) best = { q, score };
    }
  if (!best || best.score < DETECT.minScore) return null;
  // Refine each side on its own edge pixels, then intersect neighbouring sides again.
  const sides: (Line | null)[] = [0, 1, 2, 3].map((k) => refitSide(e, w, best!.q[k], best!.q[(k + 1) % 4], h));
  let quad = best.q;
  if (sides.every((s) => s)) {
    // Corner k joins side k−1 and side k (side k runs from corner k to corner k+1).
    const corners = [3, 0, 1, 2].map((prev, k) => intersect(sides[prev] as Line, sides[k] as Line));
    if (corners.every((c, k) => c && Math.hypot(c.x - quad[k].x, c.y - quad[k].y) < 0.03 * Math.hypot(w, h))) {
      const refined = order(corners as DetectPoint[]);
      if (refined && validQuad(refined, w, h)) quad = refined;
    }
  }
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  // Pixel (x, y) is the sample at its centre: normalised = (x + 0.5) / w. Corner roles follow SPEC §5.2 in NORMALISED
  // coordinates (review S3: ordering in pixels can differ on non-square images).
  // When the SPEC rule cannot assign roles (a ~45° turned page: two roles tie), the pixel-space order is kept.
  const points = quad.map((p) => ({ x: clamp01((p.x + 0.5) / w), y: clamp01((p.y + 0.5) / h) }));
  const normalised = order(points) ?? (points as Detection['quad']);
  return { quad: normalised, score: Math.round(best.score * 1000) / 1000 };
}
