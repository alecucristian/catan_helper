const { createCanvas, loadImage } = require('canvas');

function rgbToHsv(r, g, b) {
  let rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60;
    else if (max === gg) h = ((bb - rr) / d + 2) * 60;
    else h = ((rr - gg) / d + 4) * 60;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

async function run() {
  const img = await loadImage('catan_image.jpeg');
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  
  const buckets = {};
  for (let i = 0; i < data.length; i += 4) {
    const hsv = rgbToHsv(data[i], data[i+1], data[i+2]);
    const bh = Math.floor(hsv.h / 10) * 10;
    const bs = Math.floor(hsv.s * 10) / 10;
    const bv = Math.floor(hsv.v * 10) / 10;
    const key = `${bh}_${bs}_${bv}`;
    buckets[key] = (buckets[key] || 0) + 1;
  }
  
  const sorted = Object.entries(buckets).sort((a, b) => b[1] - a[1]);
  console.log("Top 5 colors:");
  for (let i=0; i<5; i++) {
    console.log(sorted[i][0], sorted[i][1]);
  }
}
run();
