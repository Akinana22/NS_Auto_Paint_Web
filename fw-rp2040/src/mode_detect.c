/** BOOTSEL 按键模式检测 — 全部在 RAM 中执行

 * GPIO0 内部上拉，按下=低电平。
 * 上电后等待按键释放 → 长按检测 (>2s) → 双击检测 (间隔<500ms)。
 */
#include "mode_detect.h"
#include "pico/stdlib.h"
#include "hardware/gpio.h"

int __not_in_flash_func(detect_mode)(void)
{
    gpio_init(BOOTSEL_PIN);
    gpio_set_dir(BOOTSEL_PIN, GPIO_IN);
    gpio_pull_up(BOOTSEL_PIN);

    // Wait for button release (may be held at power-on from previous press)
    while (!gpio_get(BOOTSEL_PIN)) tight_loop_contents();

    // Wait for first press with long-press timeout
    absolute_time_t start_time = get_absolute_time();
    while (gpio_get(BOOTSEL_PIN)) {
        if (absolute_time_diff_us(start_time, get_absolute_time()) > LONG_PRESS_MS * 1000) {
            return MODE_NONE; // no press → wait forever
        }
    }

    // Button pressed — start timing for long-press
    absolute_time_t press_start = get_absolute_time();
    while (!gpio_get(BOOTSEL_PIN)) {
        if (absolute_time_diff_us(press_start, get_absolute_time()) > LONG_PRESS_MS * 1000) {
            // Long press detected
            while (!gpio_get(BOOTSEL_PIN)) tight_loop_contents();
            return MODE_CDC_MSC;
        }
        tight_loop_contents();
    }

    // Short press released — detect single or double click
    int press_count = 1;
    absolute_time_t last_release = get_absolute_time();

    while (absolute_time_diff_us(last_release, get_absolute_time()) < DOUBLE_CLICK_MS * 1000) {
        if (!gpio_get(BOOTSEL_PIN)) {
            press_count++;
            // Wait for second release
            while (!gpio_get(BOOTSEL_PIN)) tight_loop_contents();
            last_release = get_absolute_time();
            if (press_count == 2) break;
        }
        tight_loop_contents();
    }

    if (press_count == 2) return MODE_HID_MSC;
    return MODE_HID_CDC;
}
