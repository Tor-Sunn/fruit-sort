/* --- Layout --- */

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 20px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #0f172a;
  color: #e5e7eb;
  display: flex;
  justify-content: center;
}

.fs-wrapper {
  width: 100%;
  /* Raised max-width so grid columns can be wider and jars can grow */
  max-width: 1400px;
}

.fs-title {
  margin: 0 0 4px;
  font-size: 28px;
}

.fs-sub {
  margin: 0 0 16px;
  color: #9ca3af;
  font-size: 14px;
}

.fs-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

#fs-status {
  flex: 1;
  min-height: 20px;
  font-size: 14px;
  color: #fbbf24;
}

#fs-reset {
  padding: 6px 14px;
  border-radius: 999px;
  border: none;
  background: #22c55e;
  color: #022c22;
  font-weight: 600;
  cursor: pointer;
}

/* --- Board (plass til 18 glass: 6 per rad * 3 rader) --- */

/* Use minmax so columns have a sensible minimum width (so jars can be larger).
   The layout will still be responsive: columns expand, but never shrink below 180px. */
.fs-board {
  display: grid;
  grid-template-columns: repeat(6, minmax(180px, 1fr));
  gap: 20px;
  justify-content: center;
  align-items: start;

  /* MOVED FURTHER DOWN: increase space between header and board */
  margin-top: 96px;
}

/* --- Glass --- */

.fs-glass {
  position: relative;
  width: 100%;
  /* larger target max width for jars (will take effect when grid cell allows it) */
  max-width: 280px;
  aspect-ratio: 3 / 5;
  margin-inline: auto;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.fs-glass--unused {
  visibility: hidden;
}

.fs-glass:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0,0,0,0.35);
}

/* NEW: visual for selected glass
   - remove harsh outline
   - slight lift + scale for depth
   - soft drop shadow
   - subtle orange glow around rim via ::after (non-blocking, pointer-events: none)
*/
.fs-glass--selected {
  outline: none;
  transform: translateY(-6px) scale(1.02);
  box-shadow: 0 20px 40px rgba(0,0,0,0.45);
  z-index: 4; /* sits above non-selected jars */
}

/* glow ring near the rim to indicate selection without covering fruit */
.fs-glass--selected::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 6%; /* aligns the glow near the jar rim */
  transform: translateX(-50%);
  width: 94%;
  height: 14%;
  border-radius: 50%;
  pointer-events: none;
  z-index: 5;
  box-shadow: 0 0 28px 8px rgba(249,115,22,0.12), 0 0 10px 2px rgba(249,115,22,0.08);
  transition: box-shadow 140ms ease, opacity 140ms ease, transform 140ms ease;
}

/* Jar grafikklag: inner under frukt (img-based) */

.fs-jar-inner-img {
  position: absolute;
  left: 50%;
  bottom: 4%;
  /* width controls jar visual size relative to .fs-glass */
  width: 92%;
  height: auto;
  transform: translateX(-50%);
  object-fit: contain;
  pointer-events: none;
  z-index: 0;
  opacity: 0.98;
}

/* Frukt-stack inni glasset (midtre lag) */

/* Positioned absolute so stack sits flush to bottom of jar.
   Lowered and shortened the stack so fruits start deeper inside the jar. */
.fs-fruit-stack {
  position: absolute;
  z-index: 1;
  left: 50%;
  transform: translateX(-50%);
  width: 46%;
  /* stack occupies the lower portion of the jar graphic */
  height: 58%;
  /* anchor a little above true bottom so fruits sit inside rim */
  bottom: 10%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
}

/* Slightly larger fruit but still constrained so 4 items fit nicely.
   object-position center bottom keeps visuals hugging the jar bottom. */
/* INCREASED ~20%: desktop from 30% -> 36% */
.fs-fruit {
  display: block;
  max-width: 100%;
  width: auto;
  height: auto;
  pointer-events: none;
  object-fit: contain;
  object-position: center bottom;
  max-height: 36%;
}

/* --- Responsivt --- */

