/** FAT16 精简读取器实现 */
#include "fat_reader.h"
#include "pico/stdlib.h"
#include "proto.h"
#include <string.h>

#define DISK_OFFSET MSC_SCRIPT_OFFSET
#define DISK_SIZE   MSC_SCRIPT_SIZE
#define SECTOR_SIZE 512

static void _read_sector(uint32_t sector, uint8_t* buf)
{
    uint32_t addr = DISK_OFFSET + sector * SECTOR_SIZE;
    memcpy(buf, (const uint8_t*)(XIP_BASE + addr), SECTOR_SIZE);
}

void fat_init(fat_mount_t* fs) { memset(fs, 0, sizeof(*fs)); }

bool fat_mount(fat_mount_t* fs)
{
    uint8_t boot[512];
    _read_sector(0, boot);
    if (boot[510] != 0x55 || boot[511] != 0xAA) return false;
    if (boot[11] != SECTOR_SIZE || (boot[11] << 8 | boot[12]) != SECTOR_SIZE) return false;

    uint16_t reserved = boot[14] | ((uint16_t)boot[15] << 8);
    uint8_t  num_fats = boot[16];
    uint16_t root_entries = boot[17] | ((uint16_t)boot[18] << 8);
    uint16_t sec_per_fat = boot[22] | ((uint16_t)boot[23] << 8);
    uint8_t  sec_per_cluster = boot[13];

    fs->fat_start    = reserved;
    fs->dir_start    = reserved + num_fats * sec_per_fat;
    fs->data_start   = fs->dir_start + (root_entries * 32) / SECTOR_SIZE;
    fs->root_entries = root_entries;
    fs->sec_per_cluster = sec_per_cluster;
    fs->mounted      = true;
    return true;
}

static bool _name_match(const uint8_t* entry, const char* name)
{
    char fname[13];
    memset(fname, 0, sizeof(fname));
    uint8_t j = 0;
    for (uint8_t i = 0; i < 8 && entry[i] != 0x20; i++) {
        char c = entry[i];
        if (c >= 'a' && c <= 'z') c -= 32;
        fname[j++] = c;
    }
    if (entry[8] != 0x20) {
        fname[j++] = '.';
        for (uint8_t i = 8; i < 11 && entry[i] != 0x20; i++) {
            char c = entry[i];
            if (c >= 'a' && c <= 'z') c -= 32;
            fname[j++] = c;
        }
    }
    fname[j] = '\0';
    // case-insensitive compare
    const char* p = name;
    uint8_t k = 0;
    while (fname[k] && *p) {
        char a = fname[k]; if (a >= 'a' && a <= 'z') a -= 32;
        char b = *p; if (b >= 'a' && b <= 'z') b -= 32;
        if (a != b) return false;
        k++; p++;
    }
    return (fname[k] == '\0' && *p == '\0');
}

bool fat_find(fat_mount_t* fs, fat_file_t* file, const char* name)
{
    if (!fs->mounted) return false;
    uint8_t sec[512];
    for (uint16_t i = 0; i < fs->root_entries; i++) {
        if ((i % 16) == 0) _read_sector(fs->dir_start + i / 16, sec);
        const uint8_t* e = &sec[(i % 16) * 32];
        if (e[0] == 0x00) break;
        if (e[0] == 0xE5) continue;
        if (e[11] & 0x08) continue;
        if (e[11] & 0x10) continue;
        if (_name_match(e, name)) {
            file->fs = fs;
            file->size = e[28] | ((uint32_t)e[29] << 8) | ((uint32_t)e[30] << 16) | ((uint32_t)e[31] << 24);
            file->start_cluster = e[26] | ((uint16_t)e[27] << 8);
            file->open = true;
            return true;
        }
    }
    return false;
}

static uint16_t _next_cluster(fat_mount_t* fs, uint16_t cluster)
{
    uint8_t fat[512];
    uint32_t fat_sector = fs->fat_start + (cluster * 2) / SECTOR_SIZE;
    _read_sector(fat_sector, fat);
    return fat[(cluster * 2) % SECTOR_SIZE] | ((uint16_t)fat[(cluster * 2 + 1) % SECTOR_SIZE] << 8);
}

bool fat_read(fat_mount_t* fs, fat_file_t* file, uint8_t* buf, uint32_t size)
{
    if (!file->open || size > file->size) return false;
    uint16_t cluster = file->start_cluster;
    uint32_t offset = 0;

    while (offset < size) {
        uint32_t data_sector = fs->data_start + (cluster - 2) * fs->sec_per_cluster;
        for (uint8_t s = 0; s < fs->sec_per_cluster && offset < size; s++) {
            uint8_t sec[512];
            _read_sector(data_sector + s, sec);
            uint32_t chunk = size - offset;
            if (chunk > 512) chunk = 512;
            memcpy(buf + offset, sec, chunk);
            offset += chunk;
        }
        if (offset >= size) break;
        cluster = _next_cluster(fs, cluster);
        if (cluster >= 0xFFF8) break; // end of chain or bad cluster
    }
    return true;
}

bool fat_file_size(fat_mount_t* fs, fat_file_t* file, uint32_t* size)
{
    (void)fs;
    if (!file->open) return false;
    *size = file->size;
    return true;
}
