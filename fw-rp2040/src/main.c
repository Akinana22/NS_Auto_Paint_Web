/** NS Auto Painter �?RP2040 Pico 固件 v0.02
 *
 * BOOTSEL 按键模式切换 + USB 动态配�?+ Flash 5区布局 + 脚本引擎
 *
 * 启动流程:
 *   1. RAM 中检�?BOOTSEL 按键 �?确定模式
 *   2. 初始�?Flash + 日志 + 脚本引擎
 *   3. 根据模式加载对应分区的脚�?
 *   4. 启动 USB (动态配置描述符)
 *   5. 主循�? HID + 脚本引擎 tick + (CDC / MSC)
 */

#include <stdio.h>
#include <string.h>
#include "pico/stdlib.h"
#include "pico/multicore.h"
#include "hardware/timer.h"
#include "hardware/watchdog.h"
#include "hardware/flash.h"
#include "tusb.h"
#include "proto.h"
#include "mode_detect.h"
#include "flash_store.h"
#include "script_engine.h"
#include "msc_disk.h"

extern int current_mode;  // defined in usb_descriptors.c

// ==== State ====
static controller_report_t hid_report;
static script_engine_t engine;
static uint8_t script_ram[SCRIPT_SEGMENT_MAX_SIZE];
static volatile bool script_running = false;
static bool hid_connected = false;

// CDC upload �?streaming to flash
static uint8_t  cdc_cmd_buf[256];
static uint32_t cdc_cmd_len = 0;
static uint32_t cdc_upload_size = 0;
static uint32_t cdc_upload_offset = 0;
static bool     cdc_uploading = false;
static uint8_t  cdc_page_buf[256];
static uint8_t  cdc_page_pos  = 0;
static uint32_t cdc_crc = 0;
static uint32_t cdc_erased_sector = 0xFFFFFFFF; // lazy sector erase tracker

// ==== Time ====
static volatile uint32_t system_ms = 0;
static struct repeating_timer _ms_timer;
bool ms_timer_callback(struct repeating_timer *t) { (void)t; system_ms++; return true; }
static uint32_t get_ms(void) { return system_ms; }

// ==== HID ====
static void reset_hid_report(void) {
    hid_report.buttons = 0; hid_report.hat = HAT_CENTER;
    hid_report.lx = STICK_CENTER; hid_report.ly = STICK_CENTER;
    hid_report.rx = STICK_CENTER; hid_report.ry = STICK_CENTER;
    hid_report.vendor = 0;
}
static void apply_report(const controller_report_t* r) {
    hid_report.buttons = r->buttons;
    hid_report.hat = r->hat;
    hid_report.lx = r->lx; hid_report.ly = r->ly;
    hid_report.rx = r->rx; hid_report.ry = r->ry;
    hid_report.vendor = r->vendor;
}

static void hid_task(void) {
    if (!tud_hid_ready()) return;
    if (!tud_hid_n_ready(0)) { hid_connected = false; return; }
    hid_connected = true;
    uint8_t report[8];
    report[0] = hid_report.buttons & 0xFF; report[1] = (hid_report.buttons >> 8) & 0xFF;
    report[2] = hid_report.hat;
    report[3] = hid_report.lx; report[4] = hid_report.ly;
    report[5] = hid_report.rx; report[6] = hid_report.ry;
    report[7] = hid_report.vendor;
    tud_hid_report(1, report, sizeof(report));
}

// ==== CDC ====
static void cdc_respond(const char* str) {
    if (tud_cdc_n_connected(0)) { tud_cdc_write_str(str); tud_cdc_write_flush(); }
}

