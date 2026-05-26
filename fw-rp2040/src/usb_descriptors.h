/** USB 描述符 — 动态配置: HID only / CDC+MSC
 *
 * 全局变量 extern int current_mode 控制当前返回哪种配置描述符。
 * MODE_HID_CDC / MODE_HID_MSC → HID 仅
 * MODE_CDC_MSC → CDC + MSC
 *
 * HID Report Descriptor 对齐 SwiCC_RP2040 (已验证 NS 可识别)。
 */
#ifndef USB_DESCRIPTORS_H
#define USB_DESCRIPTORS_H

#include "tusb.h"

#define TUD_HID_REPORT_DESC_NSAP(...) \
  HID_USAGE_PAGE ( HID_USAGE_PAGE_DESKTOP     ) ,\
  HID_USAGE      ( HID_USAGE_DESKTOP_GAMEPAD  ) ,\
  HID_COLLECTION ( HID_COLLECTION_APPLICATION ) ,\
    /* 16 buttons */ \
    HID_USAGE_PAGE    ( HID_USAGE_PAGE_BUTTON                  ) ,\
    HID_USAGE_MIN     ( 1                                      ) ,\
    HID_USAGE_MAX     ( 16                                     ) ,\
    HID_LOGICAL_MIN   ( 0                                      ) ,\
    HID_LOGICAL_MAX   ( 1                                      ) ,\
    HID_REPORT_COUNT  ( 16                                     ) ,\
    HID_REPORT_SIZE   ( 1                                      ) ,\
    HID_INPUT         ( HID_DATA | HID_VARIABLE | HID_ABSOLUTE ) ,\
    /* HAT switch */ \
    HID_USAGE_PAGE    ( HID_USAGE_PAGE_DESKTOP                 ) ,\
    HID_USAGE         ( HID_USAGE_DESKTOP_HAT_SWITCH           ) ,\
    HID_LOGICAL_MIN   ( 0                                      ) ,\
    HID_LOGICAL_MAX   ( 7                                      ) ,\
    HID_PHYSICAL_MIN  ( 0                                      ) ,\
    HID_PHYSICAL_MAX_N( 315, 2                                 ) ,\
    HID_UNIT          ( 20                                     ) ,\
    HID_REPORT_COUNT  ( 1                                      ) ,\
    HID_REPORT_SIZE   ( 4                                      ) ,\
    HID_INPUT         ( HID_DATA | HID_VARIABLE | HID_ABSOLUTE | HID_WRAP_NO | HID_LINEAR | HID_PREFERRED_STATE | HID_NULL_STATE ) ,\
    /* Padding 4 bits */ \
    HID_REPORT_COUNT  ( 1                                      ) ,\
    HID_REPORT_SIZE   ( 4                                      ) ,\
    HID_INPUT         ( HID_CONSTANT | HID_VARIABLE | HID_ABSOLUTE ) ,\
    /* 4 analog sticks */ \
    HID_USAGE_PAGE    ( HID_USAGE_PAGE_DESKTOP                 ) ,\
    HID_USAGE         ( HID_USAGE_DESKTOP_X                    ) ,\
    HID_USAGE         ( HID_USAGE_DESKTOP_Y                    ) ,\
    HID_USAGE         ( HID_USAGE_DESKTOP_Z                    ) ,\
    HID_USAGE         ( HID_USAGE_DESKTOP_RZ                   ) ,\
    HID_LOGICAL_MIN   ( 0                                      ) ,\
    HID_LOGICAL_MAX   ( 255                                    ) ,\
    HID_REPORT_COUNT  ( 4                                      ) ,\
    HID_REPORT_SIZE   ( 8                                      ) ,\
    HID_INPUT         ( HID_DATA | HID_VARIABLE | HID_ABSOLUTE ) ,\
    /* Vendor */ \
    HID_USAGE_PAGE_N  ( 0xFF00, 2                              ) ,\
    HID_USAGE         ( 0x20                                   ) ,\
    HID_REPORT_COUNT  ( 1                                      ) ,\
    HID_REPORT_SIZE   ( 8                                      ) ,\
    HID_INPUT         ( HID_DATA | HID_VARIABLE | HID_ABSOLUTE ) ,\
    /* Output (mirror) */ \
    HID_USAGE_PAGE    ( HID_USAGE_PAGE_DESKTOP                 ) ,\
    HID_USAGE_N       ( 0x2611, 2                              ) ,\
    HID_REPORT_COUNT  ( 1                                      ) ,\
    HID_REPORT_SIZE   ( 8                                      ) ,\
    HID_OUTPUT        ( HID_DATA | HID_VARIABLE | HID_ABSOLUTE | HID_WRAP_NO | HID_LINEAR | HID_PREFERRED_STATE | HID_NULL_STATE | HID_NONLINEAR | HID_VOLATILE ) ,\
  HID_COLLECTION_END

#endif
