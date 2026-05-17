/**
 * 调色盘切换指令生成 — 支持预设调色盘 BFS 导航 + 自定义 HSB 长按优化。
 */
import { TextCmd } from './types';
import { TimingSnapshot, defaultTiming } from './timing';
import { getPresetPaletteHex } from '@engine/preset-palette';

const HUE_MAX = 200, SAT_MAX = 212, VAL_MAX = 111;
const LONG_PRESS_MS = 3000;

// ---- 预设调色盘坐标映射 ----
let _presetCoordMap: Map<string, [number, number]> | null = null;

export function getCoordMap(): Map<string, [number, number]> {
  if (_presetCoordMap) return _presetCoordMap;
  _presetCoordMap = new Map();
  const hexList = getPresetPaletteHex();
  let idx = 0;
  for (let row = 1; row <= 7; row++) {
    for (let col = 1; col <= 11; col++) {
      _presetCoordMap.set(hexList[idx].toUpperCase(), [row, col]);
      idx++;
    }
  }
  // E column (row 1-7, col 12)
  for (let row = 1; row <= 7; row++) {
    _presetCoordMap.set(hexList[idx].toUpperCase(), [row, 12]);
    idx++;
  }
  return _presetCoordMap;
}

function canWrapColumn(row: number): boolean {
  return row >= 1 && row <= 3;
}

export function bfsPalettePath(sR: number, sC: number, eR: number, eC: number): string[] {
  function getNeighbors(r: number, c: number): [string, number, number][] {
    const n: [string, number, number][] = [];
    // UP
    n.push(['UP', r === 1 ? 7 : r - 1, c]);
    // DOWN
    n.push(['DOWN', r === 7 ? 1 : r + 1, c]);
    // LEFT
    if (c === 1) {
      if (canWrapColumn(r)) n.push(['LEFT', r, 12]);
    } else {
      n.push(['LEFT', r, c - 1]);
    }
    // RIGHT
    if (c === 12) {
      if (canWrapColumn(r)) n.push(['RIGHT', r, 1]);
    } else {
      n.push(['RIGHT', r, c + 1]);
    }
    return n;
  }

  const queue: [number, number, string[]][] = [[sR, sC, []]];
  const visited = new Set<string>();
  visited.add(`${sR},${sC}`);

  while (queue.length > 0) {
    const [r, c, path] = queue.shift()!;
    for (const [action, nr, nc] of getNeighbors(r, c)) {
      const key = `${nr},${nc}`;
      if (!visited.has(key)) {
        const newPath = [...path, action];
        if (nr === eR && nc === eC) return newPath;
        visited.add(key);
        queue.push([nr, nc, newPath]);
      }
    }
  }
  return [];
}

function hexToRgb(h: string): [number, number, number] {
  const hex = h.replace('#', '');
  return [
    parseInt(hex.substring(0, 2), 16),
    parseInt(hex.substring(2, 4), 16),
    parseInt(hex.substring(4, 6), 16),
  ];
}

/** 预设调色盘指令生成 */
export function generatePaletteCommandsPreset(
  targetHex: string,
  curRow: number,
  curCol: number,
  timing: TimingSnapshot = defaultTiming,
): { cmds: TextCmd[]; row: number; col: number } {
  const coordMap = getCoordMap();
  let key = targetHex.toUpperCase();
  if (!coordMap.has(key)) {
    // 最近邻搜索
    const targetRgb = hexToRgb(targetHex);
    let minDist = Infinity;
    let nearestKey = '';
    for (const [hexKey] of coordMap) {
      const rgb = hexToRgb(hexKey);
      const dist = (targetRgb[0] - rgb[0]) ** 2 + (targetRgb[1] - rgb[1]) ** 2 + (targetRgb[2] - rgb[2]) ** 2;
      if (dist < minDist) { minDist = dist; nearestKey = hexKey; }
    }
    key = nearestKey;
  }

  const [tR, tC] = coordMap.get(key)!;
  const path = bfsPalettePath(curRow, curCol, tR, tC);

  const cmds: TextCmd[] = [
    { btn: 'Y', totalMs: timing.keyIntervalMs },
    { btn: 'Y', totalMs: timing.keyIntervalMs + timing.waitIntervalMs },
  ];
  for (const action of path) {
    cmds.push({ btn: action, totalMs: timing.keyIntervalMs });
  }
  cmds.push({ btn: 'A', totalMs: timing.keyIntervalMs });
  cmds.push({ btn: 'WAIT', totalMs: 2 * timing.waitIntervalMs });

  return { cmds, row: tR, col: tC };
}

