// Monochrome LCD renderer: every pixel is drawn by hand on a 2D canvas so the
// panel keeps the flat, printed look of a 1997 handset screen. No dependencies,
// no WebGL, no build step.

const COLS = 21;
const ROWS = 21;

// Four tones only, as the reference demands: light LCD, grid, ink, deep ink.
const LCD_LIGHT = "#b1be96";
const LCD_BASE = "#a6b48b";
const LCD_EDGE = "#9aa87f";
const GRID_LINE = "#9dab81";
const INK = "#252e1c";

// Fruit drawn as an 8 x 8 stamp: round body, stem leaning up and to the right.
const FRUIT = [
  ".....#..",
  "....#...",
  "..####..",
  ".######.",
  "########",
  "########",
  ".######.",
  "..####..",
];

// 5 x 7 bitmap font, only the glyphs the HUD actually prints.
const FONT = {
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  "C": [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "R": ["####.", "#...#", "#...#", "####.", "#..#.", "#...#", "#...#"],
  "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  "0": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
};

const HI_STORAGE_KEY = "cobrao.hi";

// The server has no food yet, so the fruit is decorative until snapshots carry one.
const PLACEHOLDER_FOOD = { x: 15, y: 6 };

export function createArena(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const noise = buildNoiseTile();
  let noisePattern = ctx.createPattern(noise, "repeat");
  let layout = null;
  let game = null;
  let disposed = false;
  let hiScore = readHiScore();

  function render() {
    if (disposed || !layout) return;
    const { width, height, cell, arenaX, arenaY, arenaSize, border, fontPx, hudY, gridPx } = layout;

    // Passive LCD: uneven, matte lighting instead of an even backlit surface.
    const glow = ctx.createRadialGradient(width * 0.42, height * 0.34, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.8);
    glow.addColorStop(0, LCD_LIGHT);
    glow.addColorStop(0.55, LCD_BASE);
    glow.addColorStop(1, LCD_EDGE);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // Barely-there grain keeps the panel from reading as a flat digital fill.
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = noisePattern;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;

    const score = currentScore();
    if (score > hiScore) {
      hiScore = score;
      writeHiScore(hiScore);
    }
    ctx.fillStyle = INK;
    drawText(ctx, "SCORE " + pad(score), arenaX, hudY, fontPx);
    const hi = "HI " + pad(hiScore);
    drawText(ctx, hi, arenaX + arenaSize - textWidth(hi, fontPx), hudY, fontPx);

    // Playfield border: four solid bars, so nothing lands on a half pixel.
    ctx.fillRect(arenaX, arenaY, arenaSize, border);
    ctx.fillRect(arenaX, arenaY + arenaSize - border, arenaSize, border);
    ctx.fillRect(arenaX, arenaY, border, arenaSize);
    ctx.fillRect(arenaX + arenaSize - border, arenaY, border, arenaSize);

    const originX = arenaX + border;
    const originY = arenaY + border;
    ctx.fillStyle = GRID_LINE;
    for (let i = 1; i < COLS; i++) ctx.fillRect(originX + i * cell, originY, gridPx, cell * ROWS);
    for (let i = 1; i < ROWS; i++) ctx.fillRect(originX, originY + i * cell, cell * COLS, gridPx);

    ctx.fillStyle = INK;
    const food = game?.food ?? PLACEHOLDER_FOOD;
    drawFruit(ctx, originX + food.x * cell, originY + food.y * cell, cell);

    const body = game?.snake?.body ?? [];
    const inset = Math.max(1, Math.round(cell * 0.07));
    for (const part of body) {
      ctx.fillRect(originX + part.x * cell + inset, originY + part.y * cell + inset, cell - inset * 2, cell - inset * 2);
    }
    if (body.length) drawEyes(ctx, originX + body[0].x * cell, originY + body[0].y * cell, cell, game.snake.direction);
  }

  function currentScore() {
    if (typeof game?.score === "number") return game.score;
    return Math.max(0, (game?.snake?.body?.length ?? 3) - 3);
  }

  function measure() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    canvas.width = width;
    canvas.height = height;
    ctx.imageSmoothingEnabled = false;
    noisePattern = ctx.createPattern(noise, "repeat");

    // Cells must be whole pixels and perfectly square, so the grid never wobbles.
    const margin = Math.round(Math.min(width, height) * 0.055);
    const cell = Math.max(3, Math.floor(Math.min((width - margin * 2) / (COLS + 0.4), (height - margin * 2) / (ROWS + 2.5))));
    const border = Math.max(2, Math.round(cell * 0.22));
    const arenaSize = cell * COLS + border * 2;
    const fontPx = Math.max(1, Math.round((cell * 1.3) / 7));
    const hudHeight = fontPx * 7;
    const gap = Math.round(cell * 0.95);
    const top = Math.round((height - (hudHeight + gap + arenaSize)) / 2);
    layout = {
      width,
      height,
      cell,
      border,
      arenaSize,
      fontPx,
      arenaX: Math.round((width - arenaSize) / 2),
      arenaY: top + hudHeight + gap,
      hudY: top,
      gridPx: Math.max(1, Math.round(dpr)),
    };
    render();
  }

  const observer = new ResizeObserver(measure);
  observer.observe(canvas.parentElement);
  document.addEventListener("visibilitychange", render);
  measure();

  return {
    drawGame(next) {
      game = next;
      render();
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", render);
    },
  };
}

function drawText(ctx, text, x, y, px) {
  let cursor = x;
  for (const char of text.toUpperCase()) {
    const glyph = FONT[char] ?? FONT[" "];
    glyph.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] === "#") ctx.fillRect(cursor + rx * px, y + ry * px, px, px);
      }
    });
    cursor += px * 6;
  }
}

function textWidth(text, px) {
  return text.length * px * 6 - px;
}

function pad(value) {
  return String(Math.min(999, Math.max(0, Math.round(value)))).padStart(3, "0");
}

function drawFruit(ctx, x, y, cell) {
  const px = Math.max(1, Math.floor(cell / 8));
  const offset = Math.round((cell - px * 8) / 2);
  FRUIT.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      if (row[rx] === "#") ctx.fillRect(x + offset + rx * px, y + offset + ry * px, px, px);
    }
  });
}

// Eyes are holes punched in the head block, pushed toward the travel direction.
function drawEyes(ctx, x, y, cell, direction) {
  const dx = direction?.x ?? 1;
  const dy = direction?.y ?? 0;
  const size = Math.max(1, Math.round(cell * 0.16));
  const center = cell / 2 - size / 2;
  const forward = cell * 0.2;
  const side = cell * 0.19;
  ctx.fillStyle = LCD_BASE;
  for (const sign of [-1, 1]) {
    ctx.fillRect(
      Math.round(x + center + dx * forward - dy * side * sign),
      Math.round(y + center + dy * forward + dx * side * sign),
      size,
      size,
    );
  }
  ctx.fillStyle = INK;
}

function buildNoiseTile() {
  const tile = document.createElement("canvas");
  tile.width = tile.height = 96;
  const tileCtx = tile.getContext("2d");
  const image = tileCtx.createImageData(96, 96);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.random() < 0.5 ? 20 : 235;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
    image.data[i + 3] = Math.random() * 255;
  }
  tileCtx.putImageData(image, 0, 0);
  return tile;
}

function readHiScore() {
  try {
    return Number(localStorage.getItem(HI_STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeHiScore(value) {
  try {
    localStorage.setItem(HI_STORAGE_KEY, String(value));
  } catch {
    // Private mode: the high score simply does not survive the session.
  }
}
