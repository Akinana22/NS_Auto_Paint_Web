import { useState, useRef, useCallback, useEffect } from 'react';
import { fitToCanvas, cropToRegion, getCropOffset } from '../engine/crop';
import { pixelize } from '../engine/pixelize';
import { quantize, expandQuantizedToCanvas } from '../engine/quantize';
import { gridToJson } from '../engine/json-builder';
import { importJson } from '../engine/json-importer';
import { getCanvasMode } from '../engine/canvas-mode';
import { PRESET_PALETTE_HEX } from '../engine/preset-palette';
import { findBestSchedule, estimateScheduleCost } from '../compiler/optimizer';
import { compileDrawingScript } from '../compiler/command-builder';
import { createTimingSnapshot } from '../compiler/timing';
import { PicoSerial, crc32 } from '../serial/pico-flash';
import { PixelJson, Palette, GridCell } from '../engine/types';
import CropPreview from '../components/CropPreview';

const CANVAS_MODE_NAMES: Record<string, string> = {
  standard: '标准', book: '书籍', tv: '电视', game: '游戏', decoration: '装修',
};
const CANVAS_MODE_KEYS = ['standard', 'book', 'tv', 'game', 'decoration'];
const BLOCK_SIZES = [1, 3, 4, 7, 8, 13, 16, 19, 27, 32];
const COLOR_VALUES = [2, 4, 8, 16, 32, 64, 128, 256];

const JSON_PLACEHOLDER = '文件来源: \n网格大小: \n画布类型: \n笔尖类型: \n最小像素: \n颜色数量: ';

