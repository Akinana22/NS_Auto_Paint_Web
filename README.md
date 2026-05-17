# NS Auto Painter (Web 版)

基于 RP2040 Pico 模拟 NS Pro 手柄的自动像素画绘制工具。  
原 Python/PySide6 桌面应用重构为 TypeScript Web 版本。

在线使用：[https://akinana22.github.io/NS_Auto_Paint_Web/](https://akinana22.github.io/NS_Auto_Paint_Web/)

## 使用流程

1. 初次烧录固件：
从 GitHub Releases 下载 .uf2 → 长按单片机 BOOTSEL 按钮 → 连接烧录设备 → 拖入 .uf2

2. 生成脚本：
切换到「朋友收集」或「斯普拉顿」页面 → 上传图片 → 像素化 → 量化 → 生成JSON → 生成 .bin  → 下载 .bin

3. CDC 写入脚本：
Pico 连接Windows设备 → 访问「朋友收集」页面 → 点击「连接 Pico」→ 一键写入 Flash

4. MSC 写入脚本：
Pico 连接烧录设备 → 弹出 NS_SCRIPT U 盘 → .bin 拖入 U 盘 → 断开连接自动写入 Flash

5. 开始绘制：
Pico 连接 Switch → 按下 BOOTSEL 按钮 → 等待脚本自动执行

## 固件兼容性说明

| 模式 | 兼容性要求 |
|------|-----------|
| HID 模式 | NS全系列产品（NS1/NS续航版/NSOled/NSLite/NS2） |
| MSC 模式 | 全平台（Windows/macOS/Linux/Android/iOS/iPadOS） |
| CDC 模式 | Windows 10/11（Chrome/Edge） |

## 本地部署

```bash
git clone https://github.com/Akinana22/NS_Auto_Paint_Web.git
cd NS_Auto_Paint_Web/frontend
npm install
npm run build    # 产出 dist/ 目录
npx serve dist   # 浏览器访问 http://localhost:3000
```

构建产物使用相对路径 `./`，可部署到任意子目录。

## 项目结构

```
├── frontend/         # React + Vite + TypeScript 前端
│   └── src/
│       ├── engine/   # 图片处理管线 (crop → pixelize → quantize → JSON)
│       ├── compiler/ # 脚本生成 (调度优化 + Builder 模式)
│       ├── serial/   # Web Serial API 脚本上传
│       └── pages/    # UI 页面
├── fw-rp2040/        # RP2040 Pico C 固件
│   └── src/
│       ├── main.c               # USB HID + CDC + MSC 复合设备
│       ├── script_engine.c/h    # 二进制脚本引擎
│       ├── flash_store.c/h      # Flash 读写管理
│       ├── msc_disk.c/h         # MSC 大容量存储 (U盘)
│       └── usb_descriptors.c/h  # USB 描述符
├── shared/           # 共享二进制协议定义
├── .github/workflows/
│   ├── deploy-pages.yml     # CI: 部署前端到 GitHub Pages
│   └── release-firmware.yml # CI: 编译 .uf2 发布到 Release
└── LICENSE
```

## 固件构建

```bash
# 本地编译 (需要 Pico SDK + ARM GCC)
cd fw-rp2040 && mkdir build && cd build
export PICO_SDK_PATH=/path/to/pico-sdk
cmake .. && make
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite 5 + TypeScript 5 |
| 固件 | C11 + Raspberry Pi Pico SDK + TinyUSB |
| USB 设备 | HORI POKKEN CONTROLLER (VID 0x0F0D, PID 0x0092) |
| 通信 | Web Serial API (CDC) + USB HID |
| 部署 | GitHub Pages + GitHub Releases + GitHub Actions |

## 开源声明

NS Auto Painter 基于 GNU General Public License v3.0 开源。  
基于 [SwiCC_RP2040](https://github.com/EasyConNS/EasyCon) 固件框架改造。  
感谢所有开源贡献者。
