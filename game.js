// =======================
// Fruit Sort – game.js
// Arcade + Campaign, random men spillbart
// =======================

// ---- KONSTANTER ----

const MAX_GLASSES = 18;       // 6 i bredden * 3 rader (layout)
const GLASS_CAPACITY = 4;

// Standard brett (brukes ikke lenger direkte, men lar stå)
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
const difficultySelect = document.getElementById("fs-difficulty");
const fastHardCheckbox = document.getElementById("fs-fast-hard"); // ikke brukt i logikk nå

// ---- STATE ----

// Mode: "arcade" eller "campaign"
let currentMode = "arcade";

// Generator-modus styrer hvor "kaotisk" brettet er via antall frukttyper.
let generatorDifficulty = "brutal"; // "casual" | "challenging" | "brutal" | "insane"

// Arcade / campaign state
let glasses = [];          // Array av MAX_GLASSES glass, hvert glass = array med frukt (bunn -> topp)
let activeLevel = { ...DEFAULT_LEVEL_CONFIG };
let selectedGlassIndex = null;
let moves = 0;

// Dekke/blad-state
let initialCoveredPositions = {};  // index -> [absIndex ...] fra start
let coveredPositions = {};         // gjeldende dekke-data

// Score / daily / seed
let startTime = null;
let lastScore = 0;
let levelSeed = null;

// Campaign-state
let currentCampaignIndex = 0;
let campaignLevelLabelEl = null;
let campaignPrevBtn = null;
let campaignNextBtn = null;
let modeArcadeBtn = null;
let modeCampaignBtn = null;

// ---- HELPERFUNKSJONER ----

function shuffleInPlace(array, rng = Math.random) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function randInt(min, max, rng = Math.random) { // inclusive
    return Math.floor(rng() * (max - min + 1)) + min;
}

// Sjekk om et glass er "komplett" (4 like frukter)
function isGlassComplete(stack) {
    if (stack.length !== GLASS_CAPACITY) return false;
    return stack.every(f => f === stack[0]);
}

