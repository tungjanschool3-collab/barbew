// BarModel canvas editor — bars, lines, brackets, braces, text, scissors-cut, copy/paste, undo.

const PALETTE = ["#ff6b9d", "#ffa94d", "#ffd93d", "#6bcb77", "#4d96ff", "#a06cd5"];
let uid = 1;
const nextId = () => uid++;

export class BarModelEditor {
  constructor(canvas, wrap) {
    this.canvas = canvas;
    this.wrap = wrap;
    this.ctx = canvas.getContext("2d");
    this.objects = [];
    this.selectedId = null;
    this.clipboard = null;
    this.tool = "select";
    this.color = "#ff6b9d";
    this.scale = 1;
    this.history = [];
    this.drag = null; // { mode, obj, startX, startY, orig }
    this.pointers = new Map();
    this.pinchStartDist = null;
    this.pinchStartScale = 1;

    this._bindEvents();
    this._resize();
    window.addEventListener("resize", () => this._resize());
    this._raf = requestAnimationFrame(() => this._loop());
  }

  setTool(tool) {
    this.tool = tool;
    this.selectedId = tool === "select" ? this.selectedId : this.selectedId;
  }

  setColor(c) {
    this.color = c;
  }

  zoomBy(delta) {
    this.scale = Math.min(3, Math.max(0.4, +(this.scale + delta).toFixed(2)));
  }

  clearAll() {
    this._pushHistory();
    this.objects = [];
    this.selectedId = null;
  }

  undo() {
    const prev = this.history.pop();
    if (prev) {
      this.objects = prev;
      this.selectedId = null;
    }
  }

  deleteSelected() {
    if (!this.selectedId) return;
    this._pushHistory();
    this.objects = this.objects.filter((o) => o.id !== this.selectedId);
    this.selectedId = null;
  }

  copySelected() {
    const obj = this._findById(this.selectedId);
    if (obj) this.clipboard = JSON.parse(JSON.stringify(obj));
  }

  pasteClipboard() {
    if (!this.clipboard) return;
    this._pushHistory();
    const copy = JSON.parse(JSON.stringify(this.clipboard));
    copy.id = nextId();
    this._offsetObject(copy, 24, 24);
    this.objects.push(copy);
    this.selectedId = copy.id;
  }

  // ---------- internal ----------

  _offsetObject(o, dx, dy) {
    if (o.type === "line") {
      o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy;
    } else {
      o.x += dx; o.y += dy;
    }
  }

  _pushHistory() {
    this.history.push(JSON.parse(JSON.stringify(this.objects)));
    if (this.history.length > 60) this.history.shift();
  }

  _findById(id) {
    return this.objects.find((o) => o.id === id);
  }

  _resize() {
    const rect = this.wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + "px";
    this.canvas.style.height = rect.height + "px";
    this.dpr = dpr;
  }

