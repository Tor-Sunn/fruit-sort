// ==========================
// Fruit Merge Grid – game.js
// Prototype B: 9x9, merge, gravity, leaves
// ==========================

// --- CONFIG ---

const GRID_SIZE = 9;

// rekkefølgen styrer merge-kjeden
const FRUITS = [
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

// hvor mange fruits brukes som “startnivå”
const BASE_FRUIT_COUNT = 8; // de første 8 i FRUITS

// hvor mange celler som får blader ved start
const LEAF_CELLS_MIN = 8;
const LEAF_CELLS_MAX = 14;
const LEAF_LAYERS_MIN = 1;
const LEAF_LAYERS_MAX = 3;

// --- STATE ---

/**
 * Board er 2D-array: board[y][x] = { fruitIndex, leafLayers } eller null
 */
let board = [];
let selectedCell = null; // {x,y} eller null
let score = 0;
let moves = 0;

// cache DOM
const gridEl = document.getElementById("fm-grid");
const statusEl = document.getElementById("fm-status");
const scoreEl = document.getElementById("fm-score");
const movesEl = document.getElementById("fm-moves");
const newGameBtn = document.getElementById("fm-newgame");

// --- HELPERS ---

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function inBounds(x, y) {
    return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
}

// --- BOARD GENERERING ---

function createEmptyBoard() {
    board = Array.from({ length: GRID_SIZE }, () =>
        Array.from({ length: GRID_SIZE }, () => null)
    );
}

function randomBaseFruitIndex() {
    return randInt(0, BASE_FRUIT_COUNT - 1);
}

function fillBoardWithRandomFruits() {
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            board[y][x] = {
                fruitIndex: randomBaseFruitIndex(),
                leafLayers: 0
            };
        }
    }
}

function placeRandomLeaves() {
    const totalCells = GRID_SIZE * GRID_SIZE;
    const leafCellsCount = randInt(LEAF_CELLS_MIN, LEAF_CELLS_MAX);

    const indices = Array.from({ length: totalCells }, (_, i) => i);
    // shuffle
    for (let i = indices.length - 1; i > 0; i--) {
        const j = randInt(0, i);
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    let placed = 0;
    for (let idx of indices) {
        if (placed >= leafCellsCount) break;
        const x = idx % GRID_SIZE;
        const y = Math.floor(idx / GRID_SIZE);

        const cell = board[y][x];
        if (!cell) continue;

        cell.leafLayers = randInt(LEAF_LAYERS_MIN, LEAF_LAYERS_MAX);
        placed++;
    }
}

// Sjekk om brettet har minst ett mulig trekk
function hasAnyMove() {
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const cell = board[y][x];
            if (!cell || cell.leafLayers > 0) continue;

            // åtte retninger
            const dirs = [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
                [1, 1],
                [-1, -1],
                [1, -1],
                [-1, 1]
            ];

            for (const [dx, dy] of dirs) {
                let cx = x + dx;
                let cy = y + dy;
                let blocked = false;

                while (inBounds(cx, cy)) {
                    const other = board[cy][cx];
                    if (other && other.leafLayers === 0) {
                        // fant frukt, sjekk om samme type
                        if (other.fruitIndex === cell.fruitIndex && !blocked) {
                            return true;
                        } else {
                            break;
                        }
                    } else if (other && other.leafLayers > 0) {
                        blocked = true;
                    }
                    cx += dx;
                    cy += dy;
                }
            }
        }
    }
    return false;
}

function generateNewBoard() {
    createEmptyBoard();

    let attempts = 0;
    do {
        fillBoardWithRandomFruits();
        placeRandomLeaves();
        attempts++;
        if (attempts > 30) break; // gi opp, bare bruk siste versjon
    } while (!hasAnyMove());
}

// --- RENDER ---

function renderBoard(highlightMerged = null, leafHits = []) {
    gridEl.innerHTML = "";

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const cellData = board[y][x];
            const cell = document.createElement("div");
            cell.className = "fm-cell";
            cell.dataset.x = String(x);
            cell.dataset.y = String(y);

            if (
                selectedCell &&
                selectedCell.x === x &&
                selectedCell.y === y &&
                cellData &&
                cellData.leafLayers === 0
            ) {
                cell.classList.add("fm-cell--selected");
            }

            if (
                highlightMerged &&
                highlightMerged.x === x &&
                highlightMerged.y === y
            ) {
                cell.classList.add("fm-cell--merged");
            }

            if (cellData) {
                const fruitImg = document.createElement("img");
                fruitImg.className = "fm-fruit";
                fruitImg.src = `img/${FRUITS[cellData.fruitIndex]}.png`;
                fruitImg.alt = FRUITS[cellData.fruitIndex];

                if (cellData.leafLayers > 0) {
                    fruitImg.classList.add("fm-fruit--hidden");
                }

                cell.appendChild(fruitImg);

                if (cellData.leafLayers > 0) {
                    const leafWrap = document.createElement("div");
                    leafWrap.className = "fm-leaf-wrap";

                    const leafImg = document.createElement("img");
                    leafImg.className = "fm-leaf";
                    leafImg.src = "img/leaf.png";
                    leafImg.alt = "leaf";

                    const count = document.createElement("span");
                    count.className = "fm-leaf-count";
                    count.textContent = String(cellData.leafLayers);

                    leafWrap.appendChild(leafImg);
                    leafWrap.appendChild(count);

                    // hvis denne cellen er truffet, gi liten animasjon
                    if (leafHits.some((p) => p.x === x && p.y === y)) {
                        leafWrap.classList.add("fm-leaf-hit");
                    }

                    cell.appendChild(leafWrap);
                }
            }

            gridEl.appendChild(cell);
        }
    }

    scoreEl.textContent = String(score);
    movesEl.textContent = String(moves);
}

