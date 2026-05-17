export interface CanvasMode {
  name: string;
  width: number;
  height: number;
  activeX: number;
  activeY: number;
  activeW: number;
  activeH: number;
  startX: number;
  startY: number;
}

export const CANVAS_MODES: Record<string, CanvasMode> = {
  standard: {
    name: '标准', width: 256, height: 256,
    activeX: 0, activeY: 0, activeW: 256, activeH: 256,
    startX: 128, startY: 128,
  },
  book: {
    name: '书籍', width: 256, height: 256,
    activeX: 38, activeY: 0, activeW: 180, activeH: 256,
    startX: 128, startY: 128,
  },
  tv: {
    name: '电视', width: 256, height: 256,
    activeX: 0, activeY: 63, activeW: 256, activeH: 131,
    startX: 128, startY: 128,
  },
  game: {
    name: '游戏', width: 256, height: 256,
    activeX: 0, activeY: 56, activeW: 256, activeH: 144,
    startX: 128, startY: 128,
  },
  decoration: {
    name: '装修', width: 256, height: 256,
    activeX: 42, activeY: 0, activeW: 172, activeH: 256,
    startX: 128, startY: 128,
  },
};

export const DEFAULT_CANVAS_MODE = 'standard';

export const JSON_TO_CANVAS_MODE: Record<string, string> = {
  square: 'standard',
  book: 'book',
  tv: 'tv',
  videogame: 'game',
  interior: 'decoration',
};

export const CANVAS_MODE_DISPLAY: Record<string, string> = {
  standard: '标准', book: '书籍', tv: '电视',
  game: '游戏', decoration: '装修',
};

export function getCanvasMode(mode?: string): CanvasMode {
  return CANVAS_MODES[mode || DEFAULT_CANVAS_MODE] || CANVAS_MODES[DEFAULT_CANVAS_MODE];
}

export function jsonPresetToCanvasMode(preset: string): string {
  return JSON_TO_CANVAS_MODE[preset] || DEFAULT_CANVAS_MODE;
}
