import fs from 'fs';
import { createCanvas, loadImage } from 'canvas';
import { URL } from 'url';
global.URL = URL;
global.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return createCanvas(1, 1);
    throw new Error('Not implemented: ' + tag);
  }
};
global.window = { cvLoaded: false };
import canvasPkg from 'canvas';
global.Image = canvasPkg.Image;

import { detectCenters } from './src/import/stage-centers.js';
import { detectTiles } from './src/import/stage-tiles.js';

async function run() {
  const img = await loadImage('./catan_image.jpeg');
  const source = createCanvas(img.width, img.height);
  const sourceCtx = source.getContext('2d');
  sourceCtx.drawImage(img, 0, 0);

  const centersState = await detectCenters(source, "four");
  console.log("BOUNDS:", centersState.bounds);
  const tilesState = await detectTiles(centersState);

  for (let i = 0; i < tilesState.tiles.length; i++) {
    const t = tilesState.tiles[i];
    console.log(`Tile ${t.tileId}: Classified as ${t.resource}. HSV: h=${Math.round(t.bodyFeatures.h)}, s=${t.bodyFeatures.s.toFixed(2)}, v=${t.bodyFeatures.v.toFixed(2)}`);
  }
}
run();
