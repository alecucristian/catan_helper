export function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function drawImageToCanvas(image) {
  const canvas = createCanvas(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  return canvas;
}

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => reject(new Error("Could not load image."));
    img.src = URL.createObjectURL(file);
  });
}

export function rgbToHsv(r, g, b) {
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

export function sampleHSV(ctx, x, y, radius) {
  const points = [];
  const r = Math.max(1, Math.floor(radius));
  for (let oy = -r; oy <= r; oy += 2) {
    for (let ox = -r; ox <= r; ox += 2) {
      if (ox * ox + oy * oy > r * r) {
        continue;
      }
      const px = Math.max(0, Math.min(ctx.canvas.width - 1, Math.round(x + ox)));
      const py = Math.max(0, Math.min(ctx.canvas.height - 1, Math.round(y + oy)));
      const data = ctx.getImageData(px, py, 1, 1).data;
      points.push(rgbToHsv(data[0], data[1], data[2]));
    }
  }
  if (!points.length) {
    return { h: 0, s: 0, v: 0 };
  }
  let sumH = 0;
  let sumS = 0;
  let sumV = 0;
  for (let i = 0; i < points.length; i += 1) {
    sumH += points[i].h;
    sumS += points[i].s;
    sumV += points[i].v;
  }
  return { h: sumH / points.length, s: sumS / points.length, v: sumV / points.length };
}

export function extractLargestComponent(mask, width, height) {
  const visited = new Uint8Array(width * height);
  const queue = [];
  let best = null;

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }
    const idx = y * width + x;
    if (!mask[idx] || visited[idx]) {
      return;
    }
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!mask[start] || visited[start]) {
        continue;
      }
      visited[start] = 1;
      queue.push(start);
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      while (queue.length) {
        const index = queue.pop();
        const px = index % width;
        const py = Math.floor(index / width);
        count += 1;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
        push(px + 1, py);
        push(px - 1, py);
        push(px, py + 1);
        push(px, py - 1);
      }
      if (!best || count > best.count) {
        best = { minX, maxX, minY, maxY, count };
      }
    }
  }

  return best;
}