export default function TomodachiPage() {
  const [stage, setStage] = useState(0);
  const [canvasMode, setCanvasMode] = useState('standard');
  const [brushType, setBrushType] = useState('pixel');
  const [brushSize, setBrushSize] = useState(1);
  const [drawingMode, setDrawingMode] = useState('image');

  const [blockSizeIdx, setBlockSizeIdx] = useState(0);
  const [colorIdx, setColorIdx] = useState(3);

  const _blockSize = BLOCK_SIZES[blockSizeIdx];
  const _maxColorsVal = COLOR_VALUES[colorIdx];

  const [pixelBlockSize, setPixelBlockSize] = useState(0);
  const [genBlockSize, setGenBlockSize] = useState(-1);
  const [lastQuantizedColorIndex, setLastQuantizedColorIndex] = useState(-1);
  const [genColorIndex, setGenColorIndex] = useState(-1);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fittedCanvas, setFittedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [croppedImage, setCroppedImage] = useState<ImageData | null>(null);
  const [blockGrid, setBlockGrid] = useState<GridCell[][] | null>(null);
  const [pipelinePalette, setPipelinePalette] = useState<Palette | null>(null);
  const [pipelineJson, setPipelineJson] = useState<PixelJson | null>(null);

  const [jsonLoaded, setJsonLoaded] = useState(false);
  const [jsonMatrix, setJsonMatrix] = useState<number[][] | null>(null);
  const [jsonPalette, setJsonPalette] = useState<Palette | null>(null);
  const [jsonMetadata, setJsonMetadata] = useState<any>(null);
  const [jsonFilePath, setJsonFilePath] = useState('');
  const [generatedIsPreset, setGeneratedIsPreset] = useState(false);
  const [pressData, setPressData] = useState<{h:number;s:number;b:number}[] | undefined>();
  const [colorIndexMatrix, setColorIndexMatrix] = useState<number[][] | null>(null);
  const [colorPalette, setColorPalette] = useState<Palette | null>(null);

  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const colStartsRef = useRef<number[]>([]);
  const rowStartsRef = useRef<number[]>([]);

  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [jsonStatusText, setJsonStatusText] = useState('');
  const [binaryData, setBinaryData] = useState<Uint8Array | null>(null);
  const [scheduleInfo, setScheduleInfo] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmEstimate, setConfirmEstimate] = useState<any>(null);

  const [pico, setPico] = useState<PicoSerial | null>(null);
  const [serialInfo, setSerialInfo] = useState('');
  const [estimatedMsVal, setEstimatedMsVal] = useState(0);

  const fileRef = useRef<HTMLInputElement>(null);
  const [previewTitle, setPreviewTitle] = useState('预览');
  const [pixmapCanvas, setPixmapCanvasState] = useState<HTMLCanvasElement | null>(null);
  const [scale, setScale] = useState(1.0);

  // setPixmap: ImageData → Canvas, exactly matching original setPixmap(QPixmap)
  const setPixmapCanvas = useCallback((data: ImageData) => {
    const c = document.createElement('canvas');
    c.width = data.width;
    c.height = data.height;
    c.getContext('2d')!.putImageData(data, 0, 0);
    setPixmapCanvasState(c);
  }, []);

  // ======== _update_stage_buttons ========
  const canCrop = stage === 1;
  const canPixelize = stage >= 2 && _blockSize !== pixelBlockSize;
  const canLimitColors = stage >= 3 &&
    (lastQuantizedColorIndex < 0 || colorIdx !== lastQuantizedColorIndex);
  const canGenerateJson = stage >= 4 && lastQuantizedColorIndex >= 0 &&
    (pixelBlockSize !== genBlockSize || lastQuantizedColorIndex !== genColorIndex);
  const canConfirm = jsonLoaded;

  useEffect(() => {
    const nm = CANVAS_MODE_NAMES[canvasMode] || '标准';
    const mode = getCanvasMode(canvasMode);
    if (stage >= 5 && pipelineJson) {
      setPreviewTitle(`预览 - 画布: ${nm} ${mode.activeW}x${mode.activeH}  网格: ${pipelineJson.width}x${pipelineJson.height}`);
    } else if (jsonLoaded && jsonMetadata) {
      const jm = getCanvasMode(jsonMetadata.canvasMode || canvasMode);
      setPreviewTitle(`预览 - 画布: ${nm} ${jm.activeW}x${jm.activeH}  网格: ${jsonMetadata.width}x${jsonMetadata.height}`);
    } else {
      setPreviewTitle(`预览 - 画布: ${nm} ${mode.activeW}x${mode.activeH}`);
    }
  }, [stage, canvasMode, pipelineJson, jsonLoaded, jsonMetadata]);

  // _rebuild_pixmap — exact translation: rebuild fitted at given scale
  const rebuildPixmapAtScale = useCallback((sourceImage: HTMLImageElement, mode: string, s: number) => {
    const m = getCanvasMode(mode);
    const tw = Math.max(1, Math.round(m.activeW * s));
    const th = Math.max(1, Math.round(m.activeH * s));
    const iw = sourceImage.naturalWidth;
    const ih = sourceImage.naturalHeight;
    const r = Math.max(tw / iw, th / ih);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(iw * r));
    c.height = Math.max(1, Math.round(ih * r));
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceImage, 0, 0, c.width, c.height);
    return c;
  }, []);

  // synchronous scale + pixmap rebuild (React 18 batches setScale+setPixmapCanvasState)
  const handleScaleChange = useCallback((ns: number) => {
    setScale(ns);
    if (stage === 1 && image) {
      setPixmapCanvasState(rebuildPixmapAtScale(image, canvasMode, ns));
    }
  }, [stage, image, canvasMode, rebuildPixmapAtScale]);

  const updateJsonStatus = useCallback(() => {
    if (!jsonLoaded) { setJsonStatusText(''); return; }
    const mode = getCanvasMode(canvasMode);
    let src: string, gridW: any, gridH: any, bt: string, bs: number, nColors: any;
    if (jsonMetadata) {
      src = jsonMetadata.source || 'unknown';
      gridW = jsonMetadata.width;
      gridH = jsonMetadata.height;
      bt = jsonMetadata.jsonBrushType || brushType;
      bs = jsonMetadata.jsonBrushSize || brushSize;
      nColors = jsonMetadata.paletteSize;
    } else if (pipelineJson) {
      src = pipelineJson.source || 'ns_auto_paint';
      gridW = pipelineJson.width;
      gridH = pipelineJson.height;
      bt = pipelineJson.brush?.mode || brushType;
      bs = pipelineJson.brush?.px || brushSize;
      nColors = pipelineJson.palette?.length ?? 0;
    } else { setJsonStatusText(''); return; }
    const cname = CANVAS_MODE_NAMES[canvasMode] || canvasMode;
    setJsonStatusText(
      `文件来源: ${src}\n网格大小: ${gridW}\u00d7${gridH}\n` +
      `画布类型: ${cname} ${mode.activeW}\u00d7${mode.activeH}\n笔尖类型: ${bt}\n` +
      `最小像素: ${bs}px\n颜色数量: ${nColors}`
    );
  }, [jsonLoaded, jsonMetadata, pipelineJson, canvasMode, brushType, brushSize, jsonFilePath]);

  useEffect(() => { updateJsonStatus(); }, [updateJsonStatus]);

  const loadJsonAndRender = useCallback((data: PixelJson, filePath: string) => {
    setJsonFilePath(filePath);
    const brush = data.brush || {};
    const bt = brush.mode || 'pixel';
    const bs = brush.px || 1;
    setBrushType(bt);
    setBrushSize(bs);

    const result = importJson(data, bt, bs, canvasMode);
    setJsonMatrix(result.matrix2d);
    setJsonPalette(result.palette);
    setJsonMetadata(result.metadata);
    setJsonLoaded(true);
    setGeneratedIsPreset(result.metadata.allPreset);
    setPressData(result.metadata.pressData);

    const detectedMode = result.metadata.canvasMode;
    if (detectedMode && detectedMode !== canvasMode) setCanvasMode(detectedMode);

    // _update_preview_from_matrix → setPixmap
    const h = result.matrix2d.length;
    const w = result.matrix2d[0]?.length ?? 0;
    const imgArr = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const ci = result.matrix2d[y][x];
        if (ci >= 0 && ci < result.palette.length) {
          const [r, g, b] = result.palette[ci];
          imgArr[idx] = r; imgArr[idx + 1] = g; imgArr[idx + 2] = b; imgArr[idx + 3] = 255;
        }
      }
    }
    setPixmapCanvas(new ImageData(imgArr, w, h));
    setColorIndexMatrix(result.matrix2d);
    setColorPalette(result.palette);
    updateJsonStatus();
    setStatusText('');
  }, [canvasMode, setPixmapCanvas, updateJsonStatus]);

  const onUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setFittedCanvas(fitToCanvas(img, canvasMode));
        setOffsetX(0); setOffsetY(0);
        setScale(1.0);
        setPixmapCanvasState(fitToCanvas(img, canvasMode)); // setSourceImage → pixmap = fitted
        setStage(1);
        setStatusText('');
        setJsonLoaded(false);
        setJsonMatrix(null);
        setJsonPalette(null);
        setJsonMetadata(null);
        setPipelineJson(null);
        setDrawingMode('image');
        // full reset
        setBlockGrid(null); setCroppedImage(null); setPipelinePalette(null);
        setPixelBlockSize(0); setGenBlockSize(-1); setLastQuantizedColorIndex(-1); setGenColorIndex(-1);
        setColorIndexMatrix(null); setColorPalette(null); setBinaryData(null);
        setScheduleInfo(''); setEstimatedMsVal(0); setConfirmEstimate(null);
        setBrushType('pixel'); setBrushSize(1); setBlockSizeIdx(0); setColorIdx(3);
        colStartsRef.current = []; rowStartsRef.current = [];
        setPreviewTitle(`预览 - 画布: ${CANVAS_MODE_NAMES[canvasMode] || '标准'}`);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }, [canvasMode]);

  const onCrop = useCallback(() => {
    if (!pixmapCanvas) return;
    setLoading(true);
    const mode = getCanvasMode(canvasMode);
    const pmw = pixmapCanvas.width;
    const pmh = pixmapCanvas.height;
    const off = getCropOffset(pmw, pmh, canvasMode, offsetX, offsetY);
    const cropped = cropToRegion(pixmapCanvas, off.left, off.top, off.right, off.bottom);
    const canvas = document.createElement('canvas');
    canvas.width = mode.activeW; canvas.height = mode.activeH;
    const ctx = canvas.getContext('2d')!;
    const tmp = new OffscreenCanvas(cropped.width, cropped.height);
    tmp.getContext('2d')!.putImageData(cropped, 0, 0);
    ctx.drawImage(tmp, 0, 0);
    const result = ctx.getImageData(0, 0, mode.activeW, mode.activeH);
    setCroppedImage(result);
    setPixmapCanvas(result); // setPixmap(cropped_pixmap)
    setScale(1.0); setOffsetX(0); setOffsetY(0);
    setStage(2);
    setStatusText('');
    setLoading(false);
  }, [pixmapCanvas, canvasMode, offsetX, offsetY, setPixmapCanvas]);

  const onPixelize = useCallback(() => {
    if (!croppedImage) return;
    setLoading(true);
    const bs = BLOCK_SIZES[blockSizeIdx];
    const { image, grid, colStarts, rowStarts } = pixelize(croppedImage, canvasMode, bs);
    setBlockGrid(grid);
    colStartsRef.current = colStarts;
    rowStartsRef.current = rowStarts;
    setPixmapCanvas(image); // setPixmap(pixelized)
    setScale(1.0); setOffsetX(0); setOffsetY(0);
    setPixelBlockSize(bs);
    setLastQuantizedColorIndex(-1);
    setStage(3);
    setStatusText('');
    setLoading(false);
  }, [croppedImage, canvasMode, blockSizeIdx, setPixmapCanvas]);

  const onLimitColors = useCallback(() => {
    if (!blockGrid) return;
    setLoading(true);
    const mc = COLOR_VALUES[colorIdx];
    const { palette, matrix } = quantize(blockGrid, mc);
    setPipelinePalette(palette);
    // expand quantized block-grid back to canvas dimensions for preview
    const m = getCanvasMode(canvasMode);
    const previewImg = expandQuantizedToCanvas(blockGrid, palette, colStartsRef.current, rowStartsRef.current, m.activeW, m.activeH);
    setPixmapCanvas(previewImg);
    setScale(1.0); setOffsetX(0); setOffsetY(0);
    setLastQuantizedColorIndex(colorIdx);
    setStage(4);
    setStatusText('');
    setLoading(false);
  }, [blockGrid, colorIdx, setPixmapCanvas]);

  const onGenerateJson = useCallback(() => {
    if (!blockGrid || !pipelinePalette) return;
    setJsonStatusText('正在构建JSON\u2026');
    setLoading(true);
    const jd = gridToJson(blockGrid, pipelinePalette, canvasMode, 'pixel', pixelBlockSize);
    setPipelineJson(jd);
    setGenBlockSize(pixelBlockSize);
    setGenColorIndex(lastQuantizedColorIndex);
    setStage(5);
    setStatusText('');
    setLoading(false);
    setDrawingMode('json');
    loadJsonAndRender(jd, 'generated');
  }, [blockGrid, pipelinePalette, canvasMode, pixelBlockSize, lastQuantizedColorIndex, loadJsonAndRender]);

  const onUploadJson = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as PixelJson;
        setPipelineJson(data);
        setStage(4);
        setDrawingMode('json');
        loadJsonAndRender(data, file.name);
      } catch (e: any) { setStatusText(`JSON解析失败: ${e.message}`); }
    };
    reader.readAsText(file);
  }, [loadJsonAndRender]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith('.json')) onUploadJson(file);
    else onUpload(file);
    e.target.value = '';
  }, [onUpload, onUploadJson]);

  const onConfirm = useCallback(() => {
    if (!colorIndexMatrix) return;
    setLoading(true);
    const timing = createTimingSnapshot();
    try {
      let gridMatrix: number[][], gridW: number, gridH: number;
      if (drawingMode === 'json' && brushSize) {
        const step = brushSize;
        gridH = Math.floor(colorIndexMatrix.length / step);
        gridW = Math.floor((colorIndexMatrix[0]?.length ?? 0) / step);
        gridMatrix = [];
        for (let y = 0; y < gridH; y++) {
          const row: number[] = [];
          for (let x = 0; x < gridW; x++) row.push(colorIndexMatrix[y * step][x * step]);
          gridMatrix.push(row);
        }
      } else {
        gridH = colorIndexMatrix.length;
        gridW = colorIndexMatrix[0]?.length ?? 0;
        gridMatrix = colorIndexMatrix;
      }
      const best = findBestSchedule(gridMatrix,
        drawingMode === 'json' ? brushType : 'pixel',
        drawingMode === 'json' ? brushSize : 1,
        generatedIsPreset, colorPalette || [], pressData, timing);
      const totalMs = estimateScheduleCost(best.schedule,
        drawingMode === 'json' ? brushType : 'pixel',
        drawingMode === 'json' ? brushSize : 1,
        generatedIsPreset, gridW, gridH,
        colorPalette || [], pressData, timing);
      const minutes = Math.floor(totalMs / 60000);
      const seconds = Math.floor((totalMs % 60000) / 1000);
      const { binary } = compileDrawingScript(best.schedule, colorPalette || [], brushType, brushSize, generatedIsPreset, pressData, timing);
      setBinaryData(binary);
      setScheduleInfo(best.description);
      setEstimatedMsVal(totalMs);
      setConfirmEstimate({
        totalMs, bestDesc: best.description,
        evaluationLog: best.logs,
        formattedTime: `${minutes} 分 ${seconds} 秒`,
        binary,
      });
      setShowConfirmDialog(true);
    } catch (e: any) { setStatusText(`评估失败: ${e.message}`); }
    setLoading(false);
  }, [colorIndexMatrix, colorPalette, drawingMode, brushType, brushSize, generatedIsPreset, pressData]);

  const handleConfirmYes = useCallback(() => {
    setShowConfirmDialog(false);
    setStatusText('脚本已生成，请上传到 Pico');
  }, []);

  const scriptInfoText = estimatedMsVal
    ? `最优方案: ${scheduleInfo}\n预计耗时: ${(estimatedMsVal / 1000).toFixed(1)}秒 (${(estimatedMsVal / 60000).toFixed(1)}分钟)`
    : '最优方案: \n预计耗时: ';
  const downloadScript = useCallback(() => {
    if (!binaryData) return;
    const blob = new Blob([binaryData], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ns_auto_paint_script.bin';
    a.click();
  }, [binaryData]);

  const onOpenPixelWebsite = useCallback(() => {
    window.open('https://living-the-grid.com', '_blank');
  }, []);

  // ---- Pico ----
  const handleConnectPico = useCallback(async () => {
    try {
      const ps = new PicoSerial();
      const info = await ps.connect();
      setPico(ps);
      setSerialInfo(`已连接: ${info.firmware} | 脚本: ${info.hasScript ? '已加载' : '无'}`);
    } catch (err: any) { setSerialInfo(`连接失败: ${err.message}`); }
  }, []);

  const handleDisconnectPico = useCallback(async () => {
    if (pico) { await pico.disconnect(); setPico(null); setSerialInfo(''); }
  }, [pico]);

  const handleUploadScript = useCallback(async () => {
    if (!pico || !binaryData) return;
    setLoading(true);
    try {
      const csum = crc32(binaryData);
      await pico.writeScript(binaryData, csum);
      setSerialInfo('脚本上传成功！');
      setLoading(false);
    } catch (err: any) { setSerialInfo(`上传失败: ${err.message}`); setLoading(false); }
  }, [pico, binaryData]);

  // ======== UI ========
  return (
    <div className="page-wrapper">
      <div className="page-box">
        <div className="page-group-flex">
        {/* LEFT */}
        <div className="panel page-col" style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        <div className="panel-header">{'\u{1F47E} 图片处理设置'}</div>

        <div className="flex-row">
          <label>画布模式:</label>
          <select value={canvasMode} onChange={e => setCanvasMode(e.target.value)} disabled={stage >= 2} style={{ flex: 1 }}>
            {CANVAS_MODE_KEYS.map(k => <option key={k} value={k}>{CANVAS_MODE_NAMES[k]}</option>)}
          </select>
        </div>

        <button onClick={() => fileRef.current?.click()} className="primary">{'\u{1F4C1} 上传图片'}</button>
        <input ref={fileRef} type="file" accept="image/*,.json" style={{ display: 'none' }} onChange={handleFileChange} />

        <button onClick={onCrop} disabled={!canCrop || loading}>{'\u2702\uFE0F 裁切'}</button>

        <div className="flex-col" style={{ gap: 2 }}>
          <label>最小像素块大小: {_blockSize}</label>
          <input type="range" min={0} max={BLOCK_SIZES.length - 1} value={blockSizeIdx} step={1}
            onChange={e => setBlockSizeIdx(Number(e.target.value))} />
        </div>

        <button onClick={onPixelize} disabled={!canPixelize || loading} className="primary">{'\u{1F532} 像素化'}</button>

        <div className="flex-col" style={{ gap: 2 }}>
          <label>最大颜色数: {_maxColorsVal}</label>
          <input type="range" min={0} max={COLOR_VALUES.length - 1} value={colorIdx} step={1}
            onChange={e => setColorIdx(Number(e.target.value))} />
        </div>

        <button onClick={onLimitColors} disabled={!canLimitColors || loading}>{'\u{1F3A8} 限制色彩'}</button>

        <button onClick={onOpenPixelWebsite} style={{ marginTop: 4 }}>{'\u{1F310} 推荐！打开第三方像素化网页'}</button>

        <div className="section-divider">
          <div className="panel-header">{'\u{1F4C4} JSON处理'}</div>
          <div className="btn-row" style={{ marginBottom: 8 }}>
            <button onClick={onGenerateJson} disabled={!canGenerateJson || loading}>{'\u{1F4DD} 生成JSON'}</button>
            <button onClick={() => fileRef.current?.click()}>{'\u{1F4C1} 上传JSON'}</button>
          </div>
          <pre className="status-bar" style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.5 }}>
            {jsonStatusText || JSON_PLACEHOLDER}
          </pre>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button onClick={onConfirm} disabled={!canConfirm || loading} className="primary">{'\u{1F4CC} 生成脚本'}</button>
            <button onClick={downloadScript} className="success" disabled={!binaryData}>{'\u{1F4BE} 下载脚本'} {binaryData ? `(${binaryData.length}B)` : ''}</button>
          </div>
          <pre className="status-bar" style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.5 }}>
            {scriptInfoText}
          </pre>
        </div>

        {statusText && <div className="status-bar">{statusText}</div>}

        <div className="section-divider" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="panel-header">脚本烧录</div>
          {!pico ? (
            <button onClick={handleConnectPico} className="primary" disabled={loading}>
              {loading ? '连接中...' : '连接单片机（CDC 模式）'}
            </button>
          ) : (
            <div className="flex-col">
              <button onClick={handleDisconnectPico}>断开连接</button>
              {binaryData && (
                <button onClick={handleUploadScript} className="success" disabled={loading}>上传脚本到 Pico</button>
              )}
            </div>
          )}
          {serialInfo && <div className="status-bar">{serialInfo}</div>}
        </div>
      </div>

      {/* CENTER */}
      <div className="panel page-col" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, flexShrink: 0 }}>{previewTitle}</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', minHeight: 0 }}>
          <CropPreview
            pixmapCanvas={pixmapCanvas}
            cropMode={stage === 1}
            canvasMode={canvasMode}
            offsetX={offsetX}
            offsetY={offsetY}
            onOffsetChange={(dx, dy) => { setOffsetX(dx); setOffsetY(dy); }}
            scale={scale}
            onScaleChange={handleScaleChange}
          />
        </div>
      </div>

      {/* Confirm Dialog */}
      {showConfirmDialog && confirmEstimate && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'var(--overlay-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 'var(--z-modal)',
        }}>
          <div className="panel" style={{ minWidth: 480, maxWidth: 'min(600px, 90vw)', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="panel-header">绘图预估</div>
            <pre style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 13, marginBottom: 16 }}>
{`【最优方案】${confirmEstimate.bestDesc}
预估总耗时：${confirmEstimate.formattedTime}

── 所有方案评估 ──
${(confirmEstimate.evaluationLog || []).join('\n')}

是否立即生成脚本？`}
            </pre>
            <div className="flex-row" style={{ justifyContent: 'flex-end' }}>
              <button onClick={() => setShowConfirmDialog(false)}>取消</button>
              <button onClick={handleConfirmYes} className="primary">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
      </div>
    </div>
  );
}
