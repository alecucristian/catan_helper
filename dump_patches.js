const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

const utils = require('/home/alecu/projects/catan_helper/src/import/canvas-utils.js');
const centersModule = require('/home/alecu/projects/catan_helper/src/import/stage-centers.js');

// Mock DOM
global.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return createCanvas(1, 1);
    throw new Error('Not implemented: ' + tag);
  }
};
global.window = { cvLoaded: false }; // Mock window

async function run() {
  const img = await loadImage('/home/alecu/projects/catan_helper/catan_image.jpeg');
  const source = utils.createCanvas(img.width, img.height);
  const sourceCtx = source.getContext('2d');
  sourceCtx.drawImage(img, 0, 0);

  // Bounds logic
  const rawBounds = { w: 859, h: 813, x: 55, y: 704 }; // Handcoded from previous run to bypass opencv for now
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

  fs.writeFileSync('normalized.png', normalized.toBuffer('image/png'));
  console.log('Saved normalized.png');
}

run();
