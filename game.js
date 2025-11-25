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

let glasses = [];          // Array av MAX_GLASSES glass, hvert glass = array med frukt (bunn -> topp)
let activeLevel = { ...DEFAULT_LEVEL_CONFIG };
let selectedGlassIndex = null;
let moves = 0;

// initialCoveredPositions: index -> array of absolute indices (index-from-bottom) that were covered at game start.
// Example: initialCoveredPositions[2] = [1,2] means at start jar 2 had leaves covering the fruits at bottom-index 1 and 2.
let initialCoveredPositions = {};

// coveredPositions: mutable remaining covered data for each glass.
// Each entry is either { positions: [absIndex,...] } (partial leaves) or { fullCover: N } (whole-glass cover).
let coveredPositions = {};

// ---- HELPERS ----

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

// ---- DIFFICULTY, SCORING, DAILY ----

const DIFFICULTY_PRESETS = {
    easy: { glasses: 6, emptyGlasses: 2, coveredGlasses: 2, scrambleMoves: 60, multiplier: 1.0, fullCoverProb: 0.10 },
    medium: { glasses: 8, emptyGlasses: 2, coveredGlasses: 3, scrambleMoves: 90, multiplier: 1.25, fullCoverProb: 0.25 },
    hard: { glasses: 10, emptyGlasses: 2, coveredGlasses: 4, scrambleMoves: 140, multiplier: 1.5, fullCoverProb: 0.35 }
};

let startTime = null;
let lastScore = 0;
let levelSeed = null; // store seed for daily/hashable boards

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

// generate level by reverse-scrambling from a solved board (guaranteed solvable)
function generateSolvableLevel(config, scrambleMoves = 100, seed = null) {
    const { glasses: numGlasses, emptyGlasses } = config;
    const nonEmpty = numGlasses - emptyGlasses;

    // choose fruit types deterministically when seed is provided
    const pool = [...FRUIT_POOL];

    // deterministic shuffle using seeded RNG when seed provided
    const rng = seed == null ? Math.random : makeSeededRng(seed);
    if (seed != null) {
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
    } else {
        shuffle(pool);
    }
    const chosen = pool.slice(0, nonEmpty);

    // helper that builds the initial solved state
    const buildSolvedState = () => {
        const state = chosen.map(f => Array.from({ length: GLASS_CAPACITY }, () => f));
        for (let i = 0; i < emptyGlasses; i++) state.push([]);
        // pad to requested number of glasses (numGlasses) - rest of MAX_GLASSES added later
        while (state.length < numGlasses) state.push([]);
        return state;
    };

    const isValidPour = (from, to, st) => {
        if (from === to) return false;
        if (st[from].length === 0) return false;
        if (st[to].length >= GLASS_CAPACITY) return false;
        if (st[to].length === 0) return true;
        return st[to][st[to].length - 1] === st[from][st[from].length - 1];
    };

    const performScramble = (state) => {
        let attempts = 0;
        let moves = 0;
        const maxAttempts = Math.max(100, scrambleMoves * 12);
        const total = state.length;

        while (moves < scrambleMoves && attempts < maxAttempts) {
            attempts++;
            const from = Math.floor(rng() * total);
            const to = Math.floor(rng() * total);
            if (!isValidPour(from, to, state)) continue;

            const topFruit = state[from][state[from].length - 1];
            let sameCount = 0;
            for (let i = state[from].length - 1; i >= 0; i--) {
                if (state[from][i] === topFruit) sameCount++; else break;
            }
            const available = GLASS_CAPACITY - state[to].length;
            const toMove = Math.min(sameCount, available);
            const moved = [];
            for (let i = 0; i < toMove; i++) moved.push(state[from].pop());
            for (let i = moved.length - 1; i >= 0; i--) state[to].push(moved[i]);

            moves++;
        }

        // If we barely moved anything, force a few simple pours to break solved state.
        if (moves < Math.max(1, Math.floor(scrambleMoves / 6))) {
            let forced = 0;
            const total = state.length;
            for (let i = 0; i < total && forced < 6; i++) {
                for (let j = 0; j < total && forced < 6; j++) {
                    if (isValidPour(i, j, state)) {
                        const topFruit = state[i][state[i].length - 1];
                        let sameCount = 0;
                        for (let k = state[i].length - 1; k >= 0; k--) {
                            if (state[i][k] === topFruit) sameCount++; else break;
                        }
                        const available = GLASS_CAPACITY - state[j].length;
                        const toMove = Math.min(1, Math.min(sameCount, available));
                        if (toMove > 0) {
                            const moved = [];
                            for (let m = 0; m < toMove; m++) moved.push(state[i].pop());
                            for (let m = moved.length - 1; m >= 0; m--) state[j].push(moved[m]);
                            forced++;
                        }
                    }
                }
            }
        }

        return state;
    };

    // retry scramble attempts if result is still "solved"
    const maxRetries = 6;
    let finalState = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const state = buildSolvedState();
        performScramble(state);

        // check if unsolved
        const used = state.slice(0, numGlasses);
        const allOk = used.every(stack => stack.length === 0 || isGlassComplete(stack));
        if (!allOk) {
            finalState = state;
            break;
        }

        // if seed provided, advance RNG deterministically for next attempt
        if (seed != null) {
            // consume a few random values to vary next attempt deterministically
            for (let k = 0; k < (attempt + 1) * 7; k++) rng();
        }
    }

    // fallback: if still null, build one last time and force a small swap so it's not solved
    if (!finalState) {
        finalState = buildSolvedState();
        // force move: find first valid pour and do one unit
        const total = finalState.length;
        outer:
        for (let i = 0; i < total; i++) {
            for (let j = 0; j < total; j++) {
                if (isValidPour(i, j, finalState)) {
                    const f = finalState[i].pop();
                    finalState[j].push(f);
                    break outer;
                }
            }
        }
    }

    // pad to MAX_GLASSES with unused empties
    while (finalState.length < MAX_GLASSES) finalState.push([]);

    return finalState;
}

