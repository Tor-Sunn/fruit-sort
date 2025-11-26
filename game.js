// =======================
// Fruit Sort – game.js
// Arcade-modus med 4 av hver frukt, 1–3 tomme glass (tilfeldig)
// og Casual/Challenging/Brutal/Insane som bestemmer brettstørrelse.
// =======================

// ---- KONSTANTER ----

const MAX_GLASSES = 18;       // 6 i bredden * 3 rader i layout
const GLASS_CAPACITY = 4;

// Alle fruktfilene du har i /img (navn uten .png)
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

// Arcade-moduser – disse styrer hvor mange glass og hvor mye "blad-dekke" vi bruker
const MODE_CONFIG = {
    casual: {
        key: "casual",
        label: "Casual",
        glasses: 8,            // maks synlige glass
        coverRatio: 0.10,      // andel glass som får blad
        fullCoverProb: 0.18,   // sannsynlighet for full dekke ("?2" osv)
        scoreMultiplier: 1.0
    },
    challenging: {
        key: "challenging",
        label: "Challenging",
        glasses: 12,
        coverRatio: 0.16,
        fullCoverProb: 0.25,
        scoreMultiplier: 1.3
    },
    brutal: {
        key: "brutal",
        label: "Brutal",
        glasses: 15,
        coverRatio: 0.20,
        fullCoverProb: 0.30,
        scoreMultiplier: 1.6
    },
    insane: {
        key: "insane",
        label: "Insane",
        glasses: 18,
        coverRatio: 0.24,
        fullCoverProb: 0.35,
        scoreMultiplier: 2.0
    }
};

// ---- DOM ----

const boardEl = document.getElementById("fs-board");
const movesEl = document.getElementById("fs-moves");
const statusEl = document.getElementById("fs-status");
const resetBtn = document.getElementById("fs-reset");

// ---- STATE ----

let currentModeKey = "casual";   // "casual" | "challenging" | "brutal" | "insane"

let glasses = [];                // Array av MAX_GLASSES glass, hvert glass = array med frukt (bunn -> topp)
let activeLevel = {
    glasses: 0,        // hvor mange glass som er i bruk (1..18)
    colorGlasses: 0,   // hvor mange av dem som faktisk har frukt (resten er tomme fra start)
    emptyGlasses: 0,   // hvor mange som skal være tomme ved start
    modeKey: "casual",
    scoreMultiplier: 1
};

let selectedGlassIndex = null;
let moves = 0;

// "blad-dekke":
// initialCoveredPositions: index -> array av absolute indices (index-from-bottom) som var dekket ved start
let initialCoveredPositions = {};
// coveredPositions: mutable remaining covered data for hvert glass.
// Enten { positions: [absIndex,...] } (delvis dekke) eller { fullCover: N } (fullt dekket)
let coveredPositions = {};

// Score / tid
let startTime = null;
let lastScore = 0;
let levelSeed = null; // ikke brukt til daily her, men lar det være til senere

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

// enkel score: bedre score for færre trekk + kortere tid
function computeScore(movesCount, elapsedMs, difficultyMultiplier = 1) {
    const elapsedSec = Math.max(1, Math.round(elapsedMs / 1000));
    const base = 1000 * difficultyMultiplier;
    const score = Math.max(0, Math.round(base - movesCount * 12 - elapsedSec * 3));
    return score;
}

// ---- COVER RNG (for blad/cover) ----

