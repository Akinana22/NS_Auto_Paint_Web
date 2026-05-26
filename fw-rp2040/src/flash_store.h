/** Flash 存储 — 5区布局 (固件/备用/CDC脚本/MSC脚本/日志) */
#ifndef FLASH_STORE_H
#define FLASH_STORE_H

#include <stdint.h>
#include <stdbool.h>
#include "proto.h"

#ifdef __cplusplus
extern "C" {
#endif

// ---- Init ----
void flash_store_init(void);

// ---- CDC Script (raw binary partition) ----
bool     cdc_script_has_valid(void);
uint32_t cdc_script_get_size(void);
const script_header_t* cdc_script_get_header(void);
const uint8_t* cdc_script_get_ptr(void);
bool     cdc_script_erase(void);

// ---- MSC Script (FAT partition exposed to host) ----
// The host formats and manages this. We just provide read/write at sector level.
bool     msc_script_has_valid(void);
uint32_t msc_script_get_size(void);
const script_header_t* msc_script_get_header(void);
const uint8_t* msc_script_get_ptr(void);
int32_t  msc_script_read_sectors(uint32_t sector, uint32_t count, void* buf);
int32_t  msc_script_write_sectors(uint32_t sector, uint32_t count, const void* buf);

// ---- CRC32 ----
void     flash_store_crc32_init(void);
uint32_t flash_store_crc32(const uint8_t* data, uint32_t len);
uint32_t flash_store_crc32_stream_byte(uint32_t crc, uint8_t byte); // incremental, no final XOR

// ---- Low-level raw access ----
void flash_raw_erase(uint32_t offset, uint32_t len);
void flash_raw_program(uint32_t offset, const uint8_t* data, uint32_t len);
void flash_raw_read(uint32_t offset, uint8_t* buf, uint32_t len);

#ifdef __cplusplus
}
#endif

#endif // FLASH_STORE_H
