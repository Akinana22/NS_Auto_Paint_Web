/** 二进制脚本指令协议 — 前后端 + 固件共享定义 (v4.0) */

export const enum OpCode {
  WAIT       = 0x00, // + dur_ms:2B LE
  BTN_PRESS  = 0x01, // + btn:2B LE
  BTN_DOWN   = 0x02, // + btn:2B LE (additive |=)
  BTN_UP     = 0x03, // release all
  DPAD       = 0x04, // + hat:1B
  LSTICK     = 0x05, // + lx:1B ly:1B dur_ms:2B LE
  RSTICK     = 0x06, // + rx:1B ry:1B dur_ms:2B LE
  // 0x07 removed (was LOOP)
  BTN_TAP    = 0x08, // + btn:2B LE dur_ms:2B LE (press→wait→release)
  DPAD_TAP   = 0x09, // + hat:1B dur_ms:2B LE (hat→wait→center)
  NEXT       = 0x0A, // load next segment
  BTN_REL    = 0x0B, // + btn:2B LE (release specific buttons)
  REPEAT     = 0x0C, // + count:2B LE (repeat next instruction)
  END        = 0xFF,
}

/** Switch 按钮位掩码 (与 USB HID report 一致) */
export const enum BtnMask {
  Y = 0x0001,
  B = 0x0002,
  A = 0x0004,
  X = 0x0008,
  L = 0x0010,
  R = 0x0020,
  ZL = 0x0040,
  ZR = 0x0080,
  MINUS = 0x0100,
  PLUS = 0x0200,
  LCLICK = 0x0400,
  RCLICK = 0x0800,
  HOME = 0x1000,
  CAPTURE = 0x2000,
}

/** D-Pad 方向值 (与 USB HID report 一致) */
export const enum Hat {
  TOP = 0,
  TOP_RIGHT = 1,
  RIGHT = 2,
  BOTTOM_RIGHT = 3,
  BOTTOM = 4,
  BOTTOM_LEFT = 5,
  LEFT = 6,
  TOP_LEFT = 7,
  CENTER = 8,
}

/** 摇杆中心值 */
export const STICK_CENTER = 128;
export const STICK_MIN = 0;
export const STICK_MAX = 255;

/** Flash 脚本存储地址 — CDC 脚本区 (0x0C0000) */
export const FLASH_SCRIPT_OFFSET = 0x0C0000;
export const FLASH_SCRIPT_MAX_SIZE = 512 * 1024;

/** 脚本文件魔术字 + 头部 */
export const SCRIPT_MAGIC = 0x4E534150; // "NSAP"
export const SCRIPT_PROTO_VERSION = 2;
export interface ScriptHeader {
  magic: number;
  version: number;
  size: number;
  checksum: number;
  frameCount: number;
  estimatedMs: number;
}

export const SCRIPT_HEADER_SIZE = 24;
export const SCRIPT_HEADER_SECTOR = 4096;

/** 分段目录 (version=2) */
export const SCRIPT_SEGMENT_MAX_SIZE = 64 * 1024;
export const SCRIPT_MAX_SEGMENTS = 32;
export interface ScriptSegEntry {
  offset: number; // relative to body start
  size: number;
}