let coverRng = Math.random;
function setCoverRng(seed) {
    if (seed == null) {
        coverRng = Math.random;
    } else {
        // enkel seedet RNG (Mulberry32)
        let t = seed >>> 0;
        coverRng = function () {
            t += 0x6D2B79F5;
            let r = Math.imul(t ^ (t >>> 15), 1 | t);
            r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
    }
}
function coverRandInt(min, max) {
    return randInt(min, max, coverRng);
}

// ---- RENDERING / LEAVES ----

// Compute bottom percentage for a fruit at indexFromBottom (0 = bunn)
function computeLeafBottomPercent(indexFromBottom, stackLen = GLASS_CAPACITY) {
    const base = 10;     // bottom anchor i CSS
    const height = 58;   // prosent av høyden hvor fruktene ligger
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
        if (domIndex >= 0 && domIndex < fruitImgs.length) {
            fruitEl = fruitImgs[domIndex];
        } else if (fruitImgs.length > 0) {
            fruitEl = fruitImgs[fruitImgs.length - 1];
        }

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

// ---- NIVÅGENERERING – REN TILFELDIG DEAL, 4 AV HVER FRUKT ----

// Teller hvor mange glass som allerede er "komplette"
function countCompleteGlasses(state, colorGlasses) {
    let c = 0;
    for (let i = 0; i < colorGlasses; i++) {
        if (isGlassComplete(state[i])) c++;
    }
    return c;
}

// Lager nytt brett for valgt modus.
// 1–3 tomme glass (tilfeldig – men tilpasset antall frukttyper)
// Alltid 4 av hver type som er i spill.
function createRandomLevel(modeKey) {
    const mode = MODE_CONFIG[modeKey] || MODE_CONFIG.casual;
    const totalGlasses = mode.glasses;

    // hvor mange tomme glass ønsker vi? 1–3, men minst så mye at vi ikke trenger mer enn FRUIT_POOL-typer
    const minEmpty = Math.max(1, totalGlasses - FRUIT_POOL.length);
    const maxEmpty = Math.min(3, totalGlasses - 2); // minst 2 glass med frukt
    const emptyGlasses = (() => {
        if (maxEmpty < minEmpty) return minEmpty;
        return randInt(minEmpty, maxEmpty);
    })();

    const colorGlasses = totalGlasses - emptyGlasses;

    // vi trenger én frukttype per "målglass" i løst tilstand
    const fruitTypesCount = Math.min(colorGlasses, FRUIT_POOL.length);
    const chosenTypes = shuffleInPlace([...FRUIT_POOL]).slice(0, fruitTypesCount);

    // lag 4 av hver valgt frukt
    const fruits = [];
    chosenTypes.forEach(type => {
        for (let i = 0; i < GLASS_CAPACITY; i++) fruits.push(type);
    });

    let bestState = null;

    // Vi prøver noen ganger til vi får et brett som ikke er "nesten ferdig"
    let attempts = 0;
    while (attempts < 30) {
        attempts++;

        const state = Array.from({ length: totalGlasses }, () => []);

        // Del ut frukter tilfeldig på de første colorGlasses glassene
        const fruitBag = shuffleInPlace([...fruits]);
        let idx = 0;
        for (let g = 0; g < colorGlasses; g++) {
            for (let s = 0; s < GLASS_CAPACITY; s++) {
                state[g].push(fruitBag[idx++]);
            }
        }
        // Siste emptyGlasses glass (fra colorGlasses til totalGlasses-1) blir helt tomme.

        const complete = countCompleteGlasses(state, colorGlasses);
        const maxCompleteAllowed = Math.floor(colorGlasses * 0.5); // maks 50% ferdig sortert

        bestState = state;

        if (complete <= maxCompleteAllowed) {
            // ser greit ut – ikke for mye ferdig sortert
            break;
        }
    }

    return {
        state: bestState,
        totalGlasses,
        colorGlasses,
        emptyGlasses,
        fruitTypesCount
    };
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

function setupCoversForMode(mode) {
    initialCoveredPositions = {};
    coveredPositions = {};

    const modeCfg = mode || MODE_CONFIG[currentModeKey] || MODE_CONFIG.casual;

    const candidateIndices = [];
    for (let i = 0; i < activeLevel.colorGlasses; i++) {
        if (glasses[i] && glasses[i].length > 1 && !isGlassComplete(glasses[i])) {
            candidateIndices.push(i);
        }
    }

    shuffleInPlace(candidateIndices, coverRng);

    const roughTarget = Math.round(candidateIndices.length * (modeCfg.coverRatio || 0.18));
    const toCover = Math.min(roughTarget, candidateIndices.length);

    for (let k = 0; k < toCover; k++) {
        const idx = candidateIndices[k];
        const stackLen = glasses[idx].length;
        if (stackLen <= 1) continue;

        const makeFullCover = coverRng() < (modeCfg.fullCoverProb || 0.25);

        if (makeFullCover) {
            // fullt dekke – må ha minst 1 frukt for å "låse opp"
            const required = coverRandInt(1, Math.min(stackLen, GLASS_CAPACITY));
            coveredPositions[idx] = { fullCover: required };
            initialCoveredPositions[idx] = [];
        } else {
            // delvis dekke nederste frukter
            const maxDepth = Math.max(1, stackLen - 1);
            const depth = coverRandInt(1, maxDepth);
            const positions = [];
            for (let j = 0; j < depth; j++) positions.push(j);

            initialCoveredPositions[idx] = positions.slice();
            coveredPositions[idx] = { positions: positions.slice() };
        }
    }
}

// Start nytt spill for gitt modus
function startNewGame(modeKey) {
    currentModeKey = modeKey || currentModeKey || "casual";
    const mode = MODE_CONFIG[currentModeKey] || MODE_CONFIG.casual;

    moves = 0;
    movesEl.textContent = "0";
    statusEl.textContent = "";

    // Generer nytt brett
    const level = createRandomLevel(currentModeKey);
    glasses = level.state;
    activeLevel = {
        glasses: level.totalGlasses,
        colorGlasses: level.colorGlasses,
        emptyGlasses: level.emptyGlasses,
        modeKey: currentModeKey,
        scoreMultiplier: mode.scoreMultiplier || 1
    };

    setCoverRng(null);         // frisk RNG for dekke
    setupCoversForMode(mode);

    selectedGlassIndex = null;
    startTime = Date.now();
    drawBoard();
}

// ---- SCRAMBLE-KNAPPER (Casual / Challenging / Brutal / Insane) ----

function setModeAndRestart(modeKey) {
    if (!MODE_CONFIG[modeKey]) return;
    currentModeKey = modeKey;

    // Oppdater knappestil
    const buttons = document.querySelectorAll(".fs-gen-btn");
    buttons.forEach(btn => {
        const isActive = btn.dataset.genMode === modeKey;
        btn.classList.toggle("fs-gen-btn-active", isActive);
        btn.style.fontWeight = isActive ? "700" : "400";
    });

    startNewGame(modeKey);
    const mode = MODE_CONFIG[modeKey];
    statusEl.textContent = `New board – ${mode.label} mode.`;
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

    ["casual", "challenging", "brutal", "insane"].forEach(modeKey => {
        const cfg = MODE_CONFIG[modeKey];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = cfg.label;
        btn.dataset.genMode = modeKey;
        btn.className = "fs-gen-btn";
        btn.style.padding = "3px 10px";
        btn.style.borderRadius = "999px";
        btn.style.border = "none";
        btn.style.cursor = "pointer";
        btn.style.fontSize = "0.85rem";
        btn.style.background = "#111827";
        btn.style.color = "#e5e7eb";

        if (modeKey === currentModeKey) {
            btn.classList.add("fs-gen-btn-active");
            btn.style.fontWeight = "700";
        } else {
            btn.style.fontWeight = "400";
        }

        btn.addEventListener("click", () => setModeAndRestart(modeKey));
        bar.appendChild(btn);
    });

    // Legg den mellom top-bar og board
    wrapper.insertBefore(bar, board);
}

// Knytt reset-knapp til aktiv modus
resetBtn.addEventListener("click", () => {
    startNewGame(currentModeKey);
});

// ---- INIT ----

initGeneratorButtons();
startNewGame(currentModeKey);

// ---- WIN CHECK & SCORING ----

function checkWin() {
    const usedGlasses = glasses.slice(0, activeLevel.glasses);

    const allOk = usedGlasses.every(stack =>
        stack.length === 0 || isGlassComplete(stack)
    );

    if (allOk) {
        const endTime = Date.now();
        const elapsed = startTime ? (endTime - startTime) : 0;
        const mode = MODE_CONFIG[activeLevel.modeKey] || MODE_CONFIG.casual;
        const score = computeScore(moves, elapsed, mode.scoreMultiplier || 1);
        lastScore = score;

        coveredPositions = {};
        initialCoveredPositions = {};
        drawBoard();

        statusEl.textContent = `🎉 You solved the board! Score: ${score}`;

        const payload = {
            score,
            moves,
            timeMs: elapsed,
            mode: activeLevel.modeKey,
            seed: levelSeed || null,
            date: new Date().toISOString().slice(0, 10)
        };
        // Hooks for backend om du vil senere:
        console.log("submitFruitSortScore", payload);
    }
}
