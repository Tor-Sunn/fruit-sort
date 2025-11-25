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

// initialCoveredPositions: index -> array of absolute indices (index-from-bottom) that were covered at game start.
// Example: initialCoveredPositions[2] = [1,2] means at start jar 2 had leaves covering the fruits at bottom-index 1 and 2.
let initialCoveredPositions = {};

// coveredPositions: mutable remaining covered absolute indices for each glass. Leaves are rendered only for positions
// present here. When a covered fruit becomes visible (top reaches that index), we remove the absolute index.
let coveredPositions = {};

// Throttle scheduling for positionLeaves so we don't run it excessively while images load.
const schedulePositionLeaves = (() => {
    let scheduled = false;
    return () => {
        if (scheduled) return;
        scheduled = true;
        // two rAF passes, then run, and allow rescheduling afterwards
        requestAnimationFrame(() => requestAnimationFrame(() => {
            positionLeaves();
            scheduled = false;
        }));
    };
})();

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

// Difficulty presets + scoring / daily seed helpers
const DIFFICULTY_PRESETS = {
    easy:   { glasses: 6,  emptyGlasses: 2, coveredGlasses: 2, scrambleMoves: 60, multiplier: 1.0, fullCoverProb: 0.10 },
    medium: { glasses: 8,  emptyGlasses: 2, coveredGlasses: 3, scrambleMoves: 90, multiplier: 1.25, fullCoverProb: 0.25 },
    hard:   { glasses: 10, emptyGlasses: 2, coveredGlasses: 4, scrambleMoves: 140, multiplier: 1.5,  fullCoverProb: 0.35 }
};

let startTime = null;
let lastScore = 0;
let levelSeed = null; // store seed for daily/hashable boards

