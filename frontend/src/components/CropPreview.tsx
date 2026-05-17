import { useRef, useEffect, useCallback, useState } from 'react';
import { getCanvasMode } from '../engine/canvas-mode';

interface Props {
  pixmapCanvas: HTMLCanvasElement | null;
  cropMode: boolean;
  canvasMode: string;
  offsetX: number;
  offsetY: number;
  onOffsetChange: (dx: number, dy: number) => void;
  scale: number;
  onScaleChange: (s: number) => void;
}

const CHECKER_SIZE = 8;
const CHECKER_LIGHT = '#cccccc';
const CHECKER_DARK = '#ffffff';
const DASH_COLOR = 'rgba(255,255,255,0.7)';
const SNAP_DIST = 4;
const GRID_THRESHOLD = 6;

const ZOOM_SNAPS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 4.0, 8.0, 16.0, 32.0];
const ZOOM_MIN = ZOOM_SNAPS[0];
const ZOOM_MAX = ZOOM_SNAPS[ZOOM_SNAPS.length - 1];
const WHEEL_STEP = 0.05;
const SNAP_TOLERANCE = 0.03;

function snapScale(s: number, cur: number): { snapped: number; changed: boolean } {
  let snapCur = cur; let minCur = Infinity;
  for (const v of ZOOM_SNAPS) { const d = Math.abs(cur - v); if (d < minCur) { minCur = d; snapCur = v; } }
  for (const snap of ZOOM_SNAPS) {
    if (Math.abs(s - snap) / snap <= SNAP_TOLERANCE && snap !== snapCur) return { snapped: snap, changed: true };
    if (snap <= s) continue; break;
  }
  return { snapped: s, changed: false };
}

function canvasRect(cw: number, ch: number, cW: number, cH: number, cropMode: boolean, scale: number, offsetX: number, offsetY: number) {
  if (cropMode) {
    const wf = (cw > 0) ? cW / cw : 1; const hf = (ch > 0) ? cH / ch : 1;
    const fs = Math.min(wf, hf, 1.0);
    return { x: Math.round((cW - cw * fs) / 2), y: Math.round((cH - ch * fs) / 2), w: Math.round(cw * fs), h: Math.round(ch * fs) };
  }
  const fw = Math.round(cw * scale); const fh = Math.round(ch * scale);
  return { x: Math.round((cW - fw) / 2 + offsetX), y: Math.round((cH - fh) / 2 + offsetY), w: fw, h: fh };
}

