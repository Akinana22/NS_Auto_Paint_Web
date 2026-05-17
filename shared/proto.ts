/** 二进制脚本指令协议 — 前后端 + 固件共享定义 */

export const enum OpCode {
  WAIT = 0x00,        // + duration_ms:2B LE
  BTN_PRESS = 0x01,   // + buttons:2B LE → press_hold + release
  BTN_DOWN = 0x02,    // + buttons:2B LE → 持续按下
  BTN_UP = 0x03,      // + 无参数 → 释放所有按键
  DPAD = 0x04,        // + hat:1B
  LSTICK = 0x05,      // + lx:1B ly:1B duration_ms:2B LE
  RSTICK = 0x06,      // + rx:1B ry:1B duration_ms:2B LE
  LOOP = 0x07,        // + count:2B LE addr:4B LE (flash offset)
  END = 0xFF,         // 脚本结束
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

/** Flash 脚本存储地址 (固件会从此处读取) */
export const FLASH_SCRIPT_OFFSET = 0x100000; // 1MB 偏移
export const FLASH_SCRIPT_MAX_SIZE = 512 * 1024; // 512KB

/** 脚本文件魔术字 + 头部 */
export const SCRIPT_MAGIC = 0x4E534150; // "NSAP"
export interface ScriptHeader {
  magic: number;       // SCRIPT_MAGIC
  version: number;     // 协议版本
  size: number;        // 脚本数据字节数
  checksum: number;    // CRC32
  frameCount: number;  // 预估帧数
  estimatedMs: number; // 预估耗时(ms)
}

/** 脚本头部大小 */
export const SCRIPT_HEADER_SIZE = 20;
