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

const TOOLBAR_COLORS = [
  "#ff6b6b", "#ffa94d", "#ffd93d", "#6bcb77", "#4d96ff",
  "#a06cd5", "#ff6b9d", "#2ec4b6", "#845ec2", "#2d3142",
];
const colorPalette = document.getElementById("colorPalette");
const colorSwatches = TOOLBAR_COLORS.map((c) => {
  const sw = document.createElement("button");
  sw.type = "button";
  sw.className = "color-swatch";
  sw.style.background = c;
  if (c === TOOLBAR_COLORS[0]) sw.classList.add("active");
  sw.addEventListener("click", () => {
    editor.setColor(c);
    colorSwatches.forEach((s) => s.classList.remove("active"));
    sw.classList.add("active");
  });
  colorPalette.appendChild(sw);
  return sw;
});
editor.setColor(TOOLBAR_COLORS[0]);

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
const saveStatus = document.getElementById("saveStatus");

const STORAGE_KEY = "barbew.problems";

const DEFAULT_PROBLEMS = [
  "แม่ซื้อส้มหนัก 3.25 กิโลกรัม และซื้อแอปเปิ้ลเพิ่มอีก 1.6 กิโลกรัม แล้วแบ่งผลไม้ให้เพื่อนบ้านไป 2.15 กิโลกรัม แม่จะเหลือผลไม้ทั้งหมดกี่กิโลกรัม",
  "สมหญิงมีเงิน 150.75 บาท ซื้อสมุดราคา 45.5 บาท และซื้อปากการาคา 12.25 บาท สมหญิงจะเหลือเงินกี่บาท",
  "ร้านค้ามีน้ำตาลอยู่ 24.5 กิโลกรัม ขายไปตอนเช้า 8.75 กิโลกรัม และขายไปตอนบ่ายอีก 6.5 กิโลกรัม เหลือน้ำตาลกี่กิโลกรัม",
  "ตาปลูกผักบุ้งได้ 12.4 กิโลกรัม วันแรกขายไป 5.15 กิโลกรัม วันที่สองขายไปอีก 3.2 กิโลกรัม เหลือผักบุ้งกี่กิโลกรัม",
  "น้องมีริบบิ้นยาว 8.5 เมตร ตัดทำโบว์ชิ้นแรกยาว 1.75 เมตร และชิ้นที่สองยาว 2.4 เมตร เหลือริบบิ้นยาวกี่เมตร",
  "พ่อค้าขายผลไม้ได้เงินตอนเช้า 320.5 บาท และตอนบ่ายอีก 215.25 บาท แล้วต้องจ่ายค่าเช่าแผงเป็นเงิน 85.75 บาท พ่อค้าจะเหลือเงินกี่บาท",
  "ถังใบหนึ่งมีน้ำมันอยู่ 45.6 ลิตร เติมน้ำมันเพิ่มอีก 12.35 ลิตร แล้วนำไปเติมเครื่องยนต์ไป 20.45 ลิตร เหลือน้ำมันในถังกี่ลิตร",
  "ร้านขายข้าวสารมีข้าวสาร 156.5 กิโลกรัม ขายไปวันแรก 42.25 กิโลกรัม และขายไปวันที่สองอีก 38.75 กิโลกรัม เหลือข้าวสารกี่กิโลกรัม",
  "คุณยายขายไข่ได้เงิน 275.5 บาท และขายผักได้เงินอีก 124.25 บาท แล้วซื้อปุ๋ยราคา 180.6 บาท คุณยายจะเหลือเงินกี่บาท",
  "นักเรียนวิ่งได้ระยะทาง 3.75 กิโลเมตรในวันจันทร์ และวิ่งเพิ่มอีก 2.4 กิโลเมตรในวันอังคาร ถ้าเป้าหมายทั้งสัปดาห์คือ 12 กิโลเมตร นักเรียนต้องวิ่งอีกกี่กิโลเมตรจึงจะครบเป้าหมาย",
];

function loadSavedProblems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

function persistProblems() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(problems));
  } catch {
    // storage unavailable (private browsing, quota) — save silently fails
  }
}

let problems = loadSavedProblems() || DEFAULT_PROBLEMS.slice();
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

function flashSaveStatus(msg) {
  saveStatus.textContent = msg;
  saveStatus.classList.remove("hidden");
  clearTimeout(flashSaveStatus._t);
  flashSaveStatus._t = setTimeout(() => saveStatus.classList.add("hidden"), 1800);
}

document.getElementById("btnPrevProblem").addEventListener("click", () => {
  currentIndex = (currentIndex - 1 + problems.length) % problems.length;
  renderProblem();
});
document.getElementById("btnNextProblem").addEventListener("click", () => {
  currentIndex = (currentIndex + 1) % problems.length;
  renderProblem();
});

document.getElementById("btnNewProblem").addEventListener("click", () => {
  problems.push("");
  currentIndex = problems.length - 1;
  renderProblem();
  problemText.focus();
});

document.getElementById("btnSaveProblem").addEventListener("click", () => {
  problems[currentIndex] = problemText.value;
  persistProblems();
  flashSaveStatus("✅ บันทึกแล้ว");
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
    persistProblems();
    renderProblem();
    flashSaveStatus("✅ นำเข้าและบันทึกแล้ว");
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