// deterministic daily generator using date seed (YYYY-MM-DD -> int)
function dateSeedFromDate(d) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return ((y * 100 + m) * 100 + day) >>> 0;
}

function generateDailyLevel(config, date = new Date(), scrambleMoves = 120) {
    const seed = dateSeedFromDate(date);
    levelSeed = seed;
    return generateSolvableLevel(config, scrambleMoves, seed);
}

// compute a simple score: higher for fewer moves and shorter time.
function computeScore(movesCount, elapsedMs, difficultyMultiplier = 1) {
    const elapsedSec = Math.max(1, Math.round(elapsedMs / 1000));
    const base = 1000 * difficultyMultiplier;
    const score = Math.max(0, Math.round(base - movesCount * 12 - elapsedSec * 3));
    return score;
}

// stubs for submitting scores — replace endpoints with your eqsy.io API
async function submitGlobalScore(payload) {
    try {
        // await fetch("https://api.eqsy.io/fruit-sort/highscore", { method: "POST", body: JSON.stringify(payload) });
        console.log("submitGlobalScore", payload);
    } catch (e) {
        console.warn("submitGlobalScore failed", e);
    }
}

async function submitDailyScore(payload) {
    try {
        // await fetch("https://api.eqsy.io/fruit-sort/daily", { method: "POST", body: JSON.stringify(payload) });
        console.log("submitDailyScore", payload);
    } catch (e) {
        console.warn("submitDailyScore failed", e);
    }
}

// ---- RENDERING / LEAVES ----

// Compute bottom percentage for a fruit at indexFromBottom (0 = bottom) so leaf sits exactly over that fruit.
function computeLeafBottomPercent(indexFromBottom) {
    const base = 10; // bottom anchor in CSS
    const height = 58; // stack height percent in CSS
    const slots = Math.max(1, GLASS_CAPACITY - 1); // for 4 capacity, distribute across 3 intervals
    const step = height / slots;
    return base + indexFromBottom * step;
}

