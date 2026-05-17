/**
 * 复杂指令组合 Builder — 灵感来自 easycon_api 的链式 Builder 模式。
 *
 * 使用方式:
 *   const builder = new ScriptBuilder();
 *   builder
 *     .X().wait(200)
 *     .A().wait(100)
 *     .repeat(3, b => b.dpadRight().wait(100))
 *     .press('A').wait(50).release()
 *     .compile();  // → Uint8Array
 *
 * 高级用法 (完整绘图管线):
 *   builder
 *     .openToolbar()
 *     .selectBrush('pixel', 4)
 *     .openPalette()
 *     .switchColorCustom([50, 100, 30], [0, 0, 0])
 *     .moveAndDraw(points, curPos)
 *     .compile();
 */
import { OpCode, BtnMask, Hat, STICK_CENTER } from '@shared/proto';
import { TimingSnapshot, defaultTiming } from './timing';
import { Point, Palette, LeafBlock, PaletteEntry } from '@engine/types';
import { generateBrushNavSequence } from './brush';
import {
  generatePaletteCommandsPreset,
  generatePaletteCommandsCustom,
  getDefaultCursor,
  getDefaultHsv,
} from './palette';
import { generateMoveCommands } from './move';
import { snakeSortPoints, sortPointsAdaptive } from './optimizer';

interface PendingCmd {
  op: OpCode;
  data: number[];
}

interface LoopPlaceholder {
  op: OpCode.LOOP;
  data: number[];   // [count_low, count_high, addr_low, ..., addr_high]
  bodyStart: number; // byte offset in output where body starts
}

export class ScriptBuilder {
  private _pending: PendingCmd[] = [];
  private _loops: LoopPlaceholder[] = [];
  private _timing: TimingSnapshot;

  constructor(timing?: TimingSnapshot) {
    this._timing = timing || defaultTiming;
  }

  // ========== 基本操作 ==========

  wait(ms: number): this {
    if (ms <= 0) return this;
    // 大等待拆分为多次 WAIT (Pico 固件每帧最多处理 65535ms)
    while (ms > 65535) {
      this._push(OpCode.WAIT, [0xFF, 0xFF]);
      ms -= 65535;
    }
    this._push(OpCode.WAIT, [ms & 0xFF, (ms >> 8) & 0xFF]);
    return this;
  }

  press(btn: keyof typeof BtnMask): this {
    const mask = BtnMask[btn];
    this._push(OpCode.BTN_PRESS, [mask & 0xFF, (mask >> 8) & 0xFF]);
    return this;
  }

  down(btn: keyof typeof BtnMask): this {
    const mask = BtnMask[btn];
    this._push(OpCode.BTN_DOWN, [mask & 0xFF, (mask >> 8) & 0xFF]);
    return this;
  }

  release(): this {
    this._push(OpCode.BTN_UP, []);
    return this;
  }

  dpad(hat: Hat): this {
    this._push(OpCode.DPAD, [hat]);
    return this;
  }

  lstick(lx: number, ly: number, durationMs: number = 0): this {
    const d = Math.max(0, Math.min(65535, durationMs));
    this._push(OpCode.LSTICK, [
      Math.max(0, Math.min(255, lx)),
      Math.max(0, Math.min(255, ly)),
      d & 0xFF, (d >> 8) & 0xFF,
    ]);
    return this;
  }

  rstick(rx: number, ry: number, durationMs: number = 0): this {
    const d = Math.max(0, Math.min(65535, durationMs));
    this._push(OpCode.RSTICK, [
      Math.max(0, Math.min(255, rx)),
      Math.max(0, Math.min(255, ry)),
      d & 0xFF, (d >> 8) & 0xFF,
    ]);
    return this;
  }

  // ========== 便捷别名 ==========

  A(): this { return this.press('A'); }       B(): this { return this.press('B'); }
  X(): this { return this.press('X'); }       Y(): this { return this.press('Y'); }
  L(): this { return this.press('L'); }       R(): this { return this.press('R'); }
  ZL(): this { return this.press('ZL'); }     ZR(): this { return this.press('ZR'); }
  plus(): this { return this.press('PLUS'); } minus(): this { return this.press('MINUS'); }
  home(): this { return this.press('HOME'); }

  dpadUp(): this { return this.dpad(Hat.TOP); }
  dpadDown(): this { return this.dpad(Hat.BOTTOM); }
  dpadLeft(): this { return this.dpad(Hat.LEFT); }
  dpadRight(): this { return this.dpad(Hat.RIGHT); }

