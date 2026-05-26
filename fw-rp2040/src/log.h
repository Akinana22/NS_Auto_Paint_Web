/** 日志系统 — LittleFS 追加二进制条目 */
#ifndef LOG_H
#define LOG_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#pragma pack(push, 1)
typedef struct {
    uint64_t timestamp;
    uint8_t  mode;
} log_entry_t;
#pragma pack(pop)

void log_init(void);
void log_event(uint8_t mode);

#ifdef __cplusplus
}
#endif

#endif
