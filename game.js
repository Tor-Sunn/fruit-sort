// =======================
// Fruit Sort – game.js
// Arcade-generator med 4 modes (Casual–Insane)
// - Antall glass styres av scramble-mode
// - Alltid 4 av hver frukttype
// - Maks: 18 glass, 16 frukttyper
// - Blad-dekke på noen glass for ekstra krydder
// =======================

// ---- KONSTANTER ----

const MAX_GLASSES = 18;       // 6 i bredden * 3 rader (CSS styrer layouten)
const GLASS_CAPACITY = 4;

// Alle fruktfilene du har i /img
// NB: Insane bruker alle 16 typene (18 glass – 2 tomme = 16 fulle)
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

// Scramble-moduser: bestemmer ALT for Arcade
const SCRAMBLE_MODES = {
    casual: {
        label: "Casual",
        glasses: 8,
        emptyGlasses: 2,
        coveredGlasses: 1,
        scrambleFactor: 0.5,     // hvor mye vi blander
        scoreMult: 1.0
    },
    challenging: {
        label: "Challenging",
        glasses: 12,
        emptyGlasses: 2,
        coveredGlasses: 2,
        scrambleFactor: 0.8,
        scoreMult: 1.2
    },
    brutal: {
        label: "Brutal",
        glasses: 15,
        emptyGlasses: 2,
        coveredGlasses: 3,
        scrambleFactor: 1.1,
        scoreMult: 1.5
    },
    insane: {
        label: "Insane",
        glasses: 18,
        emptyGlasses: 2,
        coveredGlasses: 4,
        scrambleFactor: 1.4,
        scoreMult: 1.8
    }
};

// ---- DOM ----

const boardEl = document.getElementById("fs-board");
const movesEl = document.getElementById("fs-moves");
const statusEl = document.getElementById("fs-status");
const resetBtn = document.getElementById("fs-reset");

// Eksisterende HTML (vi skjuler hele blokken – dropdown + fast-hard)
// Så du slipper å endre index.html
const controlsWrap = document.querySelector(".fs-controls");
if (controlsWrap) {
    controlsWrap.style.display = "none";
}

// ---- STATE ----

// Hvilken scramble-mode som brukes (styrer alt: glass, frukt, dekke, blanding)
let generatorMode = "challenging";

let glasses = [];          // Array av MAX_GLASSES glass, hvert glass = array med frukt (bunn -> topp)
let activeLevel = {
    glasses: SCRAMBLE_MODES[generatorMode].glasses,
    emptyGlasses: SCRAMBLE_MODES[generatorMode].emptyGlasses,
    coveredGlasses: SCRAMBLE_MODES[generatorMode].coveredGlasses
};

let selectedGlassIndex = null;
let moves = 0;

// initialCoveredPositions: index -> array av absolute indices (index-from-bottom) som var dekket ved start
let initialCoveredPositions = {};

// coveredPositions: mutable remaining covered data for hvert glass.
// Enten { positions: [absIndex,...] } (delvis dekke) eller { fullCover: N } (fullt dekket)
let coveredPositions = {};

// Score / tid
let startTime = null;
let lastScore = 0;

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

