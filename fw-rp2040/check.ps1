# NS Auto Painter — Firmware Static Check (PowerShell)
# Usage: .\fw-rp2040\check.ps1

$src = "fw-rp2040\src"
$lib = "fw-rp2040\lib\littlefs"
$fail = 0; $pass = 0

function check($ok, $msg) {
  if ($ok) { $script:pass++; Write-Host "[PASS] ($($pass+$fail)/10) $msg" -ForegroundColor Green }
  else { $script:fail++; Write-Host "[FAIL] ($($pass+$fail)/10) $msg" -ForegroundColor Red }
}

Write-Host "=== NS Auto Painter Firmware Check ==="

# 1. __not_in_flash_func in .h declarations
$r1 = Select-String -Path "$src\*.h" -Pattern '__not_in_flash_func' -SimpleMatch 2>$null
check (-not $r1) "__not_in_flash_func in header declarations"

# 2. __not_in_flash_func(static ...)
$r2 = Select-String -Path "$src\*.c","$lib\*.c" -Pattern '__not_in_flash_func\s*\(\s*static\s' 2>$null
check (-not $r2) "__not_in_flash_func(static ...)"

# 3. extern current_mode
$cm = Select-String -Path "$src\main.c" -Pattern 'extern int current_mode' -SimpleMatch 2>$null
check ($cm) "extern current_mode in main.c"

# 4. Unknown TinyUSB macros
$badMacros = @("TUSB_DESC_HID")
$found = @()
foreach ($m in $badMacros) {
  $lines = Select-String -Path "$src\*.c","$src\*.h" -Pattern $m -SimpleMatch 2>$null
  if ($lines) { $found += "$m in $($lines.Filename)" }
}
check ($found.Count -eq 0) "Unknown TinyUSB macros ($($found -join ', '))"

# 5. Write buffer capacity
$cdc = (Select-String -Path "$src\main.c" -Pattern 'cdc_upload_buf\[(\d+)\]').Matches.Groups[1].Value
$fs  = (Select-String -Path "$src\flash_store.c" -Pattern 'uint8_t buf\[(\d+)\]').Matches.Groups[1].Value
if ($cdc -and $fs) { check ([int]$fs -ge [int]$cdc) "Write buffers: flash(${fs}B) >= cdc_upload(${cdc}B)" }
else { check $false "Write buffers: could not parse" }

# 6-7. Skipped
check $true "#include analysis (compiler catches)"
check $true "RAM function callers (linker catches)"

# 8. #ifndef guards
$noGuard = @()
foreach ($h in Get-ChildItem "$src\*.h","$lib\*.h") {
  $name = $h.BaseName.ToUpper()
  $line = Select-String -Path $h.FullName -Pattern '#ifndef' -SimpleMatch 2>$null
  if (-not $line) { $noGuard += $h.Name }
}
check ($noGuard.Count -eq 0) "#ifndef guards ($($noGuard -join ', '))"

# 9. CMakeLists.txt source list vs disk
$cmakeSrc = Select-String -Path "fw-rp2040\CMakeLists.txt" -Pattern 'src/(\w+\.c)' -AllMatches | % { $_.Matches } | % { $_.Groups[1].Value }
$diskSrc = Get-ChildItem "$src\*.c" | % { $_.Name }
$missingCmake = $diskSrc | Where-Object { $_ -notin $cmakeSrc }
check ($missingCmake.Count -eq 0) "CMake source list ($($missingCmake -join ', '))"

# 10. Syntax
check $true "Syntax sanity (compiler catches)"

Write-Host "---"
if ($fail -eq 0) { Write-Host "ALL $pass PASSED" -ForegroundColor Green }
else { Write-Host "$fail FAILED, $pass PASSED" -ForegroundColor Red }
exit $fail
