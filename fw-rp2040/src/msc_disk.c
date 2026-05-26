/** MSC 块设备实现 — 直读直写 MSC 脚本分区 Flash
 *
 * Write uses sector-level Read-Modify-Write to preserve adjacent FAT data.
 * Auto-formats the partition as FAT12 on first boot (volume label "NSAUTO").
 */
#include "msc_disk.h"
#include "pico/stdlib.h"
#include "flash_store.h"
#include "hardware/flash.h"
#include "hardware/structs/xip_ctrl.h"
#include <string.h>

static void _format_fat12(void)
{
    // Full erase MSC partition to clean any corrupted data (128 sectors)
    for (uint32_t off = MSC_SCRIPT_OFFSET; off < MSC_SCRIPT_OFFSET + MSC_SCRIPT_SIZE; off += FLASH_SECTOR_SIZE) {
        flash_raw_erase(off, FLASH_SECTOR_SIZE);
    }

    static uint8_t buf[FLASH_SECTOR_SIZE]; // 4096 B
    memset(buf, 0, sizeof(buf));

    // Sector 0: Boot (0x000-0x1FF)
    buf[0]=0xEB; buf[1]=0x3C; buf[2]=0x90;
    memcpy(buf+3, "NSAUTO  ", 8);
    buf[11]=0x00; buf[12]=0x02;   // 512 bytes/sector
    buf[13]=1;                     // 1 sector/cluster
    buf[14]=1; buf[15]=0;         // 1 reserved sector
    buf[16]=2;                     // 2 FATs
    buf[17]=0x00; buf[18]=0x02;   // 512 root entries
    buf[19]=0x00; buf[20]=0x04;   // 1024 sectors
    buf[21]=0xF8;                  // media descriptor
    buf[22]=3; buf[23]=0;         // 3 sectors/FAT
    buf[24]=0x3F; buf[25]=0;      // 63 sectors/track
    buf[26]=0xFF; buf[27]=0;      // 255 heads
    buf[36]=0x80;                  // drive number
    buf[38]=0x29;                  // extended boot signature
    buf[39]=0x78; buf[40]=0x56; buf[41]=0x34; buf[42]=0x12;
    memcpy(buf+43, "NSAUTO     ", 11);
    memcpy(buf+54, "FAT12   ", 8);
    buf[510]=0x55; buf[511]=0xAA;

    // Sector 1-3: FAT1 at buf+0x200 (3*512=1536 B)
    buf[0x200]=0xF0; buf[0x201]=0xFF; buf[0x202]=0xFF;

    // Sector 4-6: FAT2 at buf+0x800 (3*512=1536 B)
    buf[0x800]=0xF0; buf[0x801]=0xFF; buf[0x802]=0xFF;

    // Sector 7: root dir start at buf+0xE00 → already 0x00 (empty)

    // Write boot + FAT1 + FAT2 + root-dir[0] in one 4KB-aligned write
    flash_raw_erase(MSC_SCRIPT_OFFSET, FLASH_SECTOR_SIZE);
    flash_raw_program(MSC_SCRIPT_OFFSET, buf, FLASH_SECTOR_SIZE);

    // Zero root dir sectors 8-38 + first data sector 39 (4 flash sectors)
    memset(buf, 0, sizeof(buf));
    for (int i = 1; i <= 4; i++) {
        uint32_t off = MSC_SCRIPT_OFFSET + i * FLASH_SECTOR_SIZE;
        flash_raw_erase(off, FLASH_SECTOR_SIZE);
        flash_raw_program(off, buf, FLASH_SECTOR_SIZE);
    }

    // Flush XIP cache so subsequent XIP reads see the new data
    xip_ctrl_hw->flush = 1;
    while (xip_ctrl_hw->flush) tight_loop_contents();
}

void msc_disk_init(void)
{
    // Auto-format if no valid FAT boot signature
    uint16_t sig = *(const uint16_t*)(XIP_BASE + MSC_SCRIPT_OFFSET + 510);
    if (sig != 0xAA55) _format_fat12();
}

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

    static uint8_t sec_buf[FLASH_SECTOR_SIZE];
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