static void cdc_process_cmd(const char* cmd) {
    if (strncmp(cmd, "INFO", 4) == 0) {
        char buf[128];
        snprintf(buf, sizeof(buf),
            "INFO:NS_Auto_Paint_RP2040 v0.02\nMODE:%d\nCDC_SCRIPT:%s\nMSC_SCRIPT:%s\nHID:%s\nOK\n",
            current_mode,
            cdc_script_has_valid() ? "YES" : "NO",
            msc_script_has_valid() ? "YES" : "NO",
            hid_connected ? "CONNECTED" : "DISCONNECTED");
        cdc_respond(buf);
    } else if (strncmp(cmd, "ERASE", 5) == 0) {
        cdc_script_erase(); script_engine_stop(&engine); script_running = false;
        cdc_respond("OK:ERASED\n");
    } else if (strncmp(cmd, "WRITE:", 6) == 0) {
        unsigned int size;
        if (sscanf(cmd + 6, "%x", &size) == 1 && size <= CDC_SCRIPT_SIZE - SCRIPT_HEADER_SECTOR) {
            cdc_script_erase();
            cdc_upload_size = size; cdc_upload_offset = 0;
            cdc_page_pos = 0; cdc_uploading = true;
            cdc_crc = 0xFFFFFFFF;
            cdc_erased_sector = 0xFFFFFFFF;
            flash_store_crc32_init();
            cdc_respond("OK:READY_FOR_DATA\n");
        } else cdc_respond("ERR:BAD_SIZE\n");
    } else if (strncmp(cmd, "CRC:", 4) == 0) {
        unsigned int crc;
        if (cdc_upload_offset == cdc_upload_size && cdc_upload_size > 0 && sscanf(cmd + 4, "%x", &crc) == 1) {
            if ((cdc_crc ^ 0xFFFFFFFF) == (uint32_t)crc) {
                script_header_t hdr = { SCRIPT_MAGIC, SCRIPT_PROTO_VERSION, cdc_upload_size, crc, 0, 0 };
                uint8_t page[256]; memcpy(page, &hdr, sizeof(hdr));
                memset(page + sizeof(hdr), 0xFF, 256 - sizeof(hdr));
                flash_raw_erase(CDC_SCRIPT_OFFSET, FLASH_SECTOR_SIZE);
                flash_raw_program(CDC_SCRIPT_OFFSET, page, 256);
                cdc_respond("OK:WRITTEN\n");
            } else cdc_respond("ERR:CRC_MISMATCH\n");
        } else cdc_respond("ERR:BAD_CRC\n");
        cdc_upload_size = 0; cdc_upload_offset = 0; cdc_uploading = false;
        cdc_page_pos = 0;
    } else cdc_respond("ERR:UNKNOWN_CMD\n");
}

void tud_cdc_rx_cb(uint8_t itf) {
    (void)itf; uint8_t buf[64];
    uint32_t count = tud_cdc_n_read(0, buf, sizeof(buf));
    for (uint32_t i = 0; i < count; i++) {
        if (cdc_uploading) {
            cdc_page_buf[cdc_page_pos++] = buf[i];
            cdc_crc = flash_store_crc32_stream_byte(cdc_crc, buf[i]);

            if (cdc_page_pos == 256 || cdc_upload_offset + cdc_page_pos >= cdc_upload_size) {
                uint32_t write_addr = CDC_SCRIPT_OFFSET + SCRIPT_HEADER_SECTOR + cdc_upload_offset;
                uint32_t sector_addr = write_addr & ~(FLASH_SECTOR_SIZE - 1);

                if (sector_addr != cdc_erased_sector) {
                    flash_raw_erase(sector_addr, FLASH_SECTOR_SIZE);
                    cdc_erased_sector = sector_addr;
                }

                uint32_t wlen = cdc_page_pos;
                if (wlen < 256) memset(cdc_page_buf + wlen, 0xFF, 256 - wlen);
                flash_raw_program(write_addr, cdc_page_buf, 256);
                cdc_upload_offset += wlen;
                cdc_page_pos = 0;

                if (cdc_upload_offset >= cdc_upload_size) cdc_uploading = false;
            }
            continue;
        }
        if (buf[i] == '\n' || buf[i] == '\r') { if (cdc_cmd_len > 0) { cdc_cmd_buf[cdc_cmd_len] = '\0'; cdc_process_cmd((const char*)cdc_cmd_buf); cdc_cmd_len = 0; } }
        else if (cdc_cmd_len < sizeof(cdc_cmd_buf) - 1) cdc_cmd_buf[cdc_cmd_len++] = buf[i];
    }
}