  /** 执行文本指令序列 */
  emit(cmd: { btn: string; totalMs: number }): this {
    return this.emitTextCmd(cmd.btn, cmd.totalMs);
  }

  emitTextCmd(btn: string, totalMs: number): this {
    if (btn === 'WAIT') { this.wait(totalMs); return this; }

    // 持续按住指令
    if (btn.startsWith('__DOWN__')) {
      const name = btn.substring(8) as keyof typeof BtnMask;
      this.down(name);
      return this;
    }
    if (btn.startsWith('__UP__')) {
      this.release();
      return this;
    }

    // 摇杆指令
    if (btn.startsWith('LS ')) {
      const dir = btn.substring(3);
      const lx = dir === 'LEFT' ? 0 : dir === 'RIGHT' ? 255 : 128;
      const ly = dir === 'UP' ? 0 : dir === 'DOWN' ? 255 : 128;
      this.lstick(lx, ly, totalMs);
      return this;
    }
    if (btn.startsWith('RS ')) {
      const dir = btn.substring(3);
      const rx = dir === 'LEFT' ? 0 : dir === 'RIGHT' ? 255 : 128;
      const ry = dir === 'UP' ? 0 : dir === 'DOWN' ? 255 : 128;
      this.rstick(rx, ry, totalMs);
      return this;
    }

    // D-pad
    const hatMap: Record<string, Hat> = {
      UP: Hat.TOP, DOWN: Hat.BOTTOM,
      LEFT: Hat.LEFT, RIGHT: Hat.RIGHT,
    };
    if (btn in hatMap) {
      this.dpad(hatMap[btn]);
      return this;
    }

    // 普通按键
    if (btn in BtnMask) {
      this.press(btn as keyof typeof BtnMask);
      return this;
    }

    return this;
  }

  // ========== 高级组合 ==========

  /** 重复执行 body 函数 count 次 */

  // ========== 高级组合 ==========

  /** 嵌入多步指令序列 */
  embed(commands: { btn: string; totalMs: number }[]): this {
    for (const cmd of commands) {
      this.emit(cmd);
    }
    return this;
  }

  /** 按钮短按 (按下→保持→释放×短暂间隔) */
  tap(btn: keyof typeof BtnMask, holdMs?: number): this {
    const hold = holdMs ?? this._timing.pressHoldMs;
    this.down(btn);
    if (hold > 0) this.wait(hold);
    this.release();
    return this;
  }

  // ========== 绘画专用高级操作 ==========

  openToolbar(): this {
    this.X();
    this.wait(this._timing.keyIntervalMs);
    this.X();
    this.wait(this._timing.keyIntervalMs + this._timing.waitIntervalMs);
    return this;
  }

  selectBrush(brushType: string, brushSize: number): this {
    const cmds = generateBrushNavSequence(brushType, brushSize, this._timing);
    this.embed(cmds);
    return this;
  }

  openPalette(): this {
    this.Y();
    this.wait(this._timing.keyIntervalMs);
    this.Y();
    this.wait(this._timing.keyIntervalMs + this._timing.waitIntervalMs);
    return this;
  }

  switchToCustom(): this {
    this.R();
    this.wait(this._timing.keyIntervalMs + 2 * this._timing.waitIntervalMs);
    return this;
  }

  confirmColor(): this {
    this.A();
    this.wait(this._timing.keyIntervalMs);
    this.wait(2 * this._timing.waitIntervalMs);
    return this;
  }

  /** 预设调色盘切换 (HEX 颜色)，返回新光标位置 */
  switchColorPreset(
    targetHex: string, curRow: number, curCol: number,
  ): [number, number] {
    const { cmds, row, col } = generatePaletteCommandsPreset(
      targetHex, curRow, curCol, this._timing,
    );
    this.embed(cmds);
    return [row, col];
  }

  /** 自定义调色盘切换 (HSB steps)，返回新 HSV 位置 */
  switchColorCustom(
    targetHsv: [number, number, number],
    curHsv: [number, number, number],
  ): [number, number, number] {
    const cmds = generatePaletteCommandsCustom(curHsv, targetHsv, this._timing);
    this.embed(cmds);
    return targetHsv;
  }

  /** 移动到目标位置并绘制 */
  moveAndDraw(
    points: Point[],
    curPos: Point,
    brushType: string,
    brushSize: number,
  ): Point {
    if (points.length === 0) return curPos;

    const sorted = sortPointsAdaptive(points, curPos.x, curPos.y);
    let cur = curPos;
    for (const p of sorted) {
      const dx = p.x - cur.x;
      const dy = p.y - cur.y;
      if (dx !== 0 || dy !== 0) {
        const moveCmds = generateMoveCommands(dx, dy, brushType, brushSize, this._timing);
        this.embed(moveCmds);
      }
      this.A();
      this.wait(this._timing.drawMs);
      cur = p;
    }
    return cur;
  }

