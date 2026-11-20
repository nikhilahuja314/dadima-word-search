import { circle, moveTo, sample, transform } from '../geom/path';
import { insetPetal, petalPath, tipHalfAngle } from '../geom/shapes';
import { EPS, dist, polar, rot } from '../geom/vec';
import type { Drawing, Fill, Path, PetalSpec, Region, SectorSpec, Vec } from '../types';
import { NUMBERS } from '../types';
import { RegionIndex, findSpacingViolation, regionPath } from './measure';

const DETAIL = NUMBERS.detailMm;
const S = NUMBERS.minStrokeSpacing;
/** Every output point stays at least this far from the region outline (centre line to centre line). */
const MARGIN = DETAIL / 2 + 0.1;
/** Construction guards are a little stricter than the stated limits so that tests never sit on them. */
const SAFE = 0.02;
/** Fan and comb strokes stop this far short of the boundary. */
const STOP_SHORT = 0.6;
const MIN_STROKE = 1.2;

const origin: Vec = { x: 0, y: 0 };
const mirrorY = (v: Vec): Vec => ({ x: v.x, y: -v.y });
const rad = (v: Vec): number => Math.hypot(v.x, v.y);
const at = <T>(a: readonly T[], i: number): T => a[i] as T;

/** A region with its axis at angle 0 (+x), plus the derived geometry that fills need. */
interface Ctx {
  region: Region;
  idx: RegionIndex;
  /** Top boundary from the +y base end, over the tip, to the -y base end (the base is excluded). */
  chain: Vec[];
  cum: number[];
  tipIdx: number;
  xBase: number;
  xTip: number;
  /** True if the region's boundary is itself a stroke we draw (an inset or teardrop outline). */
  drawn: boolean;
}

function makeCtx(region: Region, drawn: boolean): Ctx {
  const path = regionPath(region);
  const idx = new RegionIndex(sample(path, 0.1));
  let chainPath: Path;
  let xBase: number;
  let xTip: number;
  if (region.kind === 'petal') {
    chainPath = { start: path.start, segs: path.segs.slice(0, 4), closed: false };
    xBase = region.spec.rBase;
    xTip = region.spec.rTip;
  } else {
    const { rInner, rOuter, a0, a1 } = region.spec;
    chainPath = moveTo(polar(rOuter, a1)).arc(origin, rOuter, a1, a0).build();
    xBase = rInner;
    xTip = rOuter;
  }
  const chain = sample(chainPath, 0.1);
  const cum = [0];
  let tipIdx = 0;
  for (let i = 1; i < chain.length; i++) {
    cum.push(at(cum, i - 1) + dist(at(chain, i - 1), at(chain, i)));
  }
  if (region.kind === 'petal') {
    chain.forEach((p, i) => {
      if (p.x > at(chain, tipIdx).x) tipIdx = i;
    });
  } else {
    chain.forEach((p, i) => {
      if (Math.abs(p.y) < Math.abs(at(chain, tipIdx).y)) tipIdx = i;
    });
  }
  return { region, idx, chain, cum, tipIdx, xBase, xTip, drawn };
}

/** Half-width of a petal at axis position x (0 outside its extent). */
function halfAt(ctx: Ctx, x: number): number {
  const up = ctx.chain;
  if (x <= at(up, 0).x) return at(up, 0).y;
  if (x >= at(up, ctx.tipIdx).x) return 0;
  let lo = 0;
  let hi = ctx.tipIdx;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (at(up, mid).x <= x) lo = mid;
    else hi = mid;
  }
  const a = at(up, lo);
  const b = at(up, hi);
  return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x || 1);
}

