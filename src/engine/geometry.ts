// COPIED from Offscan (~/Developer/pdf-scanner, commit 79218b7, same owner; D11) for the fallback camera and photo imports.
// Geometry engine (SPEC §5.2). Normalised coordinates: 0…1, origin top-left, of the UNROTATED image unless a function
// says otherwise. Quads are [TL, TR, BR, BL]. Rotations are clockwise, r ∈ {0, 90, 180, 270}; displayed = rotate(unrotated).

export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];
export type Rotation = 0 | 90 | 180 | 270;
/** A 3×3 matrix in row-major order (9 numbers), h33 = 1. */
export type Matrix3 = number[];
/** A PDF page box in user space: x0, y0 (bottom-left), x1, y1 (top-right). */
export type Box = { x0: number; y0: number; x1: number; y1: number };

export class GeometryError extends Error {
  readonly code: 'corner-conflict' | 'singular' | 'bad-rotation' | 'bad-input';
  constructor(code: GeometryError['code'], message: string) {
    super(message);
    this.name = 'GeometryError';
    this.code = code;
  }
}

const round = (v: number) => Math.floor(v + 0.5);

/**
 * Keys closer than this are a tie (review S1, oracle O2): 0.7 − 0.65 and 0.5 − 0.45 are equal decimals but not equal
 * doubles, and the SPEC's tie rule must still apply.
 */
const TIE = 1e-12;

/** Picks the point index with the extreme key; ties: smaller y, then smaller x. */
function pick(points: readonly Point[], key: (p: Point) => number, max: boolean): number {
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    const a = key(points[i]);
    const b = key(points[best]);
    const better = max ? a > b + TIE : a < b - TIE;
    const p = points[i];
    const q = points[best];
    const tie = Math.abs(a - b) <= TIE && (p.y < q.y - TIE || (Math.abs(p.y - q.y) <= TIE && p.x < q.x - TIE));
    if (better || tie) best = i;
  }
  return best;
}

/** [TL, TR, BR, BL] by TL = min(x+y), BR = max(x+y), TR = max(x−y), BL = min(x−y). Throws when two roles pick the same point. */
export function orderCorners(points: readonly Point[]): Quad {
  if (points.length !== 4) throw new GeometryError('bad-input', `need 4 points, got ${points.length}`);
  const tl = pick(points, (p) => p.x + p.y, false);
  const br = pick(points, (p) => p.x + p.y, true);
  const tr = pick(points, (p) => p.x - p.y, true);
  const bl = pick(points, (p) => p.x - p.y, false);
  if (new Set([tl, tr, br, bl]).size !== 4) throw new GeometryError('corner-conflict', 'two corner roles pick the same point');
  return [points[tl], points[tr], points[br], points[bl]];
}

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const len = (a: Point) => Math.hypot(a.x, a.y);

/** Shoelace area (absolute) of a polygon. */
export function polygonArea(q: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < q.length; i++) s += cross(q[i], q[(i + 1) % q.length]);
  return Math.abs(s) / 2;
}

/** Quad usable for a warp: convex, not self-intersecting, every interior angle 30°–150° (pixel space via `aspect` = W/H), area ≥ 10 % of the image. */
export function quadValid(q: readonly Point[], aspect: number): boolean {
  if (q.length !== 4 || !(aspect > 0) || !q.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return false;
  const px = q.map((p) => ({ x: p.x * aspect, y: p.y }));
  // Convex and simple: the turn at every corner has the same (non-zero) sign.
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(sub(px[(i + 1) % 4], px[i]), sub(px[(i + 2) % 4], px[(i + 1) % 4]));
    if (c === 0) return false;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  // With four corners, equal turn signs mean convex and simple (a "bow-tie" alternates the signs). The angle sum below is
  // a second guard (360° for a simple convex quad).
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const prev = px[(i + 3) % 4];
    const cur = px[i];
    const next = px[(i + 1) % 4];
    const a = sub(prev, cur);
    const b = sub(next, cur);
    const la = len(a);
    const lb = len(b);
    if (la === 0 || lb === 0) return false;
    const cos = Math.min(1, Math.max(-1, dot(a, b) / (la * lb)));
    const angle = (Math.acos(cos) * 180) / Math.PI;
    if (angle < 30 || angle > 150) return false;
    sum += angle;
  }
  if (Math.abs(sum - 360) > 1e-6) return false;
  return polygonArea(q) >= 0.1;
}

