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

import { rgbToHsv, extractLargestComponent } from './src/import/canvas-utils.js';

function extractBestIslandComponent(landMask, oceanMask, w, h) {
  const comp = extractLargestComponent(landMask, w, h);
  if (!comp) return null;
  
  return comp;
}

async function run() {
  const img = await loadImage('./catan_image.jpeg');
  const w = img.width;
  const h = img.height;
  
  const sampleW = Math.min(280, w);
  const scale = w / sampleW;
  const sampleH = Math.max(1, Math.round(h / scale));
  const canvas = createCanvas(sampleW, sampleH);
  const sampleCtx = canvas.getContext("2d", { willReadFrequently: true });
  sampleCtx.drawImage(img, 0, 0, sampleW, sampleH);
  const data = sampleCtx.getImageData(0, 0, sampleW, sampleH).data;

  const buckets = {};
  for (let i = 0; i < data.length; i += 4) {
    const hsv = rgbToHsv(data[i], data[i+1], data[i+2]);
    const bh = Math.floor(hsv.h / 10) * 10;
    const bs = Math.floor(hsv.s * 10) / 10;
    const bv = Math.floor(hsv.v * 10) / 10;
    const key = `${bh}_${bs}_${bv}`;
    buckets[key] = (buckets[key] || 0) + 1;
  }
  
  let bestKey = null;
  let bestCount = 0;
  for (const [k, v] of Object.entries(buckets)) {
    if (v > bestCount) {
      bestCount = v;
      bestKey = k;
    }
  }
  
  const [bh, bs, bv] = bestKey.split('_').map(Number);
  const bgHsv = { h: bh + 5, s: bs + 0.05, v: bv + 0.05 };

  const landMask = new Uint8Array(sampleW * sampleH);
  const oceanMask = new Uint8Array(sampleW * sampleH);

  for (let y = 0; y < sampleH; y += 1) {
    for (let x = 0; x < sampleW; x += 1) {
      const idx = (y * sampleW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const hsv = rgbToHsv(r, g, b);
      
      const hDiff = Math.min(Math.abs(hsv.h - bgHsv.h), 360 - Math.abs(hsv.h - bgHsv.h));
      const isBg = hDiff < 30 && Math.abs(hsv.s - bgHsv.s) < 0.4 && Math.abs(hsv.v - bgHsv.v) < 0.4;
      
      if (isBg || (b > r + 30 && b > g + 20)) {
        oceanMask[y * sampleW + x] = 1;
      } else if (hsv.v > 0.1 && hsv.s > 0.06) {
        landMask[y * sampleW + x] = 1;
      }
    }
  }

  const comp = extractBestIslandComponent(landMask, oceanMask, sampleW, sampleH);
  console.log("Component:", comp);
  
  const realMinX = comp.minX * scale;
  const realMinY = comp.minY * scale;
  const realMaxX = comp.maxX * scale;
  const realMaxY = comp.maxY * scale;
  console.log(`Real Bounding Box: x=${realMinX}, y=${realMinY}, w=${realMaxX - realMinX}, h=${realMaxY - realMinY}`);
}

run();
