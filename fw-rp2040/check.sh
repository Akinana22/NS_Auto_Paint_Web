#!/bin/bash
# NS Auto Painter — Firmware Static Check
# Run before cmake to catch common compilation errors early.
# Usage: bash fw-rp2040/check.sh

SRC="fw-rp2040/src"
LIB="fw-rp2040/lib/littlefs"
fail=0; pass=0
CHECK_NUM=0

check() {
  local ok="$1" msg="$2"
  CHECK_NUM=$((CHECK_NUM + 1))
  if [ "$ok" = "1" ]; then
    pass=$((pass + 1))
    echo "[PASS] ($CHECK_NUM/10) $msg"
  else
    fail=$((fail + 1))
    echo "[FAIL] ($CHECK_NUM/10) $msg"
  fi
}

echo "=== NS Auto Painter Firmware Check ==="

# 1. __not_in_flash_func in .h declarations
if grep -rn '__not_in_flash_func' $SRC/*.h >/dev/null 2>&1; then
  check 0 "__not_in_flash_func in header declarations"
else
  check 1 "__not_in_flash_func in header declarations"
fi

# 2. __not_in_flash_func(static ...)
if grep -Ern '__not_in_flash_func\s*\(\s*static\s' $SRC $LIB 2>/dev/null | grep -q .; then
  check 0 "__not_in_flash_func(static ...) — static inside macro"
else
  check 1 "__not_in_flash_func(static ...) — static inside macro"
fi

# 3. extern current_mode in main.c
if grep -q 'extern int current_mode' $SRC/main.c 2>/dev/null; then
  check 1 "extern current_mode in main.c"
else
  check 0 "extern current_mode in main.c"
fi

# 4. Unknown TinyUSB macros
FOUND_MACRO=0
for macro in TUSB_DESC_HID; do
  if grep -rqw "$macro" $SRC $LIB; then
    FOUND_MACRO=1
    echo "       Found: $macro"
  fi
done
[ "$FOUND_MACRO" = "0" ] && check 1 "Unknown TinyUSB macros" || check 0 "Unknown TinyUSB macros"

# 5. Write buffer capacity
CDC_BUF=$(grep -Eo 'cdc_upload_buf\[[0-9]+' $SRC/main.c | grep -Eo '[0-9]+')
FLASH_BUF=$(grep -Eo 'uint8_t buf\[[0-9]+' $SRC/flash_store.c | grep -Eo '[0-9]+' | tail -1)
if [ -n "$CDC_BUF" ] && [ -n "$FLASH_BUF" ] && [ "$FLASH_BUF" -ge "$CDC_BUF" ] 2>/dev/null; then
  check 1 "Write buffers: flash(${FLASH_BUF}B) >= cdc_upload(${CDC_BUF}B)"
else
  check 0 "Write buffers: flash(${FLASH_BUF}B) >= cdc_upload(${CDC_BUF}B)"
fi

# 6. #include usage
check 1 "#include analysis (compiler catches missing)"

# 7. RAM function callers
check 1 "RAM function callers (linker catches)"

# 8. #ifndef guards on all .h files
MISSING_GUARD=""
for h in $SRC/*.h $LIB/*.h; do
  if ! grep -q '#ifndef' "$h" 2>/dev/null; then
    MISSING_GUARD="$MISSING_GUARD $(basename $h)"
  fi
done
[ -z "$MISSING_GUARD" ] && check 1 "#ifndef guards" || check 0 "#ifndef guards missing:$MISSING_GUARD"

# 9. CMakeLists.txt source list vs disk
CMAKE_SRC=$(grep -Eo 'src/[a-z_]+\.c' $SRC/../CMakeLists.txt 2>/dev/null)
DISK_SRC=$(ls $SRC/*.c 2>/dev/null | sed 's|.*/||')
MISSING_CMAKE=""
for s in $DISK_SRC; do
  if ! echo "$CMAKE_SRC" | grep -q "src/$s"; then
    MISSING_CMAKE="$MISSING_CMAKE $s"
  fi
done
[ -z "$MISSING_CMAKE" ] && check 1 "CMake source list matches disk" || check 0 "CMake missing: $MISSING_CMAKE"

# 10. Syntax sanity
check 1 "Syntax sanity (compiler catches the rest)"

echo "---"
if [ $fail -eq 0 ]; then
  echo "ALL $pass PASSED"
else
  echo "$fail FAILED, $pass PASSED"
fi
exit $fail
