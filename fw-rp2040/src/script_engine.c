/** 脚本引擎实现 — 逐帧执行二进制指令流 */
#include "script_engine.h"
#include <string.h>

static inline uint16_t read_u16(const uint8_t* buf, uint32_t* pc) {
    uint16_t v = buf[*pc] | ((uint16_t)buf[*pc + 1] << 8); *pc += 2; return v;
}
static inline uint32_t read_u32(const uint8_t* buf, uint32_t* pc) {
    uint32_t v = buf[*pc] | ((uint32_t)buf[*pc + 1] << 8) | ((uint32_t)buf[*pc + 2] << 16) | ((uint32_t)buf[*pc + 3] << 24);
    *pc += 4; return v;
}

static void reset_report(controller_report_t* r) {
    r->buttons = 0; r->hat = HAT_CENTER;
    r->lx = STICK_CENTER; r->ly = STICK_CENTER;
    r->rx = STICK_CENTER; r->ry = STICK_CENTER;
    r->vendor = 0;
}

void script_engine_init(script_engine_t* eng, script_apply_fn apply_fn, script_get_ms_fn get_ms_fn) {
    memset(eng, 0, sizeof(*eng));
    eng->apply = apply_fn; eng->get_ms = get_ms_fn;
    reset_report(&eng->current);
    if (eng->apply) eng->apply(&eng->current);
}

void script_engine_load(script_engine_t* eng, const uint8_t* script, uint32_t size) { eng->script_ptr = script; eng->script_size = size; eng->pc = 0; eng->loop_pc = 0; eng->loop_count = 0; eng->running = false; eng->waiting = false; eng->held_buttons = 0; reset_report(&eng->current); }

void script_engine_start(script_engine_t* eng) { if (!eng->script_ptr || eng->script_size == 0) return; eng->running = true; eng->pc = 0; eng->waiting = false; eng->held_buttons = 0; reset_report(&eng->current); if (eng->apply) eng->apply(&eng->current); }

void script_engine_stop(script_engine_t* eng) { eng->running = false; eng->held_buttons = 0; reset_report(&eng->current); if (eng->apply) eng->apply(&eng->current); }

bool script_engine_is_running(const script_engine_t* eng) { return eng->running; }

static bool execute_op(script_engine_t* eng) {
    const uint8_t* buf = eng->script_ptr; uint32_t pc = eng->pc;
    if (pc >= eng->script_size) { eng->running = false; return false; }
    uint8_t op = buf[pc++];
    switch (op) {
    case OP_WAIT: {
        if (eng->waiting) { if (eng->get_ms() >= eng->wait_until) { eng->waiting = false; eng->pc = pc + 2; return true; } return false; }
        uint16_t dur = read_u16(buf, &pc); if (dur == 0) { eng->pc = pc; return true; }
        eng->wait_until = eng->get_ms() + dur; eng->waiting = true; eng->pc = pc; return false;
    }
    case OP_BTN_PRESS: { uint16_t btn = read_u16(buf, &pc); eng->current.buttons = btn; if (eng->apply) eng->apply(&eng->current); eng->pc = pc; return true; }
    case OP_BTN_DOWN:  { uint16_t btn = read_u16(buf, &pc); eng->current.buttons = btn; eng->held_buttons = btn; if (eng->apply) eng->apply(&eng->current); eng->pc = pc; return true;  }
    case OP_BTN_UP:    { eng->current.buttons = 0; eng->held_buttons = 0; if (eng->apply) eng->apply(&eng->current); eng->pc = pc; return true;  }
    case OP_DPAD:      { eng->current.hat = buf[pc++]; if (eng->apply) eng->apply(&eng->current); eng->pc = pc; return true;  }
    case OP_LSTICK:    { eng->current.lx = buf[pc++]; eng->current.ly = buf[pc++]; uint16_t dur = read_u16(buf, &pc); if (eng->apply) eng->apply(&eng->current); if (dur > 0) { eng->wait_until = eng->get_ms() + dur; eng->waiting = true; eng->held_buttons = 0xFFFF; eng->pc = pc; return false; } eng->pc = pc; return true; }
    case OP_RSTICK:    { eng->current.rx = buf[pc++]; eng->current.ry = buf[pc++]; uint16_t dur = read_u16(buf, &pc); if (eng->apply) eng->apply(&eng->current); if (dur > 0) { eng->wait_until = eng->get_ms() + dur; eng->waiting = true; eng->held_buttons = 0xFFFF; eng->pc = pc; return false; } eng->pc = pc; return true; }
    case OP_LOOP: { uint16_t count = read_u16(buf, &pc); uint32_t addr = read_u32(buf, &pc); if (eng->loop_count == 0) { if (count == 0) { eng->pc = pc; return true; } eng->loop_count = count - 1; eng->loop_pc = pc; eng->pc = addr; } else { eng->loop_count--; if (eng->loop_count == 0) { eng->loop_pc = 0; eng->pc = pc; } else eng->pc = addr; } return true; }
    default: eng->running = false; return false;
    }
}

bool script_engine_tick(script_engine_t* eng) {
    if (!eng->running) return false;
    // Stick duration timeout → reset all 4 axes
    if (eng->waiting && eng->held_buttons == 0xFFFF) {
        if (eng->get_ms() >= eng->wait_until) {
            eng->current.lx = STICK_CENTER; eng->current.ly = STICK_CENTER;
            eng->current.rx = STICK_CENTER; eng->current.ry = STICK_CENTER;
            eng->held_buttons = 0;
            if (eng->apply) eng->apply(&eng->current);
            eng->waiting = false;
        }
        return true;
    }
    while (eng->running) { if (!execute_op(eng)) break; }
    return eng->running;
}
