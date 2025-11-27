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
  'fruit_banana',
  'fruit_pear',
  'fruit_mango',
  'fruit_orange',
  'fruit_apple',
  'fruit_blueberry',
  'fruit_grape',
  'fruit_kiwi',
  'fruit_lemon',
  'fruit_cherry',
  'fruit_pineapple',
  'fruit_plum',
  'fruit_raspberry',
  'fruit_strawberry',
  'fruit_watermelon',
];

// Sannsynlighet for at en ny celle blir blad i stedet for frukt
const LEAF_PROBABILITY = 0.12;

// Scoring configuration
const MERGE_POINTS_BASE = 10; // points per merge: MERGE_POINTS_BASE * (newLevel + 1)
const TARGET_BONUS_BASE = 300; // base bonus for hitting target fruit
const TARGET_BONUS_PER_LEVEL = 200; // additional per fruit level

// --- STATE ---

// grid[r][c] = null | { kind: 'fruit', level: number } | { kind: 'leaf' }
let grid = [];
let score = 0;
let moves = 0;
let selected = null; // { row, col } eller null
let gameOver = false;
let hintPair = null; // { from:{row,col}, to:{row,col} }
let refillCounter = 0; // count refills triggered by no-merge states
let jars = []; // [{id,col,startRow,height,targetLevel}]
let fxQueue = []; // queued UI effects
// --- DOM ---

const boardEl = document.getElementById('fm-board');
const scoreEl = document.getElementById('fm-score');
const movesEl = document.getElementById('fm-moves');
const newBtn = document.getElementById('fm-new');
const hintBtn = document.getElementById('fm-hint');
const targetEl = document.getElementById('fm-target');
const chartEl = document.getElementById('fm-merge-chart');

// Target / bonus system (progressive: starts low, increases gradually)
let targetLevel = null;
let targetFloor = 1; // lower bound for target level window (pear and up)
let targetCeil = 4; // upper bound for target level window
function pickNewTarget() {
  const min = Math.max(0, Math.min(targetFloor, FRUITS.length - 1));
  const max = Math.max(min, Math.min(targetCeil, FRUITS.length - 1));
  targetLevel = randInt(min, max);
}

// ====================
// HJELPERE
// ====================

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createRandomFruit() {
  const level = randInt(0, 5); // start kun med de første nivåene for å ikke spamme høye frukter
  return { kind: 'fruit', level };
}

function createRandomCell() {
  if (Math.random() < LEAF_PROBABILITY) {
    return { kind: 'leaf', hp: randInt(1, 4) };
  }
  return createRandomFruit();
}

function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

function fruitDisplayName(level) {
  const key = FRUITS[level] || '';
  const raw = key.replace(/^fruit_/, '');
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
}

// ====================
// INITIALISERING
// ====================

function initGrid() {
  grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      // Startbrett: tillat også noen blader
      row.push(createRandomCell());
    }
    grid.push(row);
  }
}

// ====================
// RENDERING
// ====================