export default function CropPreview({ pixmapCanvas, cropMode, canvasMode, offsetX, offsetY, onOffsetChange, scale, onScaleChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const mode = getCanvasMode(canvasMode);
  const cw = mode.activeW;
  const ch = mode.activeH;

  const getContainerSize = () => {
    const c = containerRef.current;
    return { w: c?.clientWidth ?? 400, h: c?.clientHeight ?? 400 };
  };

  // ======== paintEvent ========
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const conW = container.clientWidth;
    const conH = container.clientHeight;
    canvas.width = Math.round(conW * dpr);
    canvas.height = Math.round(conH * dpr);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const fr = canvasRect(cw, ch, conW, conH, cropMode, scale, offsetX, offsetY);

    for (let y = fr.y; y < fr.y + fr.h; y += CHECKER_SIZE) {
      const hh = Math.min(CHECKER_SIZE, fr.y + fr.h - y);
      for (let x = fr.x; x < fr.x + fr.w; x += CHECKER_SIZE) {
        const ww = Math.min(CHECKER_SIZE, fr.x + fr.w - x);
        ctx.fillStyle = ((Math.floor((x - fr.x) / CHECKER_SIZE) + Math.floor((y - fr.y) / CHECKER_SIZE)) % 2 === 0) ? CHECKER_DARK : CHECKER_LIGHT;
        ctx.fillRect(x, y, ww, hh);
      }
    }

    const pm = pixmapCanvas;
    if (!pm || pm.width === 0) return;
    const pw = pm.width; const ph = pm.height;
    const sw = (cropMode) ? pw : Math.max(1, Math.round(pw * scale));
    const sh = (cropMode) ? ph : Math.max(1, Math.round(ph * scale));
    const cx = Math.round((conW - sw) / 2 + offsetX);
    const cy = Math.round((conH - sh) / 2 + offsetY);
    ctx.drawImage(pm, cx, cy, sw, sh);

    if (scale >= GRID_THRESHOLD) {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
      for (let x = 0; x <= pw; x++) { ctx.beginPath(); ctx.moveTo(cx + x * (sw / pw), cy); ctx.lineTo(cx + x * (sw / pw), cy + sh); ctx.stroke(); }
      for (let y = 0; y <= ph; y++) { ctx.beginPath(); ctx.moveTo(cx, cy + y * (sh / ph)); ctx.lineTo(cx + sw, cy + y * (sh / ph)); ctx.stroke(); }
    }

    if (cropMode) {
      ctx.lineWidth = 2; ctx.strokeStyle = DASH_COLOR; ctx.setLineDash([6, 3]);
      ctx.strokeRect(fr.x, fr.y, fr.w, fr.h); ctx.setLineDash([]);
      const cx2 = Math.round((conW - pw) / 2 + offsetX);
      const cy2 = Math.round((conH - ph) / 2 + offsetY);
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.beginPath();
      ctx.rect(cx2, cy2, pw, ph); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.fill('evenodd'); ctx.restore();
    }
  }, [pixmapCanvas, cropMode, canvasMode, offsetX, offsetY, scale, cw, ch]);

  useEffect(() => { draw(); }, [draw]);

  // window resize → redraw
  useEffect(() => {
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [draw]);

  // ======== mouse events (drag) ========
  const getCanvasPos = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const handleDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); const pos = getCanvasPos(e.clientX, e.clientY); lastPosRef.current = pos; setDrag(true);
  }, [getCanvasPos]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const pos = getCanvasPos(e.clientX, e.clientY);
      const dx = pos.x - lastPosRef.current.x; const dy = pos.y - lastPosRef.current.y;
      lastPosRef.current = pos;
      onOffsetChange(offsetX + dx, offsetY + dy);
    };
    const onUp = () => {
      setDrag(false);
      if (cropMode && pixmapCanvas) {
        const cs = getContainerSize();
        const pw = pixmapCanvas.width; const ph = pixmapCanvas.height;
        const imgLeft = (cs.w - pw) / 2 + offsetX; const imgTop = (cs.h - ph) / 2 + offsetY;
        const fr = canvasRect(cw, ch, cs.w, cs.h, true, 1, offsetX, offsetY);
        let nx = offsetX, ny = offsetY;
        if (Math.abs(imgLeft - fr.x) <= SNAP_DIST) nx += Math.round(fr.x - imgLeft);
        else if (Math.abs(imgLeft + pw - (fr.x + fr.w)) <= SNAP_DIST) nx += Math.round(fr.x + fr.w - (imgLeft + pw));
        if (Math.abs(imgTop - fr.y) <= SNAP_DIST) ny += Math.round(fr.y - imgTop);
        else if (Math.abs(imgTop + ph - (fr.y + fr.h)) <= SNAP_DIST) ny += Math.round(fr.y + fr.h - (imgTop + ph));
        if (nx !== offsetX || ny !== offsetY) onOffsetChange(nx, ny);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [drag, cropMode, offsetX, offsetY, onOffsetChange, getCanvasPos, pixmapCanvas, cw, ch]);

  // ======== wheelEvent via useEffect (passive:false) ========
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (!e.shiftKey) return;
      const rect = el.getBoundingClientRect();
      const ax = e.clientX - rect.left; const ay = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? -WHEEL_STEP : WHEEL_STEP;
      let ns = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scaleRef.current + delta));
      const { snapped, changed } = snapScale(ns, scaleRef.current);
      if (changed) ns = snapped;

      const pm = pixmapCanvasRef.current;
      if (cropModeRef.current && pm) {
        const cs = getContainerSize();
        const pw = pm.width; const ph = pm.height;
        const oldCx = (cs.w - pw) / 2 + offsetXRef.current;
        const oldCy = (cs.h - ph) / 2 + offsetYRef.current;
        const ratio = ns / scaleRef.current;
        const wn = Math.max(1, Math.round(pw * ratio));
        const hn = Math.max(1, Math.round(ph * ratio));
        const px = ax - oldCx; const py = ay - oldCy;
        const newOx = Math.round(ax - (cs.w - wn) / 2 - px * ratio);
        const newOy = Math.round(ay - (cs.h - hn) / 2 - py * ratio);
        offsetXRef.current = newOx; offsetYRef.current = newOy;
        scaleRef.current = ns;
        onOffsetChangeRef.current(newOx, newOy);
      }
      scaleRef.current = ns;
      onScaleChangeRef.current(ns);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const pixmapCanvasRef = useRef(pixmapCanvas); pixmapCanvasRef.current = pixmapCanvas;
  const offsetXRef = useRef(offsetX); offsetXRef.current = offsetX;
  const offsetYRef = useRef(offsetY); offsetYRef.current = offsetY;
  const onScaleChangeRef = useRef(onScaleChange); onScaleChangeRef.current = onScaleChange;
  const onOffsetChangeRef = useRef(onOffsetChange); onOffsetChangeRef.current = onOffsetChange;
  const scaleRef = useRef(scale); scaleRef.current = scale;
  const cropModeRef = useRef(cropMode); cropModeRef.current = cropMode;

  // ======== keyPressEvent ========
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!cropMode) return;
    const map: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = map[e.key];
    if (d) { e.preventDefault(); onOffsetChange(offsetX + d[0], offsetY + d[1]); }
  }, [cropMode, offsetX, offsetY, onOffsetChange]);

  // ======== zoom toolbar ========
  const zoomAtCenter = useCallback((ns: number) => {
    const pm = pixmapCanvas;
    if (pm) {
      const cs = getContainerSize();
      const pw = pm.width; const ph = pm.height;
      const ratio = ns / scale;
      const px = cs.w / 2 - (cs.w - pw) / 2 - offsetX;
      const py = cs.h / 2 - (cs.h - ph) / 2 - offsetY;
      onOffsetChange(
        Math.round(cs.w / 2 - (cs.w - pw * ratio) / 2 - px * ratio),
        Math.round(cs.h / 2 - (cs.h - ph * ratio) / 2 - py * ratio),
      );
    }
    onScaleChange(ns);
  }, [pixmapCanvas, scale, offsetX, offsetY, onOffsetChange, onScaleChange]);

  const zoomIn  = useCallback(() => { for (const s of ZOOM_SNAPS) if (s > scale + 0.001) { zoomAtCenter(s); return; } }, [scale, zoomAtCenter]);
  const zoomOut = useCallback(() => { for (const s of [...ZOOM_SNAPS].reverse()) if (s < scale - 0.001) { zoomAtCenter(s); return; } }, [scale, zoomAtCenter]);
  const fitView = useCallback(() => { onScaleChange(1.0); onOffsetChange(0, 0); }, [onScaleChange, onOffsetChange]);

  return (
    <div ref={containerRef} style={{ position: 'relative', overflow: 'hidden', flex: 1, width: '100%', height: '100%' }}
      tabIndex={0} onKeyDown={handleKeyDown}>
      <canvas ref={canvasRef}
        style={{ imageRendering: scale >= GRID_THRESHOLD ? 'pixelated' : 'auto', cursor: drag ? 'grabbing' : 'grab', width: '100%', height: '100%', display: 'block' }}
        onMouseDown={handleDown} />
      <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 2, background: 'rgba(20,20,20,0.85)', borderRadius: 6, padding: 4 }}>
        <button onClick={zoomOut} style={{ minWidth: 24, fontSize: 14, padding: '2px 6px', background: 'rgba(60,60,60,0.8)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4 }}>−</button>
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', fontSize: 12, color: '#000', background: 'rgba(255,255,255,0.85)', borderRadius: 3, minWidth: 42, justifyContent: 'center' }}>{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} style={{ minWidth: 24, fontSize: 14, padding: '2px 6px', background: 'rgba(60,60,60,0.8)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4 }}>+</button>
        <button onClick={fitView} style={{ minWidth: 24, fontSize: 12, padding: '2px 6px', background: 'rgba(60,60,60,0.8)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4 }}>⊓</button>
      </div>
    </div>
  );
}
