import { getCanvasMode } from './canvas-mode';
import { GridCell } from './types';

/**
 * 像素化：从画布中心 (128,128) 向外辐射 block_size × block_size 像素块。
 * 边缘块按画布边界截断。每个块取 opaque 像素的加权平均色。
 * 浏览器端实现，替代 Python PIL/numpy。
 */
export function pixelize(
  imageData: ImageData,
  canvasMode: string,
  blockSize: number
): { image: ImageData; grid: GridCell[][]; colStarts: number[]; rowStarts: number[] } {
  const mode = getCanvasMode(canvasMode);
  const aw = mode.activeW;
  const ah = mode.activeH;
  const cx = 128 - mode.activeX;  // 中心像素在 image 中的 x
  const cy = 128 - mode.activeY;  // 中心像素在 image 中的 y
  const { data, width: w, height: h } = imageData;

  // 计算列起始位置
  const colStarts = buildAxisStarts(cx, aw, blockSize);
  const rowStarts = buildAxisStarts(cy, ah, blockSize);

  const outData = new Uint8ClampedArray(aw * ah * 4);
  const grid: GridCell[][] = [];

  for (let ri = 0; ri < rowStarts.length; ri++) {
    const ry = rowStarts[ri];
    const gridRow: GridCell[] = [];
    for (let ci = 0; ci < colStarts.length; ci++) {
      const rx = colStarts[ci];
      const bw = Math.min(blockSize, aw - rx);
      const bh = Math.min(blockSize, ah - ry);
      const cell = averageBlock(data, w, h, rx, ry, bw, bh);
      gridRow.push(cell);
      // 填充输出图像
      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const outIdx = ((ry + dy) * aw + (rx + dx)) * 4;
          outData[outIdx] = cell.r;
          outData[outIdx + 1] = cell.g;
          outData[outIdx + 2] = cell.b;
          outData[outIdx + 3] = cell.a;
        }
      }
    }
    grid.push(gridRow);
  }

  return {
    image: new ImageData(outData, aw, ah),
    grid,
    colStarts,
    rowStarts,
  };
}

function buildAxisStarts(center: number, max: number, blockSize: number): number[] {
  const starts: number[] = [];

  // 向左
  const left: number[] = [];
  let x = center - blockSize;
  while (x >= 0) {
    left.push(x);
    x -= blockSize;
  }
  left.reverse();
  const hasLeftEdge = (left.length > 0 ? left[0] : center) > 0;

  // 向右
  const right: number[] = [];
  x = center + blockSize;
  while (x < max) {
    right.push(x);
    x += blockSize;
  }
  const lastRight = right.length > 0 ? right[right.length - 1] + blockSize : center + blockSize;
  const hasRightEdge = (max - lastRight) > 0;

  if (hasLeftEdge) starts.push(0);
  starts.push(...left);
  starts.push(center);
  starts.push(...right);
  if (hasRightEdge) {
    const last = starts[starts.length - 1] + blockSize;
    if (last < max) starts.push(last);
  }
  return starts;
}

function averageBlock(
  data: Uint8ClampedArray, imgW: number, imgH: number,
  bx: number, by: number, bw: number, bh: number
): GridCell {
  let sumR = 0, sumG = 0, sumB = 0, count = 0;
  for (let dy = 0; dy < bh; dy++) {
    for (let dx = 0; dx < bw; dx++) {
      const px = bx + dx;
      const py = by + dy;
      if (px >= imgW || py >= imgH) continue;
      const idx = (py * imgW + px) * 4;
      const a = data[idx + 3];
      if (a >= 128) {
        sumR += data[idx];
        sumG += data[idx + 1];
        sumB += data[idx + 2];
        count++;
      }
    }
  }
  if (count > 0) {
    return {
      r: Math.round(sumR / count),
      g: Math.round(sumG / count),
      b: Math.round(sumB / count),
      a: 255,
    };
  }
  return { r: 0, g: 0, b: 0, a: 0 };
}
