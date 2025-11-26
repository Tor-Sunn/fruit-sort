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

// generate level by reverse-scrambling (single-fruit moves), deterministic when seed provided
function generateSolvableLevel(config, scrambleMoves = 100, seed = null) {
    const { glasses: numGlasses, emptyGlasses } = config;
    const nonEmpty = numGlasses - emptyGlasses;

    // seeded RNG if seed provided
    const rng = seed == null ? Math.random : makeSeededRng(seed);

    const shuffleWithRng = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    const buildSolvedState = () => {
        const pool = shuffleWithRng([...FRUIT_POOL]).slice(0, nonEmpty);
        const state = pool.map(f => Array.from({ length: GLASS_CAPACITY }, () => f));
        for (let i = 0; i < emptyGlasses; i++) state.push([]);
        // pad to requested number of glasses (numGlasses)
        while (state.length < numGlasses) state.push([]);
        return state;
    };

    const isValidPour = (from, to, st) => {
        if (from === to) return false;
        if (!st[from] || st[from].length === 0) return false;
        if (!st[to]) return false;
        if (st[to].length >= GLASS_CAPACITY) return false;
        if (st[to].length === 0) return true;
        return st[to][st[to].length - 1] === st[from][st[from].length - 1];
    };

    const isAllSolved = (st) => {
        const used = st.slice(0, numGlasses);
        return used.every(stack => stack.length === 0 || (stack.length === GLASS_CAPACITY && stack.every(f => f === stack[0])));
    };

    const performScrambleOnce = (state, movesTarget) => {
        const total = state.length;
        let attempts = 0;
        let moves = 0;
        const maxAttempts = Math.max(200, movesTarget * 20);

        while (moves < movesTarget && attempts < maxAttempts) {
            attempts++;
            const from = Math.floor(rng() * total);
            const to = Math.floor(rng() * total);
            if (!isValidPour(from, to, state)) continue;

            // Move exactly one fruit (single-fruit moves mix more reliably)
            const fruit = state[from].pop();
            state[to].push(fruit);

            moves++;
        }

        return state;
    };

    const maxRetries = 8;
    let finalState = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const state = buildSolvedState();
        // perform extra moves when numGlasses small to ensure mixing
        const movesTarget = Math.max(scrambleMoves, Math.floor(scrambleMoves * (1 + attempt * 0.25)));
        performScrambleOnce(state, movesTarget);

        // pad to MAX_GLASSES
        while (state.length < MAX_GLASSES) state.push([]);

        if (!isAllSolved(state)) {
            finalState = state;
            break;
        }

        // advance RNG a bit between attempts for deterministic seeds
        if (seed != null) {
            for (let k = 0; k < (attempt + 1) * 7; k++) rng();
        }
    }

    // fallback: force a single swap to guarantee unsolved
    if (!finalState) {
        const fb = buildSolvedState();
        const total = fb.length;
        outer:
        for (let i = 0; i < total; i++) {
            for (let j = 0; j < total; j++) {
                if (i === j) continue;
                if (fb[i].length > 0 && fb[j].length < GLASS_CAPACITY) {
                    fb[j].push(fb[i].pop());
                    break outer;
                }
            }
        }
        while (fb.length < MAX_GLASSES) fb.push([]);
        finalState = fb;
    }

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
// Uses the current stack length so fallback percent placement matches the visible fruit spacing.
function computeLeafBottomPercent(indexFromBottom, stackLen = GLASS_CAPACITY) {
    const base = 10; // bottom anchor in CSS
    const height = 58; // stack height percent in CSS (space used by fruit stack)
    // distribute across actual slots in current stack (stackLen fruits -> stackLen-1 intervals)
    const slots = Math.max(1, stackLen - 1);
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
            // compute percent relative to stack layout using actual stack length
            const bottomPct = computeLeafBottomPercent(coveredIndex, stack.length || 1);
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

                    // Use stack-aware percent placement for fallback values
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

// --- Replace/insert: group-pour scramble + small BFS solver ---

// Returns a canonical string for a state (used by solver)
function canonicalStateKey(state, usedCount) {
    // only consider first usedCount glasses (usually activeLevel.glasses) when canonicalizing
    return state.slice(0, usedCount).map(stack => stack.join(',')).join('|');
}

// Get all legal pour moves (from -> to) for current rules (groups)
function getLegalPours(state) {
    const total = state.length;
    const pours = [];
    for (let from = 0; from < total; from++) {
        const fstack = state[from];
        if (!fstack || fstack.length === 0) continue;
        const topFruit = fstack[fstack.length - 1];

        // count top-run length in 'from'
        let run = 0;
        for (let i = fstack.length - 1; i >= 0 && fstack[i] === topFruit; i--) run++;

        for (let to = 0; to < total; to++) {
            if (to === from) continue;
            const tstack = state[to];
            if (!tstack) continue;
            const available = GLASS_CAPACITY - tstack.length;
            if (available <= 0) continue;
            if (tstack.length === 0 || tstack[tstack.length - 1] === topFruit) {
                const canMove = Math.min(run, available);
                if (canMove > 0) pours.push({ from, to, count: canMove });
            }
        }
    }
    return pours;
}

// Apply a pour move (mutates a copy and returns it)
function applyPourCopy(state, move) {
    const copy = state.map(s => s.slice());
    for (let i = 0; i < move.count; i++) {
        copy[move.to].push(copy[move.from].pop());
    }
    return copy;
}

// Lightweight BFS solver returning minimal moves to solved up to maxDepth (Infinity if not found)
function findMinSolutionMoves(startState, usedCount, maxDepth = 18) {
    const startKey = canonicalStateKey(startState, usedCount);
    const queue = [{ state: startState.map(s => s.slice()), key: startKey, depth: 0 }];
    const seen = new Map();
    seen.set(startKey, 0);

    const isSolved = (st) => {
        for (let i = 0; i < usedCount; i++) {
            const stack = st[i];
            if (stack.length === 0) continue;
            if (stack.length !== GLASS_CAPACITY) return false;
            for (let j = 1; j < stack.length; j++) {
                if (stack[j] !== stack[0]) return false;
            }
        }
        return true;
    };

    if (isSolved(startState)) return 0;

    while (queue.length) {
        const node = queue.shift();
        if (node.depth >= maxDepth) continue;

        const pours = getLegalPours(node.state);
        for (const mv of pours) {
            const next = applyPourCopy(node.state, mv);
            const key = canonicalStateKey(next, usedCount);
            if (seen.has(key) && seen.get(key) <= node.depth + 1) continue;
            if (isSolved(next)) return node.depth + 1;
            seen.set(key, node.depth + 1);
            queue.push({ state: next, key, depth: node.depth + 1 });
        }
    }
    return Infinity;
}

// Scramble using group-pours, avoid immediate reversal, and attempt to produce a board with reasonable minimal solution length
function performScrambleOnce(state, movesTarget, rng, maxAttempts = 2000) {
    const total = state.length;
    let attempts = 0;
    let moves = 0;
    let lastMove = null; // {from,to}

    while (moves < movesTarget && attempts < maxAttempts) {
        attempts++;
        const pours = getLegalPours(state);

        if (pours.length === 0) break;

        // Filter out immediate reversals
        const candidates = pours.filter(p => !(lastMove && p.from === lastMove.to && p.to === lastMove.from));
        const pool = candidates.length ? candidates : pours;

        // pick random pour from pool using rng
        const mv = pool[Math.floor(rng() * pool.length)];

        // perform the pour (group count already correct)
        for (let k = 0; k < mv.count; k++) state[mv.to].push(state[mv.from].pop());

        lastMove = { from: mv.from, to: mv.to };
        moves++;
    }

    return state;
}

// generate level by reverse-scrambling (group-pour moves), deterministic when seed provided
function generateSolvableLevel(config, scrambleMoves = 100, seed = null) {
    const { glasses: numGlasses, emptyGlasses } = config;
    const nonEmpty = numGlasses - emptyGlasses;

    // seeded RNG if seed provided
    const rng = seed == null ? Math.random : makeSeededRng(seed);

    const shuffleWithRng = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    const buildSolvedState = () => {
        const pool = shuffleWithRng([...FRUIT_POOL]).slice(0, nonEmpty);
        const state = pool.map(f => Array.from({ length: GLASS_CAPACITY }, () => f));
        for (let i = 0; i < emptyGlasses; i++) state.push([]);
        // pad to requested number of glasses (numGlasses)
        while (state.length < numGlasses) state.push([]);
        return state;
    };

    const maxRetries = 30;
    let finalState = null;

    // determine reasonable minimal-solve threshold based on board size
    let minAccept;
    if (numGlasses >= 10) minAccept = 10;
    else if (numGlasses >= 8) minAccept = 6;
    else minAccept = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const state = buildSolvedState();
        // perform extra moves when numGlasses small to ensure mixing
        const movesTarget = Math.max(scrambleMoves, Math.floor(scrambleMoves * (1 + attempt * 0.3)));

        performScrambleOnce(state, movesTarget, rng);

        // pad to MAX_GLASSES
        while (state.length < MAX_GLASSES) state.push([]);

        // reject trivial fully-solved states
        const isAllSolved = (st) => {
            const used = st.slice(0, numGlasses);
            return used.every(stack => stack.length === 0 || (stack.length === GLASS_CAPACITY && stack.every(f => f === stack[0])));
        };
        if (isAllSolved(state)) {
            // not a scramble at all, retry
            continue;
        }

        // validate scrambles by estimating minimal solution depth
        const solverDepth = Math.max(10, 18 - Math.floor(attempt / 3)); // gradually relax search depth on later attempts
        const minSolve = findMinSolutionMoves(state, numGlasses, solverDepth);

        // Accept only if solver finds a solution and it's not too easy
        if (minSolve !== Infinity && minSolve >= minAccept) {
            finalState = state;
            break;
        }

        // otherwise retry (try to get a board with measurable difficulty)
    }

    // fallback: if we couldn't find an acceptable scramble, return a safe-but-unsolved state
    if (!finalState) {
        const fb = buildSolvedState();
        const total = fb.length;
        outer:
        for (let i = 0; i < total; i++) {
            for (let j = 0; j < total; j++) {
                if (i === j) continue;
                if (fb[i].length > 0 && fb[j].length < GLASS_CAPACITY) {
                    fb[j].push(fb[i].pop());
                    break outer;
                }
            }
        }
        while (fb.length < MAX_GLASSES) fb.push([]);
        finalState = fb;
    }

    return finalState;
}

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