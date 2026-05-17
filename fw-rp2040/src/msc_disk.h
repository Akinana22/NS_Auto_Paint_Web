/**
 * 微型 FAT12 RAM 磁盘 — 用于 MSC (大容量存储) 脚本拖入
 *
 * 磁盘规格:
 *   总大小: 64KB (128 扇区 × 512B)
 *   文件系统: FAT12
 *   卷标: NS_SCRIPT
 *   根目录预置 README.txt
 *
 * 写入检测: 任何写入扇区的文件数据在 eject 后自动解析为脚本。
 */

#ifndef MSC_DISK_H
#define MSC_DISK_H

#include <stdint.h>
#include <stdbool.h>

#define DISK_SECTOR_SIZE    512
#define DISK_SECTOR_COUNT   128
#define DISK_TOTAL_SIZE     (DISK_SECTOR_SIZE * DISK_SECTOR_COUNT)

void msc_disk_init(void);
void msc_disk_read(uint32_t lba, uint8_t* buf, uint32_t count);
bool msc_disk_write(uint32_t lba, const uint8_t* buf, uint32_t count);
void msc_disk_eject(void);  // called when host ejects

// Extern for callbacks
extern uint8_t msc_disk_buf[DISK_TOTAL_SIZE];

#endif
