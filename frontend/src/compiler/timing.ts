/** 时序参数 — 集中管理，支持快照冻结 */

export interface TimingSnapshot {
  keyIntervalMs: number;
  svKeyIntervalMs: number;
  waitIntervalMs: number;
  drawMs: number;
  pressHoldMs: number;
}

export const defaultTiming: TimingSnapshot = {
  keyIntervalMs: 100,
  svKeyIntervalMs: 200,
  waitIntervalMs: 100,
  drawMs: 100,
  pressHoldMs: 30,
};

export function createTimingSnapshot(
  overrides: Partial<TimingSnapshot> = {},
): TimingSnapshot {
  return { ...defaultTiming, ...overrides };
}
