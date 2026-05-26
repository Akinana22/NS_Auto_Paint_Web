/** FAT16 精简读取器 — 在 MSC 分区根目录查找脚本文件并读取内容
 *
 * 不依赖 FatFs，仅实现 f_open/f_read/f_close 级别的功能。
 * 仅支持 FAT16，根目录最多 512 个条目。
 */
#ifndef FAT_READER_H
#define FAT_READER_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint32_t fat_start;    // FAT 表起始扇区
    uint32_t dir_start;    // 根目录起始扇区
    uint32_t data_start;   // 数据区起始扇区
    uint32_t root_entries; // 根目录条目数
    uint16_t sec_per_cluster;
    bool     mounted;
} fat_mount_t;

typedef struct {
    fat_mount_t* fs;
    uint32_t     size;
    uint32_t     start_cluster;
    bool         open;
} fat_file_t;

void fat_init(fat_mount_t* fs);
bool fat_mount(fat_mount_t* fs);
bool fat_find(fat_mount_t* fs, fat_file_t* file, const char* name);
bool fat_read(fat_mount_t* fs, fat_file_t* file, uint8_t* buf, uint32_t size);
bool fat_file_size(fat_mount_t* fs, fat_file_t* file, uint32_t* size);

#ifdef __cplusplus
}
#endif

#endif
