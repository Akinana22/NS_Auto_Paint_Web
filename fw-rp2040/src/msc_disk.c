/** MSC 块设备实现 — 直读直写 MSC 脚本分区 Flash
 *
 * Write uses sector-level Read-Modify-Write to preserve adjacent FAT data.
 * Uses flash_raw_erase/program (multicore_lockout protected).
 */
#include "msc_disk.h"
#include "pico/stdlib.h"
#include "flash_store.h"
#include "hardware/flash.h"
#include <string.h>

void msc_disk_init(void) { /* no init needed — host manages FAT */ }

int32_t msc_disk_read(uint32_t lba, uint32_t offset, void* buffer, uint32_t bufsize)
{
    uint32_t addr = MSC_SCRIPT_OFFSET + lba * DISK_SECTOR_SIZE + offset;
    if (addr + bufsize > MSC_SCRIPT_OFFSET + MSC_SCRIPT_SIZE || addr < MSC_SCRIPT_OFFSET) return -1;
    memcpy(buffer, (const uint8_t*)(XIP_BASE + addr), bufsize);
    return (int32_t)bufsize;
}

int32_t __not_in_flash_func(msc_disk_write)(uint32_t lba, uint32_t offset, const uint8_t* buffer, uint32_t bufsize)
{
    uint32_t addr = MSC_SCRIPT_OFFSET + lba * DISK_SECTOR_SIZE + offset;
    if (addr + bufsize > MSC_SCRIPT_OFFSET + MSC_SCRIPT_SIZE || addr < MSC_SCRIPT_OFFSET) return -1;

    static uint8_t sec_buf[FLASH_SECTOR_SIZE]; // 4096 B, BSS
    uint32_t cur_off = 0;
    while (cur_off < bufsize) {
        uint32_t this_addr = addr + cur_off;
        uint32_t sector_addr = this_addr & ~(FLASH_SECTOR_SIZE - 1);
        uint32_t sec_off = this_addr - sector_addr;
        uint32_t chunk = FLASH_SECTOR_SIZE - sec_off;
        if (chunk > bufsize - cur_off) chunk = bufsize - cur_off;

        memcpy(sec_buf, (const uint8_t*)(XIP_BASE + sector_addr), FLASH_SECTOR_SIZE);
        memcpy(sec_buf + sec_off, buffer + cur_off, chunk);

        flash_raw_erase(sector_addr, FLASH_SECTOR_SIZE);
        flash_raw_program(sector_addr, sec_buf, FLASH_SECTOR_SIZE);

        cur_off += chunk;
    }
    return (int32_t)bufsize;
}
