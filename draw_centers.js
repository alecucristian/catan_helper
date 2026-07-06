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

async function run() {
  const img = await loadImage('./catan_image.jpeg');
  const source = createCanvas(img.width, img.height);
  const sourceCtx = source.getContext('2d');
  sourceCtx.drawImage(img, 0, 0);

  const centersState = await detectCenters(source, "four");
  
  // Draw raw centers on original image
  const out = createCanvas(img.width, img.height);
  const outCtx = out.getContext('2d');
  outCtx.drawImage(img, 0, 0);

  const { centers, bounds } = centersState;
  const scaleX = bounds.original.w / bounds.w;
  const scaleY = bounds.original.h / bounds.h;

  outCtx.fillStyle = 'red';
  for (const c of centers) {
    const cx = bounds.original.x + c.x * scaleX;
    const cy = bounds.original.y + c.y * scaleY;
    outCtx.beginPath();
    outCtx.arc(cx, cy, 10, 0, Math.PI * 2);
    outCtx.fill();
    
    // Draw tileId
    outCtx.fillStyle = 'white';
    outCtx.font = '20px Arial';
    outCtx.fillText(c.tileId, cx + 15, cy + 15);
    outCtx.fillStyle = 'red';
  }

  fs.writeFileSync('/home/alecu/.gemini/antigravity-ide/brain/5576f87d-4a27-4b94-9cbb-ff985d3cb6b5/scratch/centers.png', out.toBuffer('image/png'));
  console.log("Saved centers.png");
}

run();