function renderGrid() {
  boardEl.innerHTML = '';

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cellData = grid[r][c];
      const cell = document.createElement('div');
      cell.className = 'fm-cell';
      cell.dataset.row = r.toString();
      cell.dataset.col = c.toString();

      if (!cellData) {
        cell.classList.add('fm-cell--empty');
      } else if (cellData.kind === 'leaf') {
        const img = document.createElement('img');
        img.src = 'img/leaf.png';
        img.alt = 'leaf';
        img.className = 'fm-leaf-img';
        cell.appendChild(img);
        const hp = document.createElement('span');
        hp.className = 'fm-leaf-hp';
        hp.textContent = String(cellData.hp || 1);
        cell.appendChild(hp);
      } else if (cellData.kind === 'fruit') {
        const sprite = FRUITS[cellData.level] || FRUITS[FRUITS.length - 1];
        const img = document.createElement('img');
        img.src = `img/${sprite}.png`;
        img.alt = sprite;
        img.className = 'fm-fruit-img';
        cell.appendChild(img);
      } else if (cellData.kind === 'lock') {
        // Render as locked empty space; no per-cell overlay now (handled by stack overlay)
      }

      if (selected && selected.row === r && selected.col === c) {
        cell.classList.add('fm-cell--selected');
      }

      if (
        hintPair &&
        ((hintPair.from.row === r && hintPair.from.col === c) ||
          (hintPair.to.row === r && hintPair.to.col === c))
      ) {
        cell.classList.add('fm-cell--hint');
      }

      boardEl.appendChild(cell);
    }
  }

  scoreEl.textContent = score.toString();
  movesEl.textContent = moves.toString();

  // Update target display if present
  if (typeof targetEl !== 'undefined' && targetEl) {
    if (typeof targetLevel === 'number') {
      const lvl = Math.min(targetLevel, FRUITS.length - 1);
      const sprite = FRUITS[lvl] || FRUITS[FRUITS.length - 1];
      const name = fruitDisplayName(lvl);
      targetEl.innerHTML = `Target: <img src="img/${sprite}.png" alt="target" class="fm-target-img"> ${name} (L${lvl})`;
    } else {
      targetEl.textContent = '';
    }
  }

  // Build/refresh merge chart (static based on FRUITS)
  renderMergeChart();
  // After cells: render multi-cell jar stacks
  renderJarStacks();
  // Render queued UI effects (bonus popups)
  renderEffects();
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
      if (cell && cell.kind === 'leaf') {
        // decrement HP, remove only when hp <=0
        cell.hp = typeof cell.hp === 'number' ? cell.hp - 1 : 0;
        if (cell.hp <= 0) {
          grid[nr][nc] = null;
        }
      }
    }
  }
}

// ====================
// REFILL
// ====================

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