// Simple seeded RNG (Mulberry32)
function makeSeededRng(seed) {
    let t = seed >>> 0;
    return function() {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

// deterministic shuffle using a seeded RNG
function seededShuffle(array, seed) {
    const rng = makeSeededRng(seed);
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// generate level by reverse-scrambling from a solved board (guaranteed solvable)
function generateSolvableLevel(config, scrambleMoves = 100, seed = null) {
    const { glasses: numGlasses, emptyGlasses } = config;
    const nonEmpty = numGlasses - emptyGlasses;
    const chosen = shuffle([...FRUIT_POOL]).slice(0, nonEmpty);

    // start solved: each nonEmpty glass full of one fruit
    const state = chosen.map(f => Array.from({ length: GLASS_CAPACITY }, () => f));
    for (let i = 0; i < emptyGlasses; i++) state.push([]);

    const total = state.length;

    // deterministic if seed provided
    const rng = seed == null ? Math.random : makeSeededRng(seed);

    const isValidPour = (from, to, st) => {
        if (from === to) return false;
        if (st[from].length === 0) return false;
        if (st[to].length >= GLASS_CAPACITY) return false;
        if (st[to].length === 0) return true;
        return st[to][st[to].length - 1] === st[from][st[from].length - 1];
    };

    // attempt many random valid moves
    let attempts = 0;
    let moves = 0;
    while (moves < scrambleMoves && attempts < scrambleMoves * 8) {
        attempts++;
        const from = Math.floor(rng() * total);
        const to = Math.floor(rng() * total);
        if (!isValidPour(from, to, state)) continue;

        // count consecutive same at top
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

    // pad to MAX_GLASSES with unused empties
    while (state.length < MAX_GLASSES) state.push([]);

    return state;
}

// deterministic daily generator using date seed (YYYY-MM-DD -> int)
function dateSeedFromDate(d) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    // simple combine to a number
    return ((y * 100 + m) * 100 + day) >>> 0;
}

function generateDailyLevel(config, date = new Date(), scrambleMoves = 120) {
    const seed = dateSeedFromDate(date);
    levelSeed = seed;
    // use seeded shuffle to pick fruit types and then reverse-scramble deterministically
    return generateSolvableLevel(config, scrambleMoves, seed);
}

// compute a simple score: higher for fewer moves and shorter time. Tweak as desired.
function computeScore(movesCount, elapsedMs, difficultyMultiplier = 1) {
    const elapsedSec = Math.max(1, Math.round(elapsedMs / 1000));
    const base = 1000 * difficultyMultiplier;
    // subtract penalties, ensure non-negative
    const score = Math.max(0, Math.round(base - movesCount * 12 - elapsedSec * 3));
    return score;
}

// stubs for submitting scores — replace endpoints with your eqsy.io API
async function submitGlobalScore(payload) {
    // Example payload: { score, moves, timeMs, difficulty, seed }
    // Replace URL with real endpoint and include auth if required.
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

// Replace existing checkWin with this: compute score on win and submit
function checkWin() {
    const usedGlasses = glasses.slice(0, activeLevel.glasses);

    const allOk = usedGlasses.every(stack =>
        stack.length === 0 || isGlassComplete(stack)
    );

    if (allOk) {
        const endTime = Date.now();
        const elapsed = startTime ? (endTime - startTime) : 0;

        // determine difficulty multiplier if available
        const diffName = activeLevel._presetName || "easy";
        const diff = DIFFICULTY_PRESETS[diffName] || { multiplier: 1.0 };

        const score = computeScore(moves, elapsed, diff.multiplier);
        lastScore = score;

        statusEl.textContent = `🎉 You solved the board! Score: ${score}`;
        // Submit scores (stubs)
        const payload = {
            score,
            moves,
            timeMs: elapsed,
            difficulty: diffName,
            seed: levelSeed || null,
            date: new Date().toISOString().slice(0,10)
        };
        submitGlobalScore(payload);
        if (levelSeed) submitDailyScore(payload);
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
// Uses data attributes set on .fs-leaf-wrap: data-glass and data-covered-index (absolute index-from-bottom).
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
        const fruitEl = fruitImgs[domIndex];

        if (fruitEl && fruitEl.clientHeight > 0) {
            // center over fruit
            const leftPx = fruitEl.offsetLeft + fruitEl.offsetWidth / 2;
            const topPx = fruitEl.offsetTop + fruitEl.offsetHeight / 2;
            // increase leaf size to better cover fruit
            const LEAF_SCALE = 1.5;    // increased scale
            const VERTICAL_SHIFT = 0.14; // move leaf down by 14% of fruit height
            const wSize = Math.round(fruitEl.offsetWidth * LEAF_SCALE);
            const hSize = Math.round(fruitEl.offsetHeight * LEAF_SCALE);

            const extraY = Math.round(fruitEl.offsetHeight * VERTICAL_SHIFT);
            // ensure leaves use px sizes once we can measure a fruit to avoid tiny intrinsic sizes
            w.style.width = `${wSize}px`;
            w.style.height = `${hSize}px`;
            w.style.left = `${leftPx}px`;
            // move center slightly down so leaf covers lower portion of fruit
            w.style.top = `${topPx + extraY}px`;
            w.style.transform = `translate(-50%, -50%)`;
            // clear bottom to avoid conflicts with top-based layout
            w.style.bottom = "";
        } else {
            // fallback percent placement (when measurements not available)
            const bottomPct = computeLeafBottomPercent(coveredIndex);
            // lower fallback by a couple percent as well
            const lowered = Math.max(0, bottomPct - 3);
            w.style.left = `50%`;
            w.style.transform = `translateX(-50%)`;
            w.style.bottom = `${lowered}%`;
            // use explicit percent width/height as a reasonable fallback
            w.style.width = `66%`;
            w.style.height = `66%`;
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
        // also schedule leaf positioning when jar inner loads (may affect layout)
        jarInnerImg.addEventListener('load', schedulePositionLeaves);
        jarInnerImg.addEventListener('error', schedulePositionLeaves);
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
            img.draggable = false;

            // Set a CSS variable for optional staggered animation
            img.style.setProperty('--fruit-index', String(stack.length - 1 - s));

            // when the fruit image finishes loading, schedule positioning so leaves get correct sizes
            img.addEventListener('load', schedulePositionLeaves);
            img.addEventListener('error', schedulePositionLeaves);

            stackEl.appendChild(img);
        }

        glassEl.appendChild(stackEl);

        // Render covers:
        // coveredPositions[i] may now be either:
        //  - { positions: [absIndex, ...] }  (partial leaves)
        //  - { fullCover: N }                (full overlay, needs N fruit reveals)
        const cover = coveredPositions[i];

        // Full cover overlay: render a single overlay that hides the whole glass
        if (cover && cover.fullCover && cover.fullCover > 0 && i < activeLevel.glasses) {
            const overlay = document.createElement("div");
            overlay.className = "fs-full-cover";
            overlay.setAttribute("aria-hidden", "true");
            overlay.dataset.glass = String(i);

            // show how many reveals remain (optional)
            const q = document.createElement("span");
            q.className = "fs-full-cover-q";
            q.textContent = "?" + (cover.fullCover > 1 ? ` ${cover.fullCover}` : "");
            overlay.appendChild(q);

            // append overlay as top element of the stack so it visually covers fruits
            stackEl.appendChild(overlay);
        } else {
            // Partial leaves (backwards compatible): render per-position leaves from cover.positions
            const initialPositions = initialCoveredPositions[i] || [];
            const remainingPositions = (cover && Array.isArray(cover.positions)) ? cover.positions : [];

            if (initialPositions.length > 0 && remainingPositions.length > 0 && i < activeLevel.glasses && stack.length > 0) {
                // iterate over remainingPositions (absolute indices). They should remain fixed relative to the jar bottom.
                // Sort descending so we append leaves top-to-bottom (not required but stable).
                remainingPositions.slice().sort((a,b) => b - a).forEach(pos => {
                    // Only render if the position still exists in the current stack (safety check)
                    if (pos < 0 || pos > stack.length - 1) return;

                    const leafWrap = document.createElement("div");
                    leafWrap.className = "fs-leaf-wrap";
                    leafWrap.setAttribute("aria-hidden", "true");
                    leafWrap.dataset.glass = String(i);
                    // dataset.coveredIndex now holds the absolute index-from-bottom (fixed)
                    leafWrap.dataset.coveredIndex = String(pos);

                    // initial fallback sizing (will be corrected by positionLeaves)
                    const bottomPct = computeLeafBottomPercent(pos);
                    leafWrap.style.left = "50%";
                    leafWrap.style.transform = "translateX(-50%)";
                    leafWrap.style.bottom = `${bottomPct}%`;
                    // use explicit percent height as fallback; will be replaced with px once measured
                    leafWrap.style.width = `66%`;
                    leafWrap.style.height = `66%`;

                    // leaf image element (fills wrapper)
                    const leafImg = document.createElement("img");
                    leafImg.className = "fs-leaf-img";
                    leafImg.src = "img/leaf.png";
                    leafImg.alt = "leaf";
                    leafImg.draggable = false;
                    // ensure the image fills the wrapper so we don't get tiny intrinsic sizes
                    leafImg.style.width = "100%";
                    leafImg.style.height = "100%";
                    leafImg.style.display = "block";

                    // schedule positioning when the leaf image has loaded
                    leafImg.addEventListener('load', schedulePositionLeaves);
                    leafImg.addEventListener('error', schedulePositionLeaves);

                    const q = document.createElement("span");
                    q.className = "fs-leaf-q";
                    q.textContent = "?";

                    leafWrap.appendChild(leafImg);
                    leafWrap.appendChild(q);

                    // append to stackEl so leaves follow fruit layout and transforms
                    stackEl.appendChild(leafWrap);
                });
            }
        }

        boardEl.appendChild(glassEl);
    }

    // schedule a positioning pass once DOM nodes are in place; actual sizing will happen
    // when images have loaded (via the load handlers above).
    schedulePositionLeaves();
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
    // Record previous top index before we modify the stack so we can compute which covered positions became visible.
    const previousTop = fromStack.length - 1;
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
    // coveredPositions[from] may be { positions: [...] } or { fullCover: N }.
    if (removedCount > 0 && coveredPositions[from]) {
        const cover = coveredPositions[from];

        // Handle fullCover: decrement required reveals by removedCount
        if (cover.fullCover && cover.fullCover > 0) {
            cover.fullCover -= removedCount;
            if (cover.fullCover <= 0) {
                // fully revealed now
                delete coveredPositions[from];
            } else {
                // keep updated count
                coveredPositions[from] = cover;
            }
        } else if (Array.isArray(cover.positions) && cover.positions.length > 0) {
            // Partial leaf reveal: only remove covered indices that became visible during this move.
            let newTop = glasses[from].length - 1;
            const remaining = cover.positions || [];
            const updated = remaining.filter(p => !(p >= newTop && p <= previousTop)).sort((a,b) => a - b);

            if (updated.length === 0) {
                delete coveredPositions[from];
            } else {
                coveredPositions[from] = { positions: updated };
            }
        }
    }

    // After a move, re-render and schedule repositioning. Images are already loaded so sizing
    // will be done in the scheduled positionLeaves pass.
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

function startNewGame() {
    moves = 0;
    movesEl.textContent = "0";
    statusEl.textContent = "";

    activeLevel = { ...DEFAULT_LEVEL_CONFIG };
    glasses = generateLevel(activeLevel);

    // Choose random non-empty used glasses to cover with leaves (store absolute indices)
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
        if (stackLen <= 1) continue; // nothing to cover under top

        // Decide cover type: full cover or partial leaves
        // Probability example: 30% chance fullCover on medium/higher difficulties.
        const makeFullCover = Math.random() < 0.3; // tweak per difficulty

        if (makeFullCover) {
            // require between 1..(stackLen) reveals to remove (tune as needed)
            const required = randInt(1, Math.max(1, Math.min(stackLen, GLASS_CAPACITY)));
            coveredPositions[idx] = { fullCover: required };
            // initialCoveredPositions keep a hint (we can store same shape)
            initialCoveredPositions[idx] = []; // no per-slot leaves when fully covered
        } else {
            // Partial leaves as before: depth = how many fruits below the top are initially covered (1..stackLen-1)
            const maxDepth = Math.min(stackLen - 1, GLASS_CAPACITY - 1);
            const depth = randInt(1, maxDepth);

            const topIndex = stackLen - 1;
            const positions = [];
            for (let j = 1; j <= depth; j++) {
                const absIndex = topIndex - j; // absolute index-from-bottom
                if (absIndex >= 0) positions.push(absIndex);
            }
            if (positions.length > 0) {
                initialCoveredPositions[idx] = positions.slice();
                coveredPositions[idx] = { positions: positions.slice() }; // store as object for consistency
            }
        }
    }

    selectedGlassIndex = null;
    drawBoard();
}

resetBtn.addEventListener("click", startNewGame);

// Init
startNewGame();