/** 单维度最优指令计算（含长按优化） */
function optimizeAxisCmds(
  current: number, target: number,
  decKey: string, incKey: string,
  axisMax: number,
  stepMs: number,
  useStick: boolean,
  stickDecDir: string, stickIncDir: string,
): TextCmd[] {
  if (target === current) return [];
  const delta = target - current;

  // 纯按键方案
  const key = delta > 0 ? incKey : decKey;
  const directCmds: TextCmd[] = Array(Math.abs(delta)).fill(null).map(() => ({
    btn: key,
    totalMs: stepMs,
  }));
  const directCost = Math.abs(delta) * stepMs;

  if (Math.abs(delta) <= 1) return directCmds;

  // 长按/长推方案
  let bestExtreme: number | null = null;
  let bestCost = directCost;

  for (const extreme of [0, axisMax]) {
    const fromExtremeSteps = Math.abs(target - extreme);
    const viaCost = LONG_PRESS_MS + fromExtremeSteps * stepMs;
    if (viaCost < bestCost) {
      bestCost = viaCost;
      bestExtreme = extreme;
    }
  }

  if (bestExtreme === null) return directCmds;

  const cmds: TextCmd[] = [];
  if (useStick) {
    // 左摇杆长推
    const stickDir = bestExtreme === 0 ? stickDecDir : stickIncDir;
    cmds.push({ btn: `LS ${stickDir}`, totalMs: LONG_PRESS_MS });
  } else {
    // ZL/ZR 长按
    const hkey = bestExtreme === 0 ? 'ZL' : 'ZR';
    cmds.push({ btn: `__DOWN__${hkey}`, totalMs: 0 });
    cmds.push({ btn: 'WAIT', totalMs: LONG_PRESS_MS });
    cmds.push({ btn: `__UP__${hkey}`, totalMs: 0 });
  }

  // 从极值微调
  const adj = target - bestExtreme;
  for (let i = 0; i < Math.abs(adj); i++) {
    cmds.push({ btn: adj > 0 ? incKey : decKey, totalMs: stepMs });
  }

  return cmds;
}

/** 自定义调色盘指令生成 */
export function generatePaletteCommandsCustom(
  currentHsv: [number, number, number],
  targetHsv: [number, number, number],
  timing: TimingSnapshot = defaultTiming,
): TextCmd[] {
  const [h1, s1, b1] = currentHsv;
  const [h2, s2, b2] = targetHsv;

  const hueCmds = optimizeAxisCmds(h1, h2, 'ZL', 'ZR', HUE_MAX, timing.keyIntervalMs, false, '', '');
  const satCmds = optimizeAxisCmds(s1, s2, 'LEFT', 'RIGHT', SAT_MAX, timing.svKeyIntervalMs, true, 'LEFT', 'RIGHT');
  const valCmds = optimizeAxisCmds(b1, b2, 'DOWN', 'UP', VAL_MAX, timing.svKeyIntervalMs, true, 'DOWN', 'UP');

  const cmds: TextCmd[] = [
    { btn: 'Y', totalMs: timing.keyIntervalMs },
    { btn: 'Y', totalMs: timing.keyIntervalMs + 2 * timing.waitIntervalMs },
    { btn: 'R', totalMs: timing.keyIntervalMs + 2 * timing.waitIntervalMs },
  ];
  cmds.push(...hueCmds);
  cmds.push(...satCmds);
  cmds.push(...valCmds);
  cmds.push({ btn: 'A', totalMs: timing.keyIntervalMs });
  cmds.push({ btn: 'WAIT', totalMs: 2 * timing.waitIntervalMs });

  return cmds;
}

export function getDefaultCursor(): [number, number] {
  return [7, 1];
}

export function getDefaultHsv(): [number, number, number] {
  return [0, 0, 0];
}
