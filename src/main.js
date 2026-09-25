import { BarModelEditor } from "./editor.js";
import { mountLogo3D } from "./logo3d.js";
import { ScratchPad } from "./scratchpad.js";

// ---- 3D logo ----
mountLogo3D(document.getElementById("logo3d"));

// ---- editor ----
const canvas = document.getElementById("canvas");
const wrap = document.querySelector(".canvas-wrap");
const editor = new BarModelEditor(canvas, wrap);

const toolButtons = document.querySelectorAll(".tool-btn[data-tool]");
toolButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    toolButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    editor.setTool(btn.dataset.tool);
  });
});
document.querySelector('.tool-btn[data-tool="select"]').classList.add("active");

document.getElementById("colorPicker").addEventListener("input", (e) => {
  editor.setColor(e.target.value);
});

document.getElementById("btnCopy").addEventListener("click", () => editor.copySelected());
document.getElementById("btnPaste").addEventListener("click", () => editor.pasteClipboard());
document.getElementById("btnDelete").addEventListener("click", () => editor.deleteSelected());
document.getElementById("btnUndo").addEventListener("click", () => editor.undo());
document.getElementById("btnClear").addEventListener("click", () => {
  if (confirm("ล้างภาพทั้งหมดหรือไม่?")) editor.clearAll();
});
document.getElementById("btnZoomIn").addEventListener("click", () => {
  editor.zoomBy(0.1);
  updateZoomLabel();
});
document.getElementById("btnZoomOut").addEventListener("click", () => {
  editor.zoomBy(-0.1);
  updateZoomLabel();
});
function updateZoomLabel() {
  document.getElementById("zoomLabel").textContent = Math.round(editor.scale * 100) + "%";
}
setInterval(updateZoomLabel, 200);

// keyboard shortcuts
window.addEventListener("keydown", (e) => {
  const tag = document.activeElement.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT" || document.activeElement.isContentEditable) return;
  if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); editor.undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key === "c") { e.preventDefault(); editor.copySelected(); }
  if ((e.ctrlKey || e.metaKey) && e.key === "v") { e.preventDefault(); editor.pasteClipboard(); }
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); editor.deleteSelected(); }
});

// ---- problem panel ----
const problemText = document.getElementById("problemText");
const fontSizeRange = document.getElementById("fontSizeRange");
const problemIndexLabel = document.getElementById("problemIndex");
const fileUpload = document.getElementById("fileUpload");

let problems = [""];
let currentIndex = 0;

fontSizeRange.addEventListener("input", () => {
  problemText.style.fontSize = fontSizeRange.value + "px";
});
problemText.style.fontSize = fontSizeRange.value + "px";

problemText.addEventListener("input", () => {
  problems[currentIndex] = problemText.value;
});

function renderProblem() {
  problemText.value = problems[currentIndex] || "";
  problemIndexLabel.textContent = `ข้อที่ ${currentIndex + 1}/${problems.length}`;
}

document.getElementById("btnPrevProblem").addEventListener("click", () => {
  currentIndex = (currentIndex - 1 + problems.length) % problems.length;
  renderProblem();
});
document.getElementById("btnNextProblem").addEventListener("click", () => {
  currentIndex = (currentIndex + 1) % problems.length;
  renderProblem();
});

fileUpload.addEventListener("change", async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  const allProblems = [];
  for (const file of files) {
    const text = await file.text();
    const parts = text
      .split(/\r?\n\s*\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    allProblems.push(...(parts.length ? parts : [text.trim()]));
  }
  if (allProblems.length) {
    problems = allProblems;
    currentIndex = 0;
    renderProblem();
  }
  fileUpload.value = "";
});

renderProblem();

// ---- calculator ----
const calc = document.getElementById("calculator");
const calcDisplay = document.getElementById("calcDisplay");
const calcGrid = document.getElementById("calcGrid");

const keys = [
  ["C", "clear"], ["±", "op"], ["%", "op"], ["÷", "op"],
  ["7", ""], ["8", ""], ["9", ""], ["×", "op"],
  ["4", ""], ["5", ""], ["6", ""], ["−", "op"],
  ["1", ""], ["2", ""], ["3", ""], ["+", "op"],
  ["0", ""], [".", ""], ["=", "eq"],
];

let calcState = { curr: "0", prev: null, op: null, reset: false };

function renderCalc() {
  calcDisplay.value = calcState.curr;
}

function calcInput(key) {
  if (key === "C") {
    calcState = { curr: "0", prev: null, op: null, reset: false };
  } else if (key === "±") {
    calcState.curr = String(parseFloat(calcState.curr || "0") * -1);
  } else if (key === "%") {
    calcState.curr = String(parseFloat(calcState.curr || "0") / 100);
  } else if (["÷", "×", "−", "+"].includes(key)) {
    if (calcState.prev !== null && !calcState.reset) calcCompute();
    calcState.prev = calcState.curr;
    calcState.op = key;
    calcState.reset = true;
  } else if (key === "=") {
    calcCompute();
    calcState.op = null;
    calcState.prev = null;
  } else if (key === ".") {
    if (calcState.reset) { calcState.curr = "0"; calcState.reset = false; }
    if (!calcState.curr.includes(".")) calcState.curr += ".";
  } else {
    if (calcState.reset || calcState.curr === "0") {
      calcState.curr = key;
      calcState.reset = false;
    } else {
      calcState.curr += key;
    }
  }
  renderCalc();
}

function calcCompute() {
  if (calcState.prev === null || calcState.op === null) return;
  const a = parseFloat(calcState.prev);
  const b = parseFloat(calcState.curr);
  let r = 0;
  switch (calcState.op) {
    case "+": r = a + b; break;
    case "−": r = a - b; break;
    case "×": r = a * b; break;
    case "÷": r = b === 0 ? NaN : a / b; break;
  }
  calcState.curr = String(Math.round(r * 1e8) / 1e8);
  calcState.reset = true;
}

keys.forEach(([label, cls]) => {
  const b = document.createElement("button");
  b.textContent = label;
  if (cls) b.classList.add(cls);
  b.addEventListener("click", () => calcInput(label));
  calcGrid.appendChild(b);
});
renderCalc();

document.getElementById("btnCalc").addEventListener("click", () => {
  calc.classList.toggle("hidden");
});
document.getElementById("calcClose").addEventListener("click", () => {
  calc.classList.add("hidden");
});

// ---- scratch paper (freehand pen/finger drawing area) ----
const scratchPad = new ScratchPad(document.getElementById("scratchpad"));
document.getElementById("btnScratch").addEventListener("click", () => scratchPad.toggle());