// Simple seeded RNG (Mulberry32) – kan brukes senere til daily
function makeSeededRng(seed) {
    let t = seed >>> 0;
    return function () {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

// compute a simple score: høyere for færre trekk og kortere tid.
function computeScore(movesCount, elapsedMs, difficultyMultiplier = 1) {
    const elapsedSec = Math.max(1, Math.round(elapsedMs / 1000));
    const base = 1000 * difficultyMultiplier;
    const score = Math.max(0, Math.round(base - movesCount * 12 - elapsedSec * 3));
    return score;
}

// ---- COVER RNG ----

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
            // full overlay med ? + antall
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

// ---- NIVÅGENERERING ----

// Bygg helt løst nivå for en gitt scramble-mode:
// - Hver fulle flaske har 4 like frukter
// - Ingen frukttype brukes mer enn 4 ganger
function buildSolvedStateForMode(modeCfg, rng) {
    const numGlasses = modeCfg.glasses;
    const emptyGlasses = modeCfg.emptyGlasses;
    const filledGlasses = numGlasses - emptyGlasses;

    // ANTALL frukttyper = antall fulle glass
    const neededTypes = Math.min(filledGlasses, FRUIT_POOL.length);

    // Velg og bland frukttypene
    const fruits = shuffleInPlace([...FRUIT_POOL], rng).slice(0, neededTypes);

    const state = [];

    // Fylte glass
    for (let i = 0; i < filledGlasses; i++) {
        const fruitName = fruits[i % neededTypes]; // burde være 1:1 men sikrer oss
        state.push(Array.from({ length: GLASS_CAPACITY }, () => fruitName));
    }

    // Tomme glass
    for (let i = 0; i < emptyGlasses; i++) {
        state.push([]);
    }

    // Fyll opp til numGlasses (normalt unødvendig, men greit for fremtid)
    while (state.length < numGlasses) state.push([]);

    // Og til MAX_GLASSES for layout
    while (state.length < MAX_GLASSES) state.push([]);

    return state;
}

// Reverse-scramble med ENKELT-frukt flytt – alltid løsbart
function scrambleStateSingleFruit(state, movesTarget, rng, usedCount) {
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

// Generer løsbart brett for aktiv generatorMode
function generateSolvableForCurrentMode(seed = null) {
    const modeCfg = SCRAMBLE_MODES[generatorMode];
    const rng = seed == null ? Math.random : makeSeededRng(seed);

    let state = buildSolvedStateForMode(modeCfg, rng);

    const filledGlasses = modeCfg.glasses - modeCfg.emptyGlasses;
    const totalFruits = filledGlasses * GLASS_CAPACITY;

    // Litt heuristikk for hvor mye vi skal blande:
    const baseMoves = totalFruits * 1.2; // start rundt 1.2x antall frukter
    const factor = modeCfg.scrambleFactor;
    const movesTarget = Math.max(20, Math.round(baseMoves * factor));

    scrambleStateSingleFruit(state, movesTarget, rng, modeCfg.glasses);
    return state;
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

// ---- START / RESET + DEKKE ----

function setupCovers(modeCfg) {
    initialCoveredPositions = {};
    coveredPositions = {};

    const candidateIndices = [];
    for (let i = 0; i < activeLevel.glasses; i++) {
        if (glasses[i] && glasses[i].length > 1 && !isGlassComplete(glasses[i])) {
            candidateIndices.push(i);
        }
    }

    shuffleInPlace(candidateIndices, coverRng);

    const toCover = Math.min(modeCfg.coveredGlasses || 0, candidateIndices.length);

    for (let k = 0; k < toCover; k++) {
        const idx = candidateIndices[k];
        const stackLen = glasses[idx].length;
        if (stackLen <= 1) continue;

        const makeFullCover = coverRng() < 0.35; // ca 35% sjanse for full dekke

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

// Start nytt spill i gjeldende generatorMode
function startNewGame() {
    moves = 0;
    movesEl.textContent = "0";
    statusEl.textContent = "";

    const modeCfg = SCRAMBLE_MODES[generatorMode];

    activeLevel = {
        mode: generatorMode,
        glasses: modeCfg.glasses,
        emptyGlasses: modeCfg.emptyGlasses,
        coveredGlasses: modeCfg.coveredGlasses
    };

    setCoverRng(null); // random dekke for nå
    glasses = generateSolvableForCurrentMode();

    setupCovers(modeCfg);

    selectedGlassIndex = null;
    startTime = Date.now();
    drawBoard();
}

// ---- SCRAMBLE-KNAPPER (Casual / Challenging / Brutal / Insane) ----

// Lager en bar under topbaren i HTML: "Scramble: Casual Challenging Brutal Insane"
function initScrambleButtons() {
    const wrapper = document.querySelector(".fs-wrapper");
    if (!wrapper) return;
    const topbar = document.querySelector(".fs-topbar");
    if (!topbar) return;

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

    ["casual", "challenging", "brutal", "insane"].forEach(modeKey => {
        const cfg = SCRAMBLE_MODES[modeKey];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = cfg.label;
        btn.dataset.mode = modeKey;
        btn.className = "fs-gen-btn";
        btn.style.padding = "3px 10px";
        btn.style.borderRadius = "999px";
        btn.style.border = "none";
        btn.style.cursor = "pointer";
        btn.style.fontSize = "0.85rem";
        btn.style.background = "#111827";
        btn.style.color = "#e5e7eb";

        if (modeKey === generatorMode) {
            btn.classList.add("fs-gen-btn-active");
            btn.style.fontWeight = "700";
        } else {
            btn.style.fontWeight = "400";
        }

        btn.addEventListener("click", () => {
            setGeneratorMode(modeKey);
        });

        bar.appendChild(btn);
    });

    // Sett den rett under topbaren
    wrapper.insertBefore(bar, boardEl);
}

function setGeneratorMode(modeKey) {
    if (!SCRAMBLE_MODES[modeKey]) return;
    generatorMode = modeKey;

    const buttons = document.querySelectorAll(".fs-gen-btn");
    buttons.forEach(btn => {
        const isActive = btn.dataset.mode === modeKey;
        btn.classList.toggle("fs-gen-btn-active", isActive);
        btn.style.fontWeight = isActive ? "700" : "400";
    });

    startNewGame();

    const cfg = SCRAMBLE_MODES[modeKey];
    statusEl.textContent = `${cfg.label} – ${cfg.glasses} glasses, ${cfg.glasses - cfg.emptyGlasses} fruit types.`;
}

// Knytt reset-knapp til ny generering i samme mode
resetBtn.addEventListener("click", () => {
    startNewGame();
});

// ---- WIN CHECK & SCORING ----

function checkWin() {
    const usedGlasses = glasses.slice(0, activeLevel.glasses);

    const allOk = usedGlasses.every(stack =>
        stack.length === 0 || isGlassComplete(stack)
    );

    if (allOk) {
        const endTime = Date.now();
        const elapsed = startTime ? (endTime - startTime) : 0;
        const modeCfg = SCRAMBLE_MODES[generatorMode] || { scoreMult: 1.0 };
        const score = computeScore(moves, elapsed, modeCfg.scoreMult);
        lastScore = score;

        coveredPositions = {};
        initialCoveredPositions = {};
        drawBoard();

        statusEl.textContent = `🎉 You solved the board! Score: ${score}`;
    }
}

// ---- INIT ----

initScrambleButtons();
startNewGame();
