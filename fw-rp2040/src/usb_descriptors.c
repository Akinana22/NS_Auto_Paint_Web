/** USB 描述符实现 — 动态配置描述符 */
#include "tusb.h"
#include "usb_descriptors.h"
#include "proto.h"
#include <string.h>

// Global mode set by main.c after BOOTSEL detection
int current_mode = MODE_NONE;

// Device Descriptor (fixed)
tusb_desc_device_t const desc_device = {
    .bLength            = sizeof(tusb_desc_device_t),
    .bDescriptorType    = TUSB_DESC_DEVICE,
    .bcdUSB             = 0x0200,
    .bDeviceClass       = 0x00,
    .bDeviceSubClass    = 0x00,
    .bDeviceProtocol    = 0x00,
    .bMaxPacketSize0    = CFG_TUD_ENDPOINT0_SIZE,
    .idVendor           = 0x0F0D,
    .idProduct          = 0x0092,
    .bcdDevice          = 0x0100,
    .iManufacturer      = 0x01,
    .iProduct           = 0x02,
    .iSerialNumber      = 0x03,
    .bNumConfigurations = 0x01,
};

uint8_t const * tud_descriptor_device_cb(void) {
    return (uint8_t const *) &desc_device;
}

// HID Report Descriptor
uint8_t const desc_hid_report[] = { TUD_HID_REPORT_DESC_NSAP() };

// ---- Dynamic Configuration Descriptor ----
enum { ITF_HID = 0 };                                // HID-only mode: 1 interface
enum { ITF_CDC = 0, ITF_CDC_DATA, ITF_MSC, CDCMSC_MAX }; // CDC+MSC: 3 interfaces

#define EPNUM_HID_OUT    0x01
#define EPNUM_HID_IN     0x81
#define EPNUM_CDC_NOTIF  0x82
#define EPNUM_CDC_OUT    0x02
#define EPNUM_CDC_IN     0x83
#define EPNUM_MSC_OUT    0x03
#define EPNUM_MSC_IN     0x84

// HID-only configuration
static uint8_t const hid_only_config[] = {
    TUD_CONFIG_DESCRIPTOR(1, 1, 0, TUD_CONFIG_DESC_LEN + TUD_HID_DESC_LEN, 0, 500),
    TUD_HID_DESCRIPTOR(ITF_HID, 0, false, sizeof(desc_hid_report), EPNUM_HID_OUT, CFG_TUD_HID_EP_BUFSIZE, 8),
};

// CDC+MSC configuration (no HID)
static uint8_t const cdc_msc_config[] = {
    TUD_CONFIG_DESCRIPTOR(1, CDCMSC_MAX, 0,
        TUD_CONFIG_DESC_LEN + TUD_CDC_DESC_LEN + TUD_MSC_DESC_LEN, 0, 500),
    TUD_CDC_DESCRIPTOR(ITF_CDC, 0, EPNUM_CDC_NOTIF, 8, EPNUM_CDC_OUT, EPNUM_CDC_IN, CFG_TUD_CDC_RX_BUFSIZE),
    TUD_MSC_DESCRIPTOR(ITF_MSC, 0, EPNUM_MSC_OUT, EPNUM_MSC_IN, CFG_TUD_MSC_EP_BUFSIZE),
};

uint8_t const * tud_descriptor_configuration_cb(uint8_t index) {
    (void)index;
    return (current_mode == MODE_CDC_MSC) ? cdc_msc_config : hid_only_config;
}

// ---- String Descriptors ----
static const char* string_desc_arr[] = {
    (const char[]) { 0x09, 0x04 },
    "HORI CO.,LTD.",
    "POKKEN CONTROLLER",
    "NSAP0001",
};

uint16_t const * tud_descriptor_string_cb(uint8_t index, uint16_t langid) {
    (void)langid;
    static uint16_t _desc_str[32];
    uint8_t len = 0;
    if (index == 0) {
        memcpy(&_desc_str[1], string_desc_arr[0], 2);
        len = 1;
    } else if (index < sizeof(string_desc_arr) / sizeof(string_desc_arr[0])) {
        const char* str = string_desc_arr[index];
        len = (uint8_t)strlen(str);
        if (len > 31) len = 31;
        for (uint8_t i = 0; i < len; i++) _desc_str[1 + i] = str[i];
    }
    _desc_str[0] = (TUSB_DESC_STRING << 8) | (uint16_t)(2 * len + 2);
    return _desc_str;
}

// ---- HID Callbacks ----
uint8_t const * tud_hid_descriptor_report_cb(uint8_t itf) {
    (void)itf; return desc_hid_report;
}
uint16_t tud_hid_descriptor_report_len_cb(uint8_t itf) {
    (void)itf; return sizeof(desc_hid_report);
}
void tud_hid_set_report_cb(uint8_t itf, uint8_t rid, hid_report_type_t type, uint8_t const* buf, uint16_t len) {
    (void)itf; (void)rid; (void)type; (void)buf; (void)len;
}
uint16_t tud_hid_get_report_cb(uint8_t itf, uint8_t rid, hid_report_type_t type, uint8_t* buf, uint16_t reqlen) {
    (void)itf; (void)rid; (void)type; memset(buf, 0, reqlen); return reqlen;
}
void tud_hid_report_complete_cb(uint8_t itf, uint8_t const* report, uint16_t len) {
    (void)itf; (void)report; (void)len;
}
