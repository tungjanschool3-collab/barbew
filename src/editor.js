// BarModel canvas editor — bars, lines, brackets, braces, text, equal divisions, copy/paste, undo.

const GRID_CM = 40;

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
    this.pendingSymbol = "+";
    this.scale = 1;
    this.resizeFeedback = null;
    this.history = [];
    this.drag = null; // { mode, obj, startX, startY, orig }
    this.pointers = new Map();
    this.pinchStartDist = null;
    this.pinchStartScale = 1;
    this.onZoomChange = null;
    this._worldHeightPx = 0;
    this._pendingGesture = null;
    this.printMode = false;

    this._drawScheduled = false;
    this._bindEvents();
    this._resize();
    window.addEventListener("resize", () => {
      this._resize();
      this._scheduleDraw();
    });
    this._scheduleDraw();
  }

  // Redraws are event-driven (scheduled on the next animation frame only
  // when something actually changed) instead of looping forever, so the
  // canvas stays idle — and off the CPU/battery — between edits.
  _scheduleDraw() {
    if (this._drawScheduled) return;
    this._drawScheduled = true;
    requestAnimationFrame(() => {
      this._drawScheduled = false;
      this._draw();
    });
  }

  setTool(tool) {
    this.tool = tool;
    this.selectedId = tool === "select" ? this.selectedId : this.selectedId;
  }

  setColor(c) {
    this.color = c;
    // Also recolor whatever's currently selected, so picking a swatch
    // after a bar already exists changes that bar's color right away.
    const obj = this._findById(this.selectedId);
    if (obj) {
      this._pushHistory();
      obj.color = c;
      this._scheduleDraw();
    }
  }

  setPendingSymbol(s) {
    this.pendingSymbol = s;
  }

  zoomBy(delta) {
    this.scale = Math.min(3, Math.max(0.4, +(this.scale + delta).toFixed(2)));
    this._scheduleDraw();
    if (this.onZoomChange) this.onZoomChange();
  }

  clearAll() {
    this._pushHistory();
    this.objects = [];
    this.selectedId = null;
    this._scheduleDraw();
  }

  getObjects() {
    return JSON.parse(JSON.stringify(this.objects));
  }

  loadObjects(objs) {
    this.objects = Array.isArray(objs) ? JSON.parse(JSON.stringify(objs)) : [];
    // Keep future nextId() calls from colliding with ids restored here.
    for (const o of this.objects) if (o.id >= uid) uid = o.id + 1;
    this.selectedId = null;
    this.history = [];
    this._scheduleDraw();
  }

  undo() {
    const prev = this.history.pop();
    if (prev) {
      this.objects = prev;
      this.selectedId = null;
      this._scheduleDraw();
    }
  }

  deleteSelected() {
    if (!this.selectedId) return;
    this._pushHistory();
    this.objects = this.objects.filter((o) => o.id !== this.selectedId);
    this.selectedId = null;
    this._scheduleDraw();
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
    this._scheduleDraw();
  }

  // Adds a new "ขั้นที่ N หา ... (ให้เติมเอง)" fill-in-the-blank heading
  // plus an empty dashed frame below it to draw that step's bar model in,
  // stacked below whatever's already on the canvas. Can be called
  // repeatedly to keep building a multi-step worked solution.
  addStep() {
    this._pushHistory();
    let maxN = 0;
    for (const o of this.objects) {
      if (o.type === "text") {
        const m = /^ขั้นที่\s*(\d+)/.exec(o.text || "");
        if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
      }
    }
    const stepNum = maxN + 1;
    const bottom = this._contentBottomWorld();
    const startY = bottom > 0 ? bottom + 50 : 44;
    const frameW = Math.max(480, this.wrap.clientWidth / this.scale - 80);

    const label = {
      id: nextId(),
      type: "text",
      x: 20,
      y: startY,
      text: `ขั้นที่ ${stepNum} หา ......................... (ให้เติมเอง)`,
      fontSize: 22,
      color: "#3a2e50",
    };
    const frame = {
      id: nextId(),
      type: "frame",
      x: 20,
      y: startY + 16,
      w: frameW,
      h: 220,
      color: "#a06cd5",
    };
    const result = {
      id: nextId(),
      type: "text",
      x: 20,
      y: startY + 16 + 220 + 34,
      text: "จะได้ ......................... (ให้เติมเอง)",
      fontSize: 20,
      color: "#3a2e50",
    };
    this.objects.push(label, frame, result);
    this.selectedId = null;
    this._scheduleDraw();
    this._editLabelFor(label);
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
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._applyCanvasSize(this._computeWorldHeight());
  }

  // Bottom edge (world/unscaled coordinates) of one object.
  _objectBottom(o) {
    if (o.type === "line") return Math.max(o.y1, o.y2);
    if (o.type === "bracket" || o.type === "brace") return o.y + Math.abs(o.dir || 1) * 50;
    if (o.type === "text") return o.y + (o.fontSize || 24);
    return (o.y || 0) + (o.h || 0);
  }

  // Furthest-down edge of everything currently drawn, in world coordinates.
  _contentBottomWorld() {
    let maxBottom = 0;
    for (const o of this.objects) {
      const bottom = this._objectBottom(o);
      if (bottom > maxBottom) maxBottom = bottom;
    }
    if (this.drag && this.drag.preview) {
      const bottom = this._objectBottom(this.drag.preview);
      if (bottom > maxBottom) maxBottom = bottom;
    }
    return maxBottom;
  }

  // The drawing surface grows taller than the visible viewport as content
  // is added below the fold, so the workspace scrolls (the problem panel
  // and toolbar sit outside this scroll area and stay visible) instead of
  // being capped to one screenful.
  _computeWorldHeight() {
    // A fixed viewport-relative floor (not the wrap's own rendered height,
    // which the canvas itself now partly determines — using that would be
    // circular and could never shrink back down after deleting content).
    // While printing there's no viewport to fill, so skip the floor —
    // otherwise every printout would pad out to a near-full blank page.
    // Keep at least one full viewport of graph paper. Previously this used
    // only 60vh, leaving the page's pink background exposed below short
    // drawings instead of continuing the usable paper area.
    const floor = this.printMode ? 0 : window.innerHeight;
    const margin = this.printMode ? 40 : 200;
    const contentBottomPx = this._contentBottomWorld() * this.scale + margin;
    return Math.max(floor, contentBottomPx);
  }

  // Toggled around printing so the canvas shrinks to fit just its content
  // instead of padding out to the screen's viewport height.
  setPrintMode(on) {
    this.printMode = on;
    this._resize();
    this._scheduleDraw();
  }

  // Returns a detached, white-background snapshot trimmed to the drawing
  // content. Selection handles are hidden and the live editor is restored
  // immediately after the copy is made.
  createExportCanvas() {
    const oldSelectedId = this.selectedId;
    const oldPrintMode = this.printMode;
    this.selectedId = null;
    this.printMode = true;
    this._resize();
    this._draw();

    const output = document.createElement("canvas");
    output.width = this.canvas.width;
    output.height = this.canvas.height;
    const out = output.getContext("2d");
    out.fillStyle = "#fff";
    out.fillRect(0, 0, output.width, output.height);
    out.drawImage(this.canvas, 0, 0);

    this.selectedId = oldSelectedId;
    this.printMode = oldPrintMode;
    this._resize();
    this._draw();
    return output;
  }

  _applyCanvasSize(heightPx) {
    const rect = this.wrap.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = heightPx * this.dpr;
    this.canvas.style.width = rect.width + "px";
    this.canvas.style.height = heightPx + "px";
    this._worldHeightPx = heightPx;
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
    // Every handler may mutate objects/drag/scale via various internal
    // branches and early returns, so schedule a redraw unconditionally
    // right after each one runs rather than threading it through them.
    c.addEventListener("pointerdown", (e) => { this._onDown(e); this._scheduleDraw(); });
    c.addEventListener("pointermove", (e) => { this._onMove(e); this._scheduleDraw(); });
    window.addEventListener("pointerup", (e) => { this._onUp(e); this._scheduleDraw(); });
    c.addEventListener("pointercancel", (e) => { this._onUp(e); this._scheduleDraw(); });
    c.addEventListener("dblclick", (e) => { this._onDblClick(e); this._scheduleDraw(); });
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
      if (hit && hit.handle) {
        this._pushHistory();
        this.selectedId = hit.obj.id;
        this.drag = {
          mode: "resize",
          handle: hit.handle,
          obj: hit.obj,
          startX: x,
          startY: y,
          orig: { ...hit.obj },
        };
      } else if (hit && hit.obj.type === "frame") {
        // The step guide box is a fixed placement guide, not something to
        // drag around — select it (so it can still be deleted) but don't
        // start a move, so a stray drag over it can't shift it off its
        // mark while the student is drawing inside it.
        this.selectedId = hit.obj.id;
        this.drag = null;
      } else if (hit) {
        this._pushHistory();
        this.selectedId = hit.obj.id;
        this.drag = { mode: "move", obj: hit.obj, startX: x, startY: y, orig: JSON.parse(JSON.stringify(hit.obj)) };
      } else {
        // Touching empty space with the select tool pans the workspace
        // (a drag that goes nowhere still just deselects, as before) —
        // this is how a finger scrolls the canvas, since single-finger
        // drag on a create tool is reserved for drawing.
        this.selectedId = null;
        this.drag = { mode: "pan", startClientY: e.clientY, startScrollTop: window.scrollY };
      }
    } else if (["bar", "line", "dashed", "bracket", "brace"].includes(this.tool)) {
      const hit = this._hitTest(x, y);
      this.drag = null;
      const base = { pointerId: e.pointerId, startX: x, startY: y, startClientY: e.clientY, shiftKey: e.shiftKey };
      if (hit && hit.handle) {
        // Pressing an existing shape's resize handle resizes it right away,
        // without switching to the select tool or holding first — touching
        // a handle is unambiguous, so there's nothing to disambiguate from.
        this._resolvePendingGesture("resize", hit.obj, hit.handle, base);
      } else if (hit && hit.obj.type !== "frame") {
        // Pressing an existing shape's body moves it right away, same as
        // the handle above — only empty space needs the hold-to-pan delay
        // below, to tell "draw here" apart from "scroll the page".
        this._resolvePendingGesture("move", hit.obj, null, base);
      } else {
        // Empty space (or the step guide frame's body, which is a fixed
        // placement guide and never drags) — a single tap here deselects
        // whatever was selected (back to its plain, idle look), same as
        // the select tool. A quick drag still draws right through it
        // (handled in _onMove once it moves past the tolerance), but
        // holding still briefly first scrolls the workspace instead — so
        // every tool can pan, not just "select".
        this.selectedId = null;
        this._pendingGesture = {
          ...base,
          timer: setTimeout(() => this._resolvePendingGesture("pan"), 220),
        };
      }
    } else if (this.tool === "text") {
      this._createTextAt(x, y);
      this.drag = null;
    } else if (this.tool === "symbol") {
      this._placeSymbol(x, y);
      this.drag = null;
    } else if (this.tool === "scissors" || this.tool === "scissors-solid") {
      this._divideAt(x, y, this.tool === "scissors-solid" ? "solid" : "dashed");
      this.drag = null;
    }
  }

  _beginCreateDrag(x, y, shiftKey) {
    if (this.tool === "bar") {
      this.drag = { mode: "create-bar", startX: x, startY: y, obj: null };
    } else if (this.tool === "line" || this.tool === "dashed") {
      this.drag = { mode: "create-line", startX: x, startY: y, dashed: this.tool === "dashed" };
    } else if (this.tool === "bracket" || this.tool === "brace") {
      this.drag = { mode: "create-span", spanType: this.tool, startX: x, startY: y, shift: shiftKey };
    }
  }

  // A hold-still gesture on empty space (or on an existing shape) resolves
  // here once its timer elapses, into either a pan or a move.
  // Called either immediately (move/resize, passing `base` straight from
  // _onDown) or later once a hold-still timer fires (pan, reading the
  // gesture info that was stashed in this._pendingGesture while waiting).
  _resolvePendingGesture(kind, obj, handle, base) {
    const g = base || this._pendingGesture;
    if (!g) return;
    this._pendingGesture = null;
    if (kind === "move") {
      this._pushHistory();
      this.selectedId = obj.id;
      this.drag = { mode: "move", obj, startX: g.startX, startY: g.startY, orig: JSON.parse(JSON.stringify(obj)) };
    } else if (kind === "resize") {
      this._pushHistory();
      this.selectedId = obj.id;
      this.drag = { mode: "resize", handle, obj, startX: g.startX, startY: g.startY, orig: { ...obj } };
    } else {
      this.drag = { mode: "pan", startClientY: g.startClientY, startScrollTop: window.scrollY };
    }
    this._scheduleDraw();
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
      if (this.onZoomChange) this.onZoomChange();
      return;
    }

    if (this._pendingGesture && this._pendingGesture.pointerId === e.pointerId) {
      const p = this._toWorld(e.clientX, e.clientY);
      const dx = p.x - this._pendingGesture.startX;
      const dy = p.y - this._pendingGesture.startY;
      if (Math.hypot(dx, dy) > 6 / this.scale) {
        clearTimeout(this._pendingGesture.timer);
        const { startX, startY, shiftKey } = this._pendingGesture;
        this._pendingGesture = null;
        this._beginCreateDrag(startX, startY, shiftKey);
      }
    }

    if (!this.drag) return;

    if (this.drag.mode === "pan") {
      window.scrollTo(window.scrollX, this.drag.startScrollTop - (e.clientY - this.drag.startClientY));
      return;
    }

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
      const dx = x - this.drag.startX;
      const dy = y - this.drag.startY;
      if (obj.type === "bar" || obj.type === "frame") {
        // Only the bottom-right handle is reachable (see _hitTest), so
        // growing/shrinking always keeps the top-left corner anchored.
        const MIN = 20;
        obj.w = Math.max(MIN, orig.w + dx);
        obj.h = Math.max(MIN, orig.h + dy);
        if (obj.type === "bar") {
          this.resizeFeedback = {
            x: obj.x + obj.w,
            y: obj.y + obj.h,
            dw: (obj.w - orig.w) / GRID_CM,
            dh: (obj.h - orig.h) / GRID_CM,
          };
        }
      } else if (obj.type === "bracket" || obj.type === "brace") {
        obj.w = Math.max(30, orig.w + dx);
      } else if (obj.type === "line") {
        if (this.drag.handle === "p1") {
          obj.x1 = orig.x1 + dx;
          obj.y1 = orig.y1 + dy;
        } else if (this.drag.handle === "p2") {
          obj.x2 = orig.x2 + dx;
          obj.y2 = orig.y2 + dy;
        }
      }
    }
  }

  _onUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStartDist = null;

    if (this._pendingGesture && this._pendingGesture.pointerId === e.pointerId) {
      clearTimeout(this._pendingGesture.timer);
      this._pendingGesture = null;
    }

    if (!this.drag) {
      this.resizeFeedback = null;
      return;
    }
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
    this.resizeFeedback = null;
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
        // Only the bottom-right corner is a resize handle (matches the one
        // handle drawn when selected); the rest of the body just moves it.
        const hTol = tol * 1.6;
        if (Math.abs(px - (o.x + o.w)) < hTol && Math.abs(py - (o.y + o.h)) < hTol) {
          return { obj: o, handle: "se" };
        }
        if (px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h) {
          return { obj: o };
        }
      } else if (o.type === "frame") {
        // Only the bottom-right corner resizes it (same as a bar) — the
        // other three corners used to be grabbable too, and missing the
        // intended one could shrink the frame to a sliver while stretching
        // it tall, rendering as a dense, corrupted-looking dashed mess.
        const hTol = tol * 1.6;
        if (Math.abs(px - (o.x + o.w)) < hTol && Math.abs(py - (o.y + o.h)) < hTol) {
          return { obj: o, handle: "se" };
        }
        if (px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h) {
          return { obj: o };
        }
      } else if (o.type === "line") {
        if (Math.abs(px - o.x1) < tol && Math.abs(py - o.y1) < tol) return { obj: o, handle: "p1" };
        if (Math.abs(px - o.x2) < tol && Math.abs(py - o.y2) < tol) return { obj: o, handle: "p2" };
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

  _placeSymbol(x, y) {
    if (!this.pendingSymbol) return;
    this._pushHistory();
    const obj = {
      id: nextId(),
      type: "text",
      x,
      y,
      text: this.pendingSymbol,
      fontSize: 40,
      color: this.color,
    };
    this.objects.push(obj);
    this.selectedId = obj.id;
  }

  _editLabelFor(obj) {
    if (obj.type === "text") {
      this._openInlineEditor({ x: obj.x, y: obj.y, existing: obj });
    } else {
      // bar / bracket / brace: edit their label
      const cx = obj.type === "bar" ? obj.x + obj.w / 2 : obj.x + obj.w / 2;
      const cy = obj.type === "bar" ? obj.y + obj.h / 2 : obj.y + (obj.dir || 1) * 26;
      this._openInlineEditor({ x: cx, y: cy, existing: obj, isLabel: true });
    }
  }

  // Shows a small centered popup card to type a number/label into, instead
  // of a tiny floating box right on the canvas — used everywhere a bar,
  // span, or standalone text object's text is entered or edited.
  _openInlineEditor({ x, y, existing, isLabel }) {
    const backdrop = document.createElement("div");
    backdrop.className = "text-modal-backdrop";
    const modal = document.createElement("div");
    modal.className = "text-modal";
    const title = document.createElement("h3");
    title.textContent = "พิมพ์ตัวเลข / ข้อความ";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "text-edit-box";
    input.placeholder = "เช่น 1,250,000 หรือ 3.125 หรือ รวม";
    input.value = existing ? (isLabel ? existing.label || "" : existing.text || "") : "";
    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "text-modal-ok";
    okBtn.textContent = "ตกลง";
    modal.appendChild(title);
    modal.appendChild(input);
    modal.appendChild(okBtn);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      document.removeEventListener("mousedown", onOutsideClick, true);
      const val = input.value.trim();
      backdrop.remove();
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
      this._scheduleDraw();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      document.removeEventListener("mousedown", onOutsideClick, true);
      backdrop.remove();
    };

    okBtn.addEventListener("click", commit);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        commit();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        cancel();
      }
    });
    // Tapping anywhere outside the card saves and closes it — except the
    // toolbar, which stays clickable while this is open so a symbol button
    // (+, −, ×, ÷, =) types straight into the box instead of dismissing it.
    const onOutsideClick = (ev) => {
      if (modal.contains(ev.target)) return;
      if (ev.target.closest && ev.target.closest(".toolbar")) return;
      commit();
    };
    document.addEventListener("mousedown", onOutsideClick, true);
  }

  _divideAt(px, py, style = "dashed") {
    const hit = this._hitTest(px, py);
    if (!hit || hit.obj.type !== "bar") return;
    const bar = hit.obj;
    this._pushHistory();
    bar.divisions = Math.min(20, (bar.divisions || 1) + 1);
    bar.divisionStyle = style;
    this.selectedId = bar.id;
    this._scheduleDraw();
  }

  // ---------- render ----------

  _draw() {
    const desiredHeight = this._computeWorldHeight();
    if (Math.abs(desiredHeight - this._worldHeightPx) > 0.5) {
      this._applyCanvasSize(desiredHeight);
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.scale(this.scale, this.scale);

    this._drawGrid();

    for (const o of this.objects) this._drawObject(o, o.id === this.selectedId);

    if (this.drag && this.drag.preview) this._drawObject(this.drag.preview, false, true);

    if (this.resizeFeedback) this._drawResizeFeedback();

    ctx.restore();
  }

  _drawObject(o, selected, ghost) {
    const ctx = this.ctx;
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.6;

    if (o.type === "bar") {
      if (!ghost) {
        ctx.shadowColor = "rgba(0,0,0,0.18)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
      }
      ctx.fillStyle = o.color;
      roundRect(ctx, o.x, o.y, o.w, o.h, 8);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      if (o.divisions > 1) {
        ctx.save();
        ctx.strokeStyle = "rgba(45,49,66,0.9)";
        const solidDivision = o.divisionStyle === "solid";
        ctx.lineWidth = solidDivision ? 5 : 4;
        ctx.setLineDash(solidDivision ? [] : [7, 6]);
        for (let i = 1; i < o.divisions; i++) {
          const x = o.x + (o.w * i) / o.divisions;
          ctx.beginPath();
          ctx.moveTo(x, o.y + 3);
          ctx.lineTo(x, o.y + o.h - 3);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (selected) {
        // Idle, the bar has no outline at all (plain filled shape); while
        // selected it gets a dashed marquee so it's obvious it can be
        // moved or resized.
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        roundRect(ctx, o.x - 3, o.y - 3, o.w + 6, o.h + 6, 10);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (o.label) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 28px Kanit, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(o.label, o.x + o.w / 2, o.y + o.h / 2);
      }
      if (selected) drawResizeHandle(ctx, o.x + o.w, o.y + o.h);
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
    } else if (o.type === "frame") {
      // An empty dashed guide box (from "เพิ่มขั้นตอน") for drawing a
      // step's bar model inside — outline only, never filled, so it
      // never covers objects drawn on top of it.
      ctx.strokeStyle = selected ? "#333" : o.color || "#a06cd5";
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 8]);
      roundRect(ctx, o.x, o.y, o.w, o.h, 12);
      ctx.stroke();
      ctx.setLineDash([]);
      if (selected) drawResizeHandle(ctx, o.x + o.w, o.y + o.h);
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

  _drawGrid() {
    const ctx = this.ctx;
    const width = this.canvas.clientWidth / this.scale;
    const height = this.canvas.clientHeight / this.scale;
    ctx.save();
    ctx.lineWidth = 1 / this.scale;
    for (let x = 0; x <= width; x += GRID_CM / 2) {
      ctx.strokeStyle = x % GRID_CM === 0 ? "#cad5ee" : "#e8edf8";
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y <= height; y += GRID_CM / 2) {
      ctx.strokeStyle = y % GRID_CM === 0 ? "#cad5ee" : "#e8edf8";
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    ctx.restore();
  }

  _drawResizeFeedback() {
    const { x, y, dw, dh } = this.resizeFeedback;
    const fmt = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)} ซม.`;
    const text = `กว้าง ${fmt(dw)}  สูง ${fmt(dh)}`;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = "bold 15px Kanit, sans-serif";
    const w = ctx.measureText(text).width + 20;
    const bx = Math.max(6, x - w / 2);
    const by = Math.max(6, y + 14);
    ctx.fillStyle = "rgba(45,49,66,0.92)";
    roundRect(ctx, bx, by, w, 34, 9);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + w / 2, by + 17);
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

// The single corner handle shown on a selected bar — bigger than the plain
// dot handles so it's an easy touch target, with a light ring so it reads
// clearly against any bar color.
function drawResizeHandle(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fillStyle = "#2d3748";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
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