function chainPoint(ctx: Ctx, s: number): Vec {
  const total = at(ctx.cum, ctx.cum.length - 1);
  const q = Math.max(0, Math.min(total, s));
  let lo = 0;
  let hi = ctx.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (at(ctx.cum, mid) <= q) lo = mid;
    else hi = mid;
  }
  const a = at(ctx.chain, lo);
  const b = at(ctx.chain, hi);
  const span = at(ctx.cum, hi) - at(ctx.cum, lo) || 1;
  const t = (q - at(ctx.cum, lo)) / span;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Boundary point at arc length `s` along the chain, and the unit normal pointing into the region. */
function chainFrame(ctx: Ctx, s: number): { p: Vec; n: Vec } {
  const p = chainPoint(ctx, s);
  const a = chainPoint(ctx, s - 0.4);
  const b = chainPoint(ctx, s + 0.4);
  const l = dist(a, b) || 1;
  const t = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  // The chain runs from +y to -y, so the interior is on the right of the direction of travel.
  return { p, n: { x: t.y, y: -t.x } };
}

/** The "local width" that comb depth is a fraction of: half-width of a petal, depth of a sector. */
function localScale(ctx: Ctx, p: Vec): number {
  if (ctx.region.kind === 'petal') return halfAt(ctx, p.x);
  return ctx.region.spec.rOuter - ctx.region.spec.rInner;
}

/**
 * An enclosing real region (or part of one) that strokes must also stay inside. `clear` is the
 * extra clearance non-end points need from it, which is `S` when its boundary is a drawn stroke.
 */
interface Guard {
  idx: RegionIndex;
  clear: number;
}

interface ValidOptions {
  /** Whether guards impose their clearance (default true). */
  guardClear?: boolean;
  /** Arc length at each end of an open stroke that is exempt from clearance (default 0.7 mm). */
  freeStart?: number;
  freeEnd?: number;
  /** Also exempt this fraction of the stroke's length from its start (the converging part of a fan). */
  startFrac?: number;
}

const guardOf = (ctx: Ctx): Guard => ({ idx: ctx.idx, clear: ctx.drawn ? S - SAFE : 0 });

/** All of `paths` inside the region and every guard, with the clearance rules. */
function valid(
  ctx: Ctx,
  guards: readonly Guard[],
  paths: readonly Path[],
  clear: number,
  opts: ValidOptions = {},
): boolean {
  const guardClear = opts.guardClear ?? true;
  const freeStart = opts.freeStart ?? 0.7;
  const freeEnd = opts.freeEnd ?? 0.7;
  for (const path of paths) {
    const pts = sample(path, 0.2);
    let total = 0;
    const arc = [0];
    for (let i = 1; i < pts.length; i++) {
      total += dist(at(pts, i - 1), at(pts, i));
      arc.push(total);
    }
    for (let k = 0; k < pts.length; k++) {
      const p = at(pts, k);
      if (!ctx.idx.inside(p)) return false;
      const d = ctx.idx.distance(p);
      if (d < MARGIN + SAFE) return false;
      const free =
        !path.closed &&
        (at(arc, k) < Math.max(freeStart, (opts.startFrac ?? 0) * total) ||
          total - at(arc, k) < freeEnd);
      if (!free && d < clear) return false;
      for (const g of guards) {
        if (!g.idx.inside(p)) return false;
        const gd = g.idx.distance(p);
        if (gd < MARGIN + SAFE || (guardClear && !free && gd < g.clear)) return false;
      }
    }
  }
  return true;
}

/** Valid, and no two strokes closer than the spacing limit. */
function accept(
  ctx: Ctx,
  guards: readonly Guard[],
  paths: readonly Path[],
  opts: { clear?: number; strict?: boolean } & ValidOptions = {},
): boolean {
  if (!valid(ctx, guards, paths, opts.clear ?? S - SAFE, opts)) return false;
  return !findSpacingViolation(paths, { min: S - 0.01, freeEnd: opts.strict ? 0 : 0.7 });
}

function line(a: Vec, b: Vec): Path {
  return moveTo(a).line(b).build();
}

const mirrorPath = (p: Path): Path => transform(p, mirrorY);

