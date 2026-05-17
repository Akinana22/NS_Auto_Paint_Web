/**
 * 画笔切换指令生成 — 基于游戏内 3行×6列 网格 UI。
 * BFS 最短路径导航。
 */
import { TextCmd } from './types';
import { TimingSnapshot, defaultTiming } from './timing';

// 画笔尺寸→列号映射
const SMOOTH_SIZE_TO_COL: Record<number, number> = { 1: 1, 3: 2, 7: 3, 13: 4, 19: 5, 27: 6 };
const PIXEL_SIZE_TO_COL: Record<number, number> = { 4: 2, 8: 3, 16: 4, 32: 5 };
const R1_COLS = new Set([1, 3, 5]);
const R1_LABEL = { 1: '顺滑画笔', 3: '其他画笔', 5: '像素画笔' } as const;
const TYPE_TO_R1_COL: Record<string, number> = { smooth: 1, pixel: 5 };
const R1_TO_SMOOTH_R2: Record<number, number> = { 1: 1, 3: 3, 5: 5 };
const R1_TO_PIXEL_R2: Record<number, number> = { 1: 2, 3: 3, 5: 5 };
const R2_TO_R1: Record<number, number> = { 1: 1, 2: 1, 3: 3, 4: 3, 5: 5, 6: 5 };
const INITIAL: [string, number, number] = ['smooth', 2, 3];

function isValidCell(row: number, col: number, brushMode: string): boolean {
  if (row === 1) return R1_COLS.has(col);
  if (row === 2 || row === 3) {
    if (brushMode === 'smooth') return col >= 1 && col <= 6;
    return col >= 2 && col <= 5;
  }
  return false;
}

function getNeighbors(row: number, col: number, brushMode: string): [number, number, string][] {
  const n: [number, number, string][] = [];
  if (row === 2 || row === 3) {
    if (isValidCell(row, col - 1, brushMode)) n.push([row, col - 1, 'LEFT']);
    if (isValidCell(row, col + 1, brushMode)) n.push([row, col + 1, 'RIGHT']);
  } else if (row === 1) {
    if (isValidCell(1, col - 2, brushMode)) n.push([1, col - 2, 'LEFT']);
    if (isValidCell(1, col + 2, brushMode)) n.push([1, col + 2, 'RIGHT']);
  }
  if (row === 1) {
    const r2col = brushMode === 'smooth' ? R1_TO_SMOOTH_R2[col] : R1_TO_PIXEL_R2[col];
    if (isValidCell(2, r2col, brushMode)) n.push([2, r2col, 'DOWN']);
  } else if (row === 2) {
    n.push([1, R2_TO_R1[col], 'UP']);
    if (isValidCell(3, col, brushMode)) n.push([3, col, 'DOWN']);
  } else if (row === 3) {
    if (isValidCell(2, col, brushMode)) n.push([2, col, 'UP']);
  }
  return n;
}

function bfsBrushPath(
  sR: number, sC: number, tR: number, tC: number, mode: string,
): string[] {
  if (sR === tR && sC === tC) return [];
  const queue: [number, number, string[]][] = [[sR, sC, []]];
  const visited = new Set<string>();
  visited.add(`${sR},${sC}`);

  while (queue.length > 0) {
    const [r, c, path] = queue.shift()!;
    for (const [nr, nc, dir] of getNeighbors(r, c, mode)) {
      const key = `${nr},${nc}`;
      if (!visited.has(key)) {
        const newPath = [...path, dir];
        if (nr === tR && nc === tC) return newPath;
        visited.add(key);
        queue.push([nr, nc, newPath]);
      }
    }
  }
  return [];
}

function commandsForPath(
  path: string[],
  timing: TimingSnapshot,
): TextCmd[] {
  return path.map(d => ({ btn: d, totalMs: timing.keyIntervalMs }));
}

/**
 * 从画布初始状态导航到目标笔尖。
 * 初始：顺滑画笔、R2C3 (7px圆)。
 */
export function generateBrushNavSequence(
  brushType: string,
  brushSize: number,
  timing: TimingSnapshot = defaultTiming,
): TextCmd[] {
  if (!brushType || !brushSize) return [];
  const cmds: TextCmd[] = [];

  // 打开工具栏
  cmds.push({ btn: 'X', totalMs: timing.keyIntervalMs });
  cmds.push({ btn: 'X', totalMs: timing.keyIntervalMs + timing.waitIntervalMs });

  let curType = INITIAL[0], curRow = INITIAL[1], curCol = INITIAL[2];
  const targetCol = brushType === 'smooth'
    ? SMOOTH_SIZE_TO_COL[brushSize]
    : PIXEL_SIZE_TO_COL[brushSize];

  // 类型切换（如果需要）
  if (curType !== brushType) {
    let path = bfsBrushPath(curRow, curCol, 1, R2_TO_R1[curCol], curType);
    cmds.push(...commandsForPath(path, timing));

    const r1TargetCol = TYPE_TO_R1_COL[brushType];
    const r1Cur = R2_TO_R1[curCol];
    if (r1Cur !== r1TargetCol) {
      path = bfsBrushPath(1, r1Cur, 1, r1TargetCol, curType);
      cmds.push(...commandsForPath(path, timing));
    }

    cmds.push({ btn: 'A', totalMs: timing.keyIntervalMs });
    cmds.push({ btn: 'WAIT', totalMs: timing.waitIntervalMs });

    curType = brushType;
    curRow = 1;
    curCol = r1TargetCol;
  }

  // 导航到 R3 目标笔尖
  if (curRow === 1) {
    const r2col = brushType === 'smooth'
      ? R1_TO_SMOOTH_R2[curCol] : R1_TO_PIXEL_R2[curCol];
    const path = bfsBrushPath(curRow, curCol, 2, r2col, brushType);
    cmds.push(...commandsForPath(path, timing));
    curRow = 2; curCol = r2col;
  }

  if (curCol !== targetCol) {
    const path = bfsBrushPath(curRow, curCol, 2, targetCol, brushType);
    cmds.push(...commandsForPath(path, timing));
    curCol = targetCol;
  }

  if (curRow === 2) {
    const path = bfsBrushPath(2, curCol, 3, targetCol, brushType);
    cmds.push(...commandsForPath(path, timing));
  }

  // 确认笔尖
  cmds.push({ btn: 'A', totalMs: timing.keyIntervalMs });
  cmds.push({ btn: 'A', totalMs: timing.keyIntervalMs });
  cmds.push({ btn: 'WAIT', totalMs: timing.waitIntervalMs });

  return cmds;
}
