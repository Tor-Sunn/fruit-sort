// ==========================
// Fruit Merge – game.js
// 9×9 grid, fruit merge + leaves
// ==========================

// --- CONFIG ---

const ROWS = 9;
const COLS = 9;

// Frukttypene dine (nivåer).
// Bildene må ligge i ./img som vist i skjermbildet ditt.
const FRUITS = [
    "fruit_banana",
    "fruit_pear",
    "fruit_mango",
    "fruit_orange",
    "fruit_apple",
    "fruit_blueberry",
    "fruit_grape",
    "fruit_kiwi",
    "fruit_lemon",
    "fruit_cherry",
    "fruit_pineapple",
    "fruit_plum",
    "fruit_raspberry",
    "fruit_strawberry",
    "fruit_watermelon"
];

// Sannsynlighet for at en ny celle blir blad i stedet for frukt
const LEAF_PROBABILITY = 0.12;

// --- STATE ---

// grid[r][c] = null | { kind: 'fruit', level: number } | { kind: 'leaf' }
let grid = [];
let score = 0;
let moves = 0;
let selected = null; // { row, col } eller null
let gameOver = false;

// --- DOM ---

const boardEl = document.getElementById("fm-board");
const scoreEl = document.getElementById("fm-score");
const movesEl = document.getElementById("fm-moves");
const newBtn = document.getElementById("fm-new");

// ====================
// HJELPERE
// ====================

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createRandomFruit() {
    const level = randInt(0, 5); // start kun med de første nivåene for å ikke spamme høye frukter
    return { kind: "fruit", level };
}

function createRandomCell() {
    if (Math.random() < LEAF_PROBABILITY) {
        return { kind: "leaf" };
    }
    return createRandomFruit();
}

function inBounds(r, c) {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

// ====================
// INITIALISERING
// ====================

function initGrid() {
    grid = [];
    for (let r = 0; r < ROWS; r++) {
        const row = [];
        for (let c = 0; c < COLS; c++) {
            row.push(createRandomFruit());
        }
        grid.push(row);
    }
}

// ====================
// RENDERING
// ====================

function renderGrid() {
    boardEl.innerHTML = "";

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cellData = grid[r][c];
            const cell = document.createElement("div");
            cell.className = "fm-cell";
            cell.dataset.row = r.toString();
            cell.dataset.col = c.toString();

            if (!cellData) {
                cell.classList.add("fm-cell--empty");
            } else if (cellData.kind === "leaf") {
                const img = document.createElement("img");
                img.src = "img/leaf.png";
                img.alt = "leaf";
                img.className = "fm-leaf-img";
                cell.appendChild(img);
            } else if (cellData.kind === "fruit") {
                const sprite = FRUITS[cellData.level] || FRUITS[FRUITS.length - 1];
                const img = document.createElement("img");
                img.src = `img/${sprite}.png`;
                img.alt = sprite;
                img.className = "fm-fruit-img";
                cell.appendChild(img);
            }

            if (selected && selected.row === r && selected.col === c) {
                cell.classList.add("fm-cell--selected");
            }

            boardEl.appendChild(cell);
        }
    }

    scoreEl.textContent = score.toString();
    movesEl.textContent = moves.toString();
}

// ====================
// MERGE-LOGIKK
// ====================

function cellsAligned(r1, c1, r2, c2) {
    const dr = r2 - r1;
    const dc = r2 === r1 && c2 === c1 ? 0 : c2 - c1;
    if (dr === 0 && dc === 0) return false;
    // rett linje: horis, vert, diagonal
    if (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)) {
        return true;
    }
    return false;
}

function pathClear(r1, c1, r2, c2) {
    const dr = Math.sign(r2 - r1);
    const dc = Math.sign(c2 - c1);
    let r = r1 + dr;
    let c = c1 + dc;
    while (!(r === r2 && c === c2)) {
        if (grid[r][c] !== null) {
            return false;
        }
        r += dr;
        c += dc;
    }
    return true;
}

function removeNeighborLeaves(row, col) {
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr;
            const nc = col + dc;
            if (!inBounds(nr, nc)) continue;
            const cell = grid[nr][nc];
            if (cell && cell.kind === "leaf") {
                grid[nr][nc] = null;
            }
        }
    }
}

// ====================
// GRAVITASJON & REFILL
// ====================

function applyGravity() {
    for (let c = 0; c < COLS; c++) {
        const stack = [];
        // samle alle ikke-null i denne kolonnen
        for (let r = 0; r < ROWS; r++) {
            if (grid[r][c] !== null) {
                stack.push(grid[r][c]);
            }
        }
        // fyll nedover fra bunnen
        let r = ROWS - 1;
        for (let i = stack.length - 1; i >= 0; i--) {
            grid[r][c] = stack[i];
            r--;
        }
        // resten på toppen blir tomt
        for (; r >= 0; r--) {
            grid[r][c] = null;
        }
    }
}

