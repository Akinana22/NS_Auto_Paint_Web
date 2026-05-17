/**
 * Flash 存储实现 — 使用 RP2040 flash API
 */
#include "flash_store.h"
#include "hardware/flash.h"
#include "hardware/sync.h"
#include <string.h>
#include <stdio.h>

// The script storage is in the last portion of flash
// RP2040 has 2MB flash: 0x10000000 to 0x10200000
// We reserve the last 512KB for script storage: 0x10180000 to 0x10200000
// (1.5MB for firmware, 512KB for scripts)
#define SCRIPT_FLASH_OFFSET FLASH_SCRIPT_OFFSET

static bool has_script = false;
static uint32_t script_size = 0;
static script_header_t cached_header;

static uint32_t _crc32_table[256];
static bool _crc_table_ready = false;

static void _build_crc32_table(void) {
    for (uint32_t i = 0; i < 256; i++) {
        uint32_t crc = i;
        for (int j = 0; j < 8; j++) {
            crc = (crc >> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
        _crc32_table[i] = crc;
    }
    _crc_table_ready = true;
}

uint32_t flash_store_crc32(const uint8_t* data, uint32_t len) {
    if (!_crc_table_ready) _build_crc32_table();
    uint32_t crc = 0xFFFFFFFF;
    for (uint32_t i = 0; i < len; i++) {
        crc = _crc32_table[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
    }
    return crc ^ 0xFFFFFFFF;
}

static void _read_header(void) {
    const uint8_t* flash_addr = (const uint8_t*)(XIP_BASE + SCRIPT_FLASH_OFFSET);
    memcpy(&cached_header, flash_addr, sizeof(script_header_t));
}

void flash_store_init(void) {
    _read_header();

    if (cached_header.magic != SCRIPT_MAGIC) {
        has_script = false;
        script_size = 0;
        return;
    }

    // Validate size
    if (cached_header.size > FLASH_SCRIPT_MAX_SIZE) {
        has_script = false;
        script_size = 0;
        return;
    }

    // Validate checksum
    const uint8_t* script_data = (const uint8_t*)(XIP_BASE + SCRIPT_FLASH_OFFSET + SCRIPT_HEADER_SIZE);
    uint32_t calc_crc = flash_store_crc32(script_data, cached_header.size);
    if (calc_crc != cached_header.checksum) {
        has_script = false;
        script_size = 0;
        return;
    }

    has_script = true;
    script_size = cached_header.size;
}

bool flash_store_has_script(void) { return has_script; }

const uint8_t* flash_store_get_script_ptr(void) {
    return (const uint8_t*)(XIP_BASE + SCRIPT_FLASH_OFFSET + SCRIPT_HEADER_SIZE);
}

uint32_t flash_store_get_script_size(void) { return script_size; }

const script_header_t* flash_store_get_header(void) {
    return &cached_header;
}

bool flash_store_write_script(const uint8_t* data, uint32_t size, uint32_t checksum) {
    if (size > FLASH_SCRIPT_MAX_SIZE) return false;

    // Prepare header
    script_header_t header;
    header.magic = SCRIPT_MAGIC;
    header.version = 1;
    header.size = size;
    header.checksum = checksum;
    header.frameCount = 0;
    header.estimatedMs = 0;

    uint32_t total_size = SCRIPT_HEADER_SIZE + size;
    // Round up to 256-byte boundary (minimum erase unit)
    uint32_t flash_size = (total_size + 255) & ~255;
    if (flash_size < FLASH_PAGE_SIZE) flash_size = FLASH_PAGE_SIZE;

    // Prepare write buffer
    // (allocate on stack — careful with size, keep script writes small or use heap)
    uint8_t buffer[4096]; // 4KB buffer, enough for header + reasonable script chunks
    if (total_size > sizeof(buffer)) {
        // Script too large for single buffer — use streaming write
        // For simplicity, limit to 4KB initially
        return false;
    }

    memset(buffer, 0xFF, flash_size);
    memcpy(buffer, &header, sizeof(script_header_t));
    memcpy(buffer + SCRIPT_HEADER_SIZE, data, size);

    // Erase and write
    uint32_t status = save_and_disable_interrupts();
    flash_range_erase(SCRIPT_FLASH_OFFSET, flash_size);
    flash_range_program(SCRIPT_FLASH_OFFSET, buffer, flash_size);
    restore_interrupts(status);

    // Re-read and verify
    _read_header();
    if (cached_header.magic != SCRIPT_MAGIC || cached_header.checksum != checksum) {
        has_script = false;
        return false;
    }

    has_script = true;
    script_size = size;
    return true;
}

void flash_store_erase(void) {
    uint32_t status = save_and_disable_interrupts();
    flash_range_erase(SCRIPT_FLASH_OFFSET, FLASH_SECTOR_SIZE);
    restore_interrupts(status);
    has_script = false;
    script_size = 0;
}
