// ---- KONSTANTER ----

const MAX_GLASSES = 18;       // 6 i bredden * 3 rader
const GLASSES_PER_ROW = 6;
const GLASS_CAPACITY = 4;

// Standard brett: 6 glass (4 fylt, 2 tomme)
// coveredGlasses = hvor mange glass som skal få dekning
const DEFAULT_LEVEL_CONFIG = {
    glasses: 6,
    emptyGlasses: 2,
    coveredGlasses: 2
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

const boardEl = document.getElementById("fs-board");
const movesEl = document.getElementById("fs-moves");
const statusEl = document.getElementById("fs-status");
const resetBtn = document.getElementById("fs-reset");

// ---- STATE ----

let glasses = [];          // Array av 18 glass, hvert glass = array med frukt (bunn -> topp)
let activeLevel = { ...DEFAULT_LEVEL_CONFIG };
let selectedGlassIndex = null;
let moves = 0;

// coveredMap: index -> depth (how many fruits below the top are covered).
// Example: depth = 2 means the fruits at positions top-1 and top-2 are each covered with a leaf.
let coveredMap = {};

// ---- HJELPERE ----

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function randInt(min, max) { // inclusive
    return Math.floor(Math.random() * (max - min + 1)) + min;
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

// Compute bottom percentage for a fruit at indexFromBottom (0 = bottom) so leaf sits exactly over that fruit.
// Uses same vertical layout as .fs-fruit-stack: bottom: 10% and height: 58%.
// We spread positions evenly across GLASS_CAPACITY slots.
function computeLeafBottomPercent(indexFromBottom) {
    const base = 10; // bottom anchor in CSS
    const height = 58; // stack height percent in CSS
    const slots = Math.max(1, GLASS_CAPACITY - 1); // for 4 capacity, distribute across 3 intervals
    const step = height / slots;
    return base + indexFromBottom * step;
}

// Position all leaf wrappers to match their fruit elements.
// Uses data attributes set on .fs-leaf-wrap: data-glass and data-covered-index.
function positionLeaves() {
    const wraps = document.querySelectorAll(".fs-leaf-wrap");
    wraps.forEach(w => {
        const glassIndex = Number(w.dataset.glass);
        const coveredIndex = Number(w.dataset.coveredIndex); // index from bottom
        const glassEl = document.querySelector(`.fs-glass[data-index="${glassIndex}"]`);
        if (!glassEl) return;
        const stackEl = glassEl.querySelector(".fs-fruit-stack");
        if (!stackEl) return;

        const fruitImgs = stackEl.querySelectorAll(".fs-fruit");
        const stack = glasses[glassIndex] || [];
        // Map coveredIndex (0=bottom) to DOM index: DOM[0]=top ... DOM[n-1]=bottom
        const domIndex = (stack.length - 1) - coveredIndex;
        const fruitEl = fruitImgs[domIndex];

        if (fruitEl && fruitEl.clientHeight > 0) {
            // center over fruit
            const leftPx = fruitEl.offsetLeft + fruitEl.offsetWidth / 2;
            const topPx = fruitEl.offsetTop + fruitEl.offsetHeight / 2;
            // increase leaf size to better cover fruit (was 1.25)
            const wSize = Math.round(fruitEl.offsetWidth * 1.40); // <- increased
            const hSize = Math.round(fruitEl.offsetHeight * 1.40);

            // lower the leaf a little so it covers the lower half of the fruit more
            const extraY = Math.round(fruitEl.offsetHeight * 0.10); // 10% of fruit height downward
            w.style.width = `${wSize}px`;
            w.style.height = `${hSize}px`;
            w.style.left = `${leftPx}px`;
            // move center slightly down
            w.style.top = `${topPx + extraY}px`;
            w.style.transform = `translate(-50%, -50%)`;
        } else {
            // fallback percent placement (when measurements not available)
            const bottomPct = computeLeafBottomPercent(coveredIndex);
            // lower fallback by a couple percent as well
            const lowered = Math.max(0, bottomPct - 2);
            w.style.left = `50%`;
            w.style.transform = `translateX(-50%)`;
            w.style.bottom = `${lowered}%`;
            w.style.width = `60%`; // increase fallback width from 54% -> 60%
            w.style.height = `auto`;
            w.style.top = ""; // clear top
        }
    });
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
        glassEl.tabIndex = 0; // make focusable for keyboard users

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

        const stack = glasses[i] || [];

        // Render stack so the array end (top) maps to the visual top of the jar.
        for (let s = stack.length - 1; s >= 0; s--) {
            const fruitName = stack[s];
            const img = document.createElement("img");
            img.className = "fs-fruit";
            img.src = `img/${fruitName}.png`;
            img.alt = fruitName;

            // Set a CSS variable for optional staggered animation
            img.style.setProperty('--fruit-index', String(stack.length - 1 - s));

            stackEl.appendChild(img);
        }

        glassEl.appendChild(stackEl);

        // If this glass index has a cover depth > 0, render one leaf per covered fruit.
        const depth = coveredMap[i] || 0;
        if (depth > 0 && i < activeLevel.glasses && stack.length > 0) {
            const topIndex = stack.length - 1;

            for (let k = 1; k <= depth; k++) {
                const coveredIndex = topIndex - k;
                if (coveredIndex < 0) break;

                // wrapper that will contain <img src="img/leaf.png"> and the question span
                const leafWrap = document.createElement("div");
                leafWrap.className = "fs-leaf-wrap";
                leafWrap.setAttribute("aria-hidden", "true");
                leafWrap.dataset.glass = String(i);
                leafWrap.dataset.coveredIndex = String(coveredIndex);

                // initial fallback sizing (will be corrected by positionLeaves)
                const bottomPct = computeLeafBottomPercent(coveredIndex);
                leafWrap.style.left = "50%";
                leafWrap.style.transform = "translateX(-50%)";
                leafWrap.style.bottom = `${bottomPct}%`;
                leafWrap.style.width = `60%`; // increased fallback width
                leafWrap.style.height = `auto`;

                // leaf image element (fills wrapper)
                const leafImg = document.createElement("img");
                leafImg.className = "fs-leaf-img";
                leafImg.src = "img/leaf.png";
                leafImg.alt = "leaf";
                leafImg.draggable = false;

                // centered question badge
                const q = document.createElement("span");
                q.className = "fs-leaf-q";
                q.textContent = "?";

                leafWrap.appendChild(leafImg);
                leafWrap.appendChild(q);

                // append to stackEl so leaves follow fruit layout and transforms
                stackEl.appendChild(leafWrap);
            }
        }

        boardEl.appendChild(glassEl);
    }

    // position leaves after paint so measurements are valid
    requestAnimationFrame(() => {
        positionLeaves();
    });
}

// ---- INTERAKSJON ----

function handleGlassClick(index) {
    if (index >= activeLevel.glasses) return;

    // Clicking a covered jar no longer reveals it. Gameplay: must remove top fruit(s) by legal moves first.

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

    // Remember how many visible fruits were removed from the 'from' jar
    const removedCount = toMove;

    moves++;
    movesEl.textContent = moves.toString();
    statusEl.textContent = "";
    selectedGlassIndex = null;

    // Reveal logic for covers on the source jar:
    if (removedCount > 0 && coveredMap[from] && coveredMap[from] > 0) {
        coveredMap[from] = Math.max(0, coveredMap[from] - 1);

        const newStack = glasses[from];
        const newTop = newStack.length - 1;
        if ((coveredMap[from] > 0) && newTop >= 1) {
            const visibleFruit = newStack[newTop];
            const nextCoveredIndex = newTop - 1;
            if (nextCoveredIndex >= 0 && newStack[nextCoveredIndex] === visibleFruit) {
                coveredMap[from] = Math.max(0, coveredMap[from] - 1);
            }
        }

        if (coveredMap[from] === 0) {
            delete coveredMap[from];
        }
    }

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

// reposition leaves on resize
window.addEventListener("resize", () => requestAnimationFrame(positionLeaves));

// ---- START / RESET ----

function startNewGame() {
    moves = 0;
    movesEl.textContent = "0";
    statusEl.textContent = "";

    activeLevel = { ...DEFAULT_LEVEL_CONFIG };
    glasses = generateLevel(activeLevel);

    // Choose random non-empty used glasses to cover with leaves (depth = number of covered fruits)
    coveredMap = {};
    const candidateIndices = [];
    for (let i = 0; i < activeLevel.glasses; i++) {
        if (glasses[i] && glasses[i].length > 0) candidateIndices.push(i);
    }
    shuffle(candidateIndices);
    const toCover = Math.min(activeLevel.coveredGlasses || 0, candidateIndices.length);
    for (let k = 0; k < toCover; k++) {
        const idx = candidateIndices[k];
        const stackLen = glasses[idx].length;
        if (stackLen <= 1) continue; // nothing to cover under top
        // depth = how many fruits below the top are initially covered (1..stackLen-1)
        const maxDepth = Math.min(stackLen - 1, GLASS_CAPACITY - 1);
        const depth = randInt(1, maxDepth);
        coveredMap[idx] = depth;
    }

    selectedGlassIndex = null;
    drawBoard();
}

resetBtn.addEventListener("click", startNewGame);

// Init
startNewGame();