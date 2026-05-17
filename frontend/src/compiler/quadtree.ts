/**
 * 自适应四叉树分割模块。
 * 根据颜色索引矩阵自动划分不同大小的矩形区块。
 */

import { LeafBlock, Point } from '@engine/types';

export function buildQuadtree(
  matrix: number[][],
  colorThreshold: number = 3,
  x: number = 0,
  y: number = 0,
  w: number = -1,
  h: number = -1,
): LeafBlock[] {
  if (matrix.length === 0) return [];
  const maxH = matrix.length;
  const maxW = matrix[0]?.length ?? 0;
  if (w < 0) w = maxW;
  if (h < 0) h = maxH;

  x = Math.max(0, Math.min(x, maxW - 1));
  y = Math.max(0, Math.min(y, maxH - 1));
  w = Math.min(w, maxW - x);
  h = Math.min(h, maxH - y);
  if (w <= 0 || h <= 0) return [];

  // 统计颜色种类
  const colors = new Set<number>();
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const idx = matrix[y + dy][x + dx];
      if (idx >= 0) colors.add(idx);
    }
  }

  if (colors.size === 0) return [];

  if (colors.size <= colorThreshold || (w === 1 && h === 1)) {
    const colorPoints = new Map<number, Point[]>();
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const idx = matrix[y + dy][x + dx];
        if (idx >= 0) {
          if (!colorPoints.has(idx)) colorPoints.set(idx, []);
          colorPoints.get(idx)!.push({ x: x + dx, y: y + dy });
        }
      }
    }
    const block: LeafBlock = { x, y: y, w, h, colorPoints };
    return [block];
  }

  const leftW = w >> 1;
  const rightW = w - leftW;
  const topH = h >> 1;
  const bottomH = h - topH;

  return [
    ...buildQuadtree(matrix, colorThreshold, x, y, leftW, topH),
    ...buildQuadtree(matrix, colorThreshold, x + leftW, y, rightW, topH),
    ...buildQuadtree(matrix, colorThreshold, x, y + topH, leftW, bottomH),
    ...buildQuadtree(matrix, colorThreshold, x + leftW, y + topH, rightW, bottomH),
  ];
}
