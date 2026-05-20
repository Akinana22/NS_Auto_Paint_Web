/** MSC 块设备实现 — 直读直写 MSC 脚本分区 Flash */
#include "msc_disk.h"
#include "pico/stdlib.h"
#include "flash_store.h"
#include "hardware/flash.h"
#include "hardware/sync.h"
#include <string.h>

void msc_disk_init(void) { /* no init needed — host manages FAT */ }

int32_t msc_disk_read(uint32_t lba, uint32_t offset, void* buffer, uint32_t bufsize)
{
    uint32_t addr = MSC_SCRIPT_OFFSET + lba * DISK_SECTOR_SIZE + offset;
    memcpy(buffer, (const uint8_t*)(XIP_BASE + addr), bufsize);
    return (int32_t)bufsize;
}

int32_t __not_in_flash_func(msc_disk_write)(uint32_t lba, uint32_t offset, const uint8_t* buffer, uint32_t bufsize)
{
    uint32_t addr = MSC_SCRIPT_OFFSET + lba * DISK_SECTOR_SIZE + offset;
    uint32_t ints = save_and_disable_interrupts();
    flash_range_erase(addr, (bufsize + FLASH_SECTOR_SIZE - 1) & ~(FLASH_SECTOR_SIZE - 1));
    flash_range_program(addr, buffer, bufsize);
    restore_interrupts(ints);
    return (int32_t)bufsize;
}