/** Fan: strokes from just inside the base centre to the boundary, evenly spaced by angle. */
function fan(ctx: Ctx, guards: readonly Guard[], requested: number): Path[] {
  const o: Vec = { x: ctx.xBase + 0.5, y: 0 };
  const L = ctx.xTip - ctx.xBase;
  let ref = at(ctx.chain, 0);
  if (ctx.region.kind === 'petal') {
    const target = ctx.xBase + 0.2 * L;
    ref = at(
      ctx.chain,
      Math.max(
        0,
        ctx.chain.findIndex((p) => p.x >= target),
      ),
    );
  }
  const phiMax = Math.min(Math.atan2(ref.y, ref.x - o.x), (80 * Math.PI) / 180);
  if (!(phiMax > 0.05)) return [];
  const poly = ctx.idx.poly;
  const rayHit = (dir: Vec): number => {
    let best = Infinity;
    for (let i = 0; i + 1 < poly.length; i++) {
      const a = at(poly, i);
      const b = at(poly, i + 1);
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const den = dir.x * ey - dir.y * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((a.x - o.x) * ey - (a.y - o.y) * ex) / den;
      const u = ((a.x - o.x) * dir.y - (a.y - o.y) * dir.x) / den;
      if (t > 1e-9 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
    return best;
  };
  for (let n = requested; n >= 3; n--) {
    const strokes: { dir: Vec; len: number }[] = [];
    let ok = true;
    // Angles are symmetric about the axis: solve the upper half and mirror it.
    for (let j = 1; j <= n && ok; j++) {
      const phi = -phiMax + (j * 2 * phiMax) / (n + 1);
      if (phi < -1e-9) continue;
      const dir = { x: Math.cos(phi), y: Math.sin(phi) };
      const hit = rayHit(dir);
      let len = hit;
      while (
        len > 3 &&
        ctx.idx.distance({ x: o.x + len * dir.x, y: o.y + len * dir.y }) < STOP_SHORT
      ) {
        len -= 0.05;
      }
      if (!(len > 3) || !Number.isFinite(hit)) ok = false;
      else strokes.push({ dir, len });
    }
    if (!ok) continue;
    const full = [
      ...strokes
        .filter((s) => s.dir.y > 1e-9)
        .map((s) => ({ dir: mirrorY(s.dir), len: s.len }))
        .toReversed(),
      ...strokes,
    ];
    if (full.length !== n) continue;
    // Spacing check at 60% of stroke length.
    const mid = full.map((s) => ({
      x: o.x + 0.6 * s.len * s.dir.x,
      y: o.y + 0.6 * s.len * s.dir.y,
    }));
    let spaced = true;
    for (let j = 0; j + 1 < mid.length; j++)
      if (dist(at(mid, j), at(mid, j + 1)) < S) spaced = false;
    if (!spaced) continue;
    const paths = full.map((s) => line(o, { x: o.x + s.len * s.dir.x, y: o.y + s.len * s.dir.y }));
    if (accept(ctx, guards, paths, { freeEnd: 2.5, startFrac: 0.6 })) return paths;
  }
  return [];
}

/** Comb: short strokes pointing inward from evenly spaced boundary points. */
function comb(ctx: Ctx, guards: readonly Guard[], requested: number, depth: number): Path[] {
  const total = at(ctx.cum, ctx.cum.length - 1);
  const s0 = 0.15 * total;
  const s1 = 0.85 * total;
  const nMax = Math.floor((s1 - s0) / S) + 1;
  for (let n = Math.min(requested, nMax); n >= 3; n--) {
    // Solve the +y half (and the on-axis stroke for odd n) and mirror it, so the result is exactly
    // symmetric and a stroke skipped on one side is skipped on the other.
    const half: Path[] = [];
    let middle: Path | null = null;
    for (let i = 0; i <= (n - 1) / 2 + 1e-9; i++) {
      const { p, n: u } = chainFrame(ctx, s0 + ((s1 - s0) * i) / (n - 1));
      const len = depth * localScale(ctx, p);
      const a = { x: p.x + STOP_SHORT * u.x, y: p.y + STOP_SHORT * u.y };
      const stroke = line(a, { x: a.x + len * u.x, y: a.y + len * u.y });
      const ok =
        len >= MIN_STROKE && valid(ctx, guards, [stroke], S - SAFE, { freeStart: 2.5, freeEnd: 0 });
      if (i < (n - 1) / 2 - 1e-9) {
        if (ok) half.push(stroke);
      } else if (ok) middle = stroke;
    }
    const paths = [...half, ...(middle ? [middle] : []), ...half.map(mirrorPath).toReversed()];
    if (paths.length < 3) continue;
    if (accept(ctx, guards, paths, { strict: true, freeStart: 2.5, freeEnd: 0 })) return paths;
  }
  return [];
}

/** A polyline with arc-length lookup. */
function polyline(pts: readonly Vec[]): { at: (s: number) => Vec; length: number } {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(at(cum, i - 1) + dist(at(pts, i - 1), at(pts, i)));
  const length = at(cum, cum.length - 1);
  return {
    length,
    at(s) {
      const q = Math.max(0, Math.min(length, s));
      let lo = 0;
      let hi = cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (at(cum, mid) <= q) lo = mid;
        else hi = mid;
      }
      const a = at(pts, lo);
      const b = at(pts, hi);
      const t = (q - at(cum, lo)) / (at(cum, hi) - at(cum, lo) || 1);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    },
  };
}

/** The arc that bead fills are strung along, from the +y side over the tip to the -y side. */
function beadArc(ctx: Ctx): Vec[] {
  if (ctx.region.kind === 'sector') {
    const { rInner, rOuter, a0, a1 } = ctx.region.spec;
    const rMid = (rInner + rOuter) / 2;
    const pts: Vec[] = [];
    const steps = Math.max(8, Math.ceil((rMid * (a1 - a0)) / 0.2));
    for (let i = 0; i <= steps; i++) pts.push(polar(rMid, a1 - ((a1 - a0) * i) / steps));
    return pts;
  }
  const L = ctx.xTip - ctx.xBase;
  const x0 = ctx.xBase + 0.35 * L;
  const x1 = ctx.xBase + 0.85 * L;
  const d = Math.max(0.35 * halfAt(ctx, ctx.xBase + 0.5 * L), S + 1.0);
  const up: Vec[] = [];
  let crossed = false;
  for (let i = 0; i <= ctx.tipIdx && !crossed; i++) {
    const p = at(ctx.chain, i);
    if (p.x < x0) continue;
    if (p.x > x1) break;
    const a = at(ctx.chain, Math.max(0, i - 3));
    const b = at(ctx.chain, Math.min(ctx.chain.length - 1, i + 3));
    const l = dist(a, b) || 1;
    const q = { x: p.x + (d * (b.y - a.y)) / l, y: p.y - (d * (b.x - a.x)) / l };
    if (q.y <= 0) {
      up.push({ x: q.x, y: 0 });
      crossed = true;
    } else up.push(q);
  }
  if (up.length < 2) return [];
  const lower = up.map(mirrorY).toReversed();
  return crossed ? [...up, ...lower.slice(1)] : [...up, ...lower];
}

function beads(ctx: Ctx, guards: readonly Guard[], requested: number): Path[] {
  const arc = beadArc(ctx);
  if (arc.length < 2) return [];
  const pl = polyline(arc);
  const nMax = Math.floor(pl.length / (2 + S));
  for (let n = Math.min(requested, nMax); n >= 3; n--) {
    const centres: Vec[] = [];
    for (let i = 0; i < n; i++) centres.push(pl.at(((i + 0.5) * pl.length) / n));
    let r = pl.length / n / 2 - S / 2;
    // Beads must also keep their distance from the boundary.
    for (const c of centres) r = Math.min(r, ctx.idx.distance(c) - S);
    r -= 0.01;
    if (r < 1.0) continue;
    const paths = centres.map((c) => circle(c, r));
    if (accept(ctx, guards, paths)) return paths;
  }
  return [];
}

/** Semicircle scallops along the base, bulging away from the base. */
function scallops(ctx: Ctx, guards: readonly Guard[], requested: number): Path[] {
  const rho = ctx.xBase + S + 0.05;
  // Angular extent at radius rho that keeps the spacing clearance from the sides.
  const step = 0.1 / rho;
  let psi = 0;
  while (
    psi < Math.PI / 2 &&
    ctx.idx.inside(polar(rho, psi + step)) &&
    ctx.idx.distance(polar(rho, psi + step)) >= S - SAFE + 0.01
  ) {
    psi += step;
  }
  if (psi * rho < 1.2) return [];
  const nMax = Math.floor((2 * psi * rho) / (2 * 1.2));
  // Fewer, larger scallops are tried first; if their bulges do not fit, a couple more (smaller) ones.
  const counts: number[] = [];
  for (let n = Math.min(requested, nMax); n >= 2; n--) counts.push(n);
  for (let n = requested + 1; n <= Math.min(requested + 2, nMax); n++) counts.push(n);
  for (const n of counts) {
    const paths: Path[] = [];
    const delta = (2 * psi) / n;
    const chord = 2 * rho * Math.sin(delta / 2);
    const r = chord / 2;
    if (r < 1.2) continue;
    for (let i = 0; i < n; i++) {
      const phi = -psi + delta * (i + 0.5);
      const c = polar(rho * Math.cos(delta / 2), phi);
      const a0 = phi - Math.PI / 2;
      paths.push(
        moveTo({ x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) })
          .arc(c, r, a0, phi + Math.PI / 2)
          .build(),
      );
    }
    if (accept(ctx, guards, paths)) return paths;
  }
  return [];
}

