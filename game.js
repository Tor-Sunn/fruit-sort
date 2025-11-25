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

// generate level by random distribution + solver (guaranteed solvable)
function generateSolvableLevel(config, scrambleMoves = 100, seed = null) {
    const { glasses: numGlasses, emptyGlasses } = config;
    const nonEmpty = numGlasses - emptyGlasses;

    // deterministic RNG when seed provided
    const rng = seed == null ? Math.random : makeSeededRng(seed);

    // helper shuffle using supplied rng
    const shuffleWithRng = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    const isSolved = (state) => {
        const used = state.slice(0, numGlasses);
        return used.every(stack => stack.length === 0 || (stack.length === GLASS_CAPACITY && stack.every(f => f === stack[0])));
    };

    const serialize = (state) => state.slice(0, numGlasses).map(s => s.join(',')).join('|');

    const cloneState = (s) => s.map(arr => arr.slice());

    const getTopSameCount = (stack) => {
        if (stack.length === 0) return 0;
        const top = stack[stack.length - 1];
        let c = 0;
        for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i] === top) c++; else break;
        }
        return c;
    };

    const getValidMoves = (st) => {
        const moves = [];
        const total = st.length;
        for (let from = 0; from < total; from++) {
            if (st[from].length === 0) continue;
            const sameCount = getTopSameCount(st[from]);
            for (let to = 0; to < total; to++) {
                if (from === to) continue;
                if (st[to].length >= GLASS_CAPACITY) continue;
                // forward rule: can pour onto empty or same-top fruit
                if (st[to].length === 0 || st[to][st[to].length - 1] === st[from][st[from].length - 1]) {
                    const available = GLASS_CAPACITY - st[to].length;
                    const maxMove = Math.min(sameCount, available);
                    // allow moves of 1..maxMove (solver needs to explore)
                    for (let cnt = 1; cnt <= maxMove; cnt++) {
                        moves.push({ from, to, cnt });
                    }
                }
            }
        }
        return moves;
    };

    const applyMove = (st, mv) => {
        const ns = cloneState(st);
        const moved = [];
        for (let i = 0; i < mv.cnt; i++) moved.push(ns[mv.from].pop());
        for (let i = moved.length - 1; i >= 0; i--) ns[mv.to].push(moved[i]);
        return ns;
    };

    // lightweight BFS solver to check solvability
    const isSolvable = (start) => {
        if (isSolved(start)) return true;
        const seen = new Set();
        const q = [];
        const key0 = serialize(start);
        seen.add(key0);
        q.push(start);
        const maxSteps = 50000; // cap to avoid pathological runs
        let steps = 0;

        while (q.length > 0) {
            if (++steps > maxSteps) return false;
            const cur = q.shift();
            if (isSolved(cur)) return true;
            const moves = getValidMoves(cur);
            for (const mv of moves) {
                const nxt = applyMove(cur, mv);
                const k = serialize(nxt);
                if (!seen.has(k)) {
                    seen.add(k);
                    q.push(nxt);
                }
            }
        }
        return false;
    };

    // build pool of fruits: each chosen fruit appears GLASS_CAPACITY times
    const poolBase = [...FRUIT_POOL];
    // choose first nonEmpty fruit types (randomized)
    const poolSelector = shuffleWithRng(poolBase).slice(0, nonEmpty);

    const buildRandomState = () => {
        // create flat list of fruits (each type repeated capacity)
        const flat = [];
        for (let i = 0; i < poolSelector.length; i++) {
            for (let k = 0; k < GLASS_CAPACITY; k++) flat.push(poolSelector[i]);
        }
        shuffleWithRng(flat);

        // distribute fruits across numGlasses in round-robin-ish way to avoid trivial full jars
        const state = Array.from({ length: numGlasses }, () => []);
        // fill one fruit at a time into a random glass with capacity
        const glassOrder = shuffleWithRng([...Array(numGlasses).keys()]);
        let idx = 0;
        while (flat.length > 0) {
            const g = glassOrder[idx % glassOrder.length];
            if (state[g].length < GLASS_CAPACITY) {
                state[g].push(flat.pop());
            }
            idx++;
        }
        // ensure order: bottom->top (we pushed in arbitrary order, that's fine)
        return state;
    };

    // attempt generation until we get a solvable, non-trivial board
    const maxAttempts = 80;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = buildRandomState();
        // pad to MAX_GLASSES
        while (candidate.length < MAX_GLASSES) candidate.push([]);
        // require not already solved and solvable
        const used = candidate.slice(0, numGlasses);
        const alreadySolved = used.every(stack => stack.length === 0 || (stack.length === GLASS_CAPACITY && stack.every(f => f === stack[0])));
        if (alreadySolved) continue;
        if (isSolvable(candidate)) return candidate;
        // if seed deterministic, advance rng a bit between attempts
        if (seed != null) {
            for (let k = 0; k < (attempt + 1) * 3; k++) rng();
        }
    }

    // fallback: deterministic small-scramble of solved layout (guarantee not solved)
    const fallback = poolSelector.map(f => Array.from({ length: GLASS_CAPACITY }, () => f));
    for (let i = 0; i < emptyGlasses; i++) fallback.push([]);
    // do a single forced swap to make it unsolved
    outer:
    for (let i = 0; i < fallback.length; i++) {
        for (let j = 0; j < fallback.length; j++) {
            if (i === j) continue;
            if (fallback[i].length > 0 && fallback[j].length < GLASS_CAPACITY) {
                const v = fallback[i].pop();
                fallback[j].push(v);
                break outer;
            }
        }
    }
    while (fallback.length < MAX_GLASSES) fallback.push([]);
    return fallback;
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

        // Skip covering already-complete jars — don't hide jars that are already fully sorted.
        if (isGlassComplete(glasses[idx])) continue;
        if (stackLen <= 1) continue;

        const makeFullCover = Math.random() < (preset.fullCoverProb || 0.2);

        if (makeFullCover) {
            // require at most the number of fruits present; avoid nonsensical fullCover values
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