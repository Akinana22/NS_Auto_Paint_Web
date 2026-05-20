/** MSC 块设备实现 — 直读直写 MSC 脚本分区 Flash */
#include "msc_disk.h"
#include "pico/stdlib.h"
#include "flash_store.h"
#include <string.h>

void msc_disk_init(void) { /* no init needed — host manages FAT */ }

int32_t msc_disk_read(uint32_t lba, uint32_t offset, void* buffer, uint32_t bufsize)
{
    (void)offset; // TinyUSB passes byte offset within block, we read full sectors
    return msc_script_read_sectors(lba, bufsize / DISK_SECTOR_SIZE, buffer);
}

int32_t __not_in_flash_func(msc_disk_write)(uint32_t lba, uint32_t offset, const uint8_t* buffer, uint32_t bufsize)
{
    (void)offset;
    return msc_script_write_sectors(lba, bufsize / DISK_SECTOR_SIZE, buffer);
}
