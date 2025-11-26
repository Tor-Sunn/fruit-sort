/* ============================================================
   FRUIT SORT – COMPLETE GAME.JS
   Stable, chaotic generator, covers, UI, daily, scoring
   ============================================================ */


// -------------------------------------------------------------
// KONSTANTER
// -------------------------------------------------------------

const MAX_GLASSES = 18;
const GLASS_CAPACITY = 4;

const DEFAULT_LEVEL_CONFIG = {
    glasses: 6,
    emptyGlasses: 2,
    coveredGlasses: 2
};

// alle fruktene i img/
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


// -------------------------------------------------------------
// DOM ELEMENTER
// -------------------------------------------------------------

const boardEl = document.getElementById("fs-board");
const movesEl = document.getElementById("fs-moves");
const statusEl = document.getElementById("fs-status");
const resetBtn = document.getElementById("fs-reset");
const difficultySelect = document.getElementById("fs-difficulty");
const fastHardCheckbox = document.getElementById("fs-fast-hard");


// -------------------------------------------------------------
// GLOBAL GAME STATE
// -------------------------------------------------------------

let generatorDifficulty = "brutal";

let glasses = [];
let activeLevel = { ...DEFAULT_LEVEL_CONFIG };
let selectedGlassIndex = null;
let moves = 0;

let initialCoveredPositions = {};
let coveredPositions = {};

let startTime = null;
let lastScore = 0;
let levelSeed = null;


// -------------------------------------------------------------
// HELPER FUNKSJONER
// -------------------------------------------------------------

function shuffleInPlace(array, rng = Math.random) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function randInt(min, max, rng = Math.random) {
    return Math.floor(rng() * (max - min + 1)) + min;
}

function isGlassComplete(stack) {
    if (stack.length !== GLASS_CAPACITY) return false;
    return stack.every(f => f === stack[0]);
}