// ==== MSC ====
void tud_msc_capacity_cb(uint8_t lun, uint32_t* block_count, uint16_t* block_size) { (void)lun; *block_count = DISK_SECTOR_COUNT; *block_size = DISK_SECTOR_SIZE; }
int32_t tud_msc_read10_cb(uint8_t lun, uint32_t lba, uint32_t offset, void* buffer, uint32_t bufsize) { (void)lun; return msc_disk_read(lba, offset, buffer, bufsize); }
int32_t tud_msc_write10_cb(uint8_t lun, uint32_t lba, uint32_t offset, uint8_t* buffer, uint32_t bufsize) { (void)lun; return msc_disk_write(lba, offset, buffer, bufsize); }
void tud_msc_inquiry_cb(uint8_t lun, uint8_t vid[8], uint8_t pid[16], uint8_t rev[4]) { (void)lun; memcpy(vid, "NS AUTO ", 8); memcpy(pid, "Script Disk     ", 16); memcpy(rev, "1.0 ", 4); }
bool tud_msc_test_unit_ready_cb(uint8_t lun) { (void)lun; return true; }
bool tud_msc_start_stop_cb(uint8_t lun, uint8_t power, bool start, bool eject) { (void)lun; (void)power; (void)start; (void)eject; return true; }
int32_t tud_msc_scsi_cb(uint8_t lun, uint8_t const scsi_cmd[16], void* buffer, uint16_t bufsize) {
    // Override default TinyUSB SCSI handler �?all commands are dispatched here.
    // READ10/WRITE10 are handled explicitly (TinyUSB default is not used).
    (void)lun; uint8_t* buf = (uint8_t*)buffer;
    switch (scsi_cmd[0]) {
    case 0x00: return tud_msc_test_unit_ready_cb(lun) ? 0 : -1;
    case 0x12: { uint8_t v[8],p[16],r[4]; tud_msc_inquiry_cb(lun,v,p,r); memset(buf,0,36); buf[0]=0x00;buf[1]=0x80;buf[2]=0x04;buf[3]=0x02;buf[4]=31; memcpy(buf+8,v,8);memcpy(buf+16,p,16);memcpy(buf+32,r,4); return 36; }
    case 0x1B: return 0;
    case 0x1E: return 0;
    case 0x25: { uint32_t bc; uint16_t bs; tud_msc_capacity_cb(lun,&bc,&bs); uint32_t lba=bc-1; buf[0]=lba>>24;buf[1]=lba>>16;buf[2]=lba>>8;buf[3]=lba; buf[4]=bs>>24;buf[5]=bs>>16;buf[6]=bs>>8;buf[7]=bs; return 8; }
    case 0x28:{ /* READ10 �?block-aligned, offset always 0 */ uint32_t lba=((uint32_t)scsi_cmd[2]<<24)|((uint32_t)scsi_cmd[3]<<16)|((uint32_t)scsi_cmd[4]<<8)|scsi_cmd[5]; return tud_msc_read10_cb(lun,lba,0,buf,bufsize); }
    case 0x2A:{ /* WRITE10 �?block-aligned, offset always 0 */ uint32_t lba=((uint32_t)scsi_cmd[2]<<24)|((uint32_t)scsi_cmd[3]<<16)|((uint32_t)scsi_cmd[4]<<8)|scsi_cmd[5]; return tud_msc_write10_cb(lun,lba,0,buf,bufsize); }
    case 0x03: memset(buf,0,18); buf[0]=0x70; buf[7]=10; return 18;
    default: return -1;
    }
}

// ==== USB lifecycle ====
void tud_mount_cb(void) { }
void tud_umount_cb(void) { watchdog_reboot(0, 0, 10); while(1); }

