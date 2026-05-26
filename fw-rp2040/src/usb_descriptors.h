/** USB 描述符 — 动态配置: HID only / CDC+MSC */
#ifndef USB_DESCRIPTORS_H
#define USB_DESCRIPTORS_H

#include "tusb.h"

#define TUD_HID_REPORT_DESC_NSAP(...) \
  HID_USAGE_PAGE ( HID_USAGE_PAGE_DESKTOP     ) ,\
  HID_USAGE      ( HID_USAGE_DESKTOP_GAMEPAD  ) ,\
  HID_COLLECTION ( HID_COLLECTION_APPLICATION ) ,\
    HID_REPORT_ID ( 1 ) \
    HID_USAGE_PAGE    ( HID_USAGE_PAGE_BUTTON                  ) ,\
    HID_USAGE_MIN     ( 1                                      ) ,\
    HID_USAGE_MAX     ( 16                                     ) ,\
    HID_LOGICAL_MIN   ( 0                                      ) ,\
    HID_LOGICAL_MAX   ( 1                                      ) ,\
    HID_REPORT_COUNT  ( 16                                     ) ,\
    HID_REPORT_SIZE   ( 1                                      ) ,\
    HID_INPUT         ( HID_DATA | HID_VARIABLE | HID_ABSOLUTE ) ,\
    HID_USAGE_PAGE    ( HID_USAGE_PAGE_DESKTOP                 ) ,\
    HID_USAGE         ( HID_USAGE_DESKTOP_HAT_SWITCH           ) ,\
    HID_LOGICAL_MIN   ( 0                                      ) ,\
    HID_LOGICAL_MAX   ( 7                                      ) ,\
    HID_REPORT_COUNT  ( 1                                      ) ,\
    HID_REPORT_SIZE   ( 4                                      ) ,\
    HID_INPUT         ( HID_DATA | HID_VARIABLE | HID_ABSOLUTE ) ,\
    HID_REPORT_COUNT  ( 1                                      ) ,\
    HID_REPORT_SIZE   ( 4                                      ) ,\
    HID_INPUT         ( HID_CONSTANT | HID_VARIABLE | HID_ABSOLUTE ) ,\
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
    HID_USAGE_PAGE_N  ( 0xFF00, 2                              ) ,\
    HID_USAGE         ( 0x20                                   ) ,\
    HID_REPORT_COUNT  ( 1                                      ) ,\
    HID_REPORT_SIZE   ( 8                                      ) ,\
    HID_INPUT         ( HID_DATA | HID_VARIABLE | HID_ABSOLUTE ) ,\
    HID_REPORT_ID ( 2 ) \
    HID_USAGE_PAGE    ( HID_USAGE_PAGE_DESKTOP                 ) ,\
    HID_USAGE         ( HID_USAGE_DESKTOP_X                    ) ,\
    HID_USAGE         ( HID_USAGE_DESKTOP_Y                    ) ,\
    HID_LOGICAL_MIN   ( 0                                      ) ,\
    HID_LOGICAL_MAX   ( 255                                    ) ,\
    HID_REPORT_COUNT  ( 8                                      ) ,\
    HID_REPORT_SIZE   ( 8                                      ) ,\
    HID_OUTPUT        ( HID_DATA | HID_VARIABLE | HID_ABSOLUTE ) ,\
  HID_COLLECTION_END

#endif