/**
 * Output pixel size of the warped page (SPEC §5.2): longest opposite edges in source pixels, snapped to A4 / Letter / Legal
 * when within 2 % (the shorter side is kept), then scaled down proportionally if a side exceeds the source's long edge.
 */
export function outputSize(q: readonly Point[], srcW: number, srcH: number): { w: number; h: number } {
  const p = q.map((c) => ({ x: c.x * srcW, y: c.y * srcH }));
  const [tl, tr, br, bl] = p;
  let w = round(Math.max(len(sub(tr, tl)), len(sub(br, bl))));
  let h = round(Math.max(len(sub(bl, tl)), len(sub(br, tr))));
  w = Math.max(w, 1);
  h = Math.max(h, 1);
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  for (const ratio of SNAP_RATIOS) {
    if (Math.abs(long / short - ratio) <= 0.02 * ratio) {
      const snapped = round(short * ratio);
      if (w >= h) w = snapped;
      else h = snapped;
      break;
    }
  }
  const limit = Math.max(srcW, srcH);
  if (w > limit || h > limit) {
    const f = limit / Math.max(w, h);
    w = Math.max(1, round(w * f));
    h = Math.max(1, round(h * f));
  }
  return { w, h };
}

/** Long/short side ratios of A4, Letter and Legal. */
export const SNAP_RATIOS = [Math.SQRT2, 11 / 8.5, 14 / 8.5] as const;

/** Homography mapping src[i] → dst[i] (h33 = 1), by Gaussian elimination with partial pivoting. Throws when singular. */
export function homography(src: readonly Point[], dst: readonly Point[]): Matrix3 {
  if (src.length !== 4 || dst.length !== 4) throw new GeometryError('bad-input', 'homography needs 4 point pairs');
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) throw new GeometryError('singular', 'points are degenerate (three on a line or repeated)');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c];
    }
  }
  const h = a.map((row, i) => row[n] / row[i]);
  return [...h, 1];
}

export function apply(H: Matrix3, p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

function checkRotation(r: number): asserts r is Rotation {
  if (r !== 0 && r !== 90 && r !== 180 && r !== 270) throw new GeometryError('bad-rotation', `rotation ${r} is not 0/90/180/270`);
}

/** Unrotated → displayed (clockwise r). 90°: (x, y) → (1 − y, x); 180°: (1 − x, 1 − y); 270°: (y, 1 − x). */
export function rotatePoint(p: Point, r: number): Point {
  checkRotation(r);
  switch (r) {
    case 0:
      return { x: p.x, y: p.y };
    case 90:
      return { x: 1 - p.y, y: p.x };
    case 180:
      return { x: 1 - p.x, y: 1 - p.y };
    case 270:
      return { x: p.y, y: 1 - p.x };
  }
}

/** Displayed → unrotated (inverse of rotatePoint). */
export function unrotatePoint(p: Point, r: number): Point {
  checkRotation(r);
  return rotatePoint(p, ((360 - r) % 360) as Rotation);
}

/** Maps a quad corner by corner. Roles are NOT re-ordered unless `reorder` (word quads keep their baseline BL→BR). */
export function rotateQuad(q: Quad, r: number, reorder = false): Quad {
  const out = q.map((p) => rotatePoint(p, r)) as Quad;
  return reorder ? orderCorners(out) : out;
}

export function unrotateQuad(q: Quad, r: number, reorder = false): Quad {
  const out = q.map((p) => unrotatePoint(p, r)) as Quad;
  return reorder ? orderCorners(out) : out;
}

/** Normalised (unrotated, top-left origin) → PDF user space of `box`: X = x0 + p.x·(x1 − x0), Y = y1 − p.y·(y1 − y0). */
export function pdfPagePoint(p: Point, box: Box): Point {
  return { x: box.x0 + p.x * (box.x1 - box.x0), y: box.y1 - p.y * (box.y1 - box.y0) };
}

/** Pixel size of an image after a clockwise rotation (90/270 swap the sides). */
export function rotatedSize(w: number, h: number, r: number): { w: number; h: number } {
  checkRotation(r);
  return r === 90 || r === 270 ? { w: h, h: w } : { w, h };
}
