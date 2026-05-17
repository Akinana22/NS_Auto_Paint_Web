/**
 * NS Auto Painter — RP2040 Pico 固件
 *
 * USB 复合设备:
 *  - HID: 模拟 HORI POKKEN CONTROLLER
 *  - CDC: Web Serial API 脚本上传
 *  - MSC: 大容量存储 (拖入 .bin 脚本)
 *
 * Flash 脚本存储 + 二进制脚本引擎 + 60Hz 帧同步
 * 连接 Switch 时自动执行脚本
 */

#include <stdio.h>
#include <string.h>
#include "pico/stdlib.h"
#include "pico/multicore.h"
#include "hardware/timer.h"
#include "tusb.h"
#include "proto.h"
#include "flash_store.h"
#include "script_engine.h"
#include "msc_disk.h"

#define LED_PIN  PICO_DEFAULT_LED_PIN

// ---- CDC Upload ----
#define CDC_UPLOAD_BUF_SIZE 16384
static uint8_t  cdc_cmd_buf[256];
static uint32_t cdc_cmd_len = 0;
static uint8_t  cdc_upload_buf[CDC_UPLOAD_BUF_SIZE];
static uint32_t cdc_upload_size = 0;
static uint32_t cdc_upload_offset = 0;
static bool     cdc_uploading = false;

// ---- State ----
static controller_report_t hid_report;
static script_engine_t engine;
static bool script_running = false;
static bool hid_connected = false;

// ---- Time ----
static volatile uint32_t system_ms = 0;
static struct repeating_timer _ms_timer;

bool ms_timer_callback(struct repeating_timer *t) {
    (void) t;
    system_ms++;
    return true;
}
static uint32_t get_ms(void) { return system_ms; }

// ---- LED ----
static volatile uint8_t led_counter = 0;

// ---- HID ----
static void reset_hid_report(void) {
    hid_report.buttons = 0;
    hid_report.hat = HAT_CENTER;
    hid_report.lx = STICK_CENTER;
    hid_report.ly = STICK_CENTER;
    hid_report.rx = STICK_CENTER;
    hid_report.ry = STICK_CENTER;
    hid_report.vendor = 0;
}

static void apply_report(const controller_report_t* r) {
    hid_report.buttons = r->buttons;
    hid_report.hat = r->hat;
    hid_report.lx = r->lx;
    hid_report.ly = r->ly;
    hid_report.rx = r->rx;
    hid_report.ry = r->ry;
    hid_report.vendor = r->vendor;
}

// ---- CDC Helpers ----
static void cdc_respond(const char* str) {
    if (tud_cdc_n_connected(0)) {
        tud_cdc_write_str(str);
        tud_cdc_write_flush();
    }
}

static void cdc_send_info(void) {
    char buf[256];
    bool has_script = flash_store_has_script();
    const script_header_t* hdr = flash_store_get_header();
    snprintf(buf, sizeof(buf),
        "INFO:NS_Auto_Paint_RP2040 v1.0.0\n"
        "SCRIPT:%s\n"
        "SIZE:%lu\n"
        "FRAMES:%lu\n"
        "MS:%lu\n"
        "HID:%s\n"
        "OK\n",
        has_script ? "LOADED" : "NONE",
        has_script ? hdr->size : 0,
        has_script ? hdr->frameCount : 0,
        has_script ? hdr->estimatedMs : 0,
        hid_connected ? "CONNECTED" : "DISCONNECTED"
    );
    cdc_respond(buf);
}

static void cdc_process_cmd(const char* cmd) {
    if (strncmp(cmd, "INFO", 4) == 0) {
        cdc_send_info();
    }
    else if (strncmp(cmd, "ERASE", 5) == 0) {
        flash_store_erase();
        script_engine_stop(&engine);
        script_running = false;
        cdc_respond("OK:ERASED\n");
    }
    else if (strncmp(cmd, "EXEC", 4) == 0) {
        if (flash_store_has_script()) {
            script_engine_load(&engine,
                flash_store_get_script_ptr(),
                flash_store_get_script_size());
            script_engine_start(&engine);
            script_running = true;
            cdc_respond("OK:EXEC\n");
        } else {
            cdc_respond("ERR:NO_SCRIPT\n");
        }
    }
    else if (strncmp(cmd, "STOP", 4) == 0) {
        script_engine_stop(&engine);
        script_running = false;
        reset_hid_report();
        cdc_respond("OK:STOP\n");
    }
    else if (strncmp(cmd, "WRITE:", 6) == 0) {
        unsigned int size;
        if (sscanf(cmd + 6, "%x", &size) == 1 && size <= CDC_UPLOAD_BUF_SIZE) {
            cdc_upload_size = size;
            cdc_upload_offset = 0;
            cdc_uploading = true;
            cdc_respond("OK:READY_FOR_DATA\n");
        } else {
            cdc_respond("ERR:BAD_SIZE\n");
        }
    }
    else if (strncmp(cmd, "CRC:", 4) == 0) {
        unsigned int crc;
        if (cdc_upload_offset == cdc_upload_size && cdc_upload_size > 0 &&
            sscanf(cmd + 4, "%x", &crc) == 1) {
            uint32_t calc = flash_store_crc32(cdc_upload_buf, cdc_upload_size);
            if (calc == (uint32_t)crc) {
                flash_store_write_script(cdc_upload_buf, cdc_upload_size, calc);
                cdc_respond("OK:WRITTEN\n");
            } else {
                cdc_respond("ERR:CRC_MISMATCH\n");
            }
        } else {
            cdc_respond("ERR:BAD_CRC\n");
        }
        cdc_upload_size = 0;
        cdc_upload_offset = 0;
        cdc_uploading = false;
    }
    else {
        cdc_respond("ERR:UNKNOWN_CMD\n");
    }
}

