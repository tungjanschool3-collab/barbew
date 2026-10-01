import { BarModelEditor } from "./editor.js";
import { ScratchPad } from "./scratchpad.js";
import { PDFDocument } from "pdf-lib";

// ---- editor ----
const canvas = document.getElementById("canvas");
const wrap = document.querySelector(".canvas-wrap");
const editor = new BarModelEditor(canvas, wrap);

// Press-and-hold either scroll button to keep scrolling continuously,
// not just one fixed jump per tap.
function bindHoldToScroll(buttonId, dir) {
  const btn = document.getElementById(buttonId);
  let timer = null;
  const start = (e) => {
    e.preventDefault();
    if (timer) return;
    window.scrollBy({ top: dir * 12, behavior: "instant" });
    timer = setInterval(() => window.scrollBy({ top: dir * 12, behavior: "instant" }), 16);
  };
  const stop = () => {
    clearInterval(timer);
    timer = null;
  };
  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointerleave", stop);
  btn.addEventListener("pointercancel", stop);
}
bindHoldToScroll("btnScrollUp", -1);
bindHoldToScroll("btnScrollDown", 1);

// Collapse the header + problem panel to free up room for drawing.
document.getElementById("btnToggleHeader").addEventListener("click", (e) => {
  const collapsed = document.body.classList.toggle("compact-header");
  e.currentTarget.textContent = collapsed ? "▼" : "▲";
  e.currentTarget.title = collapsed ? "แสดงหัวข้อและโจทย์" : "ซ่อนหัวข้อและโจทย์";
  // The canvas now has more (or less) room — resize it to match.
  window.dispatchEvent(new Event("resize"));
});

document.getElementById("btnAddStep").addEventListener("click", () => {
  editor.addStep();
  setTimeout(
    () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }),
    60
  );
});

// ---- 3D logo ----
// Three.js (~500KB) is purely decorative here, so load it lazily after
// the app itself is interactive rather than blocking the initial bundle.
const startLogo3D = () =>
  import("./logo3d.js").then(({ mountLogo3D }) => mountLogo3D(document.getElementById("logo3d")));
if ("requestIdleCallback" in window) {
  requestIdleCallback(startLogo3D, { timeout: 2000 });
} else {
  setTimeout(startLogo3D, 300);
}

// Typing a math symbol character directly into a label/text box that's
// currently open should just insert it there, instead of stamping a
// separate standalone symbol object onto the canvas.
function insertAtCursor(el, text) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  const pos = start + text.length;
  el.setSelectionRange(pos, pos);
}