function insetRegion(region: Region, gap: number): Region | null {
  if (region.kind === 'petal') {
    const spec = insetPetal(region.spec, gap);
    return spec ? { kind: 'petal', spec } : null;
  }
  const { rInner, rOuter, a0, a1 } = region.spec;
  const rI = rInner + gap;
  const rO = rOuter - gap;
  if (rO - rI < NUMBERS.minRegionWidth) return null;
  const da = Math.asin(Math.min(1, gap / rI));
  const b0 = a0 + da;
  const b1 = a1 - da;
  if (b1 <= b0 || 2 * rI * Math.sin((b1 - b0) / 2) < NUMBERS.minRegionWidth) return null;
  const spec: SectorSpec = { rInner: rI, rOuter: rO, a0: b0, a1: b1 };
  return { kind: 'sector', spec };
}

function innerTeardrop(ctx: Ctx, guards: readonly Guard[], scale: number, then: Fill): Path[] {
  if (ctx.region.kind !== 'petal') return [];
  const parent = ctx.region.spec;
  const L = parent.rTip - parent.rBase;
  const rBase = parent.rBase + 0.2 * L;
  const tipClear = NUMBERS.minStrokeSpacing / Math.sin(tipHalfAngle(parent.shape)) + 0.1;
  for (let k = 0; k <= 6; k++) {
    const rTip = Math.min(rBase + scale * L * (1 - 0.05 * k), parent.rTip - tipClear);
    if (rTip - rBase < 4) break;
    const xb = rBase + 0.33 * (rTip - rBase);
    const wmax = halfAt(ctx, xb) - S - 0.25 * k;
    if (wmax < 1.2) break;
    const halfWidth = Math.asin(Math.min(1, wmax / (1.3 * rBase)));
    const spec: PetalSpec = {
      shape: 'teardrop',
      angle: 0,
      rBase,
      rTip,
      halfWidth,
      bellyAt: 0.33,
      bellyScale: 1.3,
    };
    const outline = petalPath(spec);
    if (!accept(ctx, guards, [outline])) continue;
    const child = build({ kind: 'petal', spec }, then, [guardOf(ctx), ...guards], true);
    return [outline, ...child];
  }
  return [];
}

