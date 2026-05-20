/** 脚本引擎实现 v4.0 — 分段加载 / 累加按钮 / REPEAT / 统一等待 */
#include "script_engine.h"
#include <string.h>

static inline uint16_t read_u16(const uint8_t* buf, uint32_t* pc) {
    uint16_t v = buf[*pc] | ((uint16_t)buf[*pc + 1] << 8); *pc += 2; return v;
}

static void reset_report(controller_report_t* r) {
    r->buttons = 0; r->hat = HAT_CENTER;
    r->lx = STICK_CENTER; r->ly = STICK_CENTER;
    r->rx = STICK_CENTER; r->ry = STICK_CENTER;
    r->vendor = 0;
}

static void _start_wait(script_engine_t* eng, uint8_t type, uint16_t dur, uint16_t release_btn) {
    eng->wait_until = eng->get_ms() + dur;
    eng->waiting = true;
    eng->wait_type = type;
    eng->wait_release_btn = release_btn;
}

static void _load_segment(script_engine_t* eng, int32_t idx) {
    if (idx >= eng->seg_count) return;
    const uint8_t* flash = eng->seg_flash;
    uint32_t table_base = 8; // num_segments(4) + table_offset(4)
    uint32_t entry_off = table_base + (uint32_t)idx * 8;
    uint32_t seg_off, seg_sz;
    memcpy(&seg_off, flash + entry_off, 4);
    memcpy(&seg_sz, flash + entry_off + 4, 4);
    if (seg_sz > eng->seg_ram_size) return;
    memcpy(eng->seg_ram, flash + seg_off, seg_sz);
    eng->script_ptr = eng->seg_ram;
    eng->script_size = seg_sz;
    eng->pc = 0;
    eng->seg_index = idx;
}

void script_engine_init(script_engine_t* eng, script_apply_fn apply_fn, script_get_ms_fn get_ms_fn,
                        uint8_t* seg_ram, uint32_t seg_ram_size)
{
    memset(eng, 0, sizeof(*eng));
    eng->apply = apply_fn; eng->get_ms = get_ms_fn;
    eng->seg_ram = seg_ram; eng->seg_ram_size = seg_ram_size;
    reset_report(&eng->current);
    if (eng->apply) eng->apply(&eng->current);
}

void script_engine_load(script_engine_t* eng, const uint8_t* flash_body, uint32_t body_size)
{
    eng->seg_flash = flash_body;
    eng->pc = 0;
    eng->running = false;
    eng->waiting = false;
    eng->wait_type = WAIT_NONE;
    eng->held_buttons = 0;
    eng->repeat_count = 0;
    eng->seg_count = 0;
    eng->seg_index = 0;
    reset_report(&eng->current);

    uint32_t num = 0;
    if (body_size >= 8) memcpy(&num, flash_body, 4);
    if (num > 0 && num <= SCRIPT_MAX_SEGMENTS) eng->seg_count = (int32_t)num;
}

void script_engine_start(script_engine_t* eng)
{
    if (!eng->seg_flash || eng->seg_count == 0) return;
    _load_segment(eng, 0);
    eng->running = true;
    eng->pc = 0;
    eng->waiting = false;
    eng->wait_type = WAIT_NONE;
    eng->held_buttons = 0;
    eng->repeat_count = 0;
    reset_report(&eng->current);
    if (eng->apply) eng->apply(&eng->current);
}

void script_engine_stop(script_engine_t* eng)
{
    eng->running = false;
    eng->held_buttons = 0;
    eng->repeat_count = 0;
    eng->wait_type = WAIT_NONE;
    reset_report(&eng->current);
    if (eng->apply) eng->apply(&eng->current);
}

bool script_engine_is_running(const script_engine_t* eng) { return eng->running; }

