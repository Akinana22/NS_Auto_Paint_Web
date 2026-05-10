"""
画布预览控件 v2.3.2
PS 风格裁切：固定裁切框参照点，图像在框下自由缩放/拖拽。
Ctrl+滚轮精细缩放、缩放工具栏（+/-/fit/百分比）、鼠标左键拖拽平移、
方向键 1px 微调、吸边 5px、画布模式有效区域可视化（蒙版+虚线）。
棋盘格仅填充有效画布区域。
"""

from PySide6.QtWidgets import QWidget, QPushButton, QLabel, QHBoxLayout, QApplication
from PySide6.QtCore import Qt, QRect, QPoint, Signal
from PySide6.QtGui import (
    QPixmap, QPainter, QPen, QBrush, QColor, QPaintEvent,
    QWheelEvent, QMouseEvent, QPainterPath, QFont, QImage, QKeyEvent,
)

from core.models.canvas_mode import get_canvas_mode


CHECKER_SIZE = 8
CHECKER_DARK = QColor(204, 204, 204)
CHECKER_LIGHT = QColor(255, 255, 255)
OVERLAY_COLOR = QColor(0, 0, 0, 60)
OVERLAY_TRANSPARENT = QColor(0, 0, 0, 25)
DASH_PEN = QPen(QColor(255, 255, 255, 180), 2, Qt.DashLine, Qt.RoundCap, Qt.RoundJoin)
DASH_PEN.setDashPattern([6, 3])
GRID_PEN = QPen(QColor(0, 0, 0, 30), 1)
GRID_THRESHOLD = 6.0
SNAP_DIST = 4

ZOOM_SNAPS = [
    0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75,
    2.0, 2.25, 2.5, 2.75, 3.0, 4.0, 8.0, 16.0, 32.0,
]
ZOOM_MIN = ZOOM_SNAPS[0]
ZOOM_MAX = ZOOM_SNAPS[-1]
WHEEL_STEP = 0.05
SNAP_TOLERANCE = 0.03


def _snap_scale(scale: float) -> float:
    for s in ZOOM_SNAPS:
        if abs(scale - s) / s <= SNAP_TOLERANCE:
            return s
    return scale


def _is_snapped(scale: float) -> bool:
    for s in ZOOM_SNAPS:
        if abs(scale - s) / s <= SNAP_TOLERANCE:
            return True
    return False


class _ZoomToolbar(QWidget):
    zoom_in_clicked = Signal()
    zoom_out_clicked = Signal()
    fit_clicked = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("ZoomToolbar")
        self.setStyleSheet("""
            #ZoomToolbar {
                background: rgba(20, 20, 20, 220);
                border-radius: 6px;
            }
            QPushButton {
                background: rgba(60, 60, 60, 180);
                color: white;
                border: 1px solid rgba(255,255,255,40);
                border-radius: 4px;
                padding: 2px 6px;
                font-size: 12px;
                min-width: 22px;
            }
            QPushButton:hover { background: rgba(90, 90, 90, 200); }
            QPushButton:pressed { background: rgba(120, 120, 120, 200); }
            QLabel {
                background: rgba(255, 255, 255, 200);
                color: #000000;
                font-size: 14px;
                font-family: "Microsoft YaHei UI";
                border-radius: 3px;
                padding: 1px 6px;
                min-width: 44px;
            }
        """)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(4, 2, 4, 2)
        layout.setSpacing(2)
        self.btn_out = QPushButton("\u2212")
        self.btn_out.setToolTip("\u7f29\u5c0f (Ctrl+滚轮)")
        self.btn_out.setCursor(Qt.PointingHandCursor)
        self.btn_out.clicked.connect(self.zoom_out_clicked)
        self.label_pct = QLabel("100%")
        self.label_pct.setAlignment(Qt.AlignCenter)
        self.btn_in = QPushButton("+")
        self.btn_in.setToolTip("\u653e\u5927 (Ctrl+滚轮)")
        self.btn_in.setCursor(Qt.PointingHandCursor)
        self.btn_in.clicked.connect(self.zoom_in_clicked)
        self.btn_fit = QPushButton("\u2293")
        self.btn_fit.setToolTip("\u9002\u5e94\u7a97\u53e3")
        self.btn_fit.setCursor(Qt.PointingHandCursor)
        self.btn_fit.clicked.connect(self.fit_clicked)
        layout.addWidget(self.btn_out)
        layout.addWidget(self.label_pct)
        layout.addWidget(self.btn_in)
        layout.addWidget(self.btn_fit)
        f = self.label_pct.font()
        f.setStyleStrategy(QFont.StyleStrategy.PreferDevice)
        self.label_pct.setFont(f)

    def set_zoom_pct(self, pct: int):
        self.label_pct.setText(f"{pct}%")


