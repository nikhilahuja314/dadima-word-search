import type { Vec } from '../types';

/** Tolerance for geometric comparisons, mm. */
export const EPS = 1e-6;

export function add(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec, s: number): Vec {
  return { x: v.x * s, y: v.y * s };
}

export function len(v: Vec): number {
  return Math.hypot(v.x, v.y);
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Rotate `v` counter-clockwise by `a` radians about the origin. */
export function rot(v: Vec, a: number): Vec {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** Point at radius `r`, angle `a` (radians, counter-clockwise from +x). */
export function polar(r: number, a: number): Vec {
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

/** Angle of `v` in radians, in (-π, π]. */
export function angleOf(v: Vec): number {
  return Math.atan2(v.y, v.x);
}

/** Mirror across the x-axis (negate y). */
export function mirrorX(v: Vec): Vec {
  return { x: v.x, y: -v.y };
}

/** Mirror across the ray at angle `theta` through the origin. */
export function mirrorAbout(v: Vec, theta: number): Vec {
  return rot(mirrorX(rot(v, -theta)), theta);
}
