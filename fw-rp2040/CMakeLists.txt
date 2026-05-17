cmake_minimum_required(VERSION 3.12)

include(pico_sdk_import.cmake)

project(NS_Auto_Painter_RP2040 C CXX ASM)
set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)

pico_sdk_init()

set(SOURCES
    ${CMAKE_CURRENT_LIST_DIR}/src/main.c
    ${CMAKE_CURRENT_LIST_DIR}/src/usb_descriptors.c
    ${CMAKE_CURRENT_LIST_DIR}/src/script_engine.c
    ${CMAKE_CURRENT_LIST_DIR}/src/flash_store.c
    ${CMAKE_CURRENT_LIST_DIR}/src/msc_disk.c
)

set(INCLUDES
    ${CMAKE_CURRENT_LIST_DIR}/src
)

add_executable(${PROJECT_NAME} ${SOURCES})

target_include_directories(${PROJECT_NAME} PRIVATE ${INCLUDES})

target_link_libraries(${PROJECT_NAME} PRIVATE
    pico_stdlib
    tinyusb_device
    tinyusb_board
    pico_multicore
    hardware_flash
    hardware_timer
    hardware_sync
)

# Generate additional output formats (.uf2, .bin, .hex)
pico_add_extra_outputs(${PROJECT_NAME})

# Enable USB (TinyUSB)
pico_enable_stdio_usb(${PROJECT_NAME} 0)
pico_enable_stdio_uart(${PROJECT_NAME} 0)
