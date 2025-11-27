// =====================
// Fruit Merge – Prototype V1 (FIXED)
// =====================

// --- CONFIG ---
const ROWS = 9;
const COLS = 9;

const FRUITS = [
    "fruit_strawberry",
    "fruit_cherry",
    "fruit_apple",
    "fruit_pear",
    "fruit_kiwi",
    "fruit_lemon",
    "fruit_orange",
    "fruit_mango",
    "fruit_banana",
    "fruit_grape"
];

const LEAF = "leaf";

let grid = [];
let selected = null;

let score = 0;
let moves = 0;

// DOM
const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("score");
const movesEl = document.getElementById("moves");
document.getElementById("newgame").onclick = newGame;

// INITIALIZE
function newGame() {
    grid = [];
    score = 0;
    moves = 0;
    updateStats();

    for (let r = 0; r < ROWS; r++) {
        grid[r] = [];
        for (let c = 0; c < COLS; c++) {
            const isLeaf = Math.random() < 0.06;
            if (isLeaf) grid[r][c] = { type: LEAF, leafHits: 2 + Math.floor(Math.random() * 3) };
            else grid[r][c] = { type: FRUITS[Math.floor(Math.random() * FRUITS.length)] };
        }
    }

    render();
}

newGame();

// RENDER
function render() {
    boardEl.innerHTML = "";

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.dataset.r = r;
            cell.dataset.c = c;

            const item = grid[r][c];

            if (item.type === LEAF) {
                cell.classList.add("leaf");
                cell.dataset.hits = item.leafHits;
                const img = document.createElement("img");
                img.src = `img/${LEAF}.png`;
                cell.appendChild(img);
            } else if (item.type) {
                const img = document.createElement("img");
                img.src = `img/${item.type}.png`;
                cell.appendChild(img);
            }

            if (selected && selected.r === r && selected.c === c) {
                cell.classList.add("selected");
            }

            cell.onclick = () => handleClick(r, c);
            boardEl.appendChild(cell);
        }
    }
}

// INPUT
function handleClick(r, c) {
    if (!selected) {
        selected = { r, c };
        render();
        return;
    }

    if (selected.r === r && selected.c === c) {
        selected = null;
        render();
        return;
    }

    attemptMerge(selected, { r, c });

    selected = null;
    render();
}

// MERGE LOGIC
function attemptMerge(a, b) {
    const A = grid[a.r][a.c];
    const B = grid[b.r][b.c];

    if (A.type === LEAF || B.type === LEAF) return;
    if (A.type !== B.type) return;

    if (!isStraightLine(a, b)) return;
    if (!isPathClear(a, b)) return;

    performMerge(a, b);
}

function isStraightLine(a, b) {
    return (
        a.r === b.r ||
        a.c === b.c ||
        Math.abs(a.r - b.r) === Math.abs(a.c - b.c)
    );
}

function isPathClear(a, b) {
    const dr = Math.sign(b.r - a.r);
    const dc = Math.sign(b.c - a.c);

    let r = a.r + dr;
    let c = a.c + dc;

    while (r !== b.r || c !== b.c) {
        if (grid[r][c].type) return false;
        r += dr;
        c += dc;
    }
    return true;
}

// FIXED MERGE (gravity + refill order)
function performMerge(a, b) {
    const fruit = grid[a.r][a.c].type;
    const nextIndex = Math.min(FRUITS.length - 1, FRUITS.indexOf(fruit) + 1);
    const nextFruit = FRUITS[nextIndex];

    grid[a.r][a.c] = { type: null };
    grid[b.r][b.c] = { type: nextFruit };

    score += 10 + nextIndex * 5;
    moves++;
    updateStats();

    applyGravity();
    refill();
    applyGravity(); // NEW
    refill();       // NEW

    checkGameOver();
}
// etter merge (grid[row][col] = newFruit etc.)

if (checkGameOver()) {
    alert("Game Over – no space left at the top!");
    return;
}

// gravity → refill → render
applyGravity();
refillFromTop();
renderGrid();

function updateStats() {
    scoreEl.textContent = `Score: ${score}`;
    movesEl.textContent = `Moves: ${moves}`;
}

// GRAVITY
function applyGravity() {
    for (let c = 0; c < COLS; c++) {
        for (let r = ROWS - 2; r >= 0; r--) {
            if (!grid[r][c].type && grid[r + 1][c].type) {
                for (let rr = r; rr < ROWS - 1; rr++) {
                    if (!grid[rr + 1][c].type) {
                        grid[rr + 1][c] = grid[rr][c];
                        grid[rr][c] = { type: null };
                    }
                }
            }
        }
    }
}

// REFILL
function refill() {
    for (let c = 0; c < COLS; c++) {
        if (grid[0][c].type) continue;

        let empties = 0;
        for (let r = 0; r < ROWS; r++) {
            if (!grid[r][c].type) empties++;
            else break;
        }

        for (let k = 0; k < empties; k++) {
            if (Math.random() < 0.08)
                grid[k][c] = { type: LEAF, leafHits: 1 + Math.floor(Math.random() * 3) };
            else
                grid[k][c] = { type: FRUITS[Math.floor(Math.random() * FRUITS.length)] };
        }
    }
}

function checkGameOver() {
    // sjekk KUN toppraden
    for (let c = 0; c < COLS; c++) {
        if (grid[0][c] === null) {
            return false;   // minst EN ledig plass → ikke game over
        }
    }
    return true; // alle toppceller er FULL → game over
}
