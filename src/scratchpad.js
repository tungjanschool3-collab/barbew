// Freehand scratch-paper panel — draw with an iPad pen, finger, or mouse
// inside a fixed area, with an eraser and clear button.

const PEN_COLORS = ["#3a2e50", "#ff6b9d", "#4d96ff", "#6bcb77"];

export class ScratchPad {
  constructor(panel) {
    this.panel = panel;
    this.canvas = panel.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.mode = "pen"; // "pen" | "eraser"
    this.color = PEN_COLORS[0];
    this.penSize = 3;
    this.eraserSize = 26;
    this.strokes = [];
    this.currentStroke = null;

    this._buildToolbar();
    this._bindDrawing();
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  open() {
    this.panel.classList.remove("hidden");
    this._resize();
  }

  close() {
    this.panel.classList.add("hidden");
  }

  toggle() {
    this.panel.classList.contains("hidden") ? this.open() : this.close();
  }

  clear() {
    this.strokes = [];
    this._redraw();
  }

  _buildToolbar() {
    const colorWrap = this.panel.querySelector(".scratch-colors");
    PEN_COLORS.forEach((c) => {
      const sw = document.createElement("button");
      sw.className = "scratch-swatch";
      sw.style.background = c;
      sw.addEventListener("click", () => {
        this.color = c;
        this.mode = "pen";
        this._syncToolButtons();
      });
      colorWrap.appendChild(sw);
    });

    this.penBtn = this.panel.querySelector('[data-mode="pen"]');
    this.eraserBtn = this.panel.querySelector('[data-mode="eraser"]');
    this.penBtn.addEventListener("click", () => {
      this.mode = "pen";
      this._syncToolButtons();
    });
    this.eraserBtn.addEventListener("click", () => {
      this.mode = "eraser";
      this._syncToolButtons();
    });
    this.panel.querySelector(".scratch-clear").addEventListener("click", () => this.clear());
    this.panel.querySelector(".scratch-close").addEventListener("click", () => this.close());
    this._syncToolButtons();
  }

  _syncToolButtons() {
    this.penBtn.classList.toggle("active", this.mode === "pen");
    this.eraserBtn.classList.toggle("active", this.mode === "eraser");
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, rect.width * dpr);
    this.canvas.height = Math.max(1, rect.height * dpr);
    this.dpr = dpr;
    this._redraw();
  }

  _bindDrawing() {
    const c = this.canvas;
    c.style.touchAction = "none";
    c.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      const p = this._point(e);
      this.currentStroke = {
        erase: this.mode === "eraser",
        color: this.color,
        size:
          this.mode === "eraser"
            ? this.eraserSize
            : this.penSize * (e.pointerType === "pen" && e.pressure ? 0.6 + e.pressure : 1),
        points: [p],
      };
      this.strokes.push(this.currentStroke);
      this._redraw();
    });
    c.addEventListener("pointermove", (e) => {
      if (!this.currentStroke) return;
      e.preventDefault();
      this.currentStroke.points.push(this._point(e));
      this._redraw();
    });
    const end = (e) => {
      if (!this.currentStroke) return;
      this.currentStroke = null;
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
  }

  _point(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _redraw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const s of this.strokes) {
      if (s.points.length < 2) {
        if (s.points.length === 1 && !s.erase) {
          ctx.beginPath();
          ctx.fillStyle = s.color;
          ctx.arc(s.points[0].x, s.points[0].y, s.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }
      ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }
}
