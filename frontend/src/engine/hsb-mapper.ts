/**
 * HSB 映射器 — 游戏内自定义选色器非线性校准。
 * 将 RGB 颜色映射为 ZR/右/上 按键次数 (h/s/b steps)。
 * 浏览器端纯 TypeScript 实现，使用多分辨率搜索替代 LUT。
 */

// 色相锚定点: (step, hex_color)
const HUE_ANCHORS: [number, string][] = [
  [0, '#FF0000'], [34, '#FF00FF'], [64, '#0000FF'],
  [100, '#00FFFF'], [136, '#00FF00'], [166, '#FFFF00'],
  [200, '#FF0000'],
];

export const H_MAX = 200;
export const S_MAX = 212;
export const V_MAX = 111;

// ---- 缓存 ----
const _reverseCache = new Map<number, [number, number, number]>();

function cacheKey(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

// ---- 正向映射: (h,s,b) steps → RGB ----

function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

function rgb01ToH(r: number, g: number, b: number): number {
  const mn = Math.min(r, g, b);
  const mx = Math.max(r, g, b);
  const d = mx - mn;
  if (d === 0) return 0;
  if (mx === r) return 60 * (((g - b) / d) % 6);
  if (mx === g) return 60 * ((b - r) / d + 2);
  return 60 * ((r - g) / d + 4);
}

function hsvToRgb01(h: number, s: number, v: number): [number, number, number] {
  if (s === 0) return [v, v, v];
  const hh = h / 60;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  const lut: [number, number, number][] = [
    [v, t, p], [q, v, p], [p, v, t],
    [p, q, v], [t, p, v], [v, p, q],
  ];
  return lut[i % 6] || [0, 0, 0];
}

function hueAngleForStep(hStep: number): number {
  for (let i = 0; i < HUE_ANCHORS.length - 1; i++) {
    const [s0, h0] = HUE_ANCHORS[i];
    const [s1, h1] = HUE_ANCHORS[i + 1];
    if (s0 <= hStep && hStep <= s1) {
      if (s1 === s0) break;
      const t = (hStep - s0) / (s1 - s0);
      let hue0 = rgb01ToH(...hexToRgb01(h0));
      let hue1 = rgb01ToH(...hexToRgb01(h1));
      if (Math.abs(hue1 - hue0) > 180) {
        if (hue0 < hue1) hue0 += 360;
        else hue1 += 360;
      }
      return (hue0 + t * (hue1 - hue0)) % 360;
    }
  }
  return 0;
}

function saturationForStep(sStep: number): number {
  const p = Math.max(0, Math.min(1, sStep / S_MAX));
  if (p === 0) return 0;
  return Math.max(0, Math.min(1, 0.49 * p + 0.2 * Math.pow(p, 38) + 0.31 * Math.pow(p, 3.9)));
}

function brightnessForStep(bStep: number): number {
  const p = Math.max(0, Math.min(1, bStep / V_MAX));
  if (p === 0) return 0;
  return Math.pow(p, 1.0 / 2.26);
}

/** 正向映射: (h,s,v) 步数值 → RGB [0-255] */
export function hsvStepsToRgb(hStep: number, sStep: number, bStep: number): [number, number, number] {
  const hue = hueAngleForStep(hStep);
  const sat = saturationForStep(sStep);
  const val = brightnessForStep(bStep);
  const [r01, g01, b01] = hsvToRgb01(hue, sat, val);
  return [
    Math.round(r01 * 255),
    Math.round(g01 * 255),
    Math.round(b01 * 255),
  ];
}

// ---- 反向映射: RGB → (h,s,b) steps ----

function sqDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

/**
 * 将 RGB 颜色映射为 (h_step, s_step, b_step)。
 * 使用多分辨率搜索（16步粗搜 + 精细搜索），结果缓存。
 */
export function rgbToSteps(r: number, g: number, b: number): [number, number, number] {
  const key = cacheKey(r, g, b);
  const cached = _reverseCache.get(key);
  if (cached) return cached;

  let bestH = 0, bestS = 0, bestV = 0;
  let bestDist = Infinity;

  // 粗搜：步长 16
  const COARSE = 16;
  for (let h = 0; h <= H_MAX; h += COARSE) {
    for (let s = 0; s <= S_MAX; s += COARSE) {
      for (let v = 0; v <= V_MAX; v += COARSE) {
        const [pr, pg, pb] = hsvStepsToRgb(h, s, v);
        const d = sqDist(r, g, b, pr, pg, pb);
        if (d < bestDist) { bestDist = d; bestH = h; bestS = s; bestV = v; }
      }
    }
  }

  // 精细搜索：粗搜最佳点周围 ±16
  for (let h = Math.max(0, bestH - COARSE); h <= Math.min(H_MAX, bestH + COARSE); h++) {
    for (let s = Math.max(0, bestS - COARSE); s <= Math.min(S_MAX, bestS + COARSE); s++) {
      for (let v = Math.max(0, bestV - COARSE); v <= Math.min(V_MAX, bestV + COARSE); v++) {
        const [pr, pg, pb] = hsvStepsToRgb(h, s, v);
        const d = sqDist(r, g, b, pr, pg, pb);
        if (d < bestDist) { bestDist = d; bestH = h; bestS = s; bestV = v; }
      }
    }
  }

  const result: [number, number, number] = [bestH, bestS, bestV];
  _reverseCache.set(key, result);
  return result;
}

/**
 * 批量 RGB → steps 映射（使用 Web Worker 避免阻塞 UI）。
 * 简单场景无需 worker，直接同步调用。
 */
export function rgbToStepsBatch(colors: [number, number, number][]): [number, number, number][] {
  return colors.map(([r, g, b]) => rgbToSteps(r, g, b));
}
