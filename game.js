// =======================
// Fruit Sort – game.js
// Stabil, enkel, løsbart & blandet
// =======================

// ---- KONSTANTER ----

const MAX_GLASSES = 18;       // 6 i bredden * 3 rader
const GLASSES_PER_ROW = 6;
const GLASS_CAPACITY = 4;

// Standard brett: 6 glass (4 fylt, 2 tomme)
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
const fastHardCheckbox = document.getElementById("fs-fast-hard"); // brukes ikke i logikk nå, men kan brukes i UI

// ---- STATE ----

// Generator-modus styrer hvor hardt vi scrambler fra en løst tilstand.
// Verdier: "casual" | "challenging" | "brutal" | "insane"
let generatorDifficulty = "brutal";

let glasses = [];          // Array av MAX_GLASSES glass, hvert glass = array med frukt (bunn -> topp)
let activeLevel = { ...DEFAULT_LEVEL_CONFIG };
let selectedGlassIndex = null;
let moves = 0;

// initialCoveredPositions: index -> array av absolute indices (index-from-bottom) som var dekket ved start
let initialCoveredPositions = {};

// coveredPositions: mutable remaining covered data for hvert glass.
// Enten { positions: [absIndex,...] } (delvis dekke) eller { fullCover: N } (fullt dekket)
let coveredPositions = {};

// Score / daily
let startTime = null;
let lastScore = 0;
let levelSeed = null; // lagrer seed for daily / reproduserbare brett

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

// ---- DIFFICULTY / PRESETS ----

const DIFFICULTY_PRESETS = {
    easy: { glasses: 6, emptyGlasses: 2, coveredGlasses: 1, scrambleMoves: 70, multiplier: 1.0, fullCoverProb: 0.10 },
    medium: { glasses: 8, emptyGlasses: 1, coveredGlasses: 2, scrambleMoves: 130, multiplier: 1.25, fullCoverProb: 0.25 },
    hard: { glasses: 10, emptyGlasses: 1, coveredGlasses: 3, scrambleMoves: 200, multiplier: 1.5, fullCoverProb: 0.35 }
};

// Generator-moduser (kun hvor hardt vi scrambler – ikke hvor stort brettet er)
const GENERATOR_MODES = {
    casual: {
        label: "Casual",
        factor: 0.6    // litt under preset.scrambleMoves
    },
    challenging: {
        label: "Challenging",
        factor: 1.0    // rundt preset.scrambleMoves
    },
    brutal: {
        label: "Brutal",
        factor: 1.8    // betydelig mer blandet
    },
    insane: {
        label: "Insane",
        factor: 2.6    // veldig blandet (men fortsatt rask, ingen solver)
    }
};

// ---- COVER RNG (for deterministic daily) ----

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

// ---- NIVÅGENERERING (ENKEL, STABIL) ----

// Bygg helt løst nivå: hver frukt sin egen stabel
function buildSolvedState(config, rng) {
    const { glasses: numGlasses, emptyGlasses } = config;
    const nonEmpty = numGlasses - emptyGlasses;

    const pool = shuffleInPlace([...FRUIT_POOL], rng).slice(0, nonEmpty);

    const state = pool.map(f => Array.from({ length: GLASS_CAPACITY }, () => f));
    for (let i = 0; i < emptyGlasses; i++) state.push([]);

    while (state.length < numGlasses) state.push([]);
    while (state.length < MAX_GLASSES) state.push([]);

    return state;
}

// Reverse-scramble med ENKELT-frukt flytt
// Dette gir alltid et løsbart brett, men mye mer blandet enn "flytt hele stabelen".
function scrambleStateSingleFruit(state, movesTarget, rng) {
    const usedCount = activeLevel ? activeLevel.glasses : state.length;
    const maxAttempts = movesTarget * 10;

    let movesDone = 0;
    let attempts = 0;

    while (movesDone < movesTarget && attempts < maxAttempts) {
        attempts++;

        const fromCandidates = [];
        for (let i = 0; i < usedCount; i++) {
            if (state[i].length > 0) fromCandidates.push(i);
        }
        if (!fromCandidates.length) break;

        const from = fromCandidates[randInt(0, fromCandidates.length - 1, rng)];
        const fromStack = state[from];
        const fruit = fromStack[fromStack.length - 1];

        const toCandidates = [];
        for (let j = 0; j < usedCount; j++) {
            if (j === from) continue;
            const tstack = state[j];
            if (tstack.length >= GLASS_CAPACITY) continue;
            if (tstack.length === 0 || tstack[tstack.length - 1] === fruit) {
                toCandidates.push(j);
            }
        }
        if (!toCandidates.length) continue;

        const to = toCandidates[randInt(0, toCandidates.length - 1, rng)];

        // flytt én frukt
        state[to].push(fromStack.pop());
        movesDone++;
    }

    return state;
}

