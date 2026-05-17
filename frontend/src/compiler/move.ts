/**
 * 画布移动指令生成。
 * 网格画笔：每步 1 次移动；顺滑画笔 npx：每步 n 次移动。
 */

import { TextCmd } from './types';
import { TimingSnapshot, defaultTiming } from './timing';

export function generateMoveCommands(
  dx: number,
  dy: number,
  brushType: string | undefined,
  brushSize: number = 1,
  timing: TimingSnapshot = defaultTiming,
): TextCmd[] {
  const moveMs = timing.keyIntervalMs;

  if (brushType === 'smooth' && brushSize > 1) {
    return generateSmoothMoveCommands(dx, dy, brushSize, moveMs);
  }
  return generateGridMoveCommands(dx, dy, moveMs);
}

export function generateGridMoveCommands(
  dx: number, dy: number, moveMs: number,
): TextCmd[] {
  const cmds: TextCmd[] = [];
  let rx = dx, ry = dy;

  while (rx !== 0 && ry !== 0) {
    if (Math.abs(rx) >= Math.abs(ry)) {
      cmds.push({ btn: rx > 0 ? 'RIGHT' : 'LEFT', totalMs: moveMs });
      rx += rx > 0 ? -1 : 1;
    } else {
      cmds.push({ btn: ry > 0 ? 'DOWN' : 'UP', totalMs: moveMs });
      ry += ry > 0 ? -1 : 1;
    }
  }

  while (rx !== 0) {
    cmds.push({ btn: rx > 0 ? 'RIGHT' : 'LEFT', totalMs: moveMs });
    rx += rx > 0 ? -1 : 1;
  }

  while (ry !== 0) {
    cmds.push({ btn: ry > 0 ? 'DOWN' : 'UP', totalMs: moveMs });
    ry += ry > 0 ? -1 : 1;
  }

  return cmds;
}

function generateSmoothMoveCommands(
  dx: number, dy: number, repeat: number, moveMs: number,
): TextCmd[] {
  const base = generateGridMoveCommands(dx, dy, moveMs);
  const expanded: TextCmd[] = [];
  for (const cmd of base) {
    for (let i = 0; i < repeat; i++) {
      expanded.push(cmd);
    }
  }
  return expanded;
}