function makeSeededRng(seed) {
    let t = seed >>> 0;
    return function () {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function dateSeedFromDate(d) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return ((y * 100 + m) * 100 + day) >>> 0;
}

function computeScore(movesCount, elapsedMs, difficultyMultiplier = 1) {
    const elapsedSec = Math.max(1, Math.round(elapsedMs / 1000));
    const base = 1000 * difficultyMultiplier;
    return Math.max(0, Math.round(base - movesCount * 12 - elapsedSec * 3));
}


// -------------------------------------------------------------
// VANLIG KONTROLL OVER SPILLSTØRRELSE (EASY/MEDIUM/HARD)
// -------------------------------------------------------------

const DIFFICULTY_PRESETS = {
    easy: { glasses: 6, emptyGlasses: 2, coveredGlasses: 1 },
    medium: { glasses: 8, emptyGlasses: 1, coveredGlasses: 2 },
    hard: { glasses: 10, emptyGlasses: 1, coveredGlasses: 3 }
};

// hvor mange frukttyper brukes i scramble?
const FRUIT_COUNT_PRESET = {
    easy: 6,
    medium: 10,
    hard: 15
};


// -------------------------------------------------------------
// NY NIVÅ-GENERATOR (KAOTISK, IKKE FERDIG SORTERT)
// -------------------------------------------------------------

function generateChaoticLevel(numGlasses, numFruitTypes) {
    const totalFruits = numFruitTypes * GLASS_CAPACITY;

    const fruits = shuffleInPlace([...FRUIT_POOL]).slice(0, numFruitTypes);

    let pool = [];
    fruits.forEach(f => {
        for (let i = 0; i < GLASS_CAPACITY; i++) pool.push(f);
    });

    shuffleInPlace(pool);

    const result = [];
    let idx = 0;

    for (let g = 0; g < numGlasses; g++) {
        const stack = [];
        for (let i = 0; i < GLASS_CAPACITY; i++) {
            if (idx < pool.length) stack.push(pool[idx++]);
        }
        result.push(stack);
    }

    while (result.length < MAX_GLASSES) result.push([]);

    return result;
}

function generateLevel(config, mode = "scramble", date = null) {
    const numGlasses = config.glasses;
    const numFruitTypes = FRUIT_COUNT_PRESET[config._presetName] || 10;

    let rng = Math.random;
    if (mode === "daily" && date) rng = makeSeededRng(dateSeedFromDate(date));

    const originalRandom = Math.random;
    if (mode === "daily") Math.random = rng;

    const level = generateChaoticLevel(numGlasses, numFruitTypes);

    if (mode === "daily") Math.random = originalRandom;

    return level;
}


// -------------------------------------------------------------
// BLADE COVER / VISUELL DEKKE LOGIKK
// -------------------------------------------------------------

function computeLeafBottomPercent(indexFromBottom, stackLen = GLASS_CAPACITY) {
    const base = 10;
    const height = 58;
    const step = height / Math.max(1, stackLen - 1);
    return base + indexFromBottom * step;
}

function positionLeaves() {
    const wraps = document.querySelectorAll(".fs-leaf-wrap");

    wraps.forEach(w => {
        const glassIndex = Number(w.dataset.glass);
        const coveredIndex = Number(w.dataset.coveredIndex);
        const glassEl = document.querySelector(`.fs-glass[data-index="${glassIndex}"]`);
        if (!glassEl) return;

        const stackEl = glassEl.querySelector(".fs-fruit-stack");
        const fruitEls = stackEl.querySelectorAll(".fs-fruit");

        const stack = glasses[glassIndex] || [];
        const domIndex = (stack.length - 1) - coveredIndex;

        let targetFruit = fruitEls[domIndex] || fruitEls[fruitEls.length - 1];
        if (targetFruit && targetFruit.clientHeight > 0) {

            const leftPx = targetFruit.offsetLeft + targetFruit.offsetWidth / 2;
            const topPx = targetFruit.offsetTop + targetFruit.offsetHeight / 2;

            const LEAF_SCALE = 1.5;
            const VSHIFT = 0.14;

            const wSize = Math.round(targetFruit.offsetWidth * LEAF_SCALE);
            const hSize = Math.round(targetFruit.offsetHeight * LEAF_SCALE);

            const extraY = Math.round(targetFruit.offsetHeight * VSHIFT);

            w.style.width = `${wSize}px`;
            w.style.height = `${hSize}px`;
            w.style.left = `${leftPx}px`;
            w.style.top = `${topPx + extraY}px`;
            w.style.transform = "translate(-50%, -50%)";
            w.style.bottom = "";
        }
        else {
            const bottomPct = computeLeafBottomPercent(coveredIndex, stack.length);
            const lowered = Math.max(0, bottomPct - 3);

            w.style.left = "50%";
            w.style.bottom = `${lowered}%`;
            w.style.width = "66%";
            w.style.height = "66%";
            w.style.transform = "translateX(-50%)";
            w.style.top = "";
        }
    });
}

const schedulePositionLeaves = (() => {
    let scheduled = false;
    return () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() =>
            requestAnimationFrame(() => {
                positionLeaves();
                scheduled = false;
            })
        );
    };
})();


// -------------------------------------------------------------
// RENDER BOARD
// -------------------------------------------------------------

function drawBoard() {
    boardEl.innerHTML = "";

    for (let i = 0; i < MAX_GLASSES; i++) {
        const glassEl = document.createElement("div");
        glassEl.className = "fs-glass";
        glassEl.dataset.index = i;
        glassEl.tabIndex = 0;

        if (i >= activeLevel.glasses) glassEl.classList.add("fs-glass--unused");
        if (i === selectedGlassIndex) glassEl.classList.add("fs-glass--selected");

        const jarInner = document.createElement("img");
        jarInner.className = "fs-jar-inner-img";
        jarInner.src = "img/jar_inner.png";
        jarInner.draggable = false;
        jarInner.addEventListener("load", schedulePositionLeaves);
        jarInner.addEventListener("error", schedulePositionLeaves);
        glassEl.appendChild(jarInner);

        const stackEl = document.createElement("div");
        stackEl.className = "fs-fruit-stack";

        const stack = glasses[i] || [];
        for (let s = stack.length - 1; s >= 0; s--) {
            const fruit = stack[s];
            const img = document.createElement("img");
            img.className = "fs-fruit";
            img.src = `img/${fruit}.png`;
            img.draggable = false;
            img.style.setProperty("--fruit-index", String(stack.length - 1 - s));
            img.addEventListener("load", schedulePositionLeaves);
            img.addEventListener("error", schedulePositionLeaves);
            stackEl.appendChild(img);
        }

        glassEl.appendChild(stackEl);

        // render cover
        const cover = coveredPositions[i];

        if (cover && cover.fullCover > 0 && i < activeLevel.glasses) {
            const overlay = document.createElement("div");
            overlay.className = "fs-full-cover";
            overlay.dataset.glass = i;

            const q = document.createElement("span");
            q.className = "fs-full-cover-q";
            q.textContent = cover.fullCover > 1 ? `? ${cover.fullCover}` : "?";

            overlay.appendChild(q);
            stackEl.appendChild(overlay);
        }
        else if (cover && cover.positions && cover.positions.length) {

            cover.positions.slice().sort((a, b) => b - a).forEach(pos => {

                const leafWrap = document.createElement("div");
                leafWrap.className = "fs-leaf-wrap";
                leafWrap.dataset.glass = i;
                leafWrap.dataset.coveredIndex = pos;

                const bottomPct = computeLeafBottomPercent(pos, stack.length);
                leafWrap.style.bottom = bottomPct + "%";
                leafWrap.style.left = "50%";
                leafWrap.style.width = "66%";
                leafWrap.style.height = "66%";
                leafWrap.style.transform = "translateX(-50%)";

                const leafImg = document.createElement("img");
                leafImg.className = "fs-leaf-img";
                leafImg.src = "img/leaf.png";
                leafImg.draggable = false;

                const q = document.createElement("span");
                q.className = "fs-leaf-q";
                q.textContent = "?";

                leafWrap.appendChild(leafImg);
                leafWrap.appendChild(q);
                stackEl.appendChild(leafWrap);
            });
        }

        boardEl.appendChild(glassEl);
    }

    schedulePositionLeaves();
}


