/** MSC 块设备 — 直接映射到 MSC 脚本分区 Flash */
#ifndef MSC_DISK_H
#define MSC_DISK_H

#include <stdint.h>
#include "proto.h"

#define DISK_SECTOR_SIZE   512
#define DISK_SECTOR_COUNT  MSC_SCRIPT_SECTORS

#ifdef __cplusplus
extern "C" {
#endif

void    msc_disk_init(void);
int32_t msc_disk_read(uint32_t lba, uint32_t offset, void* buffer, uint32_t bufsize);
int32_t msc_disk_write(uint32_t lba, uint32_t offset, const uint8_t* buffer, uint32_t bufsize);

#ifdef __cplusplus
}
#endif

#endif