// Fyll kun tomme celler i toppen av hver kolonne
function refillFromTop() {
    for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
            if (grid[r][c] === null) {
                grid[r][c] = createRandomCell();
            } else {
                // denne kolonnen er fylt fra toppen ned til første frukt/blad
                break;
            }
        }
    }
}

// ====================
// GAME OVER-DETEKSJON
// ====================

// Finnes det minst ett mulig merge-trekk?
function hasAnyMergeMove() {
    const dirs = [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
        [-1, 0],
        [0, -1],
        [-1, -1],
        [-1, 1]
    ];

    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = grid[r][c];
            if (!cell || cell.kind !== "fruit") continue;

            for (const [dr, dc] of dirs) {
                let rr = r + dr;
                let cc = c + dc;
                while (inBounds(rr, cc)) {
                    const other = grid[rr][cc];
                    if (other === null) {
                        rr += dr;
                        cc += dc;
                        continue;
                    }
                    // første ting vi møter
                    if (other.kind === "fruit" && other.level === cell.level) {
                        return true;
                    }
                    break; // blokkert av feil frukt eller blad
                }
            }
        }
    }
    return false;
}

// Topp rad helt full + ingen mulige merges = game over
function checkGameOver() {
    let topFull = true;
    for (let c = 0; c < COLS; c++) {
        if (grid[0][c] === null) {
            topFull = false;
            break;
        }
    }
    if (!topFull) return false;
    if (hasAnyMergeMove()) return false;
    return true;
}

// ====================
// INTERAKSJON
// ====================

function handleCellClick(row, col) {
    if (gameOver) return;
    const cell = grid[row][col];

    if (!selected) {
        // første valg
        if (!cell || cell.kind !== "fruit") return;
        selected = { row, col };
        renderGrid();
        return;
    }

    // klikk på samme = avvelg
    if (selected.row === row && selected.col === col) {
        selected = null;
        renderGrid();
        return;
    }

    const from = grid[selected.row][selected.col];
    const to = grid[row][col];

    // kun frukt-til-frukt merge
    if (!from || !to || from.kind !== "fruit" || to.kind !== "fruit") {
        // restart seleksjon på ny celle hvis det er frukt
        if (cell && cell.kind === "fruit") {
            selected = { row, col };
            renderGrid();
        } else {
            selected = null;
            renderGrid();
        }
        return;
    }

    const r1 = selected.row;
    const c1 = selected.col;
    const r2 = row;
    const c2 = col;

    if (!cellsAligned(r1, c1, r2, c2) || !pathClear(r1, c1, r2, c2)) {
        // ugyldig trekk – flytt markering til ny celle
        selected = { row, col };
        renderGrid();
        return;
    }

    if (from.level !== to.level) {
        selected = { row, col };
        renderGrid();
        return;
    }

    // Gyldig merge!
    moves++;

    // Finn destinasjon (den "nederste" / lengst til høyre)
    let destRow = r1;
    let destCol = c1;
    let srcRow = r2;
    let srcCol = c2;

    if (r2 > r1 || (r2 === r1 && c2 > c1)) {
        destRow = r2;
        destCol = c2;
        srcRow = r1;
        srcCol = c1;
    }

    const baseLevel = from.level; // samme som to.level
    const newLevel = Math.min(baseLevel + 1, FRUITS.length - 1);
    grid[destRow][destCol] = { kind: "fruit", level: newLevel };
    grid[srcRow][srcCol] = null;

    // score – enkelt: 10 * (nivå+1)
    score += 10 * (newLevel + 1);

    // Fjern blader rundt den nye frukten
    removeNeighborLeaves(destRow, destCol);

    // Nullstill seleksjon før vi manipulerer mer
    selected = null;

    // Gravitasjon + refill
    applyGravity();
    refillFromTop();

    // Game over-sjekk
    if (checkGameOver()) {
        gameOver = true;
        renderGrid();
        setTimeout(() => {
            alert("Game Over – no space left at the top and no more merges!");
        }, 10);
        return;
    }

    renderGrid();
}

// ====================
// SETUP
// ====================

boardEl.addEventListener("click", (e) => {
    const target = e.target.closest(".fm-cell");
    if (!target) return;
    const row = Number(target.dataset.row);
    const col = Number(target.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) return;
    handleCellClick(row, col);
});

newBtn.addEventListener("click", () => {
    startNewGame();
});

function startNewGame() {
    score = 0;
    moves = 0;
    selected = null;
    gameOver = false;
    initGrid();
    renderGrid();
}

// start første spillet
startNewGame();
