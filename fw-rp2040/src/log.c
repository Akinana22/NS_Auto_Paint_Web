/** 日志系统实现 */
#include "log.h"
#include "lfs_config.h"
#include "pico/stdlib.h"
#include <string.h>
#include <stdio.h>

#define LOG_MAX_SIZE (LOG_SIZE * 3 / 4) // ~192KB, rotate when 75% full

void log_init(void) {
    lfs_init();
}

void log_event(uint8_t mode) {
    if (!lfs_is_ready()) return;
    log_entry_t entry;
    entry.timestamp = time_us_32();
    entry.mode = mode;

    lfs_file_t file;
    int err = lfs_file_open(&lfs, &file, "log.bin", LFS_O_RDWR | LFS_O_CREAT | LFS_O_APPEND);
    if (err < 0) return;

    lfs_soff_t sz = lfs_file_seek(&lfs, &file, 0, LFS_SEEK_END);
    if (sz >= LOG_MAX_SIZE) {
        lfs_file_close(&lfs, &file);
        lfs_remove(&lfs, "log.bin");
        err = lfs_file_open(&lfs, &file, "log.bin", LFS_O_RDWR | LFS_O_CREAT | LFS_O_APPEND);
        if (err < 0) return;
    }

    lfs_file_write(&lfs, &file, &entry, sizeof(entry));
    lfs_file_close(&lfs, &file);
}
