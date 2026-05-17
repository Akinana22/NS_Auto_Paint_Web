import { rgbToSteps } from './hsb-mapper';
import { getCanvasMode } from './canvas-mode';
import { GridCell, PixelJson, Palette, PaletteEntry } from './types';

const JSON_PRESET: Record<string, string> = {
  standard: 'square', book: 'book', tv: 'tv',
  game: 'videogame', decoration: 'interior',
};

/**
 * 将像素化 + 量化的 grid/matrix/palette 构建为 living-the-grid 兼容 JSON。
 */
export function gridToJson(
  grid: GridCell[][],
  palette: Palette,
  canvasMode: string,
  brushType: string,
  brushSize: number,
): PixelJson {
  const mode = getCanvasMode(canvasMode);
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  // 查找每个 grid cell 最近的调色板颜色
  function findClosest(r: number, g: number, b: number): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const [pr, pg, pb] = palette[i];
      const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // 构建像素索引矩阵
  const fullPixels: (number | null)[][] = [];
  const used = new Set<number>();

  for (const row of grid) {
    const pixelRow: (number | null)[] = [];
    for (const cell of row) {
      if (cell.a >= 128) {
        const idx = findClosest(cell.r, cell.g, cell.b);
        pixelRow.push(idx);
        used.add(idx);
      } else {
        pixelRow.push(null);
      }
    }
    fullPixels.push(pixelRow);
  }

  // 仅包含使用的颜色，重映射索引
  const sortedUsed = [...used].sort((a, b) => a - b);
  const idxMap = new Map<number, number>();
  sortedUsed.forEach((oldIdx, newIdx) => idxMap.set(oldIdx, newIdx));

  // 构建调色板（含 press 数据）
  const jpal: PaletteEntry[] = sortedUsed.map(ui => {
    const [r, g, b] = palette[ui];
    let [hs, ss, bs] = rgbToSteps(r, g, b);
    if (hs === 200) hs = 199;
    else if (hs === 201) hs = 0;
    return {
      hex: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase(),
      rgb: [r, g, b],
      press: { h: hs, s: ss, b: bs },
    };
  });

  // 重映射像素
  const pixels: (number | null)[][] = fullPixels.map(row =>
    row.map(idx => (idx !== null ? idxMap.get(idx)! : null)),
  );

  return {
    source: 'ns_auto_paint',
    version: 2,
    width: cols,
    height: rows,
    brush: { mode: brushType, px: brushSize },
    canvas: {
      preset: JSON_PRESET[canvasMode] || 'square',
      w: mode.activeW,
      h: mode.activeH,
    },
    palette: jpal,
    pixels,
  };
}
