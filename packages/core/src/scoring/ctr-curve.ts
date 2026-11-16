/**
 * Expected organic CTR by average position (desktop + mobile blend), used by rule 2.9.3.
 * Rounded from public click-curve studies (2024–2025); the rule only flags pages below
 * half of this, so the curve needs to be roughly right, not exact.
 */
const CURVE: [position: number, ctr: number][] = [
  [1, 0.28], [2, 0.155], [3, 0.11], [4, 0.08], [5, 0.06], [6, 0.046], [7, 0.036], [8, 0.03], [9, 0.025], [10, 0.021],
  [15, 0.012], [20, 0.008], [30, 0.004], [50, 0.002],
];

export function expectedCtr(position: number): number {
  if (position <= CURVE[0]![0]) return CURVE[0]![1];
  for (let i = 1; i < CURVE.length; i++) {
    const [p1, c1] = CURVE[i]!;
    if (position <= p1) {
      const [p0, c0] = CURVE[i - 1]!;
      return c0 + ((c1 - c0) * (position - p0)) / (p1 - p0);
    }
  }
  return CURVE[CURVE.length - 1]![1];
}
