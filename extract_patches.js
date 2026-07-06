const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const utils = require('/home/alecu/projects/catan_helper/src/import/canvas-utils.js');
const stageCenters = require('/home/alecu/projects/catan_helper/src/import/stage-centers.js');

global.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return createCanvas(1, 1);
    throw new Error('Not implemented: ' + tag);
  }
};
global.window = { cvLoaded: false };

async function run() {
  const img = await loadImage('/home/alecu/projects/catan_helper/catan_image.jpeg');
  const source = utils.createCanvas(img.width, img.height);
  const sourceCtx = source.getContext('2d');
  sourceCtx.drawImage(img, 0, 0);

  // Bounds logic
  const rawBounds = { w: 859, h: 813, x: 55, y: 704 }; 
  const size = Math.max(rawBounds.w, rawBounds.h);
  const cx = rawBounds.x + rawBounds.w / 2;
  const cy = rawBounds.y + rawBounds.h / 2;
  const bounds = {
    x: Math.floor(cx - size / 2),
    y: Math.floor(cy - size / 2),
    w: size,
    h: size
  };

  const NORMALIZED_BOARD_SIZE = 960;
  const normalized = utils.createCanvas(NORMALIZED_BOARD_SIZE, NORMALIZED_BOARD_SIZE);
  const normalizedCtx = normalized.getContext("2d");
  normalizedCtx.drawImage(
    source,
    bounds.x, bounds.y, bounds.w, bounds.h,
    0, 0, NORMALIZED_BOARD_SIZE, NORMALIZED_BOARD_SIZE
  );

  // Layout
  const rows = [3, 4, 5, 4, 3];
  let id = 0;
  const tiles = [];
  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < rows[row]; col += 1) {
      tiles.push({ id, row, col });
      id += 1;
    }
  }

  const maxCols = Math.max(...rows);
  const widthFactor = maxCols * 0.88 + 2.1;
  const heightFactor = ((rows.length - 1) * 0.86 * 0.76) + 0.86 + 1.9;
  const hexW = Math.min(NORMALIZED_BOARD_SIZE / widthFactor, NORMALIZED_BOARD_SIZE / heightFactor);
  const hexH = hexW * 0.86;
  const hStep = hexW * 0.88;
  const vStep = hexH * 0.76;
  const landWidth = maxCols * hStep + hexW * 0.2;
  const landHeight = (rows.length - 1) * vStep + hexH;
  const padX = (NORMALIZED_BOARD_SIZE - landWidth) / 2;
  const padY = (NORMALIZED_BOARD_SIZE - landHeight) / 2;

  const centers = new Map();
  for (let i = 0; i < tiles.length; i += 1) {
    const tile = tiles[i];
    const rowCount = rows[tile.row];
    const x = padX + ((maxCols - rowCount) * hStep) / 2 + tile.col * hStep + hexW / 2;
    const y = padY + tile.row * vStep + hexH / 2;
    centers.set(tile.id, { x, y });
  }

  // Draw each center as a patch!
  for (const [tid, c] of centers.entries()) {
    const patch = utils.createCanvas(72, 72);
    const pctx = patch.getContext('2d');
    const spanW = hexW * 0.74;
    const spanH = hexH * 0.74;
    pctx.drawImage(normalized, c.x - spanW/2, c.y - spanH/2, spanW, spanH, 0, 0, 72, 72);
    fs.writeFileSync(`/home/alecu/.gemini/antigravity-ide/brain/5576f87d-4a27-4b94-9cbb-ff985d3cb6b5/scratch/patches/tile_${tid}.png`, patch.toBuffer('image/png'));
  }
  console.log("Saved patches.");
}

run();