// -------------------------------------------------------------
// POUR LOGIC
// -------------------------------------------------------------

function handleGlassClick(index) {
    if (index >= activeLevel.glasses) return;

    const stack = glasses[index];

    if (selectedGlassIndex === null) {
        if (stack.length === 0) return;
        selectedGlassIndex = index;
        statusEl.textContent = "Pick a glass to pour into.";
        drawBoard();
        return;
    }

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

    const topFruit = fromStack[fromStack.length - 1];

    // count same top fruits
    let sameCount = 0;
    for (let i = fromStack.length - 1; i >= 0; i--) {
        if (fromStack[i] === topFruit) sameCount++;
        else break;
    }

    const space = GLASS_CAPACITY - toStack.length;

    if (space <= 0) {
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

    const movedCount = Math.min(sameCount, space);

    const prevTop = fromStack.length - 1;
    const moved = [];
    for (let i = 0; i < movedCount; i++)
        moved.push(fromStack.pop());

    for (let i = moved.length - 1; i >= 0; i--)
        toStack.push(moved[i]);

    moves++;
    movesEl.textContent = moves;

    selectedGlassIndex = null;

    // reveal covers if needed
    if (movedCount > 0 && coveredPositions[from]) {
        const cover = coveredPositions[from];

        if (cover.fullCover && cover.fullCover > 0) {
            cover.fullCover -= movedCount;
            if (cover.fullCover <= 0) {
                delete coveredPositions[from];
                initialCoveredPositions[from] = [];
            }
        }
        else if (cover.positions) {
            const newTop = glasses[from].length - 1;
            cover.positions = cover.positions.filter(p => !(p >= newTop && p <= prevTop));
            if (cover.positions.length === 0) {
                delete coveredPositions[from];
                initialCoveredPositions[from] = [];
            }
        }
    }

    drawBoard();
    checkWin();
}

boardEl.addEventListener("click", e => {
    const glass = e.target.closest(".fs-glass");
    if (!glass) return;
    handleGlassClick(Number(glass.dataset.index));
});

window.addEventListener("resize", () => schedulePositionLeaves());


// -------------------------------------------------------------
// DEKKEGENERERING
// -------------------------------------------------------------

function setupCovers(preset) {
    initialCoveredPositions = {};
    coveredPositions = {};

    const candidates = [];
    for (let i = 0; i < activeLevel.glasses; i++) {
        if (glasses[i].length > 1 && !isGlassComplete(glasses[i])) candidates.push(i);
    }

    shuffleInPlace(candidates);

    const coverCount = Math.min(preset.coveredGlasses, candidates.length);

    for (let k = 0; k < coverCount; k++) {
        const idx = candidates[k];
        const stackLen = glasses[idx].length;

        const doFull = Math.random() < 0.25;

        if (doFull) {
            const need = randInt(1, Math.min(stackLen, GLASS_CAPACITY));
            coveredPositions[idx] = { fullCover: need };
            initialCoveredPositions[idx] = [];
        }
        else {
            const depth = randInt(1, Math.max(1, stackLen - 1));
            const pos = [];
            for (let j = 0; j < depth; j++) pos.push(j);

            coveredPositions[idx] = { positions: [...pos] };
            initialCoveredPositions[idx] = [...pos];
        }
    }
}


// -------------------------------------------------------------
// START / NEW GAME
// -------------------------------------------------------------

function startNewGame(options = {}) {
    moves = 0;
    movesEl.textContent = 0;
    statusEl.textContent = "";

    const diff = options.difficulty || "medium";
    const preset = DIFFICULTY_PRESETS[diff];

    activeLevel = {
        glasses: preset.glasses,
        emptyGlasses: preset.emptyGlasses,
        coveredGlasses: preset.coveredGlasses,
        _presetName: diff
    };

    const mode = options.mode || "scramble";

    if (mode === "daily" && options.date) {
        glasses = generateLevel(activeLevel, "daily", options.date);
    } else {
        glasses = generateLevel(activeLevel, "scramble");
    }

    setupCovers(preset);

    selectedGlassIndex = null;
    startTime = Date.now();
    drawBoard();
}


// -------------------------------------------------------------
// SCRAMBLE MODE BUTTONS (Casual / Challenging / Brutal / Insane)
// -------------------------------------------------------------

const GENERATOR_MODES = {
    casual: { label: "Casual" },
    challenging: { label: "Challenging" },
    brutal: { label: "Brutal" },
    insane: { label: "Insane" }
};

function setGeneratorMode(mode) {
    if (!GENERATOR_MODES[mode]) return;

    generatorDifficulty = mode;

    const btns = document.querySelectorAll(".fs-gen-btn");
    btns.forEach(btn => {
        const act = btn.dataset.genMode === mode;
        btn.classList.toggle("fs-gen-btn-active", act);
        btn.style.fontWeight = act ? "700" : "400";
    });

    const diff = difficultySelect.value;
    startNewGame({ difficulty: diff, mode: "scramble" });

    statusEl.textContent = `New board – ${GENERATOR_MODES[mode].label} scramble.`;
}

function initGeneratorButtons() {
    const wrapper = document.querySelector(".fs-wrapper");
    const board = document.getElementById("fs-board");

    const bar = document.createElement("div");
    bar.className = "fs-genbar";
    bar.style.margin = "4px 0";
    bar.style.display = "flex";
    bar.style.gap = "6px";
    bar.style.fontSize = "0.9rem";

    const label = document.createElement("span");
    label.textContent = "Scramble:";
    label.style.opacity = 0.8;
    bar.appendChild(label);

    ["casual", "challenging", "brutal", "insane"].forEach(m => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fs-gen-btn";
        btn.dataset.genMode = m;
        btn.textContent = GENERATOR_MODES[m].label;
        btn.style.padding = "3px 10px";
        btn.style.border = "none";
        btn.style.borderRadius = "999px";
        btn.style.cursor = "pointer";
        btn.style.background = "#111827";
        btn.style.color = "#e5e7eb";
        btn.style.fontWeight = (m === generatorDifficulty ? "700" : "400");
        btn.addEventListener("click", () => setGeneratorMode(m));
        bar.appendChild(btn);
    });

    wrapper.insertBefore(bar, board);
}


// -------------------------------------------------------------
// WIN CHECK
// -------------------------------------------------------------

function checkWin() {
    const used = glasses.slice(0, activeLevel.glasses);

    const allGood = used.every(stack =>
        stack.length === 0 || isGlassComplete(stack)
    );

    if (!allGood) return;

    const now = Date.now();
    const elapsed = now - startTime;
    const diffName = activeLevel._presetName;
    const score = computeScore(moves, elapsed, 1.0);

    lastScore = score;

    coveredPositions = {};
    initialCoveredPositions = {};
    drawBoard();

    statusEl.textContent = `🎉 You solved the board! Score: ${score}`;
}


// -------------------------------------------------------------
// INIT GAME
// -------------------------------------------------------------

initGeneratorButtons();

const initialDiff = difficultySelect.value || "medium";
startNewGame({ difficulty: initialDiff, mode: "scramble" });

resetBtn.addEventListener("click", () => {
    const diff = difficultySelect.value || "medium";
    startNewGame({ difficulty: diff, mode: "scramble" });
});
