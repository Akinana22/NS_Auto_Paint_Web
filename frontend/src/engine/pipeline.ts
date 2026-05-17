import { getCanvasMode } from './canvas-mode';
import { fitToCanvas, cropToRegion, getCropOffset } from './crop';
import { pixelize } from './pixelize';
import { quantize } from './quantize';
import { gridToJson } from './json-builder';
import { ImageProcessParams, PipelineResult } from './types';

/**
 * 完整图像处理管线: fit → crop → pixelize → quantize → JSON
 * 浏览器端实现，使用 Canvas API 替代 PIL/numpy。
 */
export async function processPipeline(
  image: HTMLImageElement,
  params: ImageProcessParams,
): Promise<PipelineResult> {
  const { canvasMode, brushType, brushSize, maxColors, offsetX, offsetY } = params;
  const mode = getCanvasMode(canvasMode);

  // 1. Fit: 等比缩放到覆盖画布有效区域
  const fitted = fitToCanvas(image, canvasMode);

  // 2. Crop: 裁切到画布有效区域
  const offset = getCropOffset(fitted.width, fitted.height, canvasMode, offsetX, offsetY);
  const cropped = cropToRegion(fitted, offset.left, offset.top, offset.right, offset.bottom);

  // 3. Pixelize: 中心辐射分块
  const { image: pixelizedImg, grid } = pixelize(cropped, canvasMode, brushSize);

  // 4. Quantize: Median Cut 色彩量化
  const { palette, matrix } = quantize(grid, maxColors);

  // 5. JSON: 构建 living-the-grid 格式
  const json = gridToJson(grid, palette, canvasMode, brushType, brushSize);

  return {
    image,
    cropped,
    pixelized: pixelizedImg,
    quantized: new ImageData(
      new Uint8ClampedArray(mode.activeW * mode.activeH * 4),
      mode.activeW,
      mode.activeH,
    ),
    palette,
    grid,
    matrix,
    json,
  };
}

/** 只执行 Pixelize 阶段（预览用） */
export function processPixelize(
  image: HTMLImageElement,
  canvasMode: string,
  brushSize: number,
): { image: ImageData; grid: { r: number; g: number; b: number; a: number }[][] } {
  const fitted = fitToCanvas(image, canvasMode);
  const offset = getCropOffset(fitted.width, fitted.height, canvasMode, 0, 0);
  const cropped = cropToRegion(fitted, offset.left, offset.top, offset.right, offset.bottom);
  return pixelize(cropped, canvasMode, brushSize);
}