// ==== Core 1: LED ====
void core1_task(void) {
    gpio_init(PICO_DEFAULT_LED_PIN); gpio_set_dir(PICO_DEFAULT_LED_PIN, GPIO_OUT);
    uint8_t c = 0;
    while (1) {
        if (current_mode == MODE_CDC_MSC) {
            gpio_put(PICO_DEFAULT_LED_PIN, 1);
        } else if (script_running) {
            gpio_put(PICO_DEFAULT_LED_PIN, (c & 0x04) ? 1 : 0);
        } else {
            gpio_put(PICO_DEFAULT_LED_PIN, (c & 0x10) ? 1 : 0);
        }
        c++; sleep_ms(50);
    }
}

// ==== Main ====
int main(void) {
    stdio_init_all();

    // Init MSC partition (auto-format on first boot)
    msc_disk_init();

    // FS ready �?quick double flash
    {
        gpio_init(PICO_DEFAULT_LED_PIN);
        gpio_set_dir(PICO_DEFAULT_LED_PIN, GPIO_OUT);
        gpio_put(PICO_DEFAULT_LED_PIN, 1); sleep_ms(80);
        gpio_put(PICO_DEFAULT_LED_PIN, 0); sleep_ms(80);
        gpio_put(PICO_DEFAULT_LED_PIN, 1); sleep_ms(80);
        gpio_put(PICO_DEFAULT_LED_PIN, 0); sleep_ms(120);
    }

    // 1. BOOTSEL模式检�?(RAM)
    current_mode = detect_mode();
    if (current_mode == MODE_NONE) {
        while (1) { __wfi(); }
    }

    // Flash LED to confirm mode: 1=HID_CDC, 2=HID_MSC, 3=CDC_MSC
    {
        int flashes = (current_mode == MODE_CDC_MSC) ? 3 : (current_mode == MODE_HID_MSC) ? 2 : 1;
        for (int i = 0; i < flashes; i++) {
            gpio_put(PICO_DEFAULT_LED_PIN, 1); sleep_ms(100);
            gpio_put(PICO_DEFAULT_LED_PIN, 0); sleep_ms(200);
        }
    }

    multicore_launch_core1(core1_task);
    flash_store_init();
    add_repeating_timer_ms(1, ms_timer_callback, NULL, &_ms_timer);

    reset_hid_report();
    script_engine_init(&engine, apply_report, get_ms, script_ram, SCRIPT_SEGMENT_MAX_SIZE);

    // 2. 加载脚本
    if (current_mode == MODE_HID_CDC && cdc_script_has_valid()) {
        script_engine_load(&engine, cdc_script_get_ptr(), cdc_script_get_size());
    } else if (current_mode == MODE_HID_MSC && msc_script_has_valid()) {
        engine.body_in_ram = true;
        script_engine_load(&engine, msc_script_get_ptr(), msc_script_get_size());
    }
    // MODE_CDC_MSC: no script loaded �?just PC communication

    // 3. 启动 USB
    tusb_init();

    const uint32_t tick_us = 16667;
    uint32_t next_tick = time_us_32() + tick_us;
    uint32_t auto_start_delay = 0;

    // 4. 主循�?
    while (1) {
        tud_task();
        hid_task();

        // Runtime BOOTSEL long-press �?reboot to re-enter mode selection
        if (check_bootsel_long_press()) {
            watchdog_reboot(0, 0, 10);
            while (1);
        }

        uint32_t now = time_us_32();
        if (time_reached(next_tick)) {
            next_tick += tick_us;
            if (script_running) {
                if (!script_engine_tick(&engine)) { script_running = false; reset_hid_report(); }
            }
            if (hid_connected && !script_running && (current_mode != MODE_CDC_MSC)) {
                if (auto_start_delay == 0) auto_start_delay = 60;
                else { auto_start_delay--;
                    if (auto_start_delay == 0) { script_engine_start(&engine); script_running = true; }
                }
            } else if (!hid_connected) { auto_start_delay = 0; }
        }
    }
}