class CanvasPreview(QWidget):

    def __init__(self, parent=None):
        super().__init__(parent)
        self._pixmap: QPixmap | None = None
        self._source_image = None
        self._current_fitted = None
        self._canvas_mode: str = "standard"
        self._scale: float = 1.0
        self._offset = QPoint(0, 0)
        self._dragging = False
        self._last_mouse_pos = QPoint()
        self._crop_mode: bool = False

        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.StrongFocus)
        self.setMinimumSize(200, 200)
        self.setSizePolicy(
            self.sizePolicy().Policy.Expanding,
            self.sizePolicy().Policy.Expanding,
        )

        self._toolbar = _ZoomToolbar(self)
        self._toolbar.zoom_in_clicked.connect(self._zoom_in)
        self._toolbar.zoom_out_clicked.connect(self._zoom_out)
        self._toolbar.fit_clicked.connect(self.resetView)

    def setPixmap(self, pixmap: QPixmap):
        self._pixmap = pixmap
        self._source_image = None
        self._current_fitted = None
        self._fit_to_widget()
        self._update_zoom_label()
        self.update()

    def setCanvasMode(self, mode: str):
        if self._canvas_mode != mode:
            self._canvas_mode = mode
            self.update()

    def setCropMode(self, enabled: bool):
        self._crop_mode = enabled
        self.update()

    def setSourceImage(self, image, canvas_mode: str):
        self._source_image = image
        self._canvas_mode = canvas_mode
        self._offset = QPoint(0, 0)
        self._rebuild_pixmap(1.0)
        self._update_zoom_label()
        self.setCropMode(True)
        self.update()

    def getFittedImage(self):
        return self._current_fitted

    def _rebuild_pixmap(self, scale: float):
        if self._source_image is None:
            return
        mode = get_canvas_mode(self._canvas_mode)
        cw, ch = mode.active_w, mode.active_h
        target_w = max(1, int(cw * scale))
        target_h = max(1, int(ch * scale))
        iw, ih = self._source_image.size
        s = max(target_w / iw, target_h / ih)
        new_w = max(1, int(iw * s))
        new_h = max(1, int(ih * s))
        from PIL import Image as PILImage
        from core.image.pixelize import threshold_alpha
        self._current_fitted = self._source_image.resize((new_w, new_h), PILImage.LANCZOS)
        self._current_fitted = threshold_alpha(self._current_fitted)
        buf = self._current_fitted.tobytes("raw", "RGBA")
        qi = QImage(buf, new_w, new_h, QImage.Format_RGBA8888)
        self._pixmap = QPixmap.fromImage(qi)
        self._scale = scale

    # ---------- canvas area rect ----------
    def _canvas_rect(self):
        """画布有效区域在控件中的矩形。裁切前固定居中；裁切后跟随 _scale/_offset"""
        mode = get_canvas_mode(self._canvas_mode)
        cw, ch = mode.active_w, mode.active_h
        if self._source_image is not None:
            wf = self.width() / cw if cw > 0 else 1
            hf = self.height() / ch if ch > 0 else 1
            fs = min(wf, hf, 1.0)
            fw = int(cw * fs)
            fh = int(ch * fs)
            fx = (self.width() - fw) // 2
            fy = (self.height() - fh) // 2
        else:
            fw = int(cw * self._scale)
            fh = int(ch * self._scale)
            fx = (self.width() - fw) // 2 + self._offset.x()
            fy = (self.height() - fh) // 2 + self._offset.y()
        return fx, fy, fw, fh

    def getCropPixels(self) -> tuple[int, int, int, int]:
        if self._current_fitted is None:
            return (0, 0, 0, 0)
        pw = self._current_fitted.width
        ph = self._current_fitted.height
        mode = get_canvas_mode(self._canvas_mode)
        cw, ch = mode.active_w, mode.active_h

        # 裁切框在控件中的固定位置
        fx, fy, fw, fh = self._canvas_rect()
        # 图像在控件中的位置（1:1 显示）
        cx = (self.width() - pw) // 2 + self._offset.x()
        cy = (self.height() - ph) // 2 + self._offset.y()

        # 框与图像的像素级交集
        src_left  = max(0, fx - cx)
        src_top   = max(0, fy - cy)
        src_right = min(pw, int(round(fx + fw - cx)))
        src_bottom = min(ph, int(round(fy + fh - cy)))

        from core.utils.logger import get_logger as _log
        _lg = _log("CanvasPreview")
        _lg.info(f"[getCropPixels] fitted={pw}x{ph} active={cw}x{ch} "
                 f"offset=({self._offset.x()},{self._offset.y()}) "
                 f"frame=({fx},{fy},{fw},{fh}) img_pos=({cx},{cy}) "
                 f"result=({src_left},{src_top},{src_right},{src_bottom})")
        return (src_left, src_top, src_right, src_bottom)

    def getPasteOffset(self) -> tuple[int, int]:
        fx, fy, fw, fh = self._canvas_rect()
        pw = self._pixmap.width() if self._pixmap else 0
        ph = self._pixmap.height() if self._pixmap else 0
        cx = (self.width() - pw) // 2 + self._offset.x()
        cy = (self.height() - ph) // 2 + self._offset.y()
        return (max(0, int(round(cx - fx))), max(0, int(round(cy - fy))))

    def resetView(self):
        if self._source_image is not None:
            self._rebuild_pixmap(1.0)
        else:
            self._fit_to_widget()
        self._offset = QPoint(0, 0)
        self._update_zoom_label()
        self.update()

    # ---------- zoom ----------
    def _zoom_in(self):
        for s in ZOOM_SNAPS:
            if s > self._scale + 0.001:
                self._set_scale_at_center(s)
                return

    def _zoom_out(self):
        for s in reversed(ZOOM_SNAPS):
            if s < self._scale - 0.001:
                self._set_scale_at_center(s)
                return

    def _set_scale_at_center(self, new_scale: float):
        self._zoom_to_anchor(self.width() / 2.0, self.height() / 2.0, new_scale)

    def _zoom_to_anchor(self, anchor_x: float, anchor_y: float, new_scale: float):
        # 裁切模式：从源图像重新采样，保持锚点像素不移位
        if self._source_image is not None and self._pixmap:
            old_pw = self._pixmap.width()
            old_ph = self._pixmap.height()
            old_cx = (self.width() - old_pw) / 2.0
            old_cy = (self.height() - old_ph) / 2.0
            anchor_px = (anchor_x - old_cx - self._offset.x())
            anchor_py = (anchor_y - old_cy - self._offset.y())

            self._rebuild_pixmap(new_scale)

            new_pw = self._pixmap.width()
            new_ph = self._pixmap.height()
            new_cx = (self.width() - new_pw) / 2.0
            new_cy = (self.height() - new_ph) / 2.0
            ratio_x = new_pw / old_pw if old_pw > 0 else 1
            ratio_y = new_ph / old_ph if old_ph > 0 else 1
            self._offset.setX(int(anchor_x - new_cx - anchor_px * ratio_x))
            self._offset.setY(int(anchor_y - new_cy - anchor_py * ratio_y))
            self._update_zoom_label()
            self.update()
            return

        # 非裁切模式：显示级缩放
        if self._pixmap is None or self._pixmap.isNull():
            self._scale = new_scale
            self._update_zoom_label()
            self.update()
            return

        pw, ph = self._pixmap.width(), self._pixmap.height()
        old_scale = self._scale
        if old_scale <= 0:
            self._scale = new_scale
            self._update_zoom_label()
            self.update()
            return

        old_cx = (self.width() - pw * old_scale) / 2.0
        old_cy = (self.height() - ph * old_scale) / 2.0
        px = (anchor_x - old_cx - self._offset.x()) / old_scale
        py = (anchor_y - old_cy - self._offset.y()) / old_scale
        self._scale = new_scale
        new_cx = (self.width() - pw * new_scale) / 2.0
        new_cy = (self.height() - ph * new_scale) / 2.0
        self._offset.setX(int(anchor_x - new_cx - px * new_scale))
        self._offset.setY(int(anchor_y - new_cy - py * new_scale))
        self._update_zoom_label()
        self.update()

    def _update_zoom_label(self):
        pct = round(self._scale * 100)
        self._toolbar.set_zoom_pct(pct)

    # ---------- paint ----------
    def paintEvent(self, event: QPaintEvent):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.SmoothPixmapTransform, False)

        # 棋盘格全局绑定画布有效区域
        fx, fy, fw, fh = self._canvas_rect()
        self._draw_checkerboard(painter, QRect(fx, fy, fw, fh))

        if self._pixmap is None or self._pixmap.isNull():
            painter.end()
            return

        pm = self._pixmap
        pw, ph = pm.width(), pm.height()
        if self._crop_mode and self._source_image is not None:
            sw, sh = pw, ph
        else:
            sw = int(pw * self._scale)
            sh = int(ph * self._scale)

        cx = (self.width() - sw) // 2 + self._offset.x()
        cy = (self.height() - sh) // 2 + self._offset.y()
        target_rect = QRect(cx, cy, sw, sh)

        painter.drawPixmap(target_rect, pm, QRect(0, 0, pw, ph))

        if self._scale >= GRID_THRESHOLD:
            self._draw_pixel_grid(painter, target_rect, pw, ph)

        if self._crop_mode:
            self._draw_crop_frame(painter)
            self._draw_outside_overlay(painter)

        painter.end()

    # ---------- pixel grid ----------
    def _draw_pixel_grid(self, painter: QPainter, img_rect: QRect, pw: int, ph: int):
        painter.save()
        painter.setPen(GRID_PEN)
        x0, y0 = img_rect.x(), img_rect.y()
        scale = self._scale
        vis_left = max(0, int((-self._offset.x() - img_rect.width() / 2 + self.width() / 2) / scale) if scale > 0 else 0)
        vis_right = min(pw, vis_left + int(self.width() / scale) + 2)
        vis_left = max(0, vis_left - 1)
        for col in range(int(vis_left), int(vis_right) + 1):
            lx = int(x0 + col * scale)
            painter.drawLine(lx, y0, lx, y0 + int(ph * scale))
        vis_top = max(0, int((-self._offset.y() - img_rect.height() / 2 + self.height() / 2) / scale) if scale > 0 else 0)
        vis_bottom = min(ph, vis_top + int(self.height() / scale) + 2)
        vis_top = max(0, vis_top - 1)
        for row in range(int(vis_top), int(vis_bottom) + 1):
            ly = int(y0 + row * scale)
            painter.drawLine(x0, ly, x0 + int(pw * scale), ly)
        painter.restore()

    # ---------- canvas overlay ----------
    def _draw_canvas_overlay(self, painter: QPainter, img_rect: QRect, pw: int, ph: int, mode):
        painter.save()
        sx = img_rect.width() / pw if pw > 0 else 1
        sy = img_rect.height() / ph if ph > 0 else 1
        ax = img_rect.x() + int(mode.active_x * sx)
        ay = img_rect.y() + int(mode.active_y * sy)
        aw = int(mode.active_w * sx)
        ah = int(mode.active_h * sy)
        full = QRect(img_rect.x(), img_rect.y(), img_rect.width(), img_rect.height())
        active = QRect(ax, ay, aw, ah)
        overlay_path = QPainterPath()
        overlay_path.addRect(full)
        overlay_path.addRect(active)
        overlay_path.setFillRule(Qt.WindingFill)
        painter.fillPath(overlay_path, QBrush(OVERLAY_COLOR))
        painter.setPen(DASH_PEN)
        painter.setBrush(Qt.NoBrush)
        painter.drawRect(active)
        painter.restore()

    # ---------- crop frame ----------
    def _draw_crop_frame(self, painter: QPainter):
        painter.save()
        fx, fy, fw, fh = self._canvas_rect()
        frame = QRect(fx, fy, fw, fh)
        painter.setPen(DASH_PEN)
        painter.setBrush(Qt.NoBrush)
        painter.drawRect(frame)
        painter.restore()

    # ---------- outside transparent overlay ----------
    def _draw_outside_overlay(self, painter: QPainter):
        fx, fy, fw, fh = self._canvas_rect()
        pm = self._pixmap
        pw, ph = pm.width(), pm.height()
        sw, sh = (pw, ph) if self._crop_mode else (int(pw * self._scale), int(ph * self._scale))
        cx = (self.width() - sw) // 2 + self._offset.x()
        cy = (self.height() - sh) // 2 + self._offset.y()

        painter.save()
        frame_rect = QRect(fx, fy, fw, fh)
        img_rect = QRect(cx, cy, sw, sh)

        # img - frame (25 alpha)：图像在画布外的透明像素
        path = QPainterPath()
        path.addRect(img_rect)
        path.addRect(frame_rect)
        path.setFillRule(Qt.OddEvenFill)
        painter.fillPath(path, QBrush(OVERLAY_TRANSPARENT))
        painter.restore()

    # ---------- checkerboard ----------
    def _draw_checkerboard(self, painter: QPainter, rect: QRect):
        painter.save()
        for y in range(rect.top(), rect.bottom(), CHECKER_SIZE):
            for x in range(rect.left(), rect.right(), CHECKER_SIZE):
                col = (x - rect.left()) // CHECKER_SIZE
                row = (y - rect.top()) // CHECKER_SIZE
                color = CHECKER_LIGHT if (col + row) % 2 == 0 else CHECKER_DARK
                cw = min(CHECKER_SIZE, rect.right() - x)
                ch = min(CHECKER_SIZE, rect.bottom() - y)
                painter.fillRect(QRect(x, y, cw, ch), color)
        painter.restore()

    # ---------- events ----------
    def wheelEvent(self, event: QWheelEvent):
        delta = event.angleDelta().y()
        new_scale = self._scale + WHEEL_STEP if delta > 0 else self._scale - WHEEL_STEP
        new_scale = max(ZOOM_MIN, min(new_scale, ZOOM_MAX))
        snapped = _snap_scale(new_scale)
        if abs(snapped - new_scale) / snapped <= SNAP_TOLERANCE and snapped != _snap_scale(self._scale):
            new_scale = snapped
        mouse_pos = event.position()
        self._zoom_to_anchor(mouse_pos.x(), mouse_pos.y(), new_scale)
        event.accept()

    def mousePressEvent(self, event: QMouseEvent):
        if event.button() == Qt.LeftButton:
            self._dragging = True
            self._last_mouse_pos = event.pos()
            self.setCursor(Qt.ClosedHandCursor)
            event.accept()

    def mouseMoveEvent(self, event: QMouseEvent):
        if self._dragging:
            delta = event.pos() - self._last_mouse_pos
            self._offset += delta
            self._last_mouse_pos = event.pos()
            self.update()
            event.accept()

    def mouseReleaseEvent(self, event: QMouseEvent):
        if event.button() == Qt.LeftButton and self._dragging:
            self._dragging = False
            self.setCursor(Qt.OpenHandCursor)
            # 吸边 5px：裁切模式下图像边缘对齐框边缘
            if self._crop_mode and self._pixmap:
                self._snap_to_frame()
            event.accept()

    def _snap_to_frame(self):
        fx, fy, fw, fh = self._canvas_rect()
        pw = self._pixmap.width()
        ph = self._pixmap.height()
        cx = (self.width() - pw) // 2 + self._offset.x()
        cy = (self.height() - ph) // 2 + self._offset.y()

        ox, oy = self._offset.x(), self._offset.y()
        # left edge snap
        if abs(cx - fx) <= SNAP_DIST:
            ox += fx - cx
        # right edge snap
        elif abs((cx + pw) - (fx + fw)) <= SNAP_DIST:
            ox += (fx + fw) - (cx + pw)
        # top edge snap
        if abs(cy - fy) <= SNAP_DIST:
            oy += fy - cy
        # bottom edge snap
        elif abs((cy + ph) - (fy + fh)) <= SNAP_DIST:
            oy += (fy + fh) - (cy + ph)
        self._offset.setX(ox)
        self._offset.setY(oy)
        self.update()

    def keyPressEvent(self, event: QKeyEvent):
        if not self._crop_mode:
            super().keyPressEvent(event)
            return
        step = 1
        if event.key() == Qt.Key_Left:
            self._offset.setX(self._offset.x() - step)
        elif event.key() == Qt.Key_Right:
            self._offset.setX(self._offset.x() + step)
        elif event.key() == Qt.Key_Up:
            self._offset.setY(self._offset.y() - step)
        elif event.key() == Qt.Key_Down:
            self._offset.setY(self._offset.y() + step)
        else:
            super().keyPressEvent(event)
            return
        self.update()
        event.accept()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        tb = self._toolbar
        tb_w = tb.sizeHint().width()
        tb_h = tb.sizeHint().height()
        margin = 8
        tb.setGeometry(
            self.width() - tb_w - margin,
            self.height() - tb_h - margin,
            tb_w, tb_h,
        )
        tb.raise_()

    # ---------- helpers ----------
    def _fit_to_widget(self):
        if self._pixmap is None or self._pixmap.isNull():
            return
        pw, ph = self._pixmap.width(), self._pixmap.height()
        if pw <= 0 or ph <= 0:
            return
        w_scale = (self.width() - 20) / pw
        h_scale = (self.height() - 20) / ph
        self._scale = min(w_scale, h_scale)
        self._offset = QPoint(0, 0)
        self.setCursor(Qt.OpenHandCursor)
