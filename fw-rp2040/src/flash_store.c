/** Flash 存储实现 — 5区布局 + XIP 读取 + 擦写保护 */
#include "flash_store.h"
#include "pico/stdlib.h"
#include "hardware/flash.h"
#include "hardware/sync.h"
#include <string.h>
#include <stdio.h>

// ============ CRC32 table ============
static uint32_t _crc32_table[256];
static bool _crc_ready = false;

static void _build_crc32(void)
{
    for (uint32_t i = 0; i < 256; i++) {
        uint32_t crc = i;
        for (int j = 0; j < 8; j++)
            crc = (crc >> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        _crc32_table[i] = crc;
    }
    _crc_ready = true;
}

uint32_t flash_store_crc32(const uint8_t* data, uint32_t len)
{
    if (!_crc_ready) _build_crc32();
    uint32_t crc = 0xFFFFFFFF;
    for (uint32_t i = 0; i < len; i++)
        crc = _crc32_table[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
    return crc ^ 0xFFFFFFFF;
}

// ============ Raw Flash Access ============
void __not_in_flash_func(flash_raw_erase)(uint32_t offset, uint32_t len)
{
    uint32_t ints = save_and_disable_interrupts();
    flash_range_erase(offset, (len + FLASH_SECTOR_SIZE - 1) & ~(FLASH_SECTOR_SIZE - 1));
    restore_interrupts(ints);
}

void __not_in_flash_func(flash_raw_program)(uint32_t offset, const uint8_t* data, uint32_t len)
{
    uint32_t ints = save_and_disable_interrupts();
    flash_range_program(offset, data, len);
    restore_interrupts(ints);
}

void flash_raw_read(uint32_t offset, uint8_t* buf, uint32_t len)
{
    const uint8_t* src = (const uint8_t*)(XIP_BASE + offset);
    memcpy(buf, src, len);
}

// ============ CDC Script Partition ============

void flash_store_init(void) { /* header validation done per-partition on access */ }

static bool _validate_header(uint32_t offset, script_header_t* out)
{
    flash_raw_read(offset, (uint8_t*)out, sizeof(script_header_t));
    if (out->magic != SCRIPT_MAGIC) return false;
    if (out->size > CDC_SCRIPT_SIZE - SCRIPT_HEADER_SIZE) return false;

    uint8_t* body = (uint8_t*)(XIP_BASE + offset + SCRIPT_HEADER_SIZE);
    uint32_t calc = flash_store_crc32(body, out->size);
    return calc == out->checksum;
}

bool cdc_script_has_valid(void)
{
    script_header_t hdr;
    return _validate_header(CDC_SCRIPT_OFFSET, &hdr);
}

uint32_t cdc_script_get_size(void)
{
    script_header_t hdr;
    flash_raw_read(CDC_SCRIPT_OFFSET, (uint8_t*)&hdr, sizeof(hdr));
    return (hdr.magic == SCRIPT_MAGIC) ? hdr.size : 0;
}

const script_header_t* cdc_script_get_header(void)
{
    return (const script_header_t*)(XIP_BASE + CDC_SCRIPT_OFFSET);
}

const uint8_t* cdc_script_get_ptr(void)
{
    return (const uint8_t*)(XIP_BASE + CDC_SCRIPT_OFFSET + SCRIPT_HEADER_SIZE);
}

bool cdc_script_erase(void)
{
    flash_raw_erase(CDC_SCRIPT_OFFSET, FLASH_SECTOR_SIZE);
    return true;
}

bool cdc_script_write(const uint8_t* data, uint32_t size, uint32_t checksum)
{
    if (size > CDC_SCRIPT_SIZE - SCRIPT_HEADER_SIZE) return false;

    script_header_t hdr = { SCRIPT_MAGIC, 1, size, checksum, 0, 0 };
    uint32_t total = SCRIPT_HEADER_SIZE + size;

    uint8_t buf[32768];
    if (total > sizeof(buf)) return false;
    memset(buf, 0xFF, sizeof(buf));
    memcpy(buf, &hdr, SCRIPT_HEADER_SIZE);
    memcpy(buf + SCRIPT_HEADER_SIZE, data, size);

    flash_raw_erase(CDC_SCRIPT_OFFSET, total);
    flash_raw_program(CDC_SCRIPT_OFFSET, buf, total);
    return true;
}

// ============ MSC Script Partition ============

bool msc_script_has_valid(void)
{
    script_header_t hdr;
    return _validate_header(MSC_SCRIPT_OFFSET, &hdr);
}

uint32_t msc_script_get_size(void)
{
    script_header_t hdr;
    flash_raw_read(MSC_SCRIPT_OFFSET, (uint8_t*)&hdr, sizeof(hdr));
    return (hdr.magic == SCRIPT_MAGIC) ? hdr.size : 0;
}

const script_header_t* msc_script_get_header(void)
{
    return (const script_header_t*)(XIP_BASE + MSC_SCRIPT_OFFSET);
}

const uint8_t* msc_script_get_ptr(void)
{
    return (const uint8_t*)(XIP_BASE + MSC_SCRIPT_OFFSET + SCRIPT_HEADER_SIZE);
}

int32_t msc_script_read_sectors(uint32_t sector, uint32_t count, void* buf)
{
    if (sector + count > MSC_SCRIPT_SECTORS) return -1;
    uint32_t addr = MSC_SCRIPT_OFFSET + sector * 512;
    memcpy(buf, (const uint8_t*)(XIP_BASE + addr), count * 512);
    return (int32_t)(count * 512);
}

int32_t __not_in_flash_func(msc_script_write_sectors)(uint32_t sector, uint32_t count, const void* buf)
{
    if (sector + count > MSC_SCRIPT_SECTORS) return -1;
    uint32_t addr = MSC_SCRIPT_OFFSET + sector * 512;
    uint32_t len = count * 512;
    flash_raw_erase(addr, len);
    flash_raw_program(addr, (const uint8_t*)buf, len);
    return (int32_t)len;
}
