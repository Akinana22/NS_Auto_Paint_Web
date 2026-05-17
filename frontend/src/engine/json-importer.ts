import { getPresetPaletteHex } from './preset-palette';
import { jsonPresetToCanvasMode, CANVAS_MODE_DISPLAY } from './canvas-mode';
import { Point } from './types';

export interface ImportResult {
  /** 256×256 颜色索引矩阵 (-1 = transparent) */
  matrix: Int16Array;
  /** 颜色索引波形 */
  matrix2d: number[][];
  /** RGB调色板 */
  palette: [number, number, number][];
  /** 元数据 */
  metadata: ImportMeta;
}

export interface ImportMeta {
  source: string;
  width: number;
  height: number;
  brushType: string;
  brushSize: number;
  paletteSize: number;
  totalPixels: number;
  offsetX: number;
  offsetY: number;
  allPreset: boolean;
  canvasMode: string;
  jsonBrushType?: string;
  jsonBrushSize?: number;
  pressData?: { h: number; s: number; b: number }[];
  error?: string;
}

/**
 * 解析第三方 living-the-grid JSON 文件。
 * 支持 preset / custom 两种调色盘，顺滑 / 像素两种画笔。
 */
export function importJson(
  data: any,
  brushType: string,
  brushSize: number,
  canvasMode: string,
): ImportResult {
  // 校验
  if (!data || !data.width || !data.height || !data.palette || !data.pixels) {
    return errorResult({ error: 'JSON 格式错误，缺少必要字段' });
  }

  const width: number = data.width;
  const height: number = Math.min(data.height, data.pixels.length);
  const rawPalette: any[] = data.palette;
  const rawPixels: (number | null)[][] = data.pixels;

  // 解析调色板
  const colorPalette: [number, number, number][] = [];
  const hexPalette: string[] = [];
  let pressData: { h: number; s: number; b: number }[] | undefined;
  let hasPress = false;

  for (const item of rawPalette) {
    if (typeof item === 'object' && item.hex) {
      const hex = item.hex.replace('#', '');
      colorPalette.push([
        parseInt(hex.substring(0, 2), 16),
        parseInt(hex.substring(2, 4), 16),
        parseInt(hex.substring(4, 6), 16),
      ]);
      hexPalette.push(item.hex.toUpperCase());
      hasPress = !!item.press;
    } else if (typeof item === 'string') {
      const hex = item.replace('#', '');
      colorPalette.push([
        parseInt(hex.substring(0, 2), 16),
        parseInt(hex.substring(2, 4), 16),
        parseInt(hex.substring(4, 6), 16),
      ]);
      hexPalette.push(item.toUpperCase());
    } else {
      return errorResult({ error: `无效的调色板颜色: ${item}` });
    }
  }

  if (hasPress) {
    pressData = rawPalette.map(item => {
      if (item.press) {
        let h = item.press.h || 0;
        if (h === 200) h = 199;
        else if (h === 201) h = 0;
        return { h, s: item.press.s || 0, b: item.press.b || 0 };
      }
      return { h: 0, s: 0, b: 0 };
    });
  }

  // 验证预设色
  const presetHexSet = new Set(getPresetPaletteHex());
  const missingHex = hexPalette.filter(h => !presetHexSet.has(h));
  const allPreset = missingHex.length === 0;

  // 计算居中偏移
  const cellSpan = brushSize;
  const patternW = width * cellSpan;
  const patternH = height * cellSpan;
  const offsetX = (256 - patternW) >> 1;
  const offsetY = (256 - patternH) >> 1;

  // 构建 256×256 矩阵
  const size = 256 * 256;
  const matrix = new Int16Array(size);
  matrix.fill(-1);

  for (let row = 0; row < height; row++) {
    if (row >= rawPixels.length) break;
    const rowData = rawPixels[row];
    if (!Array.isArray(rowData)) continue;
    for (let col = 0; col < Math.min(width, rowData.length); col++) {
      const idx = rowData[col];
      if (idx === null || idx === undefined) continue;
      if (typeof idx !== 'number' || idx < 0 || idx >= colorPalette.length) continue;

      const baseX = offsetX + col * cellSpan;
      const baseY = offsetY + row * cellSpan;

      let fillStartX: number, fillStartY: number;
      if (brushType === 'smooth' && cellSpan > 1) {
        const a = (cellSpan - 1) >> 1;
        const cx = baseX + (cellSpan >> 1);
        const cy = baseY + (cellSpan >> 1);
        fillStartX = cx - a;
        fillStartY = cy - a;
      } else {
        fillStartX = baseX;
        fillStartY = baseY;
      }

      for (let dy = 0; dy < cellSpan; dy++) {
        const y = fillStartY + dy;
        if (y < 0 || y >= 256) continue;
        for (let dx = 0; dx < cellSpan; dx++) {
          const x = fillStartX + dx;
          if (x < 0 || x >= 256) continue;
          matrix[y * 256 + x] = idx;
        }
      }
    }
  }

  // 转换为 2D 数组
  const matrix2d: number[][] = [];
  for (let y = 0; y < 256; y++) {
    const row: number[] = [];
    for (let x = 0; x < 256; x++) {
      row.push(matrix[y * 256 + x]);
    }
    matrix2d.push(row);
  }

  // 解析 JSON canvas mode
  let detectedMode = canvasMode;
  const jsonCanvas = data.canvas;
  if (jsonCanvas?.preset) {
    detectedMode = jsonPresetToCanvasMode(jsonCanvas.preset);
  }

  // 解析 JSON brush
  let jsonBrushType: string | undefined;
  let jsonBrushSize: number | undefined;
  if (data.brush) {
    if (data.brush.mode === 'smooth' || data.brush.mode === 'pixel') {
      jsonBrushType = data.brush.mode;
    }
    if (typeof data.brush.px === 'number') {
      jsonBrushSize = data.brush.px;
    }
  }

  let totalPixels = 0;
  for (let i = 0; i < size; i++) {
    if (matrix[i] >= 0) totalPixels++;
  }

  return {
    matrix, matrix2d, palette: colorPalette,
    metadata: {
      source: data.source || '',
      width, height, brushType, brushSize,
      paletteSize: colorPalette.length, totalPixels,
      offsetX, offsetY, allPreset,
      canvasMode: detectedMode,
      jsonBrushType, jsonBrushSize,
      pressData,
    },
  };
}

function errorResult(meta: Partial<ImportMeta>): ImportResult {
  const size = 256 * 256;
  const matrix = new Int16Array(size);
  matrix.fill(-1);
  return {
    matrix,
    matrix2d: [],
    palette: [],
    metadata: {
      source: '', width: 0, height: 0,
      brushType: 'smooth', brushSize: 1,
      paletteSize: 0, totalPixels: 0,
      offsetX: 0, offsetY: 0, allPreset: false,
      canvasMode: 'standard',
      ...meta,
    },
  };
}