@media (max-width: 1200px) {
  /* allow smaller screens to reduce the min width */
  .fs-board {
    grid-template-columns: repeat(6, minmax(140px, 1fr));
  }
  .fs-glass {
    max-width: 240px;
  }
  .fs-jar-inner-img {
    bottom: 4%;
    width: 96%;
  }
  .fs-fruit-stack {
    width: 50%;
    height: 56%;
    gap: 6px;
    bottom: 9%;
  }
  /* medium screens from 28% -> ~34% */
  .fs-fruit {
    max-height: 34%;
  }
  .fs-jar-inner,
  .fs-jar-outer {
    background-size: 96% auto;
  }
}

@media (max-width: 700px) {
  .fs-board {
    grid-template-columns: repeat(3, 1fr);
  }
  .fs-glass {
    max-width: 160px;
  }
  .fs-jar-inner-img {
    bottom: 4%;
    width: 94%;
  }
  .fs-fruit-stack {
    width: 52%;
    height: 52%;
    bottom: 8%;
    gap: 6px;
  }
  /* small screens from 26% -> ~31% */
  .fs-fruit {
    max-height: 31%;
  }
  .fs-jar-inner,
  .fs-jar-outer {
    background-size: 94% auto;
  }
}

/* ---- KONSTANTER ----

const MAX_GLASSES = 18;       // 6 i bredden * 3 rader
const GLASSES_PER_ROW = 6;
const GLASS_CAPACITY = 4;

// Standard brett: 6 glass (4 fylt, 2 tomme)
const DEFAULT_LEVEL_CONFIG = {
  glasses: 6,
  emptyGlasses: 2
};

// Alle fruktfilene du har i /img
const FRUIT_POOL = [
  "fruit_apple",
  "fruit_banana",
  "fruit_blueberry",
  "fruit_cherry",
  "fruit_grape",
  "fruit_kiwi",
  "fruit_lemon",
  "fruit_mango",
  "fruit_orange",
  "fruit_pear",
  "fruit_pineapple",
  "fruit_plum",
  "fruit_raspberry",
  "fruit_strawberry",
  "fruit_watermelon"
];

// ---- DOM ----

const boardEl  = document.getElementById("fs-board");
const movesEl  = document.getElementById("fs-moves");
const statusEl = document.getElementById("fs-status");
const resetBtn = document.getElementById("fs-reset");

// ---- STATE ----

let glasses = [];          // Array av 18 glass, hvert glass = array med frukt (bunn -> topp)
let activeLevel = { ...DEFAULT_LEVEL_CONFIG };
let selectedGlassIndex = null;
let moves = 0;

// ---- HJELPERE ----

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Sjekk om et glass er "komplett" (4 like frukter)
function isGlassComplete(stack) {
  if (stack.length !== GLASS_CAPACITY) return false;
  return stack.every(f => f === stack[0]);
}

// Sjekk om brettet er løst
function checkWin() {
  const usedGlasses = glasses.slice(0, activeLevel.glasses);

  const allOk = usedGlasses.every(stack =>
    stack.length === 0 || isGlassComplete(stack)
  );

  if (allOk) {
    statusEl.textContent = "🎉 You solved the board!";
  }
}

// ---- GENERER BRETT ----

function generateLevel(config) {
  const { glasses: numGlasses, emptyGlasses } = config;
  const usedGlasses = numGlasses;
  const nonEmptyGlasses = usedGlasses - emptyGlasses;

  // Antall frukttyper = antall ikke-tomme glass
  const typesCount = nonEmptyGlasses;

  const chosenFruits = shuffle([...FRUIT_POOL]).slice(0, typesCount);

  // Lag en liste med frukter der hver type har GLASS_CAPACITY kopier
  const allFruits = [];
  chosenFruits.forEach(f => {
    for (let i = 0; i < GLASS_CAPACITY; i++) {
      allFruits.push(f);
    }
  });

  shuffle(allFruits);

  const newGlasses = [];

  // Fyll nonEmptyGlasses glass med 4 frukter hver
  for (let g = 0; g < nonEmptyGlasses; g++) {
    const stack = allFruits.slice(g * GLASS_CAPACITY, (g + 1) * GLASS_CAPACITY);
    newGlasses.push(stack);
  }

  // Legg til tomme glass
  for (let g = 0; g < emptyGlasses; g++) {
    newGlasses.push([]);
  }

  // Hvis vi har færre enn MAX_GLASSES, fyll på med helt tomme,
  // men disse markeres som "unused" i UI.
  while (newGlasses.length < MAX_GLASSES) {
    newGlasses.push([]);
  }

  return newGlasses;
}

// ---- RENDERING ----

function drawBoard() {
  boardEl.innerHTML = "";

  for (let i = 0; i < MAX_GLASSES; i++) {
    const glassEl = document.createElement("div");
    glassEl.className = "fs-glass";
    glassEl.dataset.index = i;

    if (i >= activeLevel.glasses) {
      glassEl.classList.add("fs-glass--unused");
    }

    if (i === selectedGlassIndex) {
      glassEl.classList.add("fs-glass--selected");
    }

    // Jar inner as an <img> (under fruits)
    const jarInnerImg = document.createElement("img");
    jarInnerImg.className = "fs-jar-inner-img";
    jarInnerImg.src = "img/jar_inner.png";
    jarInnerImg.alt = "jar inner";
    jarInnerImg.draggable = false;
    glassEl.appendChild(jarInnerImg);

    const stackEl = document.createElement("div");
    stackEl.className = "fs-fruit-stack";

    const stack = glasses[i];

    // Render stack so the array end (top) maps to the visual top of the jar.
    for (let s = stack.length - 1; s >= 0; s--) {
      const fruitName = stack[s];
      const img = document.createElement("img");
      img.className = "fs-fruit";
      img.src = `img/${fruitName}.png`;
      img.alt = fruitName;
      stackEl.appendChild(img);
    }

    glassEl.appendChild(stackEl);
    boardEl.appendChild(glassEl);
  }
}

// ---- INTERAKSJON ----

function handleGlassClick(index) {
  if (index >= activeLevel.glasses) return;

  const stack = glasses[index];

  // pick up from this glass
  if (selectedGlassIndex === null) {
    if (stack.length === 0) return;

    selectedGlassIndex = index;
    statusEl.textContent = "Pick a glass to pour into.";
    drawBoard();
    return;
  }

  // cancel if same glass
  if (selectedGlassIndex === index) {
    selectedGlassIndex = null;
    statusEl.textContent = "";
    drawBoard();
    return;
  }

  const from = selectedGlassIndex;
  const to = index;

  const fromStack = glasses[from];
  const toStack = glasses[to];

  if (fromStack.length === 0) {
    selectedGlassIndex = null;
    drawBoard();
    return;
  }

  // Determine the fruit type on top of the source
  const topFruit = fromStack[fromStack.length - 1];

  // Count consecutive identical top items
  let sameCount = 0;
  for (let i = fromStack.length - 1; i >= 0; i--) {
    if (fromStack[i] === topFruit) sameCount++;
    else break;
  }

  // Available space in target
  const available = GLASS_CAPACITY - toStack.length;

  // Rules
  if (available <= 0) {
    statusEl.textContent = "That glass is full.";
    selectedGlassIndex = null;
    drawBoard();
    return;
  }

  if (toStack.length > 0 && toStack[toStack.length - 1] !== topFruit) {
    statusEl.textContent = "You can only pour onto the same fruit or an empty glass.";
    selectedGlassIndex = null;
    drawBoard();
    return;
  }

  // Move up to min(sameCount, available)
  const toMove = Math.min(sameCount, available);
  const movedFruits = [];
  for (let i = 0; i < toMove; i++) {
    movedFruits.push(fromStack.pop());
  }
  for (let i = movedFruits.length - 1; i >= 0; i--) {
    toStack.push(movedFruits[i]);
  }

  moves++;
  movesEl.textContent = moves.toString();
  statusEl.textContent = "";
  selectedGlassIndex = null;

  drawBoard();
  checkWin();
}

// Delegert klikklytter
boardEl.addEventListener("click", (e) => {
  const glassEl = e.target.closest(".fs-glass");
  if (!glassEl) return;
  const index = Number(glassEl.dataset.index);
  handleGlassClick(index);
});

// ---- START / RESET ----

function startNewGame() {
  moves = 0;
  movesEl.textContent = "0";
  statusEl.textContent = "";

  activeLevel = { ...DEFAULT_LEVEL_CONFIG };
  glasses = generateLevel(activeLevel);

  selectedGlassIndex = null;
  drawBoard();
}

resetBtn.addEventListener("click", startNewGame);

// Init
startNewGame();