function split(ctx: Ctx, guards: readonly Guard[], at_: number, lower: Fill, upper: Fill): Path[] {
  if (ctx.region.kind !== 'petal') return [];
  const p = ctx.region.spec;
  const L = p.rTip - p.rBase;
  const rs = p.rBase + at_ * L;
  // Walk out along the circle of radius rs until it leaves the petal: once with no margin (where it
  // meets the boundary) and once with the clearance the stroke needs.
  const step = 0.1 / rs;
  let psiEdge = 0;
  let psiArc = 0;
  while (psiEdge < Math.PI / 2 && ctx.idx.inside(polar(rs, psiEdge + step))) psiEdge += step;
  while (
    psiArc < psiEdge &&
    ctx.idx.distance(polar(rs, psiArc + step)) >= MARGIN + SAFE + 0.05 &&
    ctx.idx.inside(polar(rs, psiArc + step))
  ) {
    psiArc += step;
  }
  if (psiArc * rs < 1.5) return [];
  const arc = moveTo(polar(rs, psiArc)).arc(origin, rs, psiArc, -psiArc).build();
  // The arc may meet the outline in a T, but must not run alongside it.
  if (!valid(ctx, guards, [arc], S - SAFE, { freeStart: 2.5, freeEnd: 2.5 })) return [];
  const out = [arc];
  // The two sides are approximated by pseudo petals (the real sub-regions are not petals): the lower
  // one is a 'round' petal topped at the split radius whose belly matches the real width there, and
  // the upper one is a petal of the parent's shape rooted on the split arc. Strokes inside them are
  // still checked against the real petal through `guards`.
  const xbL = p.rBase + 0.6 * (rs - p.rBase);
  const cyL = p.rBase * Math.sin(p.halfWidth);
  const lowerSpec: PetalSpec = {
    shape: 'round',
    angle: 0,
    rBase: p.rBase,
    rTip: rs,
    halfWidth: p.halfWidth,
    bellyAt: 0.6,
    bellyScale: Math.max(0.3, halfAt(ctx, xbL) / cyL),
  };
  const bellyAbs = p.rBase + p.bellyAt * L;
  const bellyAtU = Math.min(0.9, Math.max(0.1, (bellyAbs - rs) / (p.rTip - rs)));
  const xbU = rs + bellyAtU * (p.rTip - rs);
  const upperSpec: PetalSpec = {
    shape: p.shape,
    angle: 0,
    rBase: rs,
    rTip: p.rTip,
    halfWidth: psiEdge,
    bellyAt: bellyAtU,
    bellyScale: Math.max(0.3, halfAt(ctx, xbU) / (rs * Math.sin(psiEdge))),
  };
  const { lower: lowerGuard, upper: upperGuard } = splitGuards(ctx, rs, psiEdge);
  const base = [guardOf(ctx), ...guards];
  out.push(...build({ kind: 'petal', spec: lowerSpec }, lower, [lowerGuard, ...base], false));
  out.push(...build({ kind: 'petal', spec: upperSpec }, upper, [upperGuard, ...base], false));
  return out;
}

