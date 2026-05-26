/** 脚本引擎 — 解析 & 逐帧执行二进制脚本指令 (v4.0: segments + additive buttons + REPEAT) */
#ifndef SCRIPT_ENGINE_H
#define SCRIPT_ENGINE_H

#include <stdint.h>
#include <stdbool.h>
#include "proto.h"

typedef void (*script_apply_fn)(const controller_report_t* report);
typedef uint32_t (*script_get_ms_fn)(void);

typedef struct {
    const uint8_t* script_ptr;
    uint32_t       script_size;
    uint32_t       pc;
    bool           running;

    controller_report_t current;
    uint32_t    wait_until;
    bool        waiting;
    uint8_t     wait_type;       // WaitType enum
    uint16_t    wait_release_btn;
    uint16_t    held_buttons;

    uint16_t    repeat_count;
    uint32_t    repeat_pc;

    uint8_t*        seg_ram;
    uint32_t        seg_ram_size;
    const uint8_t*  seg_flash;
    uint32_t        body_size;
    int32_t         seg_count;
    int32_t         seg_index;
    bool            body_in_ram;  // true=seg_flash is RAM, skip copy in _load_segment

    script_apply_fn   apply;
    script_get_ms_fn  get_ms;
} script_engine_t;

void script_engine_init(script_engine_t* eng, script_apply_fn apply_fn, script_get_ms_fn get_ms_fn,
                        uint8_t* seg_ram, uint32_t seg_ram_size);
void script_engine_load(script_engine_t* eng, const uint8_t* flash_body, uint32_t body_size);
void script_engine_start(script_engine_t* eng);
void script_engine_stop(script_engine_t* eng);
bool script_engine_is_running(const script_engine_t* eng);
bool script_engine_tick(script_engine_t* eng);

#endif