// --- LOGIKK: MATCH & MERGE ---

function cellsInLine(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    if (dx === 0 && dy === 0) return null;

    // sjekk om rett linje (hor/vert/diag)
    if (!(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) {
        return null;
    }

    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const length = Math.max(Math.abs(dx), Math.abs(dy));

    const between = [];
    let cx = a.x + stepX;
    let cy = a.y + stepY;

    for (let i = 1; i < length; i++) {
        between.push({ x: cx, y: cy });
        cx += stepX;
        cy += stepY;
    }

    return between;
}

function pathIsClear(a, b) {
    const between = cellsInLine(a, b);
    if (between === null) return false;

    for (const p of between) {
        const cell = board[p.y][p.x];
        if (cell && cell.leafLayers === 0) {
            // frukt blokkerer
            return false;
        }
        if (cell && cell.leafLayers > 0) {
            // blad blokkerer også
            return false;
        }
    }
    return true;
}

function applyGravity() {
    for (let x = 0; x < GRID_SIZE; x++) {
        const column = [];
        for (let y = GRID_SIZE - 1; y >= 0; y--) {
            if (board[y][x]) column.push(board[y][x]);
        }

        let y = GRID_SIZE - 1;
        for (const cell of column) {
            board[y][x] = cell;
            y--;
        }
        while (y >= 0) {
            board[y][x] = null;
            y--;
        }
    }
}

function spawnNewFruitsAtTop() {
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (!board[y][x]) {
                board[y][x] = {
                    fruitIndex: randomBaseFruitIndex(),
                    leafLayers: 0
                };
            }
        }
    }
}

// reduser blad-lag rundt en gitt posisjon
function shakeLeavesAround(x, y) {
    const hits = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (!inBounds(nx, ny)) continue;

            const cell = board[ny][nx];
            if (cell && cell.leafLayers > 0) {
                cell.leafLayers -= 1;
                hits.push({ x: nx, y: ny });
                if (cell.leafLayers < 0) cell.leafLayers = 0;
            }
        }
    }
    return hits;
}

function tryMerge(a, b) {
    const cellA = board[a.y][a.x];
    const cellB = board[b.y][b.x];

    if (!cellA || !cellB) {
        statusEl.textContent = "Empty cell.";
        return;
    }
    if (cellA.leafLayers > 0 || cellB.leafLayers > 0) {
        statusEl.textContent = "You cannot merge covered fruits.";
        return;
    }
    if (cellA.fruitIndex !== cellB.fruitIndex) {
        statusEl.textContent = "Fruits must be identical.";
        return;
    }
    if (!pathIsClear(a, b)) {
        statusEl.textContent = "Line must be clear between the fruits.";
        return;
    }

    // gjør merge: legg ny frukt i den andre cellen (b)
    const newIndex = Math.min(cellA.fruitIndex + 1, FRUITS.length - 1);
    const mergePos = { x: b.x, y: b.y };

    board[a.y][a.x] = null;
    board[b.y][b.x] = {
        fruitIndex: newIndex,
        leafLayers: 0
    };

    // score – litt mer for høyere nivå
    const baseScore = 10 + newIndex * 5;
    score += baseScore;
    moves += 1;

    // “ryst” blader rundt merge-pos
    const leafHits = shakeLeavesAround(mergePos.x, mergePos.y);

    // gravity og spawn
    applyGravity();
    spawnNewFruitsAtTop();

    selectedCell = null;
    statusEl.textContent = "";
    renderBoard(mergePos, leafHits);
}

// --- INPUT ---

function handleCellClick(event) {
    const cellEl = event.target.closest(".fm-cell");
    if (!cellEl) return;

    const x = Number(cellEl.dataset.x);
    const y = Number(cellEl.dataset.y);
    const cell = board[y][x];

    if (!cell || cell.leafLayers > 0) {
        // kan ikke velge tom eller dekket celle
        return;
    }

    if (!selectedCell) {
        selectedCell = { x, y };
        statusEl.textContent = "Pick another matching fruit in a straight, clear line.";
        renderBoard();
        return;
    }

    // klikket samme → avbryt
    if (selectedCell.x === x && selectedCell.y === y) {
        selectedCell = null;
        statusEl.textContent = "";
        renderBoard();
        return;
    }

    const other = { x, y };
    const prev = selectedCell;
    selectedCell = null;

    tryMerge(prev, other);
}

// --- NEW GAME / INIT ---

function newGame() {
    score = 0;
    moves = 0;
    selectedCell = null;
    statusEl.textContent = "";
    generateNewBoard();
    renderBoard();
}

gridEl.addEventListener("click", handleCellClick);
newGameBtn.addEventListener("click", newGame);

window.addEventListener("DOMContentLoaded", () => {
    newGame();
});
