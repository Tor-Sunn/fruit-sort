// =====================
// Fruit Merge – Prototype V1
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
// leaf block
const LEAF = "leaf";

// grid[row][col] = { type: "fruit_...", leafHits?: number }
let grid = [];
let selected = null;

let score = 0;
let moves = 0;

// ----------------------------
// DOM
// ----------------------------
const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("score");
const movesEl = document.getElementById("moves");
document.getElementById("newgame").onclick = newGame;

// ----------------------------
// Init
// ----------------------------
function newGame() {
    grid = [];
    score = 0;
    moves = 0;
    updateStats();

    // populate grid randomly with fruits and occasional leaves
    for (let r = 0; r < ROWS; r++) {
        grid[r] = [];
        for (let c = 0; c < COLS; c++) {
            const isLeaf = Math.random() < 0.06; // 6% leaf chance
            if (isLeaf) grid[r][c] = { type: LEAF, leafHits: 2 + Math.floor(Math.random() * 3) };
            else grid[r][c] = { type: FRUITS[Math.floor(Math.random() * FRUITS.length)] };
        }
    }

    render();
}

newGame();

// ----------------------------
// Rendering
// ----------------------------
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

            // selected outline
            if (selected && selected.r === r && selected.c === c) {
                cell.classList.add("selected");
            }

            cell.onclick = () => handleClick(r, c);
            boardEl.appendChild(cell);
        }
    }
}

// ----------------------------
// Interaction
// ----------------------------
function handleClick(r, c) {
    if (!selected) {
        selected = { r, c };
        render();
        return;
    }

    // same cell = cancel
    if (selected.r === r && selected.c === c) {
        selected = null;
        render();
        return;
    }

    attemptMerge(selected, { r, c });

    selected = null;
    render();
}

// ----------------------------
// Merge Logic
// ----------------------------
function attemptMerge(a, b) {
    const A = grid[a.r][a.c];
    const B = grid[b.r][b.c];

    if (A.type === LEAF || B.type === LEAF) return;
    if (A.type !== B.type) return;

    if (!isStraightLine(a, b)) return;
    if (!pathClear(a, b)) return;

    performMerge(a, b);
}

function isStraightLine(a, b) {
    return (
        a.r === b.r || // horizontal
        a.c === b.c || // vertical
        Math.abs(a.r - b.r) === Math.abs(a.c - b.c) // diagonal
    );
}

function pathClear(a, b) {
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

function performMerge(a, b) {
    const fruit = grid[a.r][a.c].type;
    const nextIndex = Math.min(FRUITS.length - 1, FRUITS.indexOf(fruit) + 1);
    const nextFruit = FRUITS[nextIndex];

    // remove top fruit
    grid[a.r][a.c] = { type: null };
    // overwritten: new fruit in bottom
    grid[b.r][b.c] = { type: nextFruit };

    score += 10 + nextIndex * 5;
    moves++;
    updateStats();

    applyGravity();
    refill();
    checkGameOver();
}

function updateStats() {
    scoreEl.textContent = `Score: ${score}`;
    movesEl.textContent = `Moves: ${moves}`;
}

// ----------------------------
// Gravity C-model
// ----------------------------
function applyGravity() {
    for (let c = 0; c < COLS; c++) {
        for (let r = ROWS - 2; r >= 0; r--) {
            if (!grid[r][c].type && grid[r + 1][c].type) {
                // fall down
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

// ----------------------------
// Refill only open columns
// ----------------------------
function refill() {
    for (let c = 0; c < COLS; c++) {
        if (grid[0][c].type) continue; // blocked

        // count empties from top before hit
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

// ----------------------------
// Game Over
// ----------------------------
function checkGameOver() {
    for (let c = 0; c < COLS; c++) {
        if (!grid[0][c].type) return; // at least 1 open
    }
    alert("Game Over – no space left at the top!");
}
