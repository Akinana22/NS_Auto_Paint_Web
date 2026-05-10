"""
像素化模块 v2.3.2
从画布中心 (128, 128) 对外辐射 block_size × block_size 像素块。
边缘块按画布边界截断。每个块取加权平均色。
"""

import numpy as np
from PIL import Image
from core.models.canvas_mode import get_canvas_mode


def threshold_alpha(image: Image.Image) -> Image.Image:
    arr = np.array(image)
    alpha = arr[:, :, 3]
    arr[:, :, 3] = np.where(alpha >= 128, 255, 0).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def pixelize_to_blocks(image: Image.Image, canvas_mode: str, block_size: int):
    """
    image: PIL RGBA Image, 尺寸 = active_w × active_h
    canvas_mode: 画布模式
    block_size: 像素块大小

    从画布中心 (128,128) 开始向外分块，边缘块被画布边界截断。
    每个块取 opaque 像素的加权平均色。
    返回: (block_image: PIL RGBA Image, grid: 2D list of {r,g,b})
    """
    mode = get_canvas_mode(canvas_mode)
    aw, ah = mode.active_w, mode.active_h
    cx = 128 - mode.active_x  # 中心像素在 image 中的 x
    cy = 128 - mode.active_y  # 中心像素在 image 中的 y

    arr = np.array(image).astype(np.float64)
    h, w = arr.shape[:2]

    # 计算中心块左上角
    center_block_x = cx  # 中心块从 cx 开始
    center_block_y = cy

    # 向左展开
    left_blocks = []
    x = center_block_x - block_size
    while x >= 0:
        left_blocks.append(x)
        x -= block_size
    left_blocks.reverse()
    # 左边缘残余
    has_left_edge = (left_blocks[0] > 0) if left_blocks else (center_block_x > 0)
    left_edge_w = left_blocks[0] if left_blocks else center_block_x

    # 向右展开
    right_blocks = []
    x = center_block_x + block_size
    while x < aw:
        right_blocks.append(x)
        x += block_size
    has_right_edge = (aw - (right_blocks[-1] + block_size if right_blocks else center_block_x + block_size)) > 0

    # 向上展开
    top_blocks = []
    y = center_block_y - block_size
    while y >= 0:
        top_blocks.append(y)
        y -= block_size
    top_blocks.reverse()
    has_top_edge = (top_blocks[0] > 0) if top_blocks else (center_block_y > 0)
    top_edge_h = top_blocks[0] if top_blocks else center_block_y

    # 向下展开
    bottom_blocks = []
    y = center_block_y + block_size
    while y < ah:
        bottom_blocks.append(y)
        y += block_size
    has_bottom_edge = (ah - (bottom_blocks[-1] + block_size if bottom_blocks else center_block_y + block_size)) > 0

    # 构建列起始列表
    col_starts = []
    if has_left_edge:
        col_starts.append(0)
    col_starts.extend(left_blocks)
    col_starts.append(center_block_x)
    col_starts.extend(right_blocks)
    # 右边缘
    if has_right_edge:
        last_x = col_starts[-1] + block_size
        if last_x < aw:
            col_starts.append(last_x)

    # 构建行起始列表
    row_starts = []
    if has_top_edge:
        row_starts.append(0)
    row_starts.extend(top_blocks)
    row_starts.append(center_block_y)
    row_starts.extend(bottom_blocks)
    if has_bottom_edge:
        last_y = row_starts[-1] + block_size
        if last_y < ah:
            row_starts.append(last_y)

    grid = []
    out_arr = np.zeros_like(arr, dtype=np.uint8)

    for row_idx, ry in enumerate(row_starts):
        grid_row = []
        for col_idx, rx in enumerate(col_starts):
            bw = min(block_size, aw - rx)
            bh = min(block_size, ah - ry)
            block = arr[ry:ry+bh, rx:rx+bw, :]
            opaque = block[:, :, 3] >= 128
            if opaque.any():
                r = int(round(block[opaque, 0].mean()))
                g = int(round(block[opaque, 1].mean()))
                b = int(round(block[opaque, 2].mean()))
                a = 255
            else:
                r = g = b = 0
                a = 0
            grid_row.append({"r": r, "g": g, "b": b, "a": a})
            out_arr[ry:ry+bh, rx:rx+bw] = [r, g, b, a]
        grid.append(grid_row)

    return Image.fromarray(out_arr, "RGBA"), grid