/**
 * The real regions below and above the split arc (the petal cut by the circle of radius `rs`), as
 * guards. Pseudo petals only approximate these, so strokes are also checked against them.
 */
function splitGuards(ctx: Ctx, rs: number, psi: number): { lower: Guard; upper: Guard } {
  const arc = (from: number, to: number): Vec[] => {
    const n = Math.max(4, Math.ceil((rs * Math.abs(to - from)) / 0.1));
    return Array.from({ length: n + 1 }, (_, i) => polar(rs, from + ((to - from) * i) / n));
  };
  const upper = ctx.chain.slice(0, ctx.tipIdx + 1);
  const lower = ctx.chain.slice(ctx.tipIdx + 1);
  const spec = (ctx.region as { kind: 'petal'; spec: PetalSpec }).spec;
  const baseArc = Array.from({ length: 41 }, (_, i) =>
    polar(spec.rBase, -spec.halfWidth + (2 * spec.halfWidth * i) / 40),
  );
  const below = [
    ...upper.filter((v) => rad(v) < rs),
    ...arc(psi, -psi),
    ...lower.filter((v) => rad(v) < rs),
    ...baseArc,
  ];
  const above = [
    ...upper.filter((v) => rad(v) >= rs),
    ...lower.filter((v) => rad(v) >= rs),
    ...arc(-psi, psi),
  ];
  return {
    lower: { idx: new RegionIndex(below), clear: S - SAFE },
    upper: { idx: new RegionIndex(above), clear: S - SAFE },
  };
}

