/**
 * 脚本引擎 — 解析 & 逐帧执行二进制脚本指令
 */

#ifndef SCRIPT_ENGINE_H
#define SCRIPT_ENGINE_H

#include <stdint.h>
#include <stdbool.h>
#include "proto.h"

// Controller input report (matches USB HID report)
typedef struct {
    uint16_t buttons;
    uint8_t  hat;
    uint8_t  lx;
    uint8_t  ly;
    uint8_t  rx;
    uint8_t  ry;
    uint8_t  vendor;
} controller_report_t;

// Callback: apply a controller report immediately
typedef void (*script_apply_fn)(const controller_report_t* report);

// Callback: get current time in milliseconds (monotonic)
typedef uint32_t (*script_get_ms_fn)(void);

typedef struct {
    const uint8_t* script_ptr;
    uint32_t script_size;
    uint32_t pc;           // program counter (byte offset in script)
    uint32_t loop_pc;      // saved PC for loop (0 = not looping)
    uint16_t loop_count;   // remaining loop iterations
    bool running;

    controller_report_t current;
    uint32_t wait_until;   // next action timestamp (ms)
    bool waiting;

    // Current button state (for BTN_DOWN / BTN_UP)
    uint16_t held_buttons;

    // Callbacks
    script_apply_fn apply;
    script_get_ms_fn get_ms;
} script_engine_t;

// Initialize engine
void script_engine_init(script_engine_t* eng,
                        script_apply_fn apply_fn,
                        script_get_ms_fn get_ms_fn);

// Load script from memory pointer
void script_engine_load(script_engine_t* eng,
                        const uint8_t* script, uint32_t size);

// Start/pause/stop execution
void script_engine_start(script_engine_t* eng);
void script_engine_stop(script_engine_t* eng);
bool script_engine_is_running(const script_engine_t* eng);

// Tick: call every frame (~60Hz). Returns true if still running.
bool script_engine_tick(script_engine_t* eng);

#endif // SCRIPT_ENGINE_H