// CDC data received callback
void tud_cdc_rx_cb(uint8_t itf) {
    (void) itf;
    uint8_t buf[64];
    uint32_t count = tud_cdc_n_read(0, buf, sizeof(buf));

    for (uint32_t i = 0; i < count; i++) {
        uint8_t ch = buf[i];

        if (cdc_uploading) {
            // Binary data mode — accumulate until expected size
            if (cdc_upload_offset < CDC_UPLOAD_BUF_SIZE) {
                cdc_upload_buf[cdc_upload_offset++] = ch;
            }
            // After collecting all bytes, switch back to CMD mode
            if (cdc_upload_offset >= cdc_upload_size) {
                cdc_uploading = false;
                // Next bytes will be CRC command via line protocol
            }
            continue;
        }

        // Text command mode
        if (ch == '\n' || ch == '\r') {
            if (cdc_cmd_len > 0) {
                cdc_cmd_buf[cdc_cmd_len] = '\0';
                cdc_process_cmd((const char*)cdc_cmd_buf);
                cdc_cmd_len = 0;
            }
        } else {
            if (cdc_cmd_len < sizeof(cdc_cmd_buf) - 1) {
                cdc_cmd_buf[cdc_cmd_len++] = ch;
            }
        }
    }
}

// ---- MSC Callbacks ----
int32_t tud_msc_read10_cb(uint8_t lun, uint32_t lba, uint32_t offset,
                           void* buffer, uint32_t bufsize) {
    (void) lun; (void) offset;
    uint32_t count = (bufsize + DISK_SECTOR_SIZE - 1) / DISK_SECTOR_SIZE;
    msc_disk_read(lba, (uint8_t*)buffer, count);
    return bufsize;
}

int32_t tud_msc_write10_cb(uint8_t lun, uint32_t lba, uint32_t offset,
                            uint8_t* buffer, uint32_t bufsize) {
    (void) lun; (void) offset;
    uint32_t count = (bufsize + DISK_SECTOR_SIZE - 1) / DISK_SECTOR_SIZE;
    msc_disk_write(lba, buffer, count);
    return bufsize;
}

void tud_msc_inquiry_cb(uint8_t lun, uint8_t vendor_id[8], uint8_t product_id[16],
                         uint8_t product_rev[4]) {
    (void) lun;
    memcpy(vendor_id,  "NS AUTO ", 8);
    memcpy(product_id, "Script Disk     ", 16);
    memcpy(product_rev, "1.0 ", 4);
}

bool tud_msc_test_unit_ready_cb(uint8_t lun) {
    (void) lun;
    return true;
}

void tud_msc_capacity_cb(uint8_t lun, uint32_t* block_count, uint16_t* block_size) {
    (void) lun;
    *block_count = DISK_SECTOR_COUNT;
    *block_size  = DISK_SECTOR_SIZE;
}

bool tud_msc_start_stop_cb(uint8_t lun, uint8_t power_condition,
                            bool start, bool load_eject) {
    (void) lun; (void) power_condition; (void) start;
    if (load_eject) {
        msc_disk_eject();
    }
    return true;
}

