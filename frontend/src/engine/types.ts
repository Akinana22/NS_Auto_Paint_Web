export interface Point {
  x: number;
  y: number;
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type ColorRGB = [number, number, number];
export type Palette = ColorRGB[];

export interface GridCell {
  r: number; g: number; b: number; a: number;
}

export interface PressData {
  h: number;
  s: number;
  b: number;
}

export interface PaletteEntry {
  hex: string;
  rgb: [number, number, number];
  press: PressData;
}

export interface LeafBlock {
  x: number;
  y: number;
  w: number;
  h: number;
  colorPoints: Map<number, Point[]>;
}

export interface ScheduleItem {
  block: LeafBlock;
  colorOrder: number[];
}

export type ColorIndexMatrix = Int16Array;
export type ColorIndexGrid = number[][];

export interface PipelineResult {
  image: HTMLImageElement;
  cropped: ImageData;
  pixelized: ImageData;
  quantized: ImageData;
  palette: Palette;
  grid: GridCell[][];
  matrix: number[][];  // color index matrix (2D)
  json: PixelJson;
}

export interface PixelJson {
  source: string;
  version: number;
  width: number;
  height: number;
  brush: { mode: string; px: number };
  canvas: { preset: string; w: number; h: number };
  palette: PaletteEntry[];
  pixels: (number | null)[][];
}

export interface ImageProcessParams {
  canvasMode: string;
  brushType: string;
  brushSize: number;
  maxColors: number;
  offsetX: number;
  offsetY: number;
}