const toolButtons = document.querySelectorAll(".tool-btn[data-tool]");
toolButtons.forEach((btn) => {
  if (btn.dataset.symbol) {
    // Keep whatever inline editor is currently focused from losing focus
    // when this button is pressed, so we can insert into it instead.
    btn.addEventListener("mousedown", (e) => {
      if (document.activeElement && document.activeElement.classList.contains("text-edit-box")) {
        e.preventDefault();
      }
    });
  }
  btn.addEventListener("click", () => {
    if (
      btn.dataset.symbol &&
      document.activeElement &&
      document.activeElement.classList.contains("text-edit-box")
    ) {
      insertAtCursor(document.activeElement, btn.dataset.symbol);
      return;
    }
    toolButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    editor.setTool(btn.dataset.tool);
    if (btn.dataset.symbol) editor.setPendingSymbol(btn.dataset.symbol);
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
document.getElementById("btnZoomIn").addEventListener("click", () => editor.zoomBy(0.1));
document.getElementById("btnZoomOut").addEventListener("click", () => editor.zoomBy(-0.1));
function updateZoomLabel() {
  document.getElementById("zoomLabel").textContent = Math.round(editor.scale * 100) + "%";
}
editor.onZoomChange = updateZoomLabel;
updateZoomLabel();

// keyboard shortcuts
window.addEventListener("keydown", (e) => {
  const tag = document.activeElement.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT" || document.activeElement.isContentEditable) return;
  if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); editor.undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key === "c") { e.preventDefault(); editor.copySelected(); }
  if ((e.ctrlKey || e.metaKey) && e.key === "v") { e.preventDefault(); editor.pasteClipboard(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) {
    e.preventDefault();
    editor.zoomBy(0.1);
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "-") {
    e.preventDefault();
    editor.zoomBy(-0.1);
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "0") {
    e.preventDefault();
    editor.zoomBy(1 - editor.scale);
  }
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); editor.deleteSelected(); }
});

// ---- problem panel ----
const problemText = document.getElementById("problemText");
const fontSizeRange = document.getElementById("fontSizeRange");
const problemIndexLabel = document.getElementById("problemIndex");
const fileUpload = document.getElementById("fileUpload");
const saveStatus = document.getElementById("saveStatus");
const STORAGE_KEY = "barbew.problems";
const DRAWINGS_KEY = "barbew.drawings";

const DEFAULT_PROBLEMS = [
  "แม่ของมัดหมี่ซื้อเส้นขนมจีน 4 ถุง ถุงละ 2.5 กิโลกรัม นำไปทำขนมจีนทุ่งจานเลี้ยงพระ 3.5 กิโลกรัม เส้นที่เหลือแบ่งใส่ถุงเล็ก ถุงละ 0.5 กิโลกรัม เพื่อนำไปขาย จะได้กี่ถุง",
  "แปลงผักสลัดของโรงเรียนวัดทุ่งจาน วันแรกเก็บผักได้ 18.75 กิโลกรัม วันที่สองเก็บได้มากกว่าวันแรก 6.5 กิโลกรัม นักเรียนนำผักที่เก็บได้ทั้งสองวันมาแบ่งใส่ถุง ถุงละ 0.8 กิโลกรัม เพื่อขายให้ผู้ปกครอง จะได้ผักกี่ถุง",
  "กลุ่มอาชีพทอผ้าของโรงเรียนวัดทุ่งจานมีผ้ายาว 25.6 เมตร ตัดไปทำผ้ากันเปื้อนแล้ว 4.8 เมตร ผ้าที่เหลือทั้งหมดนำมาตัดเป็นถุงผ้า ใบละ 1.3 เมตร ถ้านำถุงผ้าไปขายใบละ 45.50 บาท และขายได้หมด กลุ่มจะได้เงินกี่บาท",
  "นักเรียนชั้น ป.6 โรงเรียนวัดทุ่งจาน ไปทัศนศึกษา โดยเช่ารถตู้ 2 คัน คันละ 1,250.50 บาท และซื้ออาหารกลางวันรวม 875.25 บาท ค่าใช้จ่ายทั้งหมดหารเท่า ๆ กันระหว่างนักเรียนและครูที่ไปด้วยรวม 25 คน แต่ละคนต้องจ่ายกี่บาท",
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

function loadSavedDrawings() {
  try {
    const raw = localStorage.getItem(DRAWINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistDrawings() {
  try {
    localStorage.setItem(DRAWINGS_KEY, JSON.stringify(drawings));
  } catch {
    // storage unavailable (private browsing, quota) — save silently fails
  }
}

const savedProblems = loadSavedProblems();
let problems = savedProblems || DEFAULT_PROBLEMS.slice();
let drawings = loadSavedDrawings();
let currentIndex = 0;

// Snapshot whatever is currently on the canvas into the drawing slot for
// the problem we're about to navigate away from.
function saveCurrentDrawing() {
  drawings[currentIndex] = editor.getObjects();
}

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
  editor.loadObjects(drawings[currentIndex] || []);
}

function flashSaveStatus(msg) {
  saveStatus.textContent = msg;
  saveStatus.classList.remove("hidden");
  clearTimeout(flashSaveStatus._t);
  flashSaveStatus._t = setTimeout(() => saveStatus.classList.add("hidden"), 1800);
}

document.getElementById("btnPrevProblem").addEventListener("click", () => {
  saveCurrentDrawing();
  currentIndex = (currentIndex - 1 + problems.length) % problems.length;
  renderProblem();
});
document.getElementById("btnNextProblem").addEventListener("click", () => {
  saveCurrentDrawing();
  currentIndex = (currentIndex + 1) % problems.length;
  renderProblem();
});

document.getElementById("btnNewProblem").addEventListener("click", () => {
  saveCurrentDrawing();
  problems.push("");
  drawings.push([]);
  currentIndex = problems.length - 1;
  renderProblem();
  problemText.focus();
});

document.getElementById("btnSaveProblem").addEventListener("click", () => {
  problems[currentIndex] = problemText.value;
  saveCurrentDrawing();
  persistProblems();
  persistDrawings();
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
    drawings = allProblems.map(() => []);
    currentIndex = 0;
    persistProblems();
    persistDrawings();
    renderProblem();
    flashSaveStatus("✅ นำเข้าและบันทึกแล้ว");
  }
  fileUpload.value = "";
});

window.addEventListener("beforeunload", () => {
  saveCurrentDrawing();
  persistDrawings();
});

renderProblem();

// ---- calculator ----
const calc = document.getElementById("calculator");
const calcDisplay = document.getElementById("calcDisplay");
const calcGrid = document.getElementById("calcGrid");
const calcWork = document.getElementById("calcWork");
const calcHeader = document.getElementById("calcHeader");

const keys = [
  ["C", "clear"], ["±", "op"], ["%", "op"], ["÷", "op"],
  ["7", ""], ["8", ""], ["9", ""], ["×", "op"],
  ["4", ""], ["5", ""], ["6", ""], ["−", "op"],
  ["1", ""], ["2", ""], ["3", ""], ["+", "op"],
  ["0", ""], [".", ""], ["=", "eq"],
];

// Shows the whole running expression as it's typed (e.g. "1.2+3.4−5.2")
// rather than collapsing to an intermediate result after each operator,
// and evaluates it with normal order of operations (×÷ before +−).
let calcExpr = "";
let calcJustEvaluated = false;
let calcWorkExpr = "";
let calcWorkResult = null;

function renderCalcWork() {
  calcWork.replaceChildren();
  if (!calcWorkExpr || calcWorkResult === null) {
    const hint = document.createElement("div");
    hint.className = "calc-work-hint";
    hint.textContent = "พิมพ์โจทย์แล้วกด = เพื่อดูการตั้งเลข";
    calcWork.appendChild(hint);
    return;
  }

  const tokens = calcWorkExpr.match(/\d+\.?\d*|\.\d+|[+−×÷-]/g) || [];
  let firstNumber = true;
  let pendingOp = "";
  for (const token of tokens) {
    if (["+", "−", "×", "÷", "-"].includes(token)) {
      pendingOp = token === "-" ? "−" : token;
      continue;
    }
    if (!/^(?:\d+\.?\d*|\.\d+)$/.test(token)) continue;
    const row = document.createElement("div");
    row.className = "calc-work-row";
    const op = document.createElement("span");
    op.className = "calc-work-op";
    op.textContent = pendingOp;
    const value = document.createElement("span");
    value.className = "calc-work-value";
    value.textContent = token.startsWith(".") ? `0${token}` : token;
    row.append(op, value);
    calcWork.appendChild(row);
    firstNumber = false;
    pendingOp = "";
  }

  const line = document.createElement("div");
  line.className = "calc-work-line";
  const answer = document.createElement("div");
  answer.className = "calc-work-answer";
  answer.textContent = String(calcWorkResult);
  calcWork.append(line, answer);
}

function renderCalc() {
  calcDisplay.value = calcExpr || "0";
  calcDisplay.scrollLeft = calcDisplay.scrollWidth;
  renderCalcWork();
}

function evalExpression(expr) {
  const tokens = expr.match(/\d+\.?\d*|\.\d+|[+\-−×÷]/g) || [];
  if (!tokens.length) return 0;

  let i = 0;
  const terms = [];
  if (tokens[0] === "-" || tokens[0] === "−") {
    terms.push(-parseFloat(tokens[1] ?? "0"));
    i = 2;
  } else {
    terms.push(parseFloat(tokens[0]));
    i = 1;
  }
  while (i < tokens.length - 1) {
    const op = tokens[i];
    const num = parseFloat(tokens[i + 1]);
    if (op === "×") terms.push(terms.pop() * num);
    else if (op === "÷") terms.push(num === 0 ? NaN : terms.pop() / num);
    else terms.push(op, num);
    i += 2;
  }
  let result = terms[0];
  for (let j = 1; j < terms.length; j += 2) {
    result = terms[j] === "+" ? result + terms[j + 1] : result - terms[j + 1];
  }
  return result;
}

function calcInput(key) {
  if (calcJustEvaluated) {
    if (/[0-9.]/.test(key)) {
      calcExpr = "";
      calcWorkExpr = "";
      calcWorkResult = null;
    }
    calcJustEvaluated = false;
  }

  if (key === "C") {
    calcExpr = "";
    calcWorkExpr = "";
    calcWorkResult = null;
  } else if (key === "±") {
    if (/^-?\d+\.?\d*$/.test(calcExpr)) {
      calcExpr = calcExpr.startsWith("-") ? calcExpr.slice(1) : calcExpr ? "-" + calcExpr : "";
    }
  } else if (key === "%") {
    if (/^-?\d+\.?\d*$/.test(calcExpr) && calcExpr) {
      calcExpr = String(parseFloat(calcExpr) / 100);
    }
  } else if (["÷", "×", "−", "+"].includes(key)) {
    if (!calcExpr) {
      if (key === "−") calcExpr = "-";
    } else if (/[+\-−×÷]$/.test(calcExpr)) {
      calcExpr = calcExpr.slice(0, -1) + key;
    } else {
      calcExpr += key;
    }
  } else if (key === "=") {
    if (calcExpr) {
      const clean = calcExpr.replace(/[+\-−×÷]$/, "");
      const result = Math.round(evalExpression(clean) * 1e8) / 1e8;
      calcWorkExpr = clean;
      calcWorkResult = result;
      calcExpr = String(result);
      calcJustEvaluated = true;
    }
  } else if (key === ".") {
    const m = calcExpr.match(/(\d*\.?\d*)$/);
    if (m && !m[0].includes(".")) calcExpr += m[0] === "" ? "0." : ".";
  } else {
    calcExpr += key;
  }
  renderCalc();
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

// Drag the calculator by its purple title bar. Converting right/bottom to
// left/top at drag start keeps the movement smooth and clamps it on-screen.
let calcDrag = null;
calcHeader.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button")) return;
  e.preventDefault();
  const rect = calc.getBoundingClientRect();
  calc.style.left = `${rect.left}px`;
  calc.style.top = `${rect.top}px`;
  calc.style.right = "auto";
  calc.style.bottom = "auto";
  calcDrag = { pointerId: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  calcHeader.setPointerCapture(e.pointerId);
  calc.classList.add("dragging");
});
calcHeader.addEventListener("pointermove", (e) => {
  if (!calcDrag || calcDrag.pointerId !== e.pointerId) return;
  const maxX = Math.max(0, window.innerWidth - calc.offsetWidth);
  const maxY = Math.max(0, window.innerHeight - calc.offsetHeight);
  calc.style.left = `${Math.min(maxX, Math.max(0, e.clientX - calcDrag.dx))}px`;
  calc.style.top = `${Math.min(maxY, Math.max(0, e.clientY - calcDrag.dy))}px`;
});
function stopCalcDrag(e) {
  if (!calcDrag || calcDrag.pointerId !== e.pointerId) return;
  calcDrag = null;
  calc.classList.remove("dragging");
}
calcHeader.addEventListener("pointerup", stopCalcDrag);
calcHeader.addEventListener("pointercancel", stopCalcDrag);

// Calculator keyboard input: digits, ., + - * / (mapped to our −/×/÷),
// Enter/= to compute, Escape/C to clear, Backspace to delete a digit.
const CALC_KEY_MAP = { "*": "×", "/": "÷", "-": "−" };
window.addEventListener("keydown", (e) => {
  if (calc.classList.contains("hidden")) return;
  const tag = document.activeElement.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT" || document.activeElement.isContentEditable) return;

  const key = CALC_KEY_MAP[e.key] || e.key;
  if (/^[0-9]$/.test(key) || key === "." || ["+", "−", "×", "÷"].includes(key)) {
    e.preventDefault();
    calcInput(key);
  } else if (key === "Enter" || key === "=") {
    e.preventDefault();
    calcInput("=");
  } else if (key === "Escape" || key === "c" || key === "C") {
    e.preventDefault();
    calcInput("C");
  } else if (key === "Backspace") {
    e.preventDefault();
    calcExpr = calcExpr.slice(0, -1);
    calcWorkExpr = "";
    calcWorkResult = null;
    renderCalc();
  }
});

// ---- scratch paper (freehand pen/finger drawing area) ----
const scratchPad = new ScratchPad(document.getElementById("scratchpad"));
document.getElementById("btnScratch").addEventListener("click", () => scratchPad.toggle());

// ---- print to PDF (A4) ----
// Fills in the print-only worksheet header (name/class/number blanks +
// a plain-text copy of the current problem, prefixed "-ข้อ N") right
// before printing, whether triggered by our button or Ctrl+P/Cmd+P.
const printProblemText = document.getElementById("printProblemText");
function preparePrintSheet() {
  printProblemText.textContent = `-ข้อ ${currentIndex + 1} ${problemText.value.trim()}`;
  editor.setPrintMode(true);
}
window.addEventListener("beforeprint", preparePrintSheet);
window.addEventListener("afterprint", () => editor.setPrintMode(false));
document.getElementById("btnPrintPdf").addEventListener("click", () => window.print());

// ---- save image / create PDF / append to an existing PDF ----
const existingPdfInput = document.getElementById("existingPdfInput");

function safeFilename(name) {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 60) || "barbew";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasToBlob(source, type = "image/png") {
  return new Promise((resolve, reject) => {
    source.toBlob((blob) => blob ? resolve(blob) : reject(new Error("สร้างไฟล์ภาพไม่สำเร็จ")), type);
  });
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = Array.from(text || "");
  const lines = [];
  let line = "";
  for (const char of words) {
    const next = line + char;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line.trim());
      line = char;
    } else {
      line = next;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function createWorksheetCanvas() {
  const drawing = editor.createExportCanvas();
  const page = document.createElement("canvas");
  page.width = 1240;
  page.height = 1754;
  const ctx = page.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, page.width, page.height);

  ctx.fillStyle = "#2d3142";
  ctx.textAlign = "center";
  ctx.font = "bold 38px Kanit, Tahoma, sans-serif";
  ctx.fillText("แบบฝึกหัดโจทย์ปัญหา Bar Model", page.width / 2, 70);
  ctx.font = "30px Kanit, Tahoma, sans-serif";
  const lines = wrapCanvasText(ctx, `ข้อ ${currentIndex + 1}  ${problemText.value.trim()}`, 1100);
  lines.slice(0, 6).forEach((line, i) => ctx.fillText(line, page.width / 2, 125 + i * 44));

  const top = 155 + Math.min(lines.length, 6) * 44;
  const maxW = 1140;
  const maxH = page.height - top - 70;
  const ratio = Math.min(maxW / drawing.width, maxH / drawing.height, 1);
  const width = drawing.width * ratio;
  const height = drawing.height * ratio;
  ctx.drawImage(drawing, (page.width - width) / 2, top, width, height);
  return page;
}

async function worksheetPdfBytes(existingBytes = null) {
  const pdf = existingBytes ? await PDFDocument.load(existingBytes) : await PDFDocument.create();
  const worksheet = createWorksheetCanvas();
  const png = await pdf.embedPng(await canvasToBlob(worksheet).then((b) => b.arrayBuffer()));
  const page = pdf.addPage([595.28, 841.89]);
  const margin = 24;
  const scale = Math.min((page.getWidth() - margin * 2) / png.width, (page.getHeight() - margin * 2) / png.height);
  const width = png.width * scale;
  const height = png.height * scale;
  page.drawImage(png, {
    x: (page.getWidth() - width) / 2,
    y: (page.getHeight() - height) / 2,
    width,
    height,
  });
  return pdf.save();
}

document.getElementById("btnSaveImage").addEventListener("click", async () => {
  const blob = await canvasToBlob(editor.createExportCanvas());
  downloadBlob(blob, `${safeFilename(`barbew-ข้อ-${currentIndex + 1}`)}.png`);
});

document.getElementById("btnExportPdf").addEventListener("click", async () => {
  const bytes = await worksheetPdfBytes();
  downloadBlob(new Blob([bytes], { type: "application/pdf" }), `${safeFilename(`barbew-ข้อ-${currentIndex + 1}`)}.pdf`);
});

existingPdfInput.addEventListener("change", async () => {
  const file = existingPdfInput.files?.[0];
  if (!file) return;
  try {
    const bytes = await worksheetPdfBytes(await file.arrayBuffer());
    const base = file.name.replace(/\.pdf$/i, "");
    downloadBlob(new Blob([bytes], { type: "application/pdf" }), `${safeFilename(base)}-เพิ่มผลงาน.pdf`);
  } catch (error) {
    alert("ไม่สามารถเพิ่มผลงานลง PDF นี้ได้ กรุณาตรวจสอบว่าไฟล์ไม่เสียหายหรือมีรหัสผ่าน");
    console.error(error);
  } finally {
    existingPdfInput.value = "";
  }
});