  /** Center stick */
  centerStick(isLeft: boolean = true): this {
    if (isLeft) {
      this.lstick(STICK_CENTER, STICK_CENTER, 0);
    } else {
      this.rstick(STICK_CENTER, STICK_CENTER, 0);
    }
    return this;
  }
  // ========== 编译 ==========

  /** 生成 .uf2 脚本格式的二进制 (无 OP_END — 会在 upload 时追加) */
  compile(): Uint8Array {
    let totalLen = 0;
    for (const cmd of this._pending) {
      totalLen += 1 + cmd.data.length;
    }
    totalLen += 1; // OP_END

    const buf = new Uint8Array(totalLen);
    let offset = 0;
    for (const cmd of this._pending) {
      buf[offset++] = cmd.op;
      for (const b of cmd.data) {
        buf[offset++] = b;
      }
    }
    buf[offset] = OpCode.END;
    return buf;
  }

  /** 输出总帧数/预估耗时 */
  estimate(): { frameCount: number; totalMs: number } {
    let ms = 0;
    for (const cmd of this._pending) {
      if (cmd.op === OpCode.WAIT) {
        ms += cmd.data[0] | (cmd.data[1] << 8);
      } else if (cmd.op === OpCode.BTN_PRESS) {
        ms += this._timing.pressHoldMs + this._timing.keyIntervalMs;
      } else if (cmd.op === OpCode.BTN_DOWN) {
        ms += this._timing.keyIntervalMs;
      } else if (cmd.op === OpCode.LSTICK || cmd.op === OpCode.RSTICK) {
        ms += cmd.data[2] | (cmd.data[3] << 8);
      }
    }
    return { frameCount: Math.ceil(ms / 16.667), totalMs: ms };
  }

  /** 获取当前指令列表（用于测试/调试） */
  getCommands(): PendingCmd[] {
    return [...this._pending];
  }

  /** 打印可读指令 */
  toString(): string {
    const lines: string[] = [];
    for (const cmd of this._pending) {
      const opName = OpCode[cmd.op] || `0x${cmd.op.toString(16)}`;
      lines.push(`${opName.padEnd(12)} [${cmd.data.map(b => b.toString(16).padStart(2, '0')).join(' ')}]`);
    }
    return lines.join('\n');
  }

  private _push(op: OpCode, data: number[]): void {
    this._pending.push({ op, data });
  }
}

/**
 * 完整的绘图脚本生成 — 从调度方案构建 Builder。
 * 返回 compiled binary + 预估信息。
 */
export function compileDrawingScript(
  schedule: { block: LeafBlock; colorOrder: number[] }[],
  palette: Palette,
  brushType: string,
  brushSize: number,
  usePreset: boolean,
  pressData?: { h: number; s: number; b: number }[],
  timing: TimingSnapshot = defaultTiming,
): { binary: Uint8Array; totalMs: number } {
  const builder = new ScriptBuilder(timing);

  // 画笔切换
  builder.openToolbar();
  builder.selectBrush(brushType, brushSize);

  // 调色盘初始状态
  let curRow = 7, curCol = 1;  // preset
  let curHsv: [number, number, number] = [0, 0, 0]; // custom
  const gridW = 256, gridH = 256;
  let curGx = Math.floor(gridW / 2), curGy = Math.floor(gridH / 2);

  for (const { block, colorOrder } of schedule) {
    if (colorOrder.length === 0) continue;

    for (const colorIdx of colorOrder) {
      const pts = block.colorPoints.get(colorIdx) || [];
      if (pts.length === 0) continue;

      const [r, g, b] = palette[colorIdx];
      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();

      // 颜色切换
      if (usePreset) {
        [curRow, curCol] = builder.switchColorPreset(hex, curRow, curCol);
      } else {
        const target = pressData?.[colorIdx] || { h: 0, s: 0, b: 0 };
        curHsv = builder.switchColorCustom(
          [target.h, target.s, target.b], curHsv,
        );
      }

      // 移动 + 绘制
      const newPos = builder.moveAndDraw(pts, { x: curGx, y: curGy }, brushType, brushSize);
      curGx = newPos.x;
      curGy = newPos.y;
    }
  }

  const binary = builder.compile();
  return { binary, totalMs: builder.estimate().totalMs };
}
