import { BarModelEditor } from "./editor.js";

export function createPageBuilder(root, onActivate) {
  const blocks = [];
  let active;
  let clipboard = null;
  let tool = "select";
  let symbol = "+";
  let color = "#ff6b9d";

  function activate(block) {
    if (active && active !== block) {
      active.editor.clearSelection();
      active.node.classList.remove("active-drawing");
    }
    active = block;
    active.node.classList.add("active-drawing");
    onActivate();
  }

  function add(type, value, focus = false) {
    const node = document.createElement("section");
    node.className = "page-block";
    const controls = document.createElement("div");
    controls.className = "block-controls";
    const block = { node, type };
    for (const [label, icon, change] of [["เลื่อนบล็อกขึ้น", "▲", -1], ["เลื่อนบล็อกลง", "▼", 1], ["ลบบล็อก", "×", 0]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = icon;
      button.setAttribute("aria-label", label);
      button.title = label;
      button.addEventListener("click", () => {
        const index = blocks.indexOf(block);
        if (!change) {
          if (block.editor?.objects.length || block.input?.value.trim()) {
            if (!confirm("ลบบล็อกนี้หรือไม่?")) return;
          }
          blocks.splice(index, 1);
          block.editor?.destroy();
          node.remove();
          if (active === block) {
            active = null;
            activate(blocks.find((item) => item.editor) || add("drawing", []));
          }
          return;
        }
        const other = blocks[index + change];
        if (!other) return;
        [blocks[index], blocks[index + change]] = [other, block];
        if (change < 0) other.node.before(node);
        else other.node.after(node);
        button.focus();
      });
      controls.append(button);
    }
    node.append(controls);
    root.append(node);
    blocks.push(block);
    if (type === "text") {
      const input = document.createElement("textarea");
      input.placeholder = "เพิ่มข้อความ";
      input.setAttribute("aria-label", "ข้อความในใบงาน");
      input.value = value;
      input.rows = 1;
      const printText = document.createElement("div");
      printText.className = "block-print-text";
      const syncText = () => {
        printText.textContent = input.value;
        input.style.height = "auto";
        input.style.height = input.scrollHeight + 2 + "px";
      };
      input.addEventListener("input", syncText);
      node.append(input, printText);
      syncText();
      block.input = input;
      if (focus) input.focus();
    } else {
      const wrap = document.createElement("div");
      wrap.className = "canvas-wrap";
      const canvas = document.createElement("canvas");
      canvas.className = "drawing-canvas";
      canvas.tabIndex = 0;
      canvas.setAttribute("aria-label", "พื้นที่วาดบาร์");
      wrap.append(canvas);
      node.append(wrap);
      canvas.addEventListener("pointerdown", () => {
        if (document.activeElement === canvas) activate(block);
        else canvas.focus({ preventScroll: true });
      });
      canvas.addEventListener("focus", () => activate(block));
      block.editor = new BarModelEditor(canvas, wrap, 270);
      block.editor.loadObjects(value);
      block.editor.setTool(tool);
      block.editor.setPendingSymbol(symbol);
      block.editor.setColor(color);
      block.editor.onZoomChange = onActivate;
      if (focus) canvas.focus();
    }
    return block;
  }

  return {
    addText: () => add("text", "", true),
    addDrawing: () => add("drawing", [], true),
    snapshot: () => ({ blocks: blocks.map(({ type, input, editor }) => ({ type, value: input ? input.value : editor.getObjects() })) }),
    restore(saved) {
      for (const block of blocks) block.editor?.destroy();
      blocks.length = 0;
      active = null;
      root.replaceChildren();
      if (Array.isArray(saved?.blocks)) {
        for (const block of saved.blocks) add(block.type, block.value);
      }
      if (!blocks.some((block) => block.editor)) add("drawing", Array.isArray(saved) ? saved : []);
      activate(blocks.find((block) => block.editor));
    },
    get scale() { return active?.editor.scale ?? 1; },
    setTool(value) {
      tool = value;
      for (const block of blocks) block.editor?.setTool(value);
    },
    setPendingSymbol(value) {
      symbol = value;
      for (const block of blocks) block.editor?.setPendingSymbol(value);
    },
    setColor(value) {
      color = value;
      for (const block of blocks) block.editor?.setColor(value);
    },
    copySelected() {
      const editor = active?.editor;
      if (!editor?.selectedId) return false;
      editor.copySelected();
      clipboard = editor.clipboard;
      return true;
    },
    pasteClipboard() {
      if (!active || !clipboard) return false;
      active.editor.clipboard = clipboard;
      active.editor.pasteClipboard();
      return true;
    },
    addStep: () => active.editor.addStep(),
    deleteSelected: () => active.editor.deleteSelected(),
    undo: () => active.editor.undo(),
    clearAll: () => active.editor.clearAll(),
    zoomBy: (delta) => active.editor.zoomBy(delta),
    setPrintMode(enabled) {
      for (const block of blocks) block.editor?.setPrintMode(enabled);
    },
    createExportCanvas() {
      const output = document.createElement("canvas");
      const ctx = output.getContext("2d");
      const parts = blocks.map((block) => block.editor
        ? { image: block.editor.createExportCanvas() }
        : { text: block.input.value });
      const width = Math.max(320, ...parts.map((part) => part.image?.width || 0));
      const font = "28px Kanit, Tahoma, sans-serif";
      ctx.font = font;
      let height = 0;
      for (const part of parts) {
        if (part.image) {
          height += part.image.height;
          continue;
        }
        part.lines = [];
        for (const paragraph of part.text.split("\n")) {
          let line = "";
          for (const character of paragraph) {
            if (line && ctx.measureText(line + character).width > width - 32) {
              part.lines.push(line);
              line = "";
            }
            line += character;
          }
          part.lines.push(line);
        }
        height += part.lines.length * 38 + 16;
      }
      output.width = width;
      output.height = height;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#23243c";
      ctx.font = font;
      let top = 0;
      for (const part of parts) {
        if (part.image) {
          ctx.drawImage(part.image, 0, top);
          top += part.image.height;
        } else {
          for (const line of part.lines) {
            ctx.fillText(line, 16, top + 32);
            top += 38;
          }
          top += 16;
        }
      }
      return output;
    },
  };
}