/**
 * Interpret `fill` inside `region` (axis at angle 0). `guards` are the enclosing real regions;
 * `drawn` says whether this region's boundary is a stroke we draw (rather than the caller's outline).
 */
function build(region: Region, fill: Fill, guards: readonly Guard[], drawn: boolean): Path[] {
  if (fill.type === 'none') return [];
  const ctx = makeCtx(region, drawn);
  switch (fill.type) {
    case 'inset': {
      // An inset outline must also keep its spacing from a drawn parent outline. insetPetal only
      // promises 0.8 of the gap, so widen the gap a little until the clearance holds.
      for (let g = fill.gap; g <= fill.gap + 1.2 + 1e-9; g += 0.1) {
        const inner = insetRegion(region, g);
        if (!inner) return [];
        const outline = regionPath(inner);
        if (!valid(ctx, guards, [outline], drawn ? S - SAFE : 0)) continue;
        return [outline, ...build(inner, fill.then, [guardOf(ctx), ...guards], true)];
      }
      return [];
    }
    case 'fan':
      return fan(ctx, guards, fill.n);
    case 'comb':
      return comb(ctx, guards, fill.n, fill.depth);
    case 'beadArc':
      return beads(ctx, guards, fill.n);
    case 'scallopArc':
      return scallops(ctx, guards, fill.n);
    case 'innerTeardrop':
      return innerTeardrop(ctx, guards, fill.scale, fill.then);
    case 'split':
      return split(ctx, guards, fill.at, fill.lower, fill.upper);
  }
}

/** Put the region's axis on angle 0, returning the rotation that undoes it. */
function normalise(region: Region): { local: Region; angle: number } {
  if (region.kind === 'petal') {
    return {
      local: { kind: 'petal', spec: { ...region.spec, angle: 0 } },
      angle: region.spec.angle,
    };
  }
  const { rInner, rOuter, a0, a1 } = region.spec;
  const w = (a1 - a0) / 2;
  return {
    local: { kind: 'sector', spec: { rInner, rOuter, a0: -w, a1: w } },
    angle: (a0 + a1) / 2,
  };
}

function compute(region: Region, fill: Fill): Path[] {
  const { local, angle } = normalise(region);
  const paths = build(local, fill, [], false);
  return Math.abs(angle) < EPS ? paths : paths.map((p) => transform(p, (v) => rot(v, angle)));
}

/** True if `fill` draws anything inside `region` (it silently degrades when there is no room). */
export function fits(region: Region, fill: Fill): boolean {
  return compute(region, fill).length > 0;
}

/**
 * Draw `fill` strictly inside `region`. Every stroke is role `detail`; the region's own outline is
 * not drawn (inset outlines are). Requested counts are clamped to what fits, and a fill that cannot
 * fit draws nothing. Deterministic: no rng, everything derives from the region and the fill.
 */
export function renderFill(region: Region, fill: Fill): Drawing {
  return {
    strokes: compute(region, fill).map((path) => ({ path, role: 'detail' as const })),
    fills: [],
  };
}
