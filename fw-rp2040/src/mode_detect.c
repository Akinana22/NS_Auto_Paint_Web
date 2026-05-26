/** BOOTSEL 按键模式检测 — 全部在 RAM 中执行
 *
 * 标准 Pico 板 BOOTSEL 连接在 QSPI_SS 引脚 (CS index=1),
 * 通过操作 IO_QSPI 寄存器临时切换为 GPIO Hi-Z 模式读取电平。
 */
#include "mode_detect.h"
#include "pico/stdlib.h"
#include "hardware/sync.h"
#include "hardware/structs/ioqspi.h"
#include "hardware/structs/sio.h"

#define CS_PIN_INDEX 1

static bool __no_inline_not_in_flash_func(read_bootsel)(void)
{
    uint32_t flags = save_and_disable_interrupts();

    hw_write_masked(&ioqspi_hw->io[CS_PIN_INDEX].ctrl,
        GPIO_OVERRIDE_LOW << IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_LSB,
        IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_BITS);

    for (volatile int i = 0; i < 1000; ++i);

    bool pressed = !(sio_hw->gpio_hi_in & (1u << CS_PIN_INDEX));

    hw_write_masked(&ioqspi_hw->io[CS_PIN_INDEX].ctrl,
        GPIO_OVERRIDE_NORMAL << IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_LSB,
        IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_BITS);

    restore_interrupts(flags);
    return pressed;
}

int __not_in_flash_func(detect_mode)(void)
{
    // Wait for button release
    while (read_bootsel()) tight_loop_contents();

    // Wait for first press indefinitely
    while (!read_bootsel()) tight_loop_contents();

    // Button pressed — start timing for long-press
    absolute_time_t press_start = get_absolute_time();
    while (read_bootsel()) {
        if (absolute_time_diff_us(press_start, get_absolute_time()) > LONG_PRESS_MS * 1000) {
            while (read_bootsel()) tight_loop_contents();
            return MODE_CDC_MSC;
        }
        tight_loop_contents();
    }

    // Short press released — detect single or double click
    int press_count = 1;
    absolute_time_t last_release = get_absolute_time();

    while (absolute_time_diff_us(last_release, get_absolute_time()) < DOUBLE_CLICK_MS * 1000) {
        if (read_bootsel()) {
            press_count++;
            while (read_bootsel()) tight_loop_contents();
            last_release = get_absolute_time();
            if (press_count == 2) break;
        }
        tight_loop_contents();
    }

    if (press_count == 2) return MODE_HID_MSC;
    return MODE_HID_CDC;
}

bool __not_in_flash_func(check_bootsel_long_press)(void)
{
    static absolute_time_t press_start;
    static bool was_pressed = false;

    if (read_bootsel()) {
        if (!was_pressed) {
            press_start = get_absolute_time();
            was_pressed = true;
        }
        if (absolute_time_diff_us(press_start, get_absolute_time()) > LONG_PRESS_MS * 1000) {
            was_pressed = false;
            return true;
        }
    } else {
        was_pressed = false;
    }
    return false;
}