static bool execute_op(script_engine_t* eng)
{
    const uint8_t* buf = eng->script_ptr;
    uint32_t pc = eng->pc;
    if (pc >= eng->script_size) { eng->running = false; return false; }

    uint8_t op = buf[pc++];
    switch (op) {
    case OP_WAIT: {
        if (eng->waiting) {
            if (eng->get_ms() >= eng->wait_until) { eng->waiting = false; eng->wait_type = WAIT_NONE; eng->pc = pc + 2; return true; }
            return false;
        }
        uint16_t dur = read_u16(buf, &pc);
        if (dur == 0) { eng->pc = pc; return true; }
        _start_wait(eng, WAIT_PLAIN, dur, 0);
        eng->pc = pc;
        return false;
    }
    case OP_BTN_PRESS: {
        uint16_t btn = read_u16(buf, &pc);
        eng->current.buttons = btn;
        if (eng->apply) eng->apply(&eng->current);
        eng->pc = pc;
        return true;
    }
    case OP_BTN_DOWN: {
        uint16_t btn = read_u16(buf, &pc);
        eng->current.buttons |= btn;
        eng->held_buttons |= btn;
        if (eng->apply) eng->apply(&eng->current);
        eng->pc = pc;
        return true;
    }
    case OP_BTN_UP: {
        eng->current.buttons = 0;
        eng->held_buttons = 0;
        if (eng->apply) eng->apply(&eng->current);
        eng->pc = pc;
        return true;
    }
    case OP_BTN_REL: {
        uint16_t btn = read_u16(buf, &pc);
        eng->current.buttons &= ~btn;
        eng->held_buttons &= ~btn;
        if (eng->apply) eng->apply(&eng->current);
        eng->pc = pc;
        return true;
    }
    case OP_DPAD: {
        eng->current.hat = buf[pc++];
        if (eng->apply) eng->apply(&eng->current);
        eng->pc = pc;
        return true;
    }
    case OP_LSTICK: {
        eng->current.lx = buf[pc++];
        eng->current.ly = buf[pc++];
        uint16_t dur = read_u16(buf, &pc);
        if (eng->apply) eng->apply(&eng->current);
        if (dur > 0) {
            _start_wait(eng, WAIT_STICK_L, dur, 0);
            eng->pc = pc;
            return false;
        }
        eng->pc = pc;
        return true;
    }
    case OP_RSTICK: {
        eng->current.rx = buf[pc++];
        eng->current.ry = buf[pc++];
        uint16_t dur = read_u16(buf, &pc);
        if (eng->apply) eng->apply(&eng->current);
        if (dur > 0) {
            _start_wait(eng, WAIT_STICK_R, dur, 0);
            eng->pc = pc;
            return false;
        }
        eng->pc = pc;
        return true;
    }
    case OP_BTN_TAP: {
        uint16_t btn = read_u16(buf, &pc);
        uint16_t dur = read_u16(buf, &pc);
        eng->current.buttons |= btn;
        if (eng->apply) eng->apply(&eng->current);
        if (dur > 0) {
            _start_wait(eng, WAIT_BTN_TAP, dur, btn);
            eng->pc = pc;
            return false;
        }
        eng->current.buttons &= ~btn;
        if (eng->apply) eng->apply(&eng->current);
        eng->pc = pc;
        return true;
    }
    case OP_DPAD_TAP: {
        uint8_t hat = buf[pc++];
        uint16_t dur = read_u16(buf, &pc);
        eng->current.hat = hat;
        if (eng->apply) eng->apply(&eng->current);
        if (dur > 0) {
            _start_wait(eng, WAIT_DPAD_TAP, dur, 0);
            eng->pc = pc;
            return false;
        }
        eng->current.hat = HAT_CENTER;
        if (eng->apply) eng->apply(&eng->current);
        eng->pc = pc;
        return true;
    }
    case OP_NEXT: {
        if (eng->seg_index + 1 < eng->seg_count) {
            _load_segment(eng, eng->seg_index + 1);
            eng->waiting = false;
            eng->wait_type = WAIT_NONE;
            eng->repeat_count = 0;
            return true;
        }
        eng->running = false;
        return false;
    }
    case OP_REPEAT: {
        uint16_t count = read_u16(buf, &pc);
        if (count == 0) { eng->pc = pc; return true; }
        eng->repeat_count = count;
        eng->repeat_pc = pc;
        eng->pc = pc;
        return true;
    }
    default:
        eng->running = false;
        return false;
    }
}

bool script_engine_tick(script_engine_t* eng)
{
    if (!eng->running) return false;

    if (eng->waiting) {
        if (eng->get_ms() >= eng->wait_until) {
            switch (eng->wait_type) {
            case WAIT_STICK_L:
                eng->current.lx = STICK_CENTER;
                eng->current.ly = STICK_CENTER;
                break;
            case WAIT_STICK_R:
                eng->current.rx = STICK_CENTER;
                eng->current.ry = STICK_CENTER;
                break;
            case WAIT_BTN_TAP:
                eng->current.buttons &= ~eng->wait_release_btn;
                break;
            case WAIT_DPAD_TAP:
                eng->current.hat = HAT_CENTER;
                break;
            default:
                break;
            }
            eng->wait_type = WAIT_NONE;
            if (eng->apply) eng->apply(&eng->current);
            eng->waiting = false;

            if (eng->repeat_count > 1) {
                eng->repeat_count--;
                eng->pc = eng->repeat_pc;
                return true;
            } else if (eng->repeat_count == 1) {
                eng->repeat_count = 0;
            }
        }
        return true;
    }

    while (eng->running) {
        if (!execute_op(eng)) break;
        if (eng->waiting) break;

        if (eng->repeat_count > 1) {
            eng->repeat_count--;
            eng->pc = eng->repeat_pc;
        } else if (eng->repeat_count == 1) {
            eng->repeat_count = 0;
        }
    }
    return eng->running;
}
