/**
 * Flash 存储管理 — 脚本读写到 RP2040 片上 Flash
 */

#ifndef FLASH_STORE_H
#define FLASH_STORE_H

#include <stdint.h>
#include <stdbool.h>
#include "proto.h"

// Initialize flash store (check magic, validate)
void flash_store_init(void);

// Check if a valid script exists in flash
bool flash_store_has_script(void);

// Get pointer to start of script data in flash (direct XIP access)
const uint8_t* flash_store_get_script_ptr(void);

// Get script size in bytes
uint32_t flash_store_get_script_size(void);

// Get script header info
const script_header_t* flash_store_get_header(void);

// Erase and write new script data to flash
// Returns true on success, false on error
bool flash_store_write_script(const uint8_t* data, uint32_t size, uint32_t checksum);

// Erase the script region
void flash_store_erase(void);

// CRC32 over data
uint32_t flash_store_crc32(const uint8_t* data, uint32_t len);

#endif // FLASH_STORE_H