// SCSI command dispatcher — required by TinyUSB MSC stack
int32_t tud_msc_scsi_cb(uint8_t lun, uint8_t const scsi_cmd[16],
                         void* buffer, uint16_t bufsize) {
    (void) lun;
    uint8_t* buf = (uint8_t*)buffer;

    switch (scsi_cmd[0]) {

    case 0x00: // TEST UNIT READY
        return tud_msc_test_unit_ready_cb(lun) ? 0 : -1;

    case 0x03: // REQUEST SENSE
        memset(buf, 0, 18);
        buf[0] = 0x70;    // valid, current errors
        buf[2] = 0x00;    // NO SENSE
        buf[7] = 10;      // additional sense length
        return 18;

    case 0x12: { // INQUIRY
        uint8_t v[8], p[16], r[4];
        tud_msc_inquiry_cb(lun, v, p, r);
        memset(buf, 0, 36);
        buf[0]  = 0x00;   // direct access block device
        buf[1]  = 0x80;   // removable
        buf[2]  = 0x04;   // SPC-2
        buf[3]  = 0x02;   // response data format
        buf[4]  = 36 - 5; // additional length
        memcpy(buf + 8,  v, 8);
        memcpy(buf + 16, p, 16);
        memcpy(buf + 32, r, 4);
        return 36;
    }

    case 0x1B: // START STOP UNIT
        tud_msc_start_stop_cb(lun, 0, false, scsi_cmd[4] & 0x02);
        return 0;

    case 0x1E: // PREVENT/ALLOW MEDIUM REMOVAL
        return 0;

    case 0x25: { // READ CAPACITY (10)
        uint32_t bc; uint16_t bs;
        tud_msc_capacity_cb(lun, &bc, &bs);
        uint32_t lba = bc - 1;
        buf[0] = (lba >> 24) & 0xFF; buf[1] = (lba >> 16) & 0xFF;
        buf[2] = (lba >> 8)  & 0xFF; buf[3] = lba & 0xFF;
        buf[4] = (bs  >> 24) & 0xFF; buf[5] = (bs  >> 16) & 0xFF;
        buf[6] = (bs  >> 8)  & 0xFF; buf[7] = bs & 0xFF;
        return 8;
    }

    case 0x28: { // READ (10)
        uint32_t lba = ((uint32_t)scsi_cmd[2] << 24)
                     | ((uint32_t)scsi_cmd[3] << 16)
                     | ((uint32_t)scsi_cmd[4] << 8)
                     |  (uint32_t)scsi_cmd[5];
        return tud_msc_read10_cb(lun, lba, 0, buf, bufsize);
    }

    case 0x2A: { // WRITE (10)
        uint32_t lba = ((uint32_t)scsi_cmd[2] << 24)
                     | ((uint32_t)scsi_cmd[3] << 16)
                     | ((uint32_t)scsi_cmd[4] << 8)
                     |  (uint32_t)scsi_cmd[5];
        return tud_msc_write10_cb(lun, lba, 0, buf, bufsize);
    }

    case 0x23: // READ FORMAT CAPACITIES
        buf[0] = 0; buf[1] = 0; buf[2] = 0; buf[3] = 8; // capacity list length
        buf[4] = 0; buf[5] = 0; buf[6] = 0; buf[7] = 0; // block count
        buf[8] = 0x02;  // formatted media
        buf[9] = 0; buf[10] = 0; buf[11] = (DISK_SECTOR_SIZE >> 8) & 0xFF;
        return 12;

    case 0x5A: // MODE SENSE (6)
        memset(buf, 0, 4);
        buf[0] = 3; buf[3] = 0x08; // write protected
        return 4;

    default:
        return -1;
    }
}

// ---- USB Lifecycle ----
void tud_mount_cb(void) {
}

void tud_umount_cb(void) {
    hid_connected = false;
}

// ---- Core 1: LED ----
void core1_task(void) {
    gpio_init(LED_PIN);
    gpio_set_dir(LED_PIN, GPIO_OUT);
    while (1) {
        if (hid_connected && script_running) {
            gpio_put(LED_PIN, (led_counter & 0x04) ? 1 : 0);
        } else if (tud_cdc_n_connected(0) || tud_mounted()) {
            gpio_put(LED_PIN, (led_counter & 0x10) ? 1 : 0);
        } else {
            gpio_put(LED_PIN, (led_counter & 0x20) ? 1 : 0);
        }
        led_counter++;
        sleep_ms(50);
    }
}

// ---- HID Task ----
static void hid_task(void) {
    if (!tud_hid_ready()) return;
    if (!tud_hid_n_ready(0)) {
        hid_connected = false;
        return;
    }
    hid_connected = true;

    uint8_t report[8];
    report[0] = hid_report.buttons & 0xFF;
    report[1] = (hid_report.buttons >> 8) & 0xFF;
    report[2] = hid_report.hat;
    report[3] = hid_report.lx;
    report[4] = hid_report.ly;
    report[5] = hid_report.rx;
    report[6] = hid_report.ry;
    report[7] = hid_report.vendor;
    tud_hid_report(1, report, sizeof(report));
}

// ---- Main ----
int main(void) {
    stdio_init_all();

    flash_store_init();
    msc_disk_init();

    add_repeating_timer_ms(1, ms_timer_callback, NULL, &_ms_timer);

    reset_hid_report();
    script_engine_init(&engine, apply_report, get_ms);

    if (flash_store_has_script()) {
        script_engine_load(&engine,
            flash_store_get_script_ptr(),
            flash_store_get_script_size());
    }

    tusb_init();
    multicore_launch_core1(core1_task);

    const uint32_t tick_us = 16667;
    uint32_t next_tick = time_us_32() + tick_us;
    uint32_t auto_start_delay = 0;

    while (1) {
        tud_task();
        hid_task();

        uint32_t now = time_us_32();
        if (time_reached(next_tick)) {
            next_tick += tick_us;
            if (script_running) {
                if (!script_engine_tick(&engine)) {
                    script_running = false;
                    reset_hid_report();
                }
            }
            if (hid_connected && !script_running && flash_store_has_script()) {
                if (auto_start_delay == 0) auto_start_delay = 60;
                else { auto_start_delay--;
                    if (auto_start_delay == 0) {
                        script_engine_start(&engine);
                        script_running = true;
                    }
                }
            } else if (!hid_connected) {
                auto_start_delay = 0;
            }
        }
    }
}
