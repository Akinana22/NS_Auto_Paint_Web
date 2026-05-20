/** TinyUSB 配置 — 动态接口: HID only 或 CDC+MSC */
#ifndef _TUSB_CONFIG_H_
#define _TUSB_CONFIG_H_

#ifdef __cplusplus
extern "C" {
#endif

#define CFG_TUSB_RHPORT0_MODE   (OPT_MODE_DEVICE)
#define CFG_TUD_ENABLED         1

#define CFG_TUD_HID             1
#define CFG_TUD_CDC             1
#define CFG_TUD_MSC             1
#define CFG_TUD_MIDI            0
#define CFG_TUD_VENDOR          0

#define CFG_TUD_CDC_RX_BUFSIZE  256
#define CFG_TUD_CDC_TX_BUFSIZE  256
#define CFG_TUD_HID_EP_BUFSIZE  64
#define CFG_TUD_MSC_EP_BUFSIZE  512
#define CFG_TUD_ENDPOINT0_SIZE  64

#ifdef __cplusplus
}
#endif

#endif
