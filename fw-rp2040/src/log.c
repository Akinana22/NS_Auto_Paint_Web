/** 日志系统实现 */
#include "log.h"
#include "lfs_config.h"
#include "pico/stdlib.h"
#include <string.h>
#include <stdio.h>

void log_init(void) {
    lfs_init();
}

void log_event(uint8_t mode) {
    log_entry_t entry;
    entry.timestamp = time_us_32();
    entry.mode = mode;

    lfs_file_t file;
    int err = lfs_file_open(&lfs, &file, "log.bin", LFS_O_WRONLY | LFS_O_CREAT | LFS_O_APPEND);
    if (err < 0) return;
    lfs_file_write(&lfs, &file, &entry, sizeof(entry));
    lfs_file_close(&lfs, &file);
}
