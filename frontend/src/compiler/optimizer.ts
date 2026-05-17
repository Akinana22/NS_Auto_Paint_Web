/**
 * 调度优化器 — 多策略调度方案 (固定网格 + 四叉树)，蛇形扫描路径。
 */

import { Point, LeafBlock, Palette } from '@engine/types';
import { buildQuadtree } from './quadtree';
import { TimingSnapshot, defaultTiming } from './timing';
import { generateBrushNavSequence } from './brush';
import { bfsPalettePath, getCoordMap } from './palette';

export interface ScheduleItem {
  block: LeafBlock;
  colorOrder: number[];
}

export interface BestSchedule {
  schedule: ScheduleItem[];
  description: string;
  costMs: number;
  logs: string[];
}

/** 简单蛇形排序：按 y 升序，偶数行 x 升序、奇数行 x 降序 */
export function snakeSortPoints(points: Point[]): Point[] {
  if (points.length === 0) return [];
  const grouped = new Map<number, number[]>();
  for (const p of points) {
    if (!grouped.has(p.y)) grouped.set(p.y, []);
    grouped.get(p.y)!.push(p.x);
  }
  const result: Point[] = [];
  const sortedY = [...grouped.keys()].sort((a, b) => a - b);
  for (let i = 0; i < sortedY.length; i++) {
    const y = sortedY[i];
    const xs = grouped.get(y)!.sort((a, b) => a - b);
    if (i % 2 === 0) {
      for (const x of xs) result.push({ x, y });
    } else {
      for (let j = xs.length - 1; j >= 0; j--) result.push({ x: xs[j], y });
    }
  }
  return result;
}

/** 自适应蛇形排序 — 根据画笔当前位置调整扫描方向 */
export function sortPointsAdaptive(
  points: Point[],
  curX: number,
  curY: number,
): Point[] {
  if (points.length === 0) return [];
  const rows = new Map<number, number[]>();
  for (const p of points) {
    if (!rows.has(p.y)) rows.set(p.y, []);
    rows.get(p.y)!.push(p.x);
  }
  const sortedY = [...rows.keys()].sort((a, b) => a - b);
  if (sortedY.length === 0) return [];

  const minY = sortedY[0], maxY = sortedY[sortedY.length - 1];
  const yOrder = curY >= (minY + maxY) / 2
    ? [...sortedY].reverse()
    : sortedY;

  const result: Point[] = [];
  let flipX = false;
  for (const y of yOrder) {
    const xs = rows.get(y)!.sort((a, b) => a - b);
    if (flipX) xs.reverse();
    for (const x of xs) result.push({ x, y });
    flipX = !flipX;
  }
  return result;
}

/** 生成候选调度方案 */
export function generateCandidateSchedules(
  gridMatrix: number[][],
): { schedule: ScheduleItem[]; description: string }[] {
  const schedules: { schedule: ScheduleItem[]; description: string }[] = [];
  const gridH = gridMatrix.length;
  const gridW = gridMatrix[0]?.length ?? 0;
  if (gridH === 0 || gridW === 0) return schedules;

  // 固定网格
  const possibleK = [1, 2, 4, 8, 16, 32, 64];
  for (const k of possibleK) {
    if (gridW % k !== 0 || gridH % k !== 0) continue;
    if (k > gridW || k > gridH) continue;
    const blockW = gridW / k;
    const blockH = gridH / k;
    const schedule: ScheduleItem[] = [];
    for (let by = 0; by < k; by++) {
      for (let bx = 0; bx < k; bx++) {
        const xStart = bx * blockW;
        const yStart = by * blockH;
        const colorPoints = new Map<number, Point[]>();
        for (let gy = 0; gy < blockH; gy++) {
          for (let gx = 0; gx < blockW; gx++) {
            const idx = gridMatrix[yStart + gy][xStart + gx];
            if (idx >= 0) {
              if (!colorPoints.has(idx)) colorPoints.set(idx, []);
              colorPoints.get(idx)!.push({ x: xStart + gx, y: yStart + gy });
            }
          }
        }
        if (colorPoints.size > 0) {
          const block: LeafBlock = { x: xStart, y: yStart, w: blockW, h: blockH, colorPoints };
          const sortedColors = [...colorPoints.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([c]) => c);
          schedule.push({ block, colorOrder: sortedColors });
        }
      }
    }
    schedules.push({ schedule, description: `固定网格 ${k}x${k}` });
  }

  // 四叉树
  for (const threshold of [2, 3, 5, 8, 12]) {
    const blocks = buildQuadtree(gridMatrix, threshold);
    const schedule: ScheduleItem[] = [];
    for (const block of blocks) {
      if (block.colorPoints.size > 0) {
        const sortedColors = [...block.colorPoints.entries()]
          .sort((a, b) => b[1].length - a[1].length)
          .map(([c]) => c);
        schedule.push({ block, colorOrder: sortedColors });
      }
    }
    schedules.push({ schedule, description: `四叉树 阈值${threshold}` });
  }

  return schedules;
}

