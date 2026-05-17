/**
 * 微型 FAT12 RAM 磁盘实现 — 启动时自动格式化
 */
#include "msc_disk.h"
#include "flash_store.h"
#include <string.h>

uint8_t msc_disk_buf[DISK_TOTAL_SIZE];

// ---- FAT12 Layout ----
// Sectors: 0=boot, 1=FAT1, 2=FAT2, 3-6=rootdir, 7+ = data
#define FAT1_SECTOR      1
#define ROOTDIR_SECTOR   3
#define DATA_SECTOR      7
#define ROOTDIR_ENTRIES  64
#define ROOTDIR_SIZE_SECTORS 4

static bool written = false;

static void put_u16(void* p, uint16_t v) {
    uint8_t* b = (uint8_t*)p;
    b[0] = v & 0xFF;
    b[1] = (v >> 8) & 0xFF;
}

static void put_u32(void* p, uint32_t v) {
    uint8_t* b = (uint8_t*)p;
    b[0] = v & 0xFF; b[1] = (v >> 8) & 0xFF;
    b[2] = (v >> 16) & 0xFF; b[3] = (v >> 24) & 0xFF;
}

static void write_boot_sector(void) {
    uint8_t* b = msc_disk_buf;
    memset(b, 0, DISK_SECTOR_SIZE);

    b[0] = 0xEB; b[1] = 0x3C; b[2] = 0x90;    // jmp
    memcpy(b + 3, "NS_AUTO ", 8);                // OEM
    put_u16(b + 11, DISK_SECTOR_SIZE);           // bytes per sector
    b[13] = 1;                                    // sectors per cluster
    put_u16(b + 14, 1);                           // reserved sectors
    b[16] = 2;                                    // FAT copies
    put_u16(b + 17, ROOTDIR_ENTRIES);            // root entries
    put_u16(b + 19, DISK_SECTOR_COUNT);          // total sectors
    b[21] = 0xF8;                                 // media descriptor
    put_u16(b + 22, 1);                          // sectors per FAT
    // ... skip rest (not needed by host)
    b[510] = 0x55; b[511] = 0xAA;                // boot signature
}

static void write_fat(void) {
    // FAT sector: initial entries
    memset(msc_disk_buf + FAT1_SECTOR * DISK_SECTOR_SIZE, 0, DISK_SECTOR_SIZE);
    memset(msc_disk_buf + 2 * DISK_SECTOR_SIZE, 0, DISK_SECTOR_SIZE);
    // Cluster 0: 0xF0 FF FF (media + bad cluster marker)
    msc_disk_buf[FAT1_SECTOR * DISK_SECTOR_SIZE] = 0xF0;
    msc_disk_buf[FAT1_SECTOR * DISK_SECTOR_SIZE + 1] = 0xFF;
    msc_disk_buf[FAT1_SECTOR * DISK_SECTOR_SIZE + 2] = 0xFF;
    // Copy to FAT2
    memcpy(msc_disk_buf + 2 * DISK_SECTOR_SIZE,
           msc_disk_buf + FAT1_SECTOR * DISK_SECTOR_SIZE, DISK_SECTOR_SIZE);
}

static void write_readme(void) {
    // Write README.TXT in root directory
    uint8_t* root = msc_disk_buf + ROOTDIR_SECTOR * DISK_SECTOR_SIZE;
    memset(root, 0, ROOTDIR_SIZE_SECTORS * DISK_SECTOR_SIZE);

    // README.TXT entry (first entry)
    const char* name = "README  TXT";
    memcpy(root, name, 11);
    root[11] = 0x20; // archive attribute
    root[12] = 0x00; // reserved
    // Time/date: set to empty
    put_u16(root + 14, 0);  // time
    put_u16(root + 16, 0);  // date
    put_u16(root + 18, 0);  // start cluster
    put_u32(root + 20, 0);  // size = 0

    // Volume label entry
    uint8_t* vol = root + 32;
    memcpy(vol, "NS_SCRIPT   ", 11);
    vol[11] = 0x08; // volume label attribute
}

void msc_disk_init(void) {
    memset(msc_disk_buf, 0, DISK_TOTAL_SIZE);
    write_boot_sector();
    write_fat();
    write_readme();
    written = false;
}

void msc_disk_read(uint32_t lba, uint8_t* buf, uint32_t count) {
    if (lba + count > DISK_SECTOR_COUNT) return;
    memcpy(buf, msc_disk_buf + lba * DISK_SECTOR_SIZE, count * DISK_SECTOR_SIZE);
}

bool msc_disk_write(uint32_t lba, const uint8_t* buf, uint32_t count) {
    if (lba + count > DISK_SECTOR_COUNT) return false;
    memcpy(msc_disk_buf + lba * DISK_SECTOR_SIZE, buf, count * DISK_SECTOR_SIZE);
    written = true;
    return true;
}

void msc_disk_eject(void) {
    if (!written) return;

    // Scan root directory for a .BIN file
    const uint8_t* root = msc_disk_buf + ROOTDIR_SECTOR * DISK_SECTOR_SIZE;
    for (int i = 0; i < ROOTDIR_ENTRIES; i++) {
        const uint8_t* entry = root + i * 32;
        if (entry[0] == 0x00 || entry[0] == 0xE5) continue;
        if (entry[11] & 0x08) continue; // skip volume label

        // Check extension is BIN
        if (memcmp(entry + 8, "BIN", 3) != 0) continue;

        uint32_t size = (uint32_t)entry[28] | ((uint32_t)entry[29] << 8)
                      | ((uint32_t)entry[30] << 16) | ((uint32_t)entry[31] << 24);
        if (size == 0 || size > FLASH_SCRIPT_MAX_SIZE) continue;

        uint16_t start_cluster = (uint16_t)entry[26] | ((uint16_t)entry[27] << 8);
        if (start_cluster < 2) continue;

        // Read file data from data area
        // Simple: contiguous read (no FAT chain walking for simplicity)
        uint32_t first_sector = DATA_SECTOR + (start_cluster - 2);
        const uint8_t* data = msc_disk_buf + first_sector * DISK_SECTOR_SIZE;

        // Write to flash with CRC32
        uint32_t crc = flash_store_crc32(data, size);
        flash_store_write_script(data, size, crc);
        break;
    }

    written = false;
}
