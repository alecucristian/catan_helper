import fs from 'fs';
import { createCanvas, loadImage } from 'canvas';

// Mock DOM
global.document = {
  createElement: (tag) => {
    if (tag === 'canvas') return createCanvas(1, 1);
    throw new Error('Not implemented: ' + tag);
  }
};
global.window = { cvLoaded: false };
global.Image = loadImage; // Polyfill for new Image() in template loading
global.URL = { createObjectURL: () => '', revokeObjectURL: () => {} };

import { rgbToHsv, extractLargestComponent } from './src/import/canvas-utils.js';
import { detectCenters } from './src/import/stage-centers.js';
import { detectTiles } from './src/import/stage-tiles.js';
import { detectTokens } from './src/import/stage-tokens.js';
import { detectHarbors } from './src/import/stage-harbors.js';

// We must override the internal 'loadImage' inside stage-tiles.js and stage-tokens.js
// because they use `new Image()`. In Node `canvas` package, `loadImage` is an async function, not a constructor!
// Let's just monkey-patch the global scope so `new Image()` works if possible.
// Wait, `canvas` package exports `Image` which works like the DOM Image!
import canvasPkg from 'canvas';
global.Image = canvasPkg.Image;

async function run() {
  try {
    const img = await loadImage('./catan_image.jpeg');
    
    // We must manually mock the `drawImageToCanvas` to return our canvas because it expects DOM image
    const source = createCanvas(img.width, img.height);
    const sourceCtx = source.getContext('2d');
    sourceCtx.drawImage(img, 0, 0);

    // Run centers
    console.log("Detecting centers...");
    const centersState = await detectCenters(source, "four");
    
    console.log("Detecting tiles...");
    const tilesState = await detectTiles(centersState);
    
    console.log("Detecting tokens...");
    const tokensState = await detectTokens(centersState, tilesState);
    
    // console.log("Detecting harbors...");
    // const harborsState = await detectHarbors(centersState);

    const mappedTiles = tokensState.tiles.map((t) => ({
      id: t.tileId,
      resource: t.resource,
      token: t.token
    }));

    // Output spiral order
    const out = [];
    for (const id of centersState.spiralOrder) {
      const t = mappedTiles.find(x => x.id === id);
      if (t) {
        let res = "";
        switch (t.resource) {
          case 'wood': res = 'W'; break;
          case 'sheep': res = 'S'; break;
          case 'wheat': res = 'G'; break;
          case 'brick': res = 'B'; break;
          case 'ore': res = 'O'; break;
          case 'desert': res = 'D'; break;
        }
        out.push(res + (t.token || ''));
      }
    }
    console.log("TILES:", out.join(" "));

  } catch(e) {
    console.error(e);
  }
}

run();
