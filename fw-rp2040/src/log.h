/** 日志系统 — LittleFS 追加二进制条目 */
#ifndef LOG_H
#define LOG_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint32_t timestamp;
    uint8_t  mode;
} log_entry_t;

void log_init(void);
void log_event(uint8_t mode);

#ifdef __cplusplus
}
#endif

#endif