/** 评估调度方案的总耗时 (ms) */
export function estimateScheduleCost(
  schedule: ScheduleItem[],
  brushType: string,
  brushSize: number,
  usePreset: boolean,
  gridW: number,
  gridH: number,
  palette: Palette,
  pressData?: { h: number; s: number; b: number }[],
  timing: TimingSnapshot = defaultTiming,
): number {
  if (schedule.length === 0) return Infinity;

  let curGx = Math.floor(gridW / 2);
  let curGy = Math.floor(gridH / 2);
  let totalMs = 0;

  // 画笔切换
  const brushCmds = generateBrushNavSequence(brushType, brushSize, timing);
  totalMs += brushCmds.reduce((s: number, c: any) => s + c.totalMs, 0);

  // 调色盘初始状态
  let curRow = 7, curCol = 1; // preset
  let curH = 0, curS = 0, curV = 0; // custom

  for (const { block, colorOrder } of schedule) {
    if (colorOrder.length === 0) continue;

    for (let ci = 0; ci < colorOrder.length; ci++) {
      const colorIdx = colorOrder[ci];
      const pts = block.colorPoints.get(colorIdx) || [];
      if (pts.length === 0) continue;

      // 颜色切换耗时
      const targetRgb = palette[colorIdx];
      const targetHex = `#${targetRgb[0].toString(16).padStart(2, '0')}${targetRgb[1].toString(16).padStart(2, '0')}${targetRgb[2].toString(16).padStart(2, '0')}`.toUpperCase();

      if (usePreset) {
        totalMs += timing.keyIntervalMs + timing.waitIntervalMs + timing.keyIntervalMs; // Y+Y
        const [tR, tC] = getCoordMap().get(targetHex) || [1, 1];
        const path = bfsPalettePath(curRow, curCol, tR, tC);
        totalMs += path.length * timing.keyIntervalMs + timing.keyIntervalMs + timing.waitIntervalMs;
        curRow = tR; curCol = tC;
      } else {
        totalMs += timing.keyIntervalMs + timing.waitIntervalMs + timing.keyIntervalMs
          + timing.keyIntervalMs + timing.waitIntervalMs; // Y+Y+R
        const pd = pressData?.[colorIdx] || { h: 0, s: 0, b: 0 };
        totalMs += Math.abs(pd.h - curH) * timing.keyIntervalMs
          + Math.abs(pd.s - curS) * timing.svKeyIntervalMs
          + Math.abs(pd.b - curV) * timing.svKeyIntervalMs
          + timing.keyIntervalMs + timing.waitIntervalMs;
        curH = pd.h; curS = pd.s; curV = pd.b;
      }

      // 绘制
      const sorted = ci === 0 ? snakeSortPoints(pts) : sortPointsAdaptive(pts, curGx, curGy);
      for (const p of sorted) {
        const step = Math.abs(curGx - p.x) + Math.abs(curGy - p.y);
        totalMs += step * (brushType === 'smooth' && brushSize > 1 ? brushSize : 1) * timing.keyIntervalMs;
        totalMs += timing.drawMs;
        curGx = p.x; curGy = p.y;
      }
    }
  }

  return totalMs;
}

/** 寻找最优调度方案 */
export function findBestSchedule(
  gridMatrix: number[][],
  brushType: string,
  brushSize: number,
  usePreset: boolean,
  palette: Palette,
  pressData?: { h: number; s: number; b: number }[],
  timing: TimingSnapshot = defaultTiming,
): BestSchedule {
  const gridH = gridMatrix.length;
  const gridW = gridMatrix[0]?.length ?? 0;
  const candidates = generateCandidateSchedules(gridMatrix);
  let bestSchedule: ScheduleItem[] | null = null;
  let bestCost = Infinity;
  let bestDesc = '';
  const logs: string[] = [];

  for (const { schedule, description } of candidates) {
    const cost = estimateScheduleCost(
      schedule, brushType, brushSize, usePreset,
      gridW, gridH, palette, pressData, timing,
    );
    logs.push(`${description}: ${(cost / 1000).toFixed(1)} 秒`);
    if (cost < bestCost) {
      bestCost = cost;
      bestSchedule = schedule;
      bestDesc = description;
    }
  }

  return {
    schedule: bestSchedule || [],
    description: bestDesc,
    costMs: bestCost,
    logs,
  };
}