// Hovedgenerator – bruker generatorDifficulty til å bestemme hvor mange scramble-moves
function generateSolvableLevel(config, scrambleMoves = 100, seed = null) {
    const rng = seed == null ? Math.random : makeSeededRng(seed);
    let state = buildSolvedState(config, rng);

    const modeCfg = GENERATOR_MODES[generatorDifficulty] || GENERATOR_MODES.brutal;
    const rawMoves = Math.round(scrambleMoves * modeCfg.factor);
    const movesTarget = Math.max(10, rawMoves);

    scrambleStateSingleFruit(state, movesTarget, rng);

    return state;
}

// Daily-variant: bruker dato til seed
function generateDailyLevel(config, date = new Date(), scrambleMoves = 120) {
    const seed = dateSeedFromDate(date);
    levelSeed = seed;
    return generateSolvableLevel(config, scrambleMoves, seed);
}

// ---- INTERAKSJON ----

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

// ---- START / RESET ----

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

// Start nytt spill
// options: { difficulty: "easy"|"medium"|"hard", mode: "scramble"|"daily", date?: Date }
function startNewGame(options = {}) {
    moves = 0;
    movesEl.textContent = "0";
    statusEl.textContent = "";

    const difficulty = options.difficulty || "medium";
    const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.medium;

    activeLevel = {
        glasses: preset.glasses,
        emptyGlasses: preset.emptyGlasses,
        coveredGlasses: preset.coveredGlasses,
        _presetName: difficulty
    };

    const mode = options.mode || "scramble";

    if (mode === "daily" && options.date) {
        levelSeed = dateSeedFromDate(options.date);
        setCoverRng(levelSeed);
        glasses = generateDailyLevel(activeLevel, options.date, preset.scrambleMoves);
    } else {
        levelSeed = null;
        setCoverRng(null);
        glasses = generateSolvableLevel(activeLevel, preset.scrambleMoves);
    }

    setupCovers(preset);

    selectedGlassIndex = null;
    startTime = Date.now();
    drawBoard();
}

// ---- GENERATOR-KNAPPER (Casual / Challenging / Brutal / Insane) ----

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

    // Start nytt brett med valgt brett-vanskelighet (dropdown)
    const diff = difficultySelect ? difficultySelect.value : "medium";
    startNewGame({ difficulty: diff, mode: "scramble" });

    statusEl.textContent = `New board – ${GENERATOR_MODES[mode].label} scramble.`;
}

function initGeneratorButtons() {
    const wrapper = document.querySelector(".fs-wrapper");
    if (!wrapper) return;

    const board = document.getElementById("fs-board");

    const bar = document.createElement("div");
    bar.className = "fs-genbar";
    bar.style.marginTop = "4px";
    bar.style.marginBottom = "4px";
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

    // Legg den mellom topptekst og board
    wrapper.insertBefore(bar, board);
}

// Knytt reset-knapp til UI-valg
resetBtn.addEventListener("click", () => {
    const diff = difficultySelect ? difficultySelect.value : "medium";
    startNewGame({ difficulty: diff, mode: "scramble" });
});

// ---- INIT ----

// Sett opp generator-knapper
initGeneratorButtons();

// initial start – bruk UI-valg hvis finnes
const initialDiff = difficultySelect ? difficultySelect.value : "medium";
startNewGame({ difficulty: initialDiff, mode: "scramble" });

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
        const diff = DIFFICULTY_PRESETS[diffName] || { multiplier: 1.0 };
        const score = computeScore(moves, elapsed, diff.multiplier);
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
            date: new Date().toISOString().slice(0, 10)
        };
        // Hooks for backend:
        console.log("submitGlobalScore", payload);
        if (levelSeed) console.log("submitDailyScore", payload);
    }
}