// Build a small visual chart of the upgrade path
function renderMergeChart() {
  if (!chartEl) return;
  // Only rebuild if empty to avoid unnecessary DOM work
  if (chartEl.dataset.built === '1') return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < FRUITS.length; i++) {
    const item = document.createElement('span');
    item.className = 'fm-chart-item';
    const img = document.createElement('img');
    img.src = `img/${FRUITS[i]}.png`;
    img.alt = fruitDisplayName(i) || FRUITS[i];
    img.className = 'fm-chart-img';
    item.appendChild(img);
    const label = document.createElement('span');
    const name = fruitDisplayName(i);
    label.textContent = name ? name : `L${i}`;
    item.title = `${name || FRUITS[i]} (L${i})`;
    item.appendChild(label);
    frag.appendChild(item);
    if (i < FRUITS.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'fm-chart-arrow';
      arrow.textContent = '→';
      frag.appendChild(arrow);
    }
  }
  chartEl.innerHTML = '';
  chartEl.appendChild(frag);
  chartEl.dataset.built = '1';
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
    [-1, 1],
  ];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (!cell || cell.kind !== 'fruit') continue;

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
          if (other.kind === 'fruit' && other.level === cell.level) {
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
  // Any board interaction clears an active hint
  hintPair = null;
  const cell = grid[row][col];

  if (!selected) {
    // første valg
    if (!cell || cell.kind !== 'fruit' || cell.lockedBy) return; // kan ikke velge låste frukter
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
  if (
    !from ||
    !to ||
    from.kind !== 'fruit' ||
    to.kind !== 'fruit' ||
    from.lockedBy ||
    to.lockedBy
  ) {
    // restart seleksjon på ny celle hvis det er frukt
    if (cell && cell.kind === 'fruit') {
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

  // Destination is always the cell clicked last (r2,c2). Source becomes empty.
  const destRow = r2;
  const destCol = c2;
  const srcRow = r1;
  const srcCol = c1;

  const baseLevel = from.level; // samme som to.level
  const newLevel = Math.min(baseLevel + 1, FRUITS.length - 1);
  grid[destRow][destCol] = { kind: 'fruit', level: newLevel };
  grid[srcRow][srcCol] = null;

  // score – per merge
  score += MERGE_POINTS_BASE * (newLevel + 1);

  // Check target bonus
  if (typeof targetLevel === 'number' && newLevel === targetLevel) {
    const bonus = TARGET_BONUS_BASE + TARGET_BONUS_PER_LEVEL * newLevel;
    score += bonus;
    // Visual FX at merge destination
    queueFx(destRow, destCol, `+${bonus}`, true);
    // Progress the target difficulty window upwards gradually
    targetFloor = Math.min(targetFloor + 1, FRUITS.length - 5);
    targetCeil = Math.min(targetCeil + 1, FRUITS.length - 1);
    pickNewTarget();
  }

  // Fjern blader rundt både kilde og destinasjon (decrement hp)
  removeNeighborLeaves(srcRow, srcCol);
  removeNeighborLeaves(destRow, destCol);

  // Nullstill seleksjon før vi manipulerer mer
  selected = null;

  // Attempt to unlock a jar based on produced fruit and adjacency
  tryUnlockJarByFruit(destRow, destCol, newLevel);

  // Do NOT apply gravity. Only refill from top when no merges remain.
  if (!hasAnyMergeMove()) {
    // First refill the board so we have solid columns, then potentially place jars/keys
    refillFromTop();
    refillCounter += 1;
    if (refillCounter % 3 === 0) {
      spawnJars(1);
    }
  }

  // Game over-sjekk
  if (checkGameOver()) {
    gameOver = true;
    renderGrid();
    setTimeout(() => {
      alert('Game Over – no space left at the top and no more merges!');
    }, 10);
    return;
  }

  renderGrid();
}

// ====================
// SETUP
// ====================

boardEl.addEventListener('click', (e) => {
  const target = e.target.closest('.fm-cell');
  if (!target) return;
  const row = Number(target.dataset.row);
  const col = Number(target.dataset.col);
  if (!Number.isInteger(row) || !Number.isInteger(col)) return;
  handleCellClick(row, col);
});

newBtn.addEventListener('click', () => {
  startNewGame();
});

if (hintBtn) {
  hintBtn.addEventListener('click', () => {
    if (gameOver) return;
    const pair = findAnyMergePair();
    if (!pair) {
      alert('Ingen mulige merges akkurat nå.');
      return;
    }
    // Deduct points only when we actually show a hint
    score = Math.max(0, score - 300);
    hintPair = pair;
    selected = { row: pair.from.row, col: pair.from.col };
    renderGrid();
  });
}

function startNewGame() {
  score = 0;
  moves = 0;
  selected = null;
  gameOver = false;
  hintPair = null;
  fxQueue = [];
  refillCounter = 0;
  jars = [];
  nextJarId = 1;
  // Ensure a solvable start (at least one merge available), and start without leaves
  // to reduce early blockers. Retry a few times if necessary.
  let attempts = 0;
  do {
    initGrid();
    attempts++;
    if (attempts > 20) break; // fail-safe
  } while (!hasAnyMergeMove());
  // reset progressive target window
  targetFloor = 1;
  targetCeil = 4;
  if (typeof pickNewTarget === 'function') pickNewTarget();
  else targetLevel = null;
  renderGrid();
}

// start første spillet
startNewGame();

// Finn og returner en gyldig merge (første funn)
function findAnyMergePair() {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
    [-1, 0],
    [0, -1],
    [-1, -1],
    [-1, 1],
  ];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (!cell || cell.kind !== 'fruit') continue;
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
          if (other.kind === 'fruit' && other.level === cell.level) {
            return { from: { row: r, col: c }, to: { row: rr, col: cc } };
          }
          break;
        }
      }
    }
  }
  return null;
}

// ====================
// UI EFFECTS
// ====================
function queueFx(row, col, text, big = false) {
  fxQueue.push({ row, col, text, big });
}

