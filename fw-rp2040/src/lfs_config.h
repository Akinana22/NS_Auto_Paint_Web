/** LittleFS Flash 后端配置 — 日志分区 */
#ifndef LFS_CONFIG_H
#define LFS_CONFIG_H

#include "lfs.h"
#include "proto.h"

#ifdef __cplusplus
extern "C" {
#endif

extern const struct lfs_config lfs_cfg;
extern lfs_t lfs;

void lfs_init(void);

#ifdef __cplusplus
}
#endif

#endif
