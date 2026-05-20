/** BOOTSEL 按键模式检测 — 全部在 RAM 中执行 */
#ifndef MODE_DETECT_H
#define MODE_DETECT_H

#include "proto.h"

// GPIO0 = BOOTSEL button, internal pull-up
#define BOOTSEL_PIN 0
#define LONG_PRESS_MS   2000
#define DOUBLE_CLICK_MS 500

#ifdef __cplusplus
extern "C" {
#endif

/** 返回检测到的模式 (MODE_NONE 表示无限等待) — 实现在 RAM 中 */
int __not_in_flash_func(detect_mode)(void);

#ifdef __cplusplus
}
#endif

#endif // MODE_DETECT_H
