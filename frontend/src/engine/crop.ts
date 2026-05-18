import { getCanvasMode } from './canvas-mode';

/** 浏览器端 LANCZOS-like 缩放 (使用 CSS image-rendering + Canvas 重绘) */
export function fitToCanvas(image: HTMLImageElement, canvasMode: string): HTMLCanvasElement {
  const mode = getCanvasMode(canvasMode);
  const cw = mode.activeW;
  const ch = mode.activeH;
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  const scale = Math.max(cw / iw, ch / ih);
  const newW = Math.max(1, Math.round(iw * scale));
  const newH = Math.max(1, Math.round(ih * scale));

  const canvas = document.createElement('canvas');
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, newW, newH);
  return canvas;
}

export function cropToRegion(
  source: HTMLCanvasElement | ImageData,
  left: number, top: number, right: number, bottom: number
): ImageData {
  let data: ImageData;
  if (source instanceof HTMLCanvasElement) {
    const ctx = source.getContext('2d')!;
    data = ctx.getImageData(0, 0, source.width, source.height);
  } else {
    data = source;
  }
  const w = right - left;
  const h = bottom - top;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const tmp = new OffscreenCanvas(data.width, data.height);
  const tctx = tmp.getContext('2d')!;
  tctx.putImageData(data, 0, 0);
  ctx.drawImage(tmp, left, top, w, h, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h)!;
}

export function canvasToImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d')!;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function imageDataToPixelArray(img: ImageData): { r: number; g: number; b: number; a: number }[][] {
  const { data, width, height } = img;
  const result: { r: number; g: number; b: number; a: number }[][] = [];
  for (let y = 0; y < height; y++) {
    const row: { r: number; g: number; b: number; a: number }[] = [];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      row.push({ r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] });
    }
    result.push(row);
  }
  return result;
}

export function imageDataToCanvas(img: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** getCropOffset: returns (left,top,right,bottom) in fitted image pixel coordinates */
export function getCropOffset(
  fittedW: number, fittedH: number,
  canvasMode: string, offsetX: number, offsetY: number
): { left: number; top: number; right: number; bottom: number; ox: number; oy: number } {
  const mode = getCanvasMode(canvasMode);
  const left   = Math.max(0, Math.round((fittedW - mode.activeW) / 2 - offsetX));
  const top    = Math.max(0, Math.round((fittedH - mode.activeH) / 2 - offsetY));
  const ox = Math.max(0, Math.round(mode.activeW / 2 - fittedW / 2 + offsetX));
  const oy = Math.max(0, Math.round(mode.activeH / 2 - fittedH / 2 + offsetY));
  return {
    left, top,
    right:  Math.min(fittedW, Math.round((fittedW + mode.activeW) / 2 - offsetX)),
    bottom: Math.min(fittedH, Math.round((fittedH + mode.activeH) / 2 - offsetY)),
    ox, oy,
  };
}

export function getCropSize(canvasMode: string): { w: number; h: number } {
  const mode = getCanvasMode(canvasMode);
  return { w: mode.activeW, h: mode.activeH };
}
