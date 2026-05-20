/**
 * NS Auto Painter — 固件协议定义 v4.0
 * RP2040 Pico C header — 分区布局 / 模式枚举 / 脚本结构 / 操作码
 */

#ifndef PROTO_H
#define PROTO_H

#include <stdint.h>

// ================ BOOTSEL Mode ================
enum BootMode {
    MODE_NONE     = -1,
    MODE_HID_CDC  = 0,
    MODE_HID_MSC  = 1,
    MODE_CDC_MSC  = 2,
};

// ================ Flash Layout (2MB) ================
#define FLASH_TOTAL_SIZE    (2 * 1024 * 1024)
#define FIRMWARE_OFFSET     0x000000
#define FIRMWARE_SIZE       (256 * 1024)

#define RESERVED_OFFSET     0x040000
#define RESERVED_SIZE       (512 * 1024)

#define CDC_SCRIPT_OFFSET   0x0C0000
#define CDC_SCRIPT_SIZE     (512 * 1024)
#define CDC_SCRIPT_SECTORS  (CDC_SCRIPT_SIZE / 512)

#define MSC_SCRIPT_OFFSET   0x140000
#define MSC_SCRIPT_SIZE     (512 * 1024)
#define MSC_SCRIPT_SECTORS  (MSC_SCRIPT_SIZE / 512)

#define LOG_OFFSET          0x1C0000
#define LOG_SIZE            (256 * 1024)

// ================ Script Protocol Version ================
#define SCRIPT_PROTO_VERSION 2

// ================ Binary Script Opcodes ================
enum OpCode {
    OP_WAIT       = 0x00,
    OP_BTN_PRESS  = 0x01,
    OP_BTN_DOWN   = 0x02,  // additive (|=)
    OP_BTN_UP     = 0x03,
    OP_DPAD       = 0x04,
    OP_LSTICK     = 0x05,
    OP_RSTICK     = 0x06,
    // 0x07 removed (was OP_LOOP)
    OP_BTN_TAP    = 0x08,
    OP_DPAD_TAP   = 0x09,
    OP_NEXT       = 0x0A,
    OP_BTN_REL    = 0x0B,
    OP_REPEAT     = 0x0C,
    OP_END        = 0xFF,
};

// ================ Wait Type (for unified timer resolution) ================
enum WaitType {
    WAIT_NONE      = 0,
    WAIT_PLAIN     = 1,
    WAIT_STICK_L   = 2,
    WAIT_STICK_R   = 3,
    WAIT_BTN_TAP   = 4,
    WAIT_DPAD_TAP  = 5,
};

// ================ Button Masks ================
enum BtnMask {
    BTN_Y        = 0x0001, BTN_B     = 0x0002, BTN_A    = 0x0004,
    BTN_X        = 0x0008, BTN_L     = 0x0010, BTN_R    = 0x0020,
    BTN_ZL       = 0x0040, BTN_ZR    = 0x0080, BTN_MINUS = 0x0100,
    BTN_PLUS     = 0x0200, BTN_LCLICK = 0x0400, BTN_RCLICK = 0x0800,
    BTN_HOME     = 0x1000, BTN_CAPTURE = 0x2000,
};

// D-Pad HAT
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

// Timing defaults
#define DEFAULT_PRESS_HOLD_MS   30
#define DEFAULT_KEY_INTERVAL_MS 100

// ================ Script Header ================
#define SCRIPT_MAGIC      0x4E534150  // "NSAP"
#define SCRIPT_HEADER_SIZE sizeof(script_header_t)
#define SCRIPT_HEADER_SECTOR 4096

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

// ================ Segment Directory (v2 only) ================
#define SCRIPT_SEGMENT_MAX_SIZE (64 * 1024)
#define SCRIPT_MAX_SEGMENTS 32

#pragma pack(push, 1)
typedef struct {
    uint32_t offset;  // relative to body start
    uint32_t size;    // bytes
} script_seg_entry_t;
#pragma pack(pop)

// ================ Controller Report ================
typedef struct {
    uint16_t buttons;
    uint8_t  hat;
    uint8_t  lx;
    uint8_t  ly;
    uint8_t  rx;
    uint8_t  ry;
    uint8_t  vendor;
} controller_report_t;

#endif // PROTO_H