// Position all leaf wrappers to match their fruit elements.
function positionLeaves() {
    const wraps = document.querySelectorAll(".fs-leaf-wrap");
    wraps.forEach(w => {
        const glassIndex = Number(w.dataset.glass);
        const coveredIndex = Number(w.dataset.coveredIndex); // absolute index-from-bottom
        const glassEl = document.querySelector(`.fs-glass[data-index="${glassIndex}"]`);
        if (!glassEl) return;
        const stackEl = glassEl.querySelector(".fs-fruit-stack");
        if (!stackEl) return;

        const fruitImgs = stackEl.querySelectorAll(".fs-fruit");
        const stack = glasses[glassIndex] || [];
        // Map coveredIndex (0=bottom) to DOM index: DOM[0]=top ... DOM[n-1]=bottom
        const domIndex = (stack.length - 1) - coveredIndex;
        // prefer exact fruitEl; if missing, fall back to bottom fruit, then top fruit, then null
        let fruitEl = null;
        if (domIndex >= 0 && domIndex < fruitImgs.length) fruitEl = fruitImgs[domIndex];
        else if (fruitImgs.length > 0) fruitEl = fruitImgs[fruitImgs.length - 1]; // bottom fruit

        // position using measured fruit if possible
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
            // fallback percent placement (when measurements not available)
            // compute percent relative to stack layout
            const bottomPct = computeLeafBottomPercent(coveredIndex);
            // keep leaf slightly lower for better coverage
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

// Render the board including leaves and full covers
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
        jarInnerImg.addEventListener('load', schedulePositionLeaves);
        jarInnerImg.addEventListener('error', schedulePositionLeaves);
        glassEl.appendChild(jarInnerImg);

        const stackEl = document.createElement("div");
        stackEl.className = "fs-fruit-stack";

        const stack = glasses[i] || [];

        // Render fruits (top of array = top of jar)
        for (let s = stack.length - 1; s >= 0; s--) {
            const fruitName = stack[s];
            const img = document.createElement("img");
            img.className = "fs-fruit";
            img.src = `img/${fruitName}.png`;
            img.alt = fruitName;
            img.draggable = false;
            img.style.setProperty('--fruit-index', String(stack.length - 1 - s));
            img.addEventListener('load', schedulePositionLeaves);
            img.addEventListener('error', schedulePositionLeaves);
            stackEl.appendChild(img);
        }

        glassEl.appendChild(stackEl);

        // Render covers:
        const cover = coveredPositions[i];

        // Full cover overlay: render a single overlay that hides the whole glass
        if (cover && cover.fullCover && cover.fullCover > 0 && i < activeLevel.glasses) {
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
            // Partial leaves
            const initialPositions = initialCoveredPositions[i] || [];
            const remainingPositions = (cover && Array.isArray(cover.positions)) ? cover.positions : [];

            if (initialPositions.length > 0 && remainingPositions.length > 0 && i < activeLevel.glasses && stack.length > 0) {
                remainingPositions.slice().sort((a, b) => b - a).forEach(pos => {
                    if (pos < 0 || pos > stack.length - 1) return;

                    const leafWrap = document.createElement("div");
                    leafWrap.className = "fs-leaf-wrap";
                    leafWrap.setAttribute("aria-hidden", "true");
                    leafWrap.dataset.glass = String(i);
                    leafWrap.dataset.coveredIndex = String(pos);

                    const bottomPct = computeLeafBottomPercent(pos);
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
                    leafImg.addEventListener('load', schedulePositionLeaves);
                    leafImg.addEventListener('error', schedulePositionLeaves);

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

    // schedule a positioning pass once DOM nodes are in place
    schedulePositionLeaves();
}

// Throttle scheduling for positionLeaves so we don't run it excessively while images load.
const schedulePositionLeaves = (() => {
    let scheduled = false;
    return () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            positionLeaves();
            scheduled = false;
        }));
    };
})();

// ---- INTERACTION ----

function handleGlassClick(index = 0) {
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
    const previousTop = fromStack.length - 1;
    const toMove = Math.min(sameCount, available);
    const movedFruits = [];
    for (let i = 0; i < toMove; i++) {
        movedFruits.push(fromStack.pop());
    }
    for (let i = movedFruits.length - 1; i >= 0; i--) {
        toStack.push(movedFruits[i]);
    }

    const removedCount = toMove;

    moves++;
    movesEl.textContent = moves.toString();
    statusEl.textContent = "";
    selectedGlassIndex = null;

    // Reveal logic for covers on the source jar:
    if (removedCount > 0 && coveredPositions[from]) {
        const cover = coveredPositions[from];

        // Handle fullCover: decrement required reveals by removedCount
        if (cover.fullCover && cover.fullCover > 0) {
            cover.fullCover -= removedCount;
            if (cover.fullCover <= 0) {
                delete coveredPositions[from];
                initialCoveredPositions[from] = [];
            } else {
                coveredPositions[from] = cover;
            }
        } else if (Array.isArray(cover.positions) && cover.positions.length > 0) {
            // Partial leaf reveal: only remove covered indices that became visible during this move.
            const newTop = glasses[from].length - 1;
            const remaining = cover.positions || [];
            const updated = remaining.filter(p => !(p >= newTop && p <= previousTop)).sort((a, b) => a - b);

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

// reposition leaves on resize
window.addEventListener("resize", () => schedulePositionLeaves());

// ---- START / RESET ----

// Replace default start behavior with enhanced generator. Call with options:
// startNewGame({ difficulty: "easy"|"medium"|"hard", mode: "scramble"|"random"|"daily", date: Date })
function startNewGame(options = {}) {
    moves = 0;
    movesEl.textContent = "0";
    statusEl.textContent = "";

    const difficulty = options.difficulty || "easy";
    const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.easy;
    activeLevel = {
        glasses: preset.glasses,
        emptyGlasses: preset.emptyGlasses,
        coveredGlasses: preset.coveredGlasses,
        _presetName: difficulty
    };

    const mode = options.mode || "scramble";

    if (mode === "daily" && options.date) {
        glasses = generateDailyLevel(activeLevel, options.date, preset.scrambleMoves);
        levelSeed = dateSeedFromDate(options.date);
    } else if (mode === "scramble") {
        glasses = generateSolvableLevel(activeLevel, preset.scrambleMoves);
        levelSeed = null;
    } else {
        glasses = generateLevel(activeLevel);
        levelSeed = null;
    }

    // reset covers using preset probability for fullCover
    initialCoveredPositions = {};
    coveredPositions = {};
    const candidateIndices = [];
    for (let i = 0; i < activeLevel.glasses; i++) {
        if (glasses[i] && glasses[i].length > 0) candidateIndices.push(i);
    }
    shuffle(candidateIndices);

    const toCover = Math.min(activeLevel.coveredGlasses || 0, candidateIndices.length);
    for (let k = 0; k < toCover; k++) {
        const idx = candidateIndices[k];
        const stackLen = glasses[idx].length;
        if (stackLen <= 1) continue;

        const makeFullCover = Math.random() < (preset.fullCoverProb || 0.2);

        if (makeFullCover) {
            const required = randInt(1, Math.max(1, Math.min(stackLen, GLASS_CAPACITY)));
            coveredPositions[idx] = { fullCover: required };
            initialCoveredPositions[idx] = [];
        } else {
            const maxDepth = Math.min(stackLen - 1, GLASS_CAPACITY - 1);
            const depth = randInt(1, maxDepth);
            const topIndex = stackLen - 1;
            const positions = [];
            for (let j = 1; j <= depth; j++) {
                const absIndex = topIndex - j; // absolute index-from-bottom
                // allow covering the bottom slot (absIndex >= 0)
                if (absIndex >= 0) positions.push(absIndex);
            }
            if (positions.length > 0) {
                initialCoveredPositions[idx] = positions.slice();
                coveredPositions[idx] = { positions: positions.slice() };
            }
        }
    }

    selectedGlassIndex = null;
    startTime = Date.now();
    drawBoard();
}

// Wire reset button and initial start
resetBtn.addEventListener("click", () => startNewGame({ difficulty: "medium", mode: "scramble" }));

// Init default
startNewGame({ difficulty: "medium", mode: "scramble" });

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

        // Clear any remaining covers so the final board doesn't show stray question-marks.
        // This fixes the case where jars become "complete" by receiving pours but previously had covers.
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
        submitGlobalScore(payload);
        if (levelSeed) submitDailyScore(payload);
    }
}