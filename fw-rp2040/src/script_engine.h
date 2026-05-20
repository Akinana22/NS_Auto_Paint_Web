/** 脚本引擎 — 解析 & 逐帧执行二进制脚本指令 */
#ifndef SCRIPT_ENGINE_H
#define SCRIPT_ENGINE_H

#include <stdint.h>
#include <stdbool.h>
#include "proto.h"

typedef void (*script_apply_fn)(const controller_report_t* report);
typedef uint32_t (*script_get_ms_fn)(void);

typedef struct {
    const uint8_t* script_ptr;
    uint32_t      script_size;
    uint32_t      pc;
    uint32_t      loop_pc;
    uint16_t      loop_count;
    bool          running;

    controller_report_t current;
    uint32_t    wait_until;
    bool        waiting;
    uint16_t    held_buttons;
    uint8_t     stick_waiting; // 1=left, 2=right, 0=none

    script_apply_fn   apply;
    script_get_ms_fn  get_ms;
} script_engine_t;

void script_engine_init(script_engine_t* eng, script_apply_fn apply_fn, script_get_ms_fn get_ms_fn);
void script_engine_load(script_engine_t* eng, const uint8_t* script, uint32_t size);
void script_engine_start(script_engine_t* eng);
void script_engine_stop(script_engine_t* eng);
bool script_engine_is_running(const script_engine_t* eng);
bool script_engine_tick(script_engine_t* eng);

#endif
