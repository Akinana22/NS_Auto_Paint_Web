import { Palette } from './types';

interface ColorBox {
  rMin: number; rMax: number;
  gMin: number; gMax: number;
  bMin: number; bMax: number;
  pixels: { r: number; g: number; b: number; x: number; y: number }[];
  avgColor: { r: number; g: number; b: number };
}

/**
 * Median Cut 色彩量化 (无仿色)。
 * 浏览器端纯 TypeScript 实现，替代 Python PIL Image.quantize()。
 */
export function quantize(
  grid: { r: number; g: number; b: number; a: number }[][],
  maxColors: number
): {
  imageData: ImageData;
  palette: Palette;
  matrix: number[][];
} {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  if (h === 0 || w === 0) {
    return {
      imageData: new ImageData(w, h),
      palette: [],
      matrix: [],
    };
  }

  // 收集 opaque 像素
  const pixels: { r: number; g: number; b: number; x: number; y: number }[] = [];
  const isOpaque: boolean[][] = [];
  for (let y = 0; y < h; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < w; x++) {
      const cell = grid[y][x];
      const op = cell.a >= 128;
      row.push(op);
      if (op) {
        pixels.push({ r: cell.r, g: cell.g, b: cell.b, x, y });
      }
    }
    isOpaque.push(row);
  }

  const actualMax = Math.max(2, Math.min(maxColors, 256));

  // 执行 Median Cut
  const boxes = medianCut(pixels, actualMax);

  // 构建调色板
  const palette: Palette = boxes.map(b => [b.avgColor.r, b.avgColor.g, b.avgColor.b]);

  // 构建 color index matrix (-1 表示透明)
  const matrix: number[][] = Array.from({ length: h }, () => new Array(w).fill(-1));

  // 将每个颜色映射到最近调色板颜色
  const colorToIndex = new Map<number, number>();
  for (let i = 0; i < boxes.length; i++) {
    for (const p of boxes[i].pixels) {
      const key = colorKey(p.r, p.g, p.b);
      colorToIndex.set(key, i);
    }
  }

  for (let boxIdx = 0; boxIdx < boxes.length; boxIdx++) {
    for (const p of boxes[boxIdx].pixels) {
      matrix[p.y][p.x] = boxIdx;
    }
  }

  // 构建输出图像
  const outData = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (isOpaque[y][x] && matrix[y][x] >= 0) {
        const c = palette[matrix[y][x]];
        outData[idx] = c[0];
        outData[idx + 1] = c[1];
        outData[idx + 2] = c[2];
        outData[idx + 3] = 255;
      }
    }
  }

  return {
    imageData: new ImageData(outData, w, h),
    palette,
    matrix,
  };
}

