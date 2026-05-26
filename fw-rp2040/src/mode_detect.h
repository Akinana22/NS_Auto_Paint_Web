/** BOOTSEL 按键模式检测 — 全部在 RAM 中执行
 *
 * 读取 QSPI_SS 引脚 (CS index=1)，无需 GPIO 配置。
 */
#ifndef MODE_DETECT_H
#define MODE_DETECT_H

#include "proto.h"
#include <stdbool.h>

#define LONG_PRESS_MS   2000
#define DOUBLE_CLICK_MS 500

#ifdef __cplusplus
extern "C" {
#endif

/** 返回检测到的模式 (MODE_NONE 表示无限等待) — 实现在 RAM 中 */
int detect_mode(void);

/** 运行时检测BOOTSEL是否已长按>2s (用于触发模式切换复位) */
bool check_bootsel_long_press(void);

#ifdef __cplusplus
}
#endif

#endif // MODE_DETECT_H
