/** LittleFS Flash 后端实现 */
#include "lfs_config.h"
#include "pico/stdlib.h"
#include "flash_store.h"
#include <string.h>

static int _read(const struct lfs_config *c, lfs_block_t block, lfs_off_t off, void *buffer, lfs_size_t size) {
    uint32_t addr = LOG_OFFSET + block * c->block_size + off;
    flash_raw_read(addr, (uint8_t*)buffer, size);
    return 0;
}

static int __not_in_flash_func(_prog)(const struct lfs_config *c, lfs_block_t block, lfs_off_t off, const void *buffer, lfs_size_t size)
{
    uint32_t addr = LOG_OFFSET + block * c->block_size + off;
    flash_raw_program(addr, (const uint8_t*)buffer, size);
    return 0;
}

static int __not_in_flash_func(_erase)(const struct lfs_config *c, lfs_block_t block)
{
    flash_raw_erase(LOG_OFFSET + block * c->block_size, c->block_size);
    return 0;
}

static int _sync(const struct lfs_config *c) { (void)c; return 0; }

const struct lfs_config lfs_cfg = {
    .read           = _read,
    .prog           = _prog,
    .erase          = _erase,
    .sync           = _sync,
    .read_size      = 16,
    .prog_size      = 256,
    .block_size     = 4096,
    .block_count    = LOG_SIZE / 4096,
    .cache_size     = 512,
    .lookahead_size = 16,
    .block_cycles   = 500,
};

lfs_t lfs;

static bool lfs_ready = false;

void lfs_init(void) {
    int err = lfs_mount(&lfs, &lfs_cfg);
    if (err) {
        err = lfs_format(&lfs, &lfs_cfg);
        if (err >= 0) err = lfs_mount(&lfs, &lfs_cfg);
        if (err < 0) return;
    }
    lfs_ready = true;
}

bool lfs_is_ready(void) { return lfs_ready; }
