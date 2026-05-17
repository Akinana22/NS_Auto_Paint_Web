/**
 * NS Auto Painter — 二进制脚本指令协议 (C version, duplicating shared/proto.ts)
 * RP2040 固件用
 */

#ifndef PROTO_H
#define PROTO_H

#include <stdint.h>

enum OpCode {
    OP_WAIT       = 0x00,  // + duration_ms:2B LE
    OP_BTN_PRESS  = 0x01,  // + buttons:2B LE → press hold & release
    OP_BTN_DOWN   = 0x02,  // + buttons:2B LE → hold
    OP_BTN_UP     = 0x03,  // → release all
    OP_DPAD       = 0x04,  // + hat:1B
    OP_LSTICK     = 0x05,  // + lx:1B ly:1B duration_ms:2B LE
    OP_RSTICK     = 0x06,  // + rx:1B ry:1B duration_ms:2B LE
    OP_LOOP       = 0x07,  // + count:2B LE addr:4B LE
    OP_END        = 0xFF,  // end of script
};

// Button masks (match USB HID report bit layout)
enum BtnMask {
    BTN_Y        = 0x0001,
    BTN_B        = 0x0002,
    BTN_A        = 0x0004,
    BTN_X        = 0x0008,
    BTN_L        = 0x0010,
    BTN_R        = 0x0020,
    BTN_ZL       = 0x0040,
    BTN_ZR       = 0x0080,
    BTN_MINUS    = 0x0100,
    BTN_PLUS     = 0x0200,
    BTN_LCLICK   = 0x0400,
    BTN_RCLICK   = 0x0800,
    BTN_HOME     = 0x1000,
    BTN_CAPTURE  = 0x2000,
};

// D-Pad HAT values
#define HAT_TOP          0x00
#define HAT_TOP_RIGHT    0x01
#define HAT_RIGHT        0x02
#define HAT_BOTTOM_RIGHT 0x03
#define HAT_BOTTOM       0x04
#define HAT_BOTTOM_LEFT  0x05
#define HAT_LEFT         0x06
#define HAT_TOP_LEFT     0x07
#define HAT_CENTER       0x08

// Stick ranges
#define STICK_CENTER 128
#define STICK_MIN    0
#define STICK_MAX    255

// Press hold default (ms) - used when executing OP_BTN_PRESS
#define DEFAULT_PRESS_HOLD_MS  30
#define DEFAULT_KEY_INTERVAL_MS 100

// Flash storage layout
#define FLASH_SCRIPT_OFFSET   0x100000  // 1MB into flash (2MB total on RP2040)
#define FLASH_SCRIPT_MAX_SIZE (512 * 1024)  // 512KB reserved for scripts
#define SCRIPT_HEADER_SIZE    20

// Script header magic "NSAP"
#define SCRIPT_MAGIC 0x4E534150

#pragma pack(push, 1)
typedef struct {
    uint32_t magic;
    uint32_t version;
    uint32_t size;
    uint32_t checksum;
    uint32_t frameCount;
    uint32_t estimatedMs;
} script_header_t;
#pragma pack(pop)

#endif // PROTO_H
