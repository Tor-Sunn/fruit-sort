    // ---- KONSTANTER ----

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
    jarInnerImg.src = "img/jar_inner.png"; // use trimmed/cropped version for best results
    jarInnerImg.alt = "jar inner";
    jarInnerImg.draggable = false;
    glassEl.appendChild(jarInnerImg);

    const stackEl = document.createElement("div");
    stackEl.className = "fs-fruit-stack";

    const stack = glasses[i];

    // Render stack so the array end (top) maps to the visual top of the jar.
    // We append the top item first so visual order matches stack semantics.
    for (let s = stack.length - 1; s >= 0; s--) {
      const fruitName = stack[s];
      const img = document.createElement("img");
      img.className = "fs-fruit";
      img.src = `img/${fruitName}.png`;
      img.alt = fruitName;
      stackEl.appendChild(img);
    }

    glassEl.appendChild(stackEl);

    // NOTE: removed jarOuterImg (svg overlay) — it created an unnatural outline
    boardEl.appendChild(glassEl);
  }
}

// ---- INTERAKSJON ----

function handleGlassClick(index) {
  // klikker på et glass som ikke er del av aktivt nivå
  if (index >= activeLevel.glasses) return;

  const stack = glasses[index];

  // Ingen frukt valgt ennå → plukk opp fra dette glasset (hvis noe der)
  if (selectedGlassIndex === null) {
    if (stack.length === 0) return;

    selectedGlassIndex = index;
    statusEl.textContent = "Pick a glass to pour into.";
    drawBoard();
    return;
  }

  // Hvis klikker på samme glass → avbryt valg
  if (selectedGlassIndex === index) {
    selectedGlassIndex = null;
    statusEl.textContent = "";
    drawBoard();
    return;
  }

  // Flytt fra selectedGlassIndex → index
  const from = selectedGlassIndex;
  const to = index;

  const fromStack = glasses[from];
  const toStack = glasses[to];

  // Guard: if source empty (shouldn't happen) cancel
  if (fromStack.length === 0) {
    selectedGlassIndex = null;
    drawBoard();
    return;
  }

  // Determine the fruit type on top of the source
  const topFruit = fromStack[fromStack.length - 1];

  // Count how many consecutive top items of the same type exist in the source
  let sameCount = 0;
  for (let i = fromStack.length - 1; i >= 0; i--) {
    if (fromStack[i] === topFruit) sameCount++;
    else break;
  }

  // Available space in target
  const available = GLASS_CAPACITY - toStack.length;

  // Regler:
  // - Målglass kan ikke være fullt
  if (available <= 0) {
    statusEl.textContent = "That glass is full.";
    selectedGlassIndex = null;
    drawBoard();
    return;
  }

  // - Målglass må være tomt eller samme frukt på toppen
  if (toStack.length > 0 && toStack[toStack.length - 1] !== topFruit) {
    statusEl.textContent = "You can only pour onto the same fruit or an empty glass.";
    selectedGlassIndex = null;
    drawBoard();
    return;
  }

  // Move as many of the top identical fruits as will fit (min(sameCount, available))
  const toMove = Math.min(sameCount, available);

  // Pop from source and push to target, preserving order
  const movedFruits = [];
  for (let i = 0; i < toMove; i++) {
    movedFruits.push(fromStack.pop());
  }
  // Push them in the same order they had (bottom -> top among the moved group)
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