// ====================
// JARS & KEY
// ====================
function spawnJars(count) {
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < 200) {
    attempts++;
    const col = randInt(0, COLS - 1);
    const start = randInt(0, ROWS - 2);
    // need 2 consecutive cells which can be locked (fruit or empty), and not already locked
    let ok = true;
    for (let i = 0; i < 2; i++) {
      const cellCandidate = grid[start + i][col];
      if (cellCandidate && (cellCandidate.kind !== 'fruit' || cellCandidate.lockedBy)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const id = nextJarId++;
    const tLevel = randInt(1, Math.min(FRUITS.length - 3, 6));
    jars.push({ id, col, startRow: start, height: 2, targetLevel: tLevel });
    for (let i = 0; i < 2; i++) {
      const cell = grid[start + i][col];
      if (cell && cell.kind === 'fruit') {
        cell.lockedBy = id;
      } else {
        grid[start + i][col] = { kind: 'lock', lockedBy: id };
      }
    }
    placed++;
  }
}

function renderJarStacks() {
  // remove previous overlays
  const old = boardEl.querySelectorAll('.fm-jar-stack');
  old.forEach((el) => el.remove());
  for (const jar of jars) {
    const topCell = boardEl.querySelector(
      `.fm-cell[data-row="${jar.startRow}"][data-col="${jar.col}"]`
    );
    const bottomCell = boardEl.querySelector(
      `.fm-cell[data-row="${jar.startRow + jar.height - 1}"][data-col="${jar.col}"]`
    );
    if (!topCell || !bottomCell) continue;
    const stack = document.createElement('div');
    stack.className = 'fm-jar-stack';
    // position
    const topRect = topCell.getBoundingClientRect();
    const bottomRect = bottomCell.getBoundingClientRect();
    const boardRect = boardEl.getBoundingClientRect();
    const padding = 0; // we rely on absolute inside board
    const x = topRect.left - boardRect.left + padding;
    const y = topRect.top - boardRect.top + padding;
    const width = topRect.width;
    const height = bottomRect.bottom - topRect.top;
    stack.style.left = `${x}px`;
    stack.style.top = `${y}px`;
    stack.style.width = `${width}px`;
    stack.style.height = `${height}px`;
    // Use PNG image to render the jar stretched across the segment
    const img = document.createElement('img');
    img.className = 'fm-jar-stack-img';
    img.src = 'img/glass.png';
    img.alt = 'jar';
    stack.appendChild(img);
    // Show required fruit badge for unlocking
    if (typeof jar.targetLevel === 'number') {
      const badge = document.createElement('img');
      badge.className = 'fm-jar-target';
      const sprite = FRUITS[Math.min(jar.targetLevel, FRUITS.length - 1)];
      badge.src = `img/${sprite}.png`;
      badge.alt = 'target fruit';
      stack.appendChild(badge);
    }
    boardEl.appendChild(stack);
  }
}

function unlockOneJar() {
  if (!jars.length) return;
  // unlock the oldest jar
  const jar = jars.shift();
  for (let i = 0; i < jar.height; i++) {
    const cell = grid[jar.startRow + i][jar.col];
    if (cell) {
      if (cell.kind === 'fruit' && cell.lockedBy === jar.id) {
        delete cell.lockedBy;
      } else if (cell.kind === 'lock' && cell.lockedBy === jar.id) {
        // free locked empty cell
        grid[jar.startRow + i][jar.col] = null;
      }
    }
  }
}

// Unlock a jar if a merge produced its target fruit adjacent to the jar segment
function tryUnlockJarByFruit(destRow, destCol, producedLevel) {
  for (let j = 0; j < jars.length; j++) {
    const jar = jars[j];
    if (producedLevel !== jar.targetLevel) continue;
    // check adjacency to any of the jar's cells
    for (let i = 0; i < jar.height; i++) {
      const r = jar.startRow + i;
      const c = jar.col;
      if (Math.abs(r - destRow) <= 1 && Math.abs(c - destCol) <= 1) {
        // unlock this specific jar
        const unlockedJar = jars.splice(j, 1)[0];
        for (let k = 0; k < unlockedJar.height; k++) {
          const cr = unlockedJar.startRow + k;
          const cc = unlockedJar.col;
          const cell = grid[cr][cc];
          if (cell) {
            if (cell.kind === 'fruit' && cell.lockedBy === unlockedJar.id) {
              delete cell.lockedBy;
            } else if (cell.kind === 'lock' && cell.lockedBy === unlockedJar.id) {
              grid[cr][cc] = null;
            }
          }
        }
        return true;
      }
    }
  }
  return false;
}

function renderEffects() {
  if (!fxQueue.length) return;
  const items = fxQueue.slice();
  fxQueue = [];
  for (const fx of items) {
    const sel = `.fm-cell[data-row="${fx.row}"][data-col="${fx.col}"]`;
    const cellEl = boardEl.querySelector(sel);
    if (!cellEl) continue;
    cellEl.style.position = 'relative';
    const el = document.createElement('span');
    el.className = 'fm-fx-bonus' + (fx.big ? ' fm-fx-bonus--big' : '');
    el.textContent = fx.text;
    cellEl.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
}