// Simple seeded RNG (Mulberry32)
function makeSeededRng(seed) {
    let t = seed >>> 0;
    return function () {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

// deterministic daily generator using date seed (YYYY-MM-DD -> int)
function dateSeedFromDate(d) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return ((y * 100 + m) * 100 + day) >>> 0;
}

// compute a simple score: høyere for færre trekk og kortere tid.
function computeScore(movesCount, elapsedMs, difficultyMultiplier = 1) {
    const elapsedSec = Math.max(1, Math.round(elapsedMs / 1000));
    const base = 1000 * difficultyMultiplier;
    const score = Math.max(0, Math.round(base - movesCount * 12 - elapsedSec * 3));
    return score;
}

// ---- ARCADE PRESETS (størrelse / tomme glass / blader) ----

const DIFFICULTY_PRESETS = {
    easy: { glasses: 6, emptyGlasses: 2, coveredGlasses: 1, scrambleMoves: 70, multiplier: 1.0, fullCoverProb: 0.10 },
    medium: { glasses: 8, emptyGlasses: 2, coveredGlasses: 2, scrambleMoves: 130, multiplier: 1.25, fullCoverProb: 0.22 },
    hard: { glasses: 10, emptyGlasses: 2, coveredGlasses: 3, scrambleMoves: 200, multiplier: 1.5, fullCoverProb: 0.30 }
};

// Generator-moduser (brukes til å velge hvor mange frukttyper i spillet)
const GENERATOR_MODES = {
    casual: { label: "Casual", offsetTypes: 3 },
    challenging: { label: "Challenging", offsetTypes: 2 },
    brutal: { label: "Brutal", offsetTypes: 1 },
    insane: { label: "Insane", offsetTypes: 0 }
};

// ---- CAMPAIGN LEVELS ----
// Nivåene øker gradvis i størrelse / frukttyper / blader

const CAMPAIGN_LEVELS = [
    { id: 1, name: "Fresh Start", glasses: 4, emptyGlasses: 1, fruitTypes: 3, coveredGlasses: 0, fullCoverProb: 0.0 },
    { id: 2, name: "First Mix", glasses: 5, emptyGlasses: 1, fruitTypes: 4, coveredGlasses: 0, fullCoverProb: 0.0 },
    { id: 3, name: "Crowded", glasses: 6, emptyGlasses: 1, fruitTypes: 5, coveredGlasses: 1, fullCoverProb: 0.10 },
    { id: 4, name: "Leaf Peek", glasses: 6, emptyGlasses: 2, fruitTypes: 5, coveredGlasses: 2, fullCoverProb: 0.18 },
    { id: 5, name: "Tight Space", glasses: 7, emptyGlasses: 1, fruitTypes: 6, coveredGlasses: 2, fullCoverProb: 0.20 },
    { id: 6, name: "Fruit Parade", glasses: 8, emptyGlasses: 2, fruitTypes: 6, coveredGlasses: 2, fullCoverProb: 0.22 },
    { id: 7, name: "Hidden Twins", glasses: 8, emptyGlasses: 2, fruitTypes: 7, coveredGlasses: 3, fullCoverProb: 0.24 },
    { id: 8, name: "Crowded Leaves", glasses: 9, emptyGlasses: 2, fruitTypes: 7, coveredGlasses: 3, fullCoverProb: 0.28 },
    { id: 9, name: "Juice Factory", glasses: 10, emptyGlasses: 2, fruitTypes: 8, coveredGlasses: 3, fullCoverProb: 0.30 },
    { id: 10, name: "Mango Storm", glasses: 11, emptyGlasses: 2, fruitTypes: 9, coveredGlasses: 3, fullCoverProb: 0.32 },
    { id: 11, name: "Busy Bar", glasses: 12, emptyGlasses: 2, fruitTypes: 10, coveredGlasses: 4, fullCoverProb: 0.34 },
    { id: 12, name: "Deep Orchard", glasses: 13, emptyGlasses: 2, fruitTypes: 11, coveredGlasses: 4, fullCoverProb: 0.36 },
    { id: 13, name: "Berry Jungle", glasses: 14, emptyGlasses: 2, fruitTypes: 12, coveredGlasses: 4, fullCoverProb: 0.36 },
    { id: 14, name: "Kiwi Chaos", glasses: 14, emptyGlasses: 2, fruitTypes: 13, coveredGlasses: 4, fullCoverProb: 0.38 },
    { id: 15, name: "Citrus Stack", glasses: 15, emptyGlasses: 2, fruitTypes: 13, coveredGlasses: 5, fullCoverProb: 0.38 },
    { id: 16, name: "Blueberry Nights", glasses: 16, emptyGlasses: 2, fruitTypes: 14, coveredGlasses: 5, fullCoverProb: 0.40 },
    { id: 17, name: "Fruit Labyrinth", glasses: 17, emptyGlasses: 2, fruitTypes: 14, coveredGlasses: 5, fullCoverProb: 0.40 },
    { id: 18, name: "Almost Full", glasses: 18, emptyGlasses: 2, fruitTypes: 15, coveredGlasses: 5, fullCoverProb: 0.42 },
    { id: 19, name: "Fruit Storm", glasses: 18, emptyGlasses: 1, fruitTypes: 15, coveredGlasses: 6, fullCoverProb: 0.45 },
    { id: 20, name: "Grand Finale", glasses: 18, emptyGlasses: 1, fruitTypes: 15, coveredGlasses: 8, fullCoverProb: 0.48 }
];

// ---- COVER RNG (for deterministic daily / campaign) ----

let coverRng = Math.random;

function setCoverRng(seed) {
    coverRng = (seed == null) ? Math.random : makeSeededRng(seed);
}

function coverRandInt(min, max) {
    return randInt(min, max, coverRng);
}

// ---- RENDERING / LEAVES ----

// Compute bottom percentage for a fruit at indexFromBottom (0 = bunn)
function computeLeafBottomPercent(indexFromBottom, stackLen = GLASS_CAPACITY) {
    const base = 10; // bottom anchor i CSS
    const height = 58; // prosent av høyden hvor fruktene ligger
    const slots = Math.max(1, stackLen - 1);
    const step = height / slots;
    return base + indexFromBottom * step;
}

// Plasser alle blad-wrappere over fruktene
function positionLeaves() {
    const wraps = document.querySelectorAll(".fs-leaf-wrap");
    wraps.forEach(w => {
        const glassIndex = Number(w.dataset.glass);
        const coveredIndex = Number(w.dataset.coveredIndex); // 0 = bunn
        const glassEl = document.querySelector(`.fs-glass[data-index="${glassIndex}"]`);
        if (!glassEl) return;
        const stackEl = glassEl.querySelector(".fs-fruit-stack");
        if (!stackEl) return;

        const fruitImgs = stackEl.querySelectorAll(".fs-fruit");
        const stack = glasses[glassIndex] || [];
        const domIndex = (stack.length - 1) - coveredIndex; // DOM[0]=topp

        let fruitEl = null;
        if (domIndex >= 0 && domIndex < fruitImgs.length) fruitEl = fruitImgs[domIndex];
        else if (fruitImgs.length > 0) fruitEl = fruitImgs[fruitImgs.length - 1];

        if (fruitEl && fruitEl.clientHeight > 0) {
            const leftPx = fruitEl.offsetLeft + fruitEl.offsetWidth / 2;
            const topPx = fruitEl.offsetTop + fruitEl.offsetHeight / 2;
            const LEAF_SCALE = 1.5;
            const VERTICAL_SHIFT = 0.14;
            const wSize = Math.round(fruitEl.offsetWidth * LEAF_SCALE);
            const hSize = Math.round(fruitEl.offsetHeight * LEAF_SCALE);
            const extraY = Math.round(fruitEl.offsetHeight * VERTICAL_SHIFT);

            w.style.width = `${wSize}px`;
            w.style.height = `${hSize}px`;
            w.style.left = `${leftPx}px`;
            w.style.top = `${topPx + extraY}px`;
            w.style.transform = `translate(-50%, -50%)`;
            w.style.bottom = "";
        } else {
            const bottomPct = computeLeafBottomPercent(coveredIndex, stack.length || 1);
            const lowered = Math.max(0, bottomPct - 3);
            w.style.left = `50%`;
            w.style.transform = `translateX(-50%)`;
            w.style.bottom = `${lowered}%`;
            w.style.width = `66%`;
            w.style.height = `66%`;
            w.style.top = "";
        }
    });
}

// Throttle positionLeaves kall
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

// Tegn hele brettet
function drawBoard() {
    boardEl.innerHTML = "";

    for (let i = 0; i < MAX_GLASSES; i++) {
        const glassEl = document.createElement("div");
        glassEl.className = "fs-glass";
        glassEl.dataset.index = i;
        glassEl.tabIndex = 0;

        if (i >= activeLevel.glasses) {
            glassEl.classList.add("fs-glass--unused");
        }

        if (i === selectedGlassIndex) {
            glassEl.classList.add("fs-glass--selected");
        }

        // Jar inner
        const jarInnerImg = document.createElement("img");
        jarInnerImg.className = "fs-jar-inner-img";
        jarInnerImg.src = "img/jar_inner.png";
        jarInnerImg.alt = "jar inner";
        jarInnerImg.draggable = false;
        jarInnerImg.addEventListener("load", schedulePositionLeaves);
        jarInnerImg.addEventListener("error", schedulePositionLeaves);
        glassEl.appendChild(jarInnerImg);

        const stackEl = document.createElement("div");
        stackEl.className = "fs-fruit-stack";

        const stack = glasses[i] || [];

        // Render frukter (array[0] = bunn)
        for (let s = stack.length - 1; s >= 0; s--) {
            const fruitName = stack[s];
            const img = document.createElement("img");
            img.className = "fs-fruit";
            img.src = `img/${fruitName}.png`;
            img.alt = fruitName;
            img.draggable = false;
            img.style.setProperty("--fruit-index", String(stack.length - 1 - s));
            img.addEventListener("load", schedulePositionLeaves);
            img.addEventListener("error", schedulePositionLeaves);
            stackEl.appendChild(img);
        }

        glassEl.appendChild(stackEl);

        // Render cover / blader
        const cover = coveredPositions[i];

        if (cover && cover.fullCover && cover.fullCover > 0 && i < activeLevel.glasses) {
            // full overlay
            const overlay = document.createElement("div");
            overlay.className = "fs-full-cover";
            overlay.setAttribute("aria-hidden", "true");
            overlay.dataset.glass = String(i);

            const q = document.createElement("span");
            q.className = "fs-full-cover-q";
            q.textContent = "?" + (cover.fullCover > 1 ? ` ${cover.fullCover}` : "");
            overlay.appendChild(q);

            stackEl.appendChild(overlay);
        } else {
            // delvis dekke
            const initialPositions = initialCoveredPositions[i] || [];
            const remainingPositions = (cover && Array.isArray(cover.positions)) ? cover.positions : [];

            if (
                initialPositions.length > 0 &&
                remainingPositions.length > 0 &&
                i < activeLevel.glasses &&
                stack.length > 0
            ) {
                remainingPositions
                    .slice()
                    .sort((a, b) => b - a)
                    .forEach(pos => {
                        if (pos < 0 || pos > stack.length - 1) return;

                        const leafWrap = document.createElement("div");
                        leafWrap.className = "fs-leaf-wrap";
                        leafWrap.setAttribute("aria-hidden", "true");
                        leafWrap.dataset.glass = String(i);
                        leafWrap.dataset.coveredIndex = String(pos);

                        const bottomPct = computeLeafBottomPercent(pos, stack.length);
                        leafWrap.style.left = "50%";
                        leafWrap.style.transform = "translateX(-50%)";
                        leafWrap.style.bottom = `${bottomPct}%`;
                        leafWrap.style.width = `66%`;
                        leafWrap.style.height = `66%`;

                        const leafImg = document.createElement("img");
                        leafImg.className = "fs-leaf-img";
                        leafImg.src = "img/leaf.png";
                        leafImg.alt = "leaf";
                        leafImg.draggable = false;
                        leafImg.style.width = "100%";
                        leafImg.style.height = "100%";
                        leafImg.style.display = "block";
                        leafImg.addEventListener("load", schedulePositionLeaves);
                        leafImg.addEventListener("error", schedulePositionLeaves);

                        const q = document.createElement("span");
                        q.className = "fs-leaf-q";
                        q.textContent = "?";

                        leafWrap.appendChild(leafImg);
                        leafWrap.appendChild(q);
                        stackEl.appendChild(leafWrap);
                    });
            }
        }

        boardEl.appendChild(glassEl);
    }

    schedulePositionLeaves();
}

// ---- NIVÅGENERERING (RANDOM, MEN MED MINST ETT TREKK) ----

// Sjekk om hele state er "trivielt løst" (alle fulle glass er komplette)
function isTriviallySolved(state, usedCount) {
    for (let i = 0; i < usedCount; i++) {
        const stack = state[i];
        if (stack.length === 0) continue;
        if (!isGlassComplete(stack)) return false;
    }
    return true;
}

// Finnes det minst ett lovlig trekk?
function hasAnyLegalMove(state, usedCount) {
    for (let from = 0; from < usedCount; from++) {
        const fs = state[from];
        if (!fs || fs.length === 0) continue;
        const topFruit = fs[fs.length - 1];

        for (let to = 0; to < usedCount; to++) {
            if (to === from) continue;
            const ts = state[to];
            if (!ts) continue;
            if (ts.length >= GLASS_CAPACITY) continue;
            if (ts.length === 0 || ts[ts.length - 1] === topFruit) {
                return true;
            }
        }
    }
    return false;
}

// Bygg ett tilfeldig brett med gitt config (uten garanti, brukes internt)
function buildRandomState(config, seed) {
    const rng = (seed == null) ? Math.random : makeSeededRng(seed);

    const numGlasses = config.glasses;
    const emptyGlasses = Math.max(0, Math.min(config.emptyGlasses || 0, numGlasses - 1));
    const nonEmpty = numGlasses - emptyGlasses;

    const maxFruitTypes = Math.min(FRUIT_POOL.length, nonEmpty);
    const fruitTypes = Math.max(3, Math.min(config.fruitTypes || maxFruitTypes, maxFruitTypes));

    // velg frukttyper
    const chosenFruits = shuffleInPlace([...FRUIT_POOL], rng).slice(0, fruitTypes);

    // lag flat liste med frukt (hver stabel får 4 frukter, fordelt på valgt spekter)
    const fruitsFlat = [];
    for (let i = 0; i < nonEmpty; i++) {
        const f = chosenFruits[i % chosenFruits.length];
        for (let k = 0; k < GLASS_CAPACITY; k++) {
            fruitsFlat.push(f);
        }
    }
    shuffleInPlace(fruitsFlat, rng);

    // fyll glass
    const state = [];
    let idx = 0;
    for (let g = 0; g < numGlasses; g++) {
        const stack = [];
        if (g < nonEmpty) {
            for (let k = 0; k < GLASS_CAPACITY; k++) {
                stack.push(fruitsFlat[idx++]);
            }
        }
        state.push(stack);
    }

    while (state.length < MAX_GLASSES) state.push([]);

    return state;
}

// Hovedgenerator – prøver flere ganger til vi får et brett med minst ett trekk & ikke trivielt løst
function generateSolvableLevel(config, _scrambleMovesIgnored = 0, seed = null) {
    const usedCount = config.glasses;
    const baseSeed = (seed == null) ? (Math.floor(Math.random() * 0xffffffff) >>> 0) : (seed >>> 0);
    const maxTries = 50;

    let lastState = null;

    for (let attempt = 0; attempt < maxTries; attempt++) {
        const s = buildRandomState(config, baseSeed + attempt * 9973);
        lastState = s;
        if (isTriviallySolved(s, usedCount)) continue;
        if (!hasAnyLegalMove(s, usedCount)) continue;
        return s;
    }

    // fallback – tar siste forsøk selv om det kanskje ikke er optimalt
    return lastState || buildRandomState(config, baseSeed + 12345);
}

// Daily-variant: bruker dato til seed
function generateDailyLevel(config, date = new Date(), scrambleMoves = 0) {
    const seed = dateSeedFromDate(date);
    levelSeed = seed;
    return generateSolvableLevel(config, scrambleMoves, seed);
}

// ---- INTERAKSJON / MOVES ----

function handleGlassClick(index) {
    if (index >= activeLevel.glasses) return;

    const stack = glasses[index];

    // Velge "fra"-glass
    if (selectedGlassIndex === null) {
        if (stack.length === 0) return;

        selectedGlassIndex = index;
        statusEl.textContent = "Pick a glass to pour into.";
        drawBoard();
        return;
    }

    // Klikk samme glass = avbryt
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

    // Teller hvor mange identiske på toppen av "from"
    let sameCount = 0;
    for (let i = fromStack.length - 1; i >= 0; i--) {
        if (fromStack[i] === topFruit) sameCount++;
        else break;
    }

    const available = GLASS_CAPACITY - toStack.length;

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

    // Flytt gruppe (spillregelen)
    const previousTop = fromStack.length - 1;
    const toMove = Math.min(sameCount, available);
    const movedFruits = [];
    for (let i = 0; i < toMove; i++) movedFruits.push(fromStack.pop());
    for (let i = movedFruits.length - 1; i >= 0; i--) toStack.push(movedFruits[i]);

    const removedCount = toMove;

    moves++;
    movesEl.textContent = moves.toString();
    statusEl.textContent = "";
    selectedGlassIndex = null;

    // Reveal-logikk for dekke på "from"
    if (removedCount > 0 && coveredPositions[from]) {
        const cover = coveredPositions[from];

        if (cover.fullCover && cover.fullCover > 0) {
            cover.fullCover -= removedCount;
            if (cover.fullCover <= 0) {
                delete coveredPositions[from];
                initialCoveredPositions[from] = [];
            } else {
                coveredPositions[from] = cover;
            }
        } else if (Array.isArray(cover.positions) && cover.positions.length > 0) {
            const newTop = glasses[from].length - 1;
            const remaining = cover.positions || [];
            const updated = remaining
                .filter(p => !(p >= newTop && p <= previousTop))
                .sort((a, b) => a - b);

            if (updated.length === 0) {
                delete coveredPositions[from];
                initialCoveredPositions[from] = [];
            } else {
                coveredPositions[from] = { positions: updated };
            }
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

// Re-posisjonér blader ved resize
window.addEventListener("resize", () => schedulePositionLeaves());

// ---- COVERS ----

function setupCovers(preset) {
    initialCoveredPositions = {};
    coveredPositions = {};

    const candidateIndices = [];
    for (let i = 0; i < activeLevel.glasses; i++) {
        if (glasses[i] && glasses[i].length > 1 && !isGlassComplete(glasses[i])) {
            candidateIndices.push(i);
        }
    }

    shuffleInPlace(candidateIndices, coverRng);

    const toCover = Math.min(activeLevel.coveredGlasses || 0, candidateIndices.length);

    for (let k = 0; k < toCover; k++) {
        const idx = candidateIndices[k];
        const stackLen = glasses[idx].length;
        if (stackLen <= 1) continue;

        const makeFullCover = coverRng() < (preset.fullCoverProb || 0.2);

        if (makeFullCover) {
            const required = coverRandInt(1, Math.min(stackLen, GLASS_CAPACITY));
            coveredPositions[idx] = { fullCover: required };
            initialCoveredPositions[idx] = [];
        } else {
            const maxDepth = Math.max(1, stackLen - 1);
            const depth = coverRandInt(1, maxDepth);
            const positions = [];

            // Dekker de nederste "depth" fruktene (0 = bunn)
            for (let j = 0; j < depth; j++) {
                positions.push(j);
            }

            initialCoveredPositions[idx] = positions.slice();
            coveredPositions[idx] = { positions: positions.slice() };
        }
    }
}

// ---- START / RESET / MODE ----

// Oppdater campaign-UI (level label + knapper)
function updateCampaignUI() {
    if (!campaignLevelLabelEl || !campaignPrevBtn || !campaignNextBtn) return;

    if (currentMode !== "campaign") {
        campaignLevelLabelEl.textContent = "";
        campaignPrevBtn.disabled = true;
        campaignNextBtn.disabled = true;
        return;
    }

    const total = CAMPAIGN_LEVELS.length;
    const idx = Math.max(0, Math.min(currentCampaignIndex, total - 1));
    const level = CAMPAIGN_LEVELS[idx];

    campaignLevelLabelEl.textContent = `Level ${level.id || (idx + 1)} / ${total}`;
    campaignPrevBtn.disabled = (idx === 0);
    campaignNextBtn.disabled = (idx >= total - 1);
}

// Start nytt spill
// options: { mode: "arcade"|"campaign"|"daily", difficulty?, campaignIndex?, date? }
function startNewGame(options = {}) {
    moves = 0;
    movesEl.textContent = "0";
    statusEl.textContent = "";

    let mode = options.mode || currentMode || "arcade";
    if (mode !== "arcade" && mode !== "campaign" && mode !== "daily") mode = "arcade";
    currentMode = mode;

    let presetForCovers = null;

    if (mode === "campaign") {
        const total = CAMPAIGN_LEVELS.length;
        let idx = (typeof options.campaignIndex === "number") ? options.campaignIndex : currentCampaignIndex;
        if (isNaN(idx)) idx = 0;
        idx = Math.max(0, Math.min(idx, total - 1));
        currentCampaignIndex = idx;

        const lvl = CAMPAIGN_LEVELS[idx];

        activeLevel = {
            glasses: lvl.glasses,
            emptyGlasses: lvl.emptyGlasses,
            coveredGlasses: lvl.coveredGlasses || 0,
            fruitTypes: lvl.fruitTypes,
            _presetName: lvl.name || `Level ${lvl.id || (idx + 1)}`
        };

        presetForCovers = {
            fullCoverProb: lvl.fullCoverProb ?? 0.25
        };

        levelSeed = lvl.id || (idx + 1);
        setCoverRng(levelSeed);
        glasses = generateSolvableLevel(activeLevel, 0, levelSeed);
    } else if (mode === "daily") {
        // enkel daily: bruk dagens dato + valgt difficulty
        const difficulty = options.difficulty || (difficultySelect ? difficultySelect.value : "medium");
        const base = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.medium;

        const nonEmpty = base.glasses - base.emptyGlasses;
        const modeCfg = GENERATOR_MODES[generatorDifficulty] || GENERATOR_MODES.brutal;
        const offset = modeCfg.offsetTypes ?? 1;
        const fruitTypes = Math.max(3, Math.min(nonEmpty, nonEmpty - offset));

        activeLevel = {
            glasses: base.glasses,
            emptyGlasses: base.emptyGlasses,
            coveredGlasses: base.coveredGlasses,
            fruitTypes,
            _presetName: `Daily ${difficulty}`
        };

        presetForCovers = base;
        const date = options.date || new Date();
        levelSeed = dateSeedFromDate(date);
        setCoverRng(levelSeed);
        glasses = generateDailyLevel(activeLevel, date, 0);
    } else {
        // ARCADE
        const difficulty = options.difficulty || (difficultySelect ? difficultySelect.value : "medium");
        const base = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.medium;

        const nonEmpty = base.glasses - base.emptyGlasses;
        const modeCfg = GENERATOR_MODES[generatorDifficulty] || GENERATOR_MODES.brutal;
        const offset = modeCfg.offsetTypes ?? 1;
        const fruitTypes = Math.max(3, Math.min(nonEmpty, nonEmpty - offset));

        activeLevel = {
            glasses: base.glasses,
            emptyGlasses: base.emptyGlasses,
            coveredGlasses: base.coveredGlasses,
            fruitTypes,
            _presetName: difficulty
        };

        presetForCovers = base;
        levelSeed = null;
        setCoverRng(null);
        glasses = generateSolvableLevel(activeLevel, base.scrambleMoves, null);
    }

    setupCovers(presetForCovers || { fullCoverProb: 0.0 });

    selectedGlassIndex = null;
    startTime = Date.now();
    drawBoard();
    updateCampaignUI();
}

// Bytt mellom Arcade / Campaign
function setGameMode(mode) {
    if (mode !== "arcade" && mode !== "campaign") mode = "arcade";
    currentMode = mode;

    if (modeArcadeBtn && modeCampaignBtn) {
        modeArcadeBtn.classList.toggle("fs-mode-btn-active", mode === "arcade");
        modeCampaignBtn.classList.toggle("fs-mode-btn-active", mode === "campaign");
        modeArcadeBtn.style.fontWeight = mode === "arcade" ? "700" : "400";
        modeCampaignBtn.style.fontWeight = mode === "campaign" ? "700" : "400";
    }

    if (mode === "campaign" && CAMPAIGN_LEVELS.length > 0) {
        startNewGame({ mode: "campaign", campaignIndex: currentCampaignIndex });
    } else {
        const diff = difficultySelect ? difficultySelect.value : "medium";
        startNewGame({ mode: "arcade", difficulty: diff });
    }
}

// GENERATOR-KNAPPER (Casual / Challenging / Brutal / Insane)

function setGeneratorMode(mode) {
    if (!GENERATOR_MODES[mode]) return;
    generatorDifficulty = mode;

    // Oppdater knappestil
    const buttons = document.querySelectorAll(".fs-gen-btn");
    buttons.forEach(btn => {
        const isActive = btn.dataset.genMode === mode;
        btn.classList.toggle("fs-gen-btn-active", isActive);
        btn.style.fontWeight = isActive ? "700" : "400";
    });

    const diff = difficultySelect ? difficultySelect.value : "medium";
    startNewGame({ mode: currentMode, difficulty: diff });

    statusEl.textContent = `New board – ${GENERATOR_MODES[mode].label} scramble.`;
}

// Sett opp UI-knapper for mode + scramble
function initGeneratorButtons() {
    const wrapper = document.querySelector(".fs-wrapper");
    if (!wrapper) return;

    const board = document.getElementById("fs-board");

    // --- MODE BAR (Arcade / Campaign + level) ---
    const modeBar = document.createElement("div");
    modeBar.className = "fs-modebar";
    modeBar.style.marginTop = "4px";
    modeBar.style.marginBottom = "4px";
    modeBar.style.fontSize = "0.9rem";
    modeBar.style.display = "flex";
    modeBar.style.alignItems = "center";
    modeBar.style.gap = "8px";

    const modeLabel = document.createElement("span");
    modeLabel.textContent = "Mode:";
    modeLabel.style.opacity = "0.8";
    modeBar.appendChild(modeLabel);

    modeArcadeBtn = document.createElement("button");
    modeArcadeBtn.type = "button";
    modeArcadeBtn.textContent = "Arcade";
    modeArcadeBtn.className = "fs-mode-btn";
    modeArcadeBtn.style.padding = "3px 10px";
    modeArcadeBtn.style.borderRadius = "999px";
    modeArcadeBtn.style.border = "none";
    modeArcadeBtn.style.cursor = "pointer";
    modeArcadeBtn.style.fontSize = "0.85rem";
    modeArcadeBtn.style.background = "#111827";
    modeArcadeBtn.style.color = "#e5e7eb";

    modeCampaignBtn = document.createElement("button");
    modeCampaignBtn.type = "button";
    modeCampaignBtn.textContent = "Campaign";
    modeCampaignBtn.className = "fs-mode-btn";
    modeCampaignBtn.style.padding = "3px 10px";
    modeCampaignBtn.style.borderRadius = "999px";
    modeCampaignBtn.style.border = "none";
    modeCampaignBtn.style.cursor = "pointer";
    modeCampaignBtn.style.fontSize = "0.85rem";
    modeCampaignBtn.style.background = "#111827";
    modeCampaignBtn.style.color = "#e5e7eb";

    modeBar.appendChild(modeArcadeBtn);
    modeBar.appendChild(modeCampaignBtn);

    const sep = document.createElement("span");
    sep.textContent = "·";
    sep.style.opacity = "0.6";
    modeBar.appendChild(sep);

    campaignPrevBtn = document.createElement("button");
    campaignPrevBtn.type = "button";
    campaignPrevBtn.textContent = "◀";
    campaignPrevBtn.style.padding = "2px 8px";
    campaignPrevBtn.style.borderRadius = "999px";
    campaignPrevBtn.style.border = "none";
    campaignPrevBtn.style.cursor = "pointer";
    campaignPrevBtn.style.fontSize = "0.8rem";
    campaignPrevBtn.style.background = "#111827";
    campaignPrevBtn.style.color = "#e5e7eb";

    campaignLevelLabelEl = document.createElement("span");
    campaignLevelLabelEl.style.minWidth = "120px";
    campaignLevelLabelEl.style.textAlign = "center";
    campaignLevelLabelEl.style.opacity = "0.9";

    campaignNextBtn = document.createElement("button");
    campaignNextBtn.type = "button";
    campaignNextBtn.textContent = "▶";
    campaignNextBtn.style.padding = "2px 8px";
    campaignNextBtn.style.borderRadius = "999px";
    campaignNextBtn.style.border = "none";
    campaignNextBtn.style.cursor = "pointer";
    campaignNextBtn.style.fontSize = "0.8rem";
    campaignNextBtn.style.background = "#111827";
    campaignNextBtn.style.color = "#e5e7eb";

    modeBar.appendChild(campaignPrevBtn);
    modeBar.appendChild(campaignLevelLabelEl);
    modeBar.appendChild(campaignNextBtn);

    wrapper.insertBefore(modeBar, board);

    // Mode-buttons handlers
    modeArcadeBtn.addEventListener("click", () => setGameMode("arcade"));
    modeCampaignBtn.addEventListener("click", () => setGameMode("campaign"));

    campaignPrevBtn.addEventListener("click", () => {
        if (currentCampaignIndex > 0) {
            currentCampaignIndex--;
            startNewGame({ mode: "campaign", campaignIndex: currentCampaignIndex });
        }
    });
    campaignNextBtn.addEventListener("click", () => {
        if (currentCampaignIndex < CAMPAIGN_LEVELS.length - 1) {
            currentCampaignIndex++;
            startNewGame({ mode: "campaign", campaignIndex: currentCampaignIndex });
        }
    });

    // --- SCRAMBLE BAR (Casual / Challenging / Brutal / Insane) ---
    const bar = document.createElement("div");
    bar.className = "fs-genbar";
    bar.style.marginTop = "2px";
    bar.style.marginBottom = "6px";
    bar.style.fontSize = "0.9rem";
    bar.style.display = "flex";
    bar.style.alignItems = "center";
    bar.style.gap = "6px";

    const label = document.createElement("span");
    label.textContent = "Scramble:";
    label.style.opacity = "0.8";
    bar.appendChild(label);

    ["casual", "challenging", "brutal", "insane"].forEach(mode => {
        const cfg = GENERATOR_MODES[mode];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = cfg.label;
        btn.dataset.genMode = mode;
        btn.className = "fs-gen-btn";
        btn.style.padding = "3px 10px";
        btn.style.borderRadius = "999px";
        btn.style.border = "none";
        btn.style.cursor = "pointer";
        btn.style.fontSize = "0.85rem";
        btn.style.background = "#111827";
        btn.style.color = "#e5e7eb";

        if (mode === generatorDifficulty) {
            btn.classList.add("fs-gen-btn-active");
            btn.style.fontWeight = "700";
        } else {
            btn.style.fontWeight = "400";
        }

        btn.addEventListener("click", () => setGeneratorMode(mode));
        bar.appendChild(btn);
    });

    wrapper.insertBefore(bar, board);

    // sett initial mode-knapp
    setGameMode(currentMode);
}

// Reset-knappen
resetBtn.addEventListener("click", () => {
    if (currentMode === "campaign") {
        startNewGame({ mode: "campaign", campaignIndex: currentCampaignIndex });
    } else {
        const diff = difficultySelect ? difficultySelect.value : "medium";
        startNewGame({ mode: "arcade", difficulty: diff });
    }
});

// ---- INIT ----

// Sett opp mode + generator-knapper
initGeneratorButtons();

// initial start – bruk UI-valg
const initialDiff = difficultySelect ? difficultySelect.value : "medium";
startNewGame({ mode: "arcade", difficulty: initialDiff });

// ---- WIN CHECK & SCORING ----

function checkWin() {
    const usedGlasses = glasses.slice(0, activeLevel.glasses);

    const allOk = usedGlasses.every(stack =>
        stack.length === 0 || isGlassComplete(stack)
    );

    if (allOk) {
        const endTime = Date.now();
        const elapsed = startTime ? (endTime - startTime) : 0;
        const diffName = activeLevel._presetName || "easy";

        const diffPreset = DIFFICULTY_PRESETS[diffName];
        const multiplier = diffPreset ? diffPreset.multiplier : 1.0;

        const score = computeScore(moves, elapsed, multiplier);
        lastScore = score;

        coveredPositions = {};
        initialCoveredPositions = {};
        drawBoard();

        statusEl.textContent = `🎉 You solved the board! Score: ${score}`;

        const payload = {
            score,
            moves,
            timeMs: elapsed,
            difficulty: diffName,
            seed: levelSeed || null,
            mode: currentMode,
            levelIndex: currentCampaignIndex,
            date: new Date().toISOString().slice(0, 10)
        };
        console.log("submitGlobalScore", payload);
        if (levelSeed && currentMode !== "arcade") {
            console.log("submitDailyScore", payload);
        }
    }
}
