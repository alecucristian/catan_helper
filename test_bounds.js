const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

function rgbToHsv(r, g, b) {
  let rr = r / 255;
  let gg = g / 255;
  let bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rr) {
      h = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60;
    } else if (max === gg) {
      h = ((bb - rr) / d + 2) * 60;
    } else {
      h = ((rr - gg) / d + 4) * 60;
    }
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function extractBestIslandComponent(mask, oceanMask, width, height) {
  const visited = new Uint8Array(width * height);
  const queue = [];
  let best = null;

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (!mask[idx] || visited[idx]) return;
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!mask[start] || visited[start]) continue;
      
      visited[start] = 1;
      queue.push(start);
      let count = 0;
      let minX = x, maxX = x, minY = y, maxY = y;

      while (queue.length > 0) {
        const curr = queue.shift();
        const cx = curr % width;
        const cy = Math.floor(curr / width);
        count += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        push(cx - 1, cy);
        push(cx + 1, cy);
        push(cx, cy - 1);
        push(cx, cy + 1);
      }

      if (!best || count > best.count) {
        best = { count, minX, maxX, minY, maxY };
      }
    }
  }
  return best;
}

async function testBounds() {
  const img = await loadImage('catan_image.jpeg');
  const w = img.width;
  const h = img.height;
  
  const sampleW = Math.min(280, w);
  const scale = w / sampleW;
  const sampleH = Math.max(1, Math.round(h / scale));
  const canvas = createCanvas(sampleW, sampleH);
  const sampleCtx = canvas.getContext("2d");
  sampleCtx.drawImage(img, 0, 0, sampleW, sampleH);
  const data = sampleCtx.getImageData(0, 0, sampleW, sampleH).data;
  
  const landMask = new Uint8Array(sampleW * sampleH);
  const oceanMask = new Uint8Array(sampleW * sampleH);

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
  console.log("Histogram Background HSV:", bgHsv, "Count:", bestCount);

  for (let y = 0; y < sampleH; y += 1) {
    for (let x = 0; x < sampleW; x += 1) {
      const idx = (y * sampleW + x) * 4;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      const hsv = rgbToHsv(r, g, b);
      
      const hDiff = Math.min(Math.abs(hsv.h - bgHsv.h), 360 - Math.abs(hsv.h - bgHsv.h));
      const isBg = hDiff < 30 && Math.abs(hsv.s - bgHsv.s) < 0.4 && Math.abs(hsv.v - bgHsv.v) < 0.4;
      
      if (isBg) {
        oceanMask[y * sampleW + x] = 1;
      } else if (hsv.v > 0.1 && hsv.s > 0.06) {
        landMask[y * sampleW + x] = 1;
      }
    }
  }

  const component = extractBestIslandComponent(landMask, oceanMask, sampleW, sampleH);
  console.log("Island component:", component);
  
  if (component) {
    const padX = (component.maxX - component.minX + 1) * 0.08;
    const padY = (component.maxY - component.minY + 1) * 0.08;
    const x = Math.max(0, Math.round(component.minX * scale - padX));
    const y = Math.max(0, Math.round(component.minY * scale - padY));
    const right = Math.min(w, Math.round((component.maxX + 1) * scale + padX));
    const bottom = Math.min(h, Math.round((component.maxY + 1) * scale + padY));
    console.log(`Bounds: x=${x}, y=${y}, w=${right-x}, h=${bottom-y}`);
  }
}

testBounds();
