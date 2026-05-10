"""
JSON 构建器 v2.3.2
block_grid -> living-the-grid 兼容 JSON。
本地生成：source="ns_auto_paint"。仅被使用的颜色写入 palette。
"""

from core.image.hsb_mapper import rgb_to_steps
from core.models.canvas_mode import get_canvas_mode

JSON_PRESET = {"standard": "square", "book": "book", "tv": "tv", "game": "videogame", "decoration": "interior"}


def grid_to_json(grid, palette, canvas_mode, brush_type, brush_size, is_local=False):
    mode = get_canvas_mode(canvas_mode)
    rows = len(grid)
    cols = len(grid[0]) if rows > 0 else 0

    def find_closest(r, g, b):
        best = 0
        best_d = float("inf")
        for idx, prgb in enumerate(palette):
            d = (r - prgb[0]) ** 2 + (g - prgb[1]) ** 2 + (b - prgb[2]) ** 2
            if d < best_d:
                best_d = d
                best = idx
        return best

    # 构建完整 pixels（用完整 palette 索引）
    full_pixels = []
    used = set()
    for row in grid:
        pixel_row = []
        for cell in row:
            if cell.get("a", 0) >= 128:
                idx = find_closest(cell["r"], cell["g"], cell["b"])
                pixel_row.append(idx)
                used.add(idx)
            else:
                pixel_row.append(None)
        full_pixels.append(pixel_row)

    # 仅被使用的颜色重映射
    sorted_used = sorted(used) if used else []
    idx_map = {old: new for new, old in enumerate(sorted_used)}

    jpal = []
    for ui in sorted_used:
        rgb = palette[ui]
        hs, ss, bs = rgb_to_steps(*rgb)
        if hs == 200:
            hs = 199
        elif hs == 201:
            hs = 0
        jpal.append({"hex": f"#{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}", "rgb": list(rgb), "press": {"h": hs, "s": ss, "b": bs}})

    pixels = []
    for row in full_pixels:
        pixel_row = []
        for idx in row:
            pixel_row.append(idx_map[idx] if idx is not None else None)
        pixels.append(pixel_row)

    return {"source": "ns_auto_paint" if is_local else "NS Auto Painter v2.3.2", "version": 2,
            "width": cols, "height": rows,
            "brush": {"mode": brush_type, "px": brush_size},
            "canvas": {"preset": JSON_PRESET.get(canvas_mode, "square"), "w": mode.active_w, "h": mode.active_h},
            "palette": jpal, "pixels": pixels}