function colorKey(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

function medianCut(
  pixels: { r: number; g: number; b: number; x: number; y: number }[],
  maxColors: number
): ColorBox[] {
  if (pixels.length === 0) return [];

  const initialBox = createBox(pixels);
  if (maxColors >= pixels.length) {
    // 每种颜色一个box
    const uniqueColors = new Map<number, typeof pixels>();
    for (const p of pixels) {
      const k = colorKey(p.r, p.g, p.b);
      if (!uniqueColors.has(k)) uniqueColors.set(k, []);
      uniqueColors.get(k)!.push(p);
    }
    return [...uniqueColors.values()].map(ps => createBox(ps));
  }

  let boxes: ColorBox[] = [initialBox];

  while (boxes.length < maxColors) {
    const idx = findBoxToSplit(boxes);
    if (idx < 0) break;
    const [b1, b2] = splitBox(boxes[idx]);
    boxes.splice(idx, 1, b1, b2);
  }

  return boxes;
}

function createBox(pixels: { r: number; g: number; b: number; x: number; y: number }[]): ColorBox {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  let sumR = 0, sumG = 0, sumB = 0;
  for (const p of pixels) {
    rMin = Math.min(rMin, p.r); rMax = Math.max(rMax, p.r);
    gMin = Math.min(gMin, p.g); gMax = Math.max(gMax, p.g);
    bMin = Math.min(bMin, p.b); bMax = Math.max(bMax, p.b);
    sumR += p.r; sumG += p.g; sumB += p.b;
  }
  const n = pixels.length;
  return {
    rMin, rMax, gMin, gMax, bMin, bMax,
    pixels,
    avgColor: { r: Math.round(sumR / n), g: Math.round(sumG / n), b: Math.round(sumB / n) },
  };
}

function findBoxToSplit(boxes: ColorBox[]): number {
  let maxSpan = -1;
  let bestIdx = -1;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.pixels.length < 2) continue;
    const rSpan = b.rMax - b.rMin;
    const gSpan = b.gMax - b.gMin;
    const bSpan = b.bMax - b.bMin;
    const maxDim = Math.max(rSpan, gSpan, bSpan);
    if (maxDim > maxSpan) {
      maxSpan = maxDim;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function splitBox(box: ColorBox): [ColorBox, ColorBox] {
  const rSpan = box.rMax - box.rMin;
  const gSpan = box.gMax - box.gMin;
  const bSpan = box.bMax - box.bMin;

  type Chan = 'r' | 'g' | 'b';
  let channel: Chan;
  if (rSpan >= gSpan && rSpan >= bSpan) channel = 'r';
  else if (gSpan >= bSpan) channel = 'g';
  else channel = 'b';

  const sorted = [...box.pixels].sort((a, b) => a[channel] - b[channel]);
  const mid = sorted.length >> 1;
  return [createBox(sorted.slice(0, mid)), createBox(sorted.slice(mid))];
}

/**
 * 量化简版：直接在已有 pixel grid 上操作，返回 ImageData。
 * 用于 preview 阶段少一个步骤的场景。
 */
export function quantizeImageData(
  grid: { r: number; g: number; b: number; a: number }[][],
  maxColors: number
): ImageData {
  return quantize(grid, maxColors).imageData;
}

/**
 * 将 block 级别量化结果展开回原始画布尺寸 (cw × ch)。
 * grid 每个 cell 对应一个 blockSize×blockSize 的像素块，
 * palette 给出每个颜色索引的 RGB。
 */
export function expandQuantizedToCanvas(
  grid: { r: number; g: number; b: number; a: number }[][],
  palette: Palette,
  colStarts: number[],
  rowStarts: number[],
  canvasW: number, canvasH: number,
): ImageData {
  const out = new Uint8ClampedArray(canvasW * canvasH * 4);
  for (let gy = 0; gy < grid.length; gy++) {
    const ry = rowStarts[gy] ?? 0;
    const row = grid[gy];
    for (let gx = 0; gx < row.length; gx++) {
      const rx = colStarts[gx] ?? 0;
      const cell = row[gx];
      if (!cell || cell.a < 128) continue;
      let best = 0; let bestD = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const d = (cell.r - palette[i][0]) ** 2 + (cell.g - palette[i][1]) ** 2 + (cell.b - palette[i][2]) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      const [r, g, b] = palette[best];
      const bw = Math.min(grid[0]?.length ? (colStarts[gx+1] ?? canvasW) - rx : canvasW - rx, canvasW - rx);
      const bh = Math.min(grid.length ? (rowStarts[gy+1] ?? canvasH) - ry : canvasH - ry, canvasH - ry);
      for (let dy = 0; dy < bh && ry + dy < canvasH; dy++) {
        for (let dx = 0; dx < bw && rx + dx < canvasW; dx++) {
          const idx = ((ry + dy) * canvasW + (rx + dx)) * 4;
          out[idx] = r; out[idx + 1] = g; out[idx + 2] = b; out[idx + 3] = 255;
        }
      }
    }
  }
  return new ImageData(out, canvasW, canvasH);
}