  _toWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / this.scale,
      y: (clientY - rect.top) / this.scale,
    };
  }

  _bindEvents() {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => this._onDown(e));
    c.addEventListener("pointermove", (e) => this._onMove(e));
    window.addEventListener("pointerup", (e) => this._onUp(e));
    c.addEventListener("pointercancel", (e) => this._onUp(e));
    c.addEventListener("dblclick", (e) => this._onDblClick(e));
    c.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.zoomBy(e.deltaY < 0 ? 0.1 : -0.1);
        }
      },
      { passive: false }
    );
  }

  _onDown(e) {
    // Prevent the browser's default mousedown focus-shifting behavior so a
    // freshly created inline text editor doesn't lose focus right away.
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      this.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.pinchStartScale = this.scale;
      this.drag = null;
      return;
    }

    const { x, y } = this._toWorld(e.clientX, e.clientY);

    if (this.tool === "select") {
      const hit = this._hitTest(x, y);
      if (hit && hit.handle === "resize") {
        this._pushHistory();
        this.selectedId = hit.obj.id;
        this.drag = { mode: "resize", obj: hit.obj, startX: x, startY: y, orig: { ...hit.obj } };
      } else if (hit) {
        this._pushHistory();
        this.selectedId = hit.obj.id;
        this.drag = { mode: "move", obj: hit.obj, startX: x, startY: y, orig: JSON.parse(JSON.stringify(hit.obj)) };
      } else {
        this.selectedId = null;
        this.drag = null;
      }
    } else if (this.tool === "bar") {
      this.drag = { mode: "create-bar", startX: x, startY: y, obj: null };
    } else if (this.tool === "line" || this.tool === "dashed") {
      this.drag = { mode: "create-line", startX: x, startY: y, dashed: this.tool === "dashed" };
    } else if (this.tool === "bracket" || this.tool === "brace") {
      this.drag = { mode: "create-span", spanType: this.tool, startX: x, startY: y, shift: e.shiftKey };
    } else if (this.tool === "text") {
      this._createTextAt(x, y);
      this.drag = null;
    } else if (this.tool === "scissors") {
      this._cutAt(x, y);
      this.drag = null;
    }
  }

  _onMove(e) {
    if (this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (this.pointers.size === 2 && this.pinchStartDist) {
      const pts = [...this.pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = dist / this.pinchStartDist;
      this.scale = Math.min(3, Math.max(0.4, +(this.pinchStartScale * ratio).toFixed(2)));
      return;
    }

    if (!this.drag) return;
    const { x, y } = this._toWorld(e.clientX, e.clientY);

    if (this.drag.mode === "create-bar") {
      const sx = this.drag.startX, sy = this.drag.startY;
      this.drag.preview = {
        type: "bar",
        x: Math.min(sx, x),
        y: Math.min(sy, y),
        w: Math.abs(x - sx),
        h: Math.abs(y - sy),
        color: this.color,
        label: "",
      };
    } else if (this.drag.mode === "create-line") {
      this.drag.preview = {
        type: "line",
        x1: this.drag.startX,
        y1: this.drag.startY,
        x2: x,
        y2: y,
        color: this.color,
        dashed: this.drag.dashed,
      };
    } else if (this.drag.mode === "create-span") {
      const sx = this.drag.startX;
      this.drag.preview = {
        type: this.drag.spanType,
        x: Math.min(sx, x),
        y: this.drag.startY,
        w: Math.abs(x - sx),
        dir: this.drag.shift ? -1 : 1,
        color: this.color,
        label: "",
      };
    } else if (this.drag.mode === "move") {
      const dx = x - this.drag.startX;
      const dy = y - this.drag.startY;
      const obj = this.drag.obj;
      const orig = this.drag.orig;
      if (obj.type === "line") {
        obj.x1 = orig.x1 + dx; obj.y1 = orig.y1 + dy;
        obj.x2 = orig.x2 + dx; obj.y2 = orig.y2 + dy;
      } else {
        obj.x = orig.x + dx; obj.y = orig.y + dy;
      }
    } else if (this.drag.mode === "resize") {
      const obj = this.drag.obj;
      const orig = this.drag.orig;
      if (obj.type === "bar") {
        obj.w = Math.max(20, orig.w + (x - this.drag.startX));
        obj.h = Math.max(20, orig.h + (y - this.drag.startY));
      } else if (obj.type === "bracket" || obj.type === "brace") {
        obj.w = Math.max(30, orig.w + (x - this.drag.startX));
      }
    }
  }

  _onUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStartDist = null;

    if (!this.drag) return;
    const d = this.drag;

    if (d.mode === "create-bar" && d.preview && d.preview.w > 6 && d.preview.h > 6) {
      this._pushHistory();
      const obj = { id: nextId(), ...d.preview };
      this.objects.push(obj);
      this.selectedId = obj.id;
    } else if (d.mode === "create-line" && d.preview) {
      if (Math.hypot(d.preview.x2 - d.preview.x1, d.preview.y2 - d.preview.y1) > 4) {
        this._pushHistory();
        const obj = { id: nextId(), ...d.preview };
        this.objects.push(obj);
        this.selectedId = obj.id;
      }
    } else if (d.mode === "create-span" && d.preview && d.preview.w > 10) {
      this._pushHistory();
      const obj = { id: nextId(), ...d.preview };
      this.objects.push(obj);
      this.selectedId = obj.id;
      this._editLabelFor(obj);
    }

    this.drag = null;
  }

  _onDblClick(e) {
    const { x, y } = this._toWorld(e.clientX, e.clientY);
    const hit = this._hitTest(x, y);
    if (hit && hit.obj) this._editLabelFor(hit.obj);
  }

  _hitTest(px, py) {
    const tol = 8 / this.scale;
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      if (o.type === "bar") {
        if (Math.abs(px - (o.x + o.w)) < tol && Math.abs(py - (o.y + o.h / 2)) < tol) {
          return { obj: o, handle: "resize" };
        }
        if (px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h) {
          return { obj: o };
        }
      } else if (o.type === "line") {
        if (this._distToSeg(px, py, o.x1, o.y1, o.x2, o.y2) < tol) return { obj: o };
      } else if (o.type === "bracket" || o.type === "brace") {
        if (Math.abs(px - (o.x + o.w)) < tol && Math.abs(py - o.y) < tol * 2) {
          return { obj: o, handle: "resize" };
        }
        if (px >= o.x - tol && px <= o.x + o.w + tol && Math.abs(py - o.y) < 20) {
          return { obj: o };
        }
      } else if (o.type === "text") {
        const w = Math.max(20, o.text.length * (o.fontSize * 0.55));
        if (px >= o.x - 4 && px <= o.x + w && py >= o.y - o.fontSize && py <= o.y + 6) {
          return { obj: o };
        }
      }
    }
    return null;
  }

  _distToSeg(px, py, x1, y1, x2, y2) {
    const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
    const dot = A * C + B * D;
    const len = C * C + D * D || 1;
    let t = dot / len;
    t = Math.max(0, Math.min(1, t));
    const xx = x1 + t * C, yy = y1 + t * D;
    return Math.hypot(px - xx, py - yy);
  }

  _createTextAt(x, y) {
    this._openInlineEditor({ x, y, existing: null });
  }

  _editLabelFor(obj) {
    if (obj.type === "text") {
      this._openInlineEditor({ x: obj.x, y: obj.y, existing: obj });
    } else {
      // bar / bracket / brace: edit their label
      const cx = obj.type === "bar" ? obj.x + obj.w / 2 : obj.x + obj.w / 2;
      const cy = obj.type === "bar" ? obj.y + obj.h / 2 : obj.y + (obj.dir || 1) * 26;
      this._openInlineEditor({ x: cx, y: cy, existing: obj, isLabel: true, centered: true });
    }
  }

  _openInlineEditor({ x, y, existing, isLabel, centered }) {
    const wrapRect = this.wrap.getBoundingClientRect();
    const div = document.createElement("div");
    div.className = "text-edit-box";
    div.contentEditable = "true";
    div.style.left = x * this.scale + wrapRect.left - wrapRect.left + "px";
    div.style.top = (centered ? y - 14 : y - 20) * this.scale + "px";
    div.style.fontSize = (isLabel ? 20 : 24) * this.scale + "px";
    div.style.color = this.color;
    div.textContent = existing ? (isLabel ? existing.label || "" : existing.text || "") : "";
    this.wrap.appendChild(div);
    div.focus();
    placeCaretEnd(div);

    const commit = () => {
      const val = div.textContent.trim();
      div.remove();
      if (isLabel) {
        this._pushHistory();
        existing.label = val;
      } else if (existing) {
        this._pushHistory();
        existing.text = val;
        if (!val) this.objects = this.objects.filter((o) => o !== existing);
      } else if (val) {
        this._pushHistory();
        this.objects.push({
          id: nextId(),
          type: "text",
          x,
          y,
          text: val,
          fontSize: 24,
          color: this.color,
        });
      }
    };

    div.addEventListener("blur", commit, { once: true });
    div.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        div.blur();
      } else if (ev.key === "Escape") {
        div.textContent = existing ? (isLabel ? existing.label || "" : existing.text || "") : "";
        div.blur();
      }
    });
  }

  _cutAt(px, py) {
    const hit = this._hitTest(px, py);
    if (!hit || hit.obj.type !== "bar") return;
    const bar = hit.obj;
    const splitX = Math.max(bar.x + 6, Math.min(bar.x + bar.w - 6, px));
    const gap = 6;
    const leftW = splitX - bar.x - gap / 2;
    const rightW = bar.x + bar.w - splitX - gap / 2;
    if (leftW < 8 || rightW < 8) return;

    this._pushHistory();
    this.objects = this.objects.filter((o) => o.id !== bar.id);
    const left = { id: nextId(), type: "bar", x: bar.x, y: bar.y, w: leftW, h: bar.h, color: bar.color, label: "" };
    const right = { id: nextId(), type: "bar", x: splitX + gap / 2, y: bar.y, w: rightW, h: bar.h, color: bar.color, label: "" };
    this.objects.push(left, right);
    this.selectedId = right.id;
  }

  // ---------- render ----------

  _loop() {
    this._draw();
    this._raf = requestAnimationFrame(() => this._loop());
  }

  _draw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(this.scale, this.scale);

    for (const o of this.objects) this._drawObject(o, o.id === this.selectedId);

    if (this.drag && this.drag.preview) this._drawObject(this.drag.preview, false, true);

    ctx.restore();
  }

  _drawObject(o, selected, ghost) {
    const ctx = this.ctx;
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.6;

    if (o.type === "bar") {
      ctx.fillStyle = o.color;
      ctx.strokeStyle = selected ? "#333" : "rgba(0,0,0,0.35)";
      ctx.lineWidth = selected ? 3 : 2;
      roundRect(ctx, o.x, o.y, o.w, o.h, 8);
      ctx.fill();
      ctx.stroke();
      if (o.label) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 20px Kanit, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(o.label, o.x + o.w / 2, o.y + o.h / 2);
      }
      if (selected) drawHandle(ctx, o.x + o.w, o.y + o.h / 2);
    } else if (o.type === "line") {
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 3;
      if (o.dashed) ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(o.x1, o.y1);
      ctx.lineTo(o.x2, o.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (selected) {
        drawHandle(ctx, o.x1, o.y1);
        drawHandle(ctx, o.x2, o.y2);
      }
    } else if (o.type === "bracket") {
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 3;
      const h = 16 * (o.dir || 1);
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(o.x, o.y + h);
      ctx.lineTo(o.x + o.w, o.y + h);
      ctx.lineTo(o.x + o.w, o.y);
      ctx.stroke();
      drawSpanLabel(ctx, o);
      if (selected) drawHandle(ctx, o.x + o.w, o.y);
    } else if (o.type === "brace") {
      drawBrace(ctx, o.x, o.x + o.w, o.y, 18 * (o.dir || 1), o.color);
      drawSpanLabel(ctx, o, 30);
      if (selected) drawHandle(ctx, o.x + o.w, o.y);
    } else if (o.type === "text") {
      ctx.fillStyle = o.color;
      ctx.font = `bold ${o.fontSize}px Kanit, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(o.text, o.x, o.y);
      if (selected) {
        const w = Math.max(20, o.text.length * (o.fontSize * 0.55));
        ctx.strokeStyle = "#333";
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(o.x - 4, o.y - o.fontSize, w + 8, o.fontSize + 10);
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawHandle(ctx, x, y) {
  ctx.fillStyle = "#333";
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpanLabel(ctx, o, extra = 20) {
  if (!o.label) return;
  ctx.fillStyle = o.color;
  ctx.font = "bold 18px Kanit, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = (o.dir || 1) > 0 ? "top" : "bottom";
  ctx.fillText(o.label, o.x + o.w / 2, o.y + (o.dir || 1) * extra);
}

function drawBrace(ctx, x1, x2, y, h, color) {
  const mid = (x1 + x2) / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.quadraticCurveTo(x1, y + h, mid - (mid - x1) * 0.4, y + h);
  ctx.quadraticCurveTo(mid, y + h, mid, y + h * 1.6);
  ctx.moveTo(mid, y + h * 1.6);
  ctx.quadraticCurveTo(mid, y + h, mid + (x2 - mid) * 0.4, y + h);
  ctx.quadraticCurveTo(x2, y + h, x2, y);
  ctx.stroke();
}

function placeCaretEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
