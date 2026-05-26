/** MSC 块设备实现 — 直读直写 MSC 脚本分区 Flash
 *
 * Write uses sector-level Read-Modify-Write to preserve adjacent FAT data.
 * Auto-formats the partition as FAT12 on first boot (volume label "NSAUTO").
 */
#include "msc_disk.h"
#include "pico/stdlib.h"
#include "flash_store.h"
#include "hardware/flash.h"
#include <string.h>

static void _format_fat12(void)
{
    uint8_t boot[512];
    memset(boot, 0, sizeof(boot));

    // BPB
    boot[0]=0xEB; boot[1]=0x3C; boot[2]=0x90;
    memcpy(boot+3, "NSAUTO  ", 8);
    boot[11]=0x00; boot[12]=0x02; // 512 bytes/sector
    boot[13]=1;                    // 1 sector/cluster
    boot[14]=1; boot[15]=0;       // 1 reserved sector
    boot[16]=2;                    // 2 FATs
    boot[17]=0x00; boot[18]=0x02; // 512 root entries
    boot[19]=0x00; boot[20]=0x04; // 1024 sectors (16-bit)
    boot[21]=0xF8;                 // media descriptor
    boot[22]=3; boot[23]=0;       // 3 sectors/FAT
    boot[24]=0x3F; boot[25]=0;    // 63 sectors/track
    boot[26]=0xFF; boot[27]=0;    // 255 heads
    // hidden sectors = 0
    // total sectors 32-bit = 0 (using 16-bit field)
    boot[36]=0x80;                 // drive number
    boot[38]=0x29;                 // extended boot signature
    boot[39]=0x78; boot[40]=0x56; boot[41]=0x34; boot[42]=0x12; // serial
    memcpy(boot+43, "NSAUTO     ", 11);  // volume label
    memcpy(boot+54, "FAT12   ", 8);       // FS type
    boot[510]=0x55; boot[511]=0xAA;

    flash_raw_erase(MSC_SCRIPT_OFFSET, FLASH_SECTOR_SIZE);
    flash_raw_program(MSC_SCRIPT_OFFSET, boot, FLASH_SECTOR_SIZE);

    // FAT1 + FAT2: first 3 bytes = 0xF0 0xFF 0xFF, rest zeros
    uint8_t fat[FLASH_SECTOR_SIZE];
    memset(fat, 0, sizeof(fat));
    fat[0]=0xF0; fat[1]=0xFF; fat[2]=0xFF;
    uint32_t fat_base = MSC_SCRIPT_OFFSET + 512;
    flash_raw_erase(fat_base, FLASH_SECTOR_SIZE);
    flash_raw_program(fat_base, fat, FLASH_SECTOR_SIZE);
    // FAT2 copy (3 sectors later = offset 3*512 from fat_base)
    uint32_t fat2_base = fat_base + 3 * 512;
    flash_raw_erase(fat2_base, FLASH_SECTOR_SIZE);
    flash_raw_program(fat2_base, fat, FLASH_SECTOR_SIZE);
}

void msc_disk_init(void)
{
    // Auto-format if partition is blank (first byte 0xFF)
    uint8_t first = *(const uint8_t*)(XIP_BASE + MSC_SCRIPT_OFFSET);
    if (first == 0xFF) _format_fat12();
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
