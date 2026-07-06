import { MODE_ROWS, MODE_FRAME_SLOTS, CENTER_QUALITY_THRESHOLDS, NORMALIZED_BOARD_SIZE } from "./constants.js";
import { clamp } from "./math-utils.js";
import { createCanvas, drawImageToCanvas, rgbToHsv } from "./canvas-utils.js";

const OCEAN_RGB = { r: 8, g: 102, b: 164 };

function fallbackBoardBounds(w, h) {
  const portrait = h > w * 1.25;
  if (portrait) {
    const bw = Math.floor(w * 0.62);
    const bh = Math.floor(h * 0.42);
    return {
      x: Math.floor((w - bw) / 2),
      y: Math.floor(h * 0.31),
      w: bw,
      h: bh
    };
  }
  const size = Math.floor(Math.min(w, h) * 0.66);
  return {
    x: Math.floor((w - size) / 2),
    y: Math.floor((h - size) / 2),
    w: size,
    h: size
  };
}

function colorDistanceSq(r, g, b, tr, tg, tb) {
  const dr = r - tr;
  const dg = g - tg;
  const db = b - tb;
  return dr * dr + dg * dg + db * db;
}

function isOceanLikePixel(r, g, b) {
  const hsv = rgbToHsv(r, g, b);
  const distSq = colorDistanceSq(r, g, b, OCEAN_RGB.r, OCEAN_RGB.g, OCEAN_RGB.b);
  const closeToTarget = distSq <= 9200;
  const hueBand = hsv.h >= 182 && hsv.h <= 224 && hsv.s >= 0.28 && hsv.v >= 0.16;
  return closeToTarget || hueBand;
}

function computeOceanRingScore(oceanMask, w, h, minX, minY, maxX, maxY) {
  let oceanHits = 0;
  let samples = 0;
  const pad = 3;
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const x1 = Math.min(w - 1, maxX + pad);
  const y1 = Math.min(h - 1, maxY + pad);

  for (let x = x0; x <= x1; x += 1) {
    const top = y0 * w + x;
    const bottom = y1 * w + x;
    samples += 2;
    oceanHits += oceanMask[top] ? 1 : 0;
    oceanHits += oceanMask[bottom] ? 1 : 0;
  }
  for (let y = y0 + 1; y < y1; y += 1) {
    const left = y * w + x0;
    const right = y * w + x1;
    samples += 2;
    oceanHits += oceanMask[left] ? 1 : 0;
    oceanHits += oceanMask[right] ? 1 : 0;
  }

  return samples > 0 ? oceanHits / samples : 0;
}

function extractBestIslandComponent(mask, oceanMask, w, h) {
  const visited = new Uint8Array(w * h);
  const queue = [];
  const cx = w / 2;
  const cy = h / 2;
  const diag = Math.hypot(w, h);
  let best = null;

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) {
      return;
    }
    const idx = y * w + x;
    if (!mask[idx] || visited[idx]) {
      return;
    }
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const start = y * w + x;
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
        const idx = queue.pop();
        const px = idx % w;
        const py = Math.floor(idx / w);
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

      if (count < 80) {
        continue;
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const boxArea = bw * bh;
      const areaRatio = count / Math.max(1, w * h);
      const aspect = bw / Math.max(1, bh);
      const shapeScore = clamp(1 - Math.abs(Math.log(Math.max(1e-5, aspect))) / 1.25, 0, 1);
      const fillScore = clamp((count / Math.max(1, boxArea) - 0.2) / 0.6, 0, 1);
      const areaScore = clamp(1 - Math.abs(0.2 - areaRatio) / 0.2, 0, 1);
      const ccx = (minX + maxX) / 2;
      const ccy = (minY + maxY) / 2;
      const centerScore = clamp(1 - Math.hypot(ccx - cx, ccy - cy) / Math.max(1, diag * 0.72), 0, 1);
      const oceanRingScore = computeOceanRingScore(oceanMask, w, h, minX, minY, maxX, maxY);
      const touchesEdge = minX <= 1 || minY <= 1 || maxX >= w - 2 || maxY >= h - 2;
      const edgePenalty = touchesEdge ? 0.58 : 1;
      const score = count
        * (0.3 + 0.7 * shapeScore)
        * (0.3 + 0.7 * fillScore)
        * (0.25 + 0.75 * centerScore)
        * (0.2 + 0.8 * oceanRingScore)
        * (0.25 + 0.75 * areaScore)
        * edgePenalty;

      if (!best || score > best.score) {
        best = { minX, maxX, minY, maxY, count, score, oceanRingScore, areaRatio };
      }
    }
  }

  return best;
}

function isColonistScreenshot(ctx) {
  // Deprecated: OpenCV handles arbitrary images so we no longer strictly check for Ocean pixels.
  return true;
}

function detectBoardBounds(ctx, w, h) {
  const sampleW = Math.min(280, w);
  const scale = w / sampleW;
  const sampleH = Math.max(1, Math.round(h / scale));
  const canvas = createCanvas(sampleW, sampleH);
  const sampleCtx = canvas.getContext("2d", { willReadFrequently: true });
  sampleCtx.drawImage(ctx.canvas, 0, 0, sampleW, sampleH);
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

  for (let y = 0; y < sampleH; y += 1) {
    for (let x = 0; x < sampleW; x += 1) {
      const idx = (y * sampleW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const hsv = rgbToHsv(r, g, b);
      
      // Determine if pixel matches background color
      const hDiff = Math.min(Math.abs(hsv.h - bgHsv.h), 360 - Math.abs(hsv.h - bgHsv.h));
      const isBg = hDiff < 30 && Math.abs(hsv.s - bgHsv.s) < 0.4 && Math.abs(hsv.v - bgHsv.v) < 0.4;
      
      if (isBg || isOceanLikePixel(r, g, b)) {
        oceanMask[y * sampleW + x] = 1;
      } else {
        landMask[y * sampleW + x] = 1;
      }
    }
  }

  const component = extractBestIslandComponent(landMask, oceanMask, sampleW, sampleH);
  if (!component || component.count < 240) {
    return fallbackBoardBounds(w, h);
  }

  const padX = (component.maxX - component.minX + 1) * 0.08;
  const padY = (component.maxY - component.minY + 1) * 0.08;
  const x = Math.max(0, Math.round(component.minX * scale - padX));
  const y = Math.max(0, Math.round(component.minY * scale - padY));
  const right = Math.min(w, Math.round((component.maxX + 1) * scale + padX));
  const bottom = Math.min(h, Math.round((component.maxY + 1) * scale + padY));
  return {
    x,
    y,
    w: Math.max(1, right - x),
    h: Math.max(1, bottom - y)
  };
}

function buildSkeleton(rows) {
  const tiles = [];
  let id = 0;
  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < rows[row]; col += 1) {
      tiles.push({ id, row, col });
      id += 1;
    }
  }
  return tiles;
}

function tileKey(row, col) {
  return row + ":" + col;
}

function buildAdjacency(tiles, rows) {
  const byKey = new Map();
  for (let i = 0; i < tiles.length; i += 1) {
    const tile = tiles[i];
    byKey.set(tileKey(tile.row, tile.col), tile.id);
  }

  const adjacency = new Map();
  for (let i = 0; i < tiles.length; i += 1) {
    const tile = tiles[i];
    const neighbors = new Set();
    const current = rows[tile.row];
    const up = tile.row > 0 ? rows[tile.row - 1] : null;
    const down = tile.row < rows.length - 1 ? rows[tile.row + 1] : null;

    const leftId = byKey.get(tileKey(tile.row, tile.col - 1));
    const rightId = byKey.get(tileKey(tile.row, tile.col + 1));
    if (leftId !== undefined) {
      neighbors.add(leftId);
    }
    if (rightId !== undefined) {
      neighbors.add(rightId);
    }

    if (up !== null) {
      const offsets = up === current - 1 ? [-1, 0] : [0, 1];
      for (let j = 0; j < offsets.length; j += 1) {
        const id = byKey.get(tileKey(tile.row - 1, tile.col + offsets[j]));
        if (id !== undefined) {
          neighbors.add(id);
        }
      }
    }

    if (down !== null) {
      const offsets = down === current - 1 ? [-1, 0] : [0, 1];
      for (let j = 0; j < offsets.length; j += 1) {
        const id = byKey.get(tileKey(tile.row + 1, tile.col + offsets[j]));
        if (id !== undefined) {
          neighbors.add(id);
        }
      }
    }

    adjacency.set(tile.id, [...neighbors]);
  }
  return adjacency;
}

function buildLayout(rows, bounds) {
  const tiles = buildSkeleton(rows);
  const adjacency = buildAdjacency(tiles, rows);
  const maxCols = Math.max(...rows);
  const widthFactor = maxCols * 0.88 + 2.1;
  const heightFactor = ((rows.length - 1) * 0.86 * 0.76) + 0.86 + 1.9;
  const hexW = Math.min(bounds.w / widthFactor, bounds.h / heightFactor);
  const hexH = hexW * 0.86;
  const hStep = hexW * 0.88;
  const vStep = hexH * 0.76;
  const landWidth = maxCols * hStep + hexW * 0.2;
  const landHeight = (rows.length - 1) * vStep + hexH;
  const padX = (bounds.w - landWidth) / 2;
  const padY = (bounds.h - landHeight) / 2;

  const centers = new Map();
  for (let i = 0; i < tiles.length; i += 1) {
    const tile = tiles[i];
    const rowCount = rows[tile.row];
    const x = bounds.x + padX + ((maxCols - rowCount) * hStep) / 2 + tile.col * hStep + hexW / 2;
    const y = bounds.y + padY + tile.row * vStep + hexH / 2;
    centers.set(tile.id, { x, y });
  }

  return {
    tiles,
    adjacency,
    centers,
    geometry: { hexW, hexH, hStep, vStep },
    boardCenter: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
  };
}

function sortClockwiseByCenter(ids, centers, cx, cy) {
  return [...ids].sort((a, b) => {
    const ac = centers.get(a);
    const bc = centers.get(b);
    const aa = Math.atan2(ac.y - cy, ac.x - cx);
    const ba = Math.atan2(bc.y - cy, bc.x - cx);
    return aa - ba;
  });
}

function buildSpiralOrder(tiles, adjacency, centers, boardCenter) {
  const remaining = new Set(tiles.map((tile) => tile.id));
  const rings = [];

  while (remaining.size > 0) {
    const ring = [];
    for (const id of remaining) {
      const neighbors = adjacency.get(id) || [];
      const inside = neighbors.filter((neighborId) => remaining.has(neighborId)).length;
      if (inside < 6) {
        ring.push(id);
      }
    }

    if (ring.length === 0) {
      for (const id of remaining) {
        ring.push(id);
      }
    }

    const ordered = sortClockwiseByCenter(ring, centers, boardCenter.x, boardCenter.y);
    const start = ordered
      .map((id, index) => ({ id, index, center: centers.get(id) }))
      .sort((a, b) => {
        const dy = a.center.y - b.center.y;
        if (Math.abs(dy) > 40) return dy;
        return a.center.x - b.center.x;
      })[0].index;
    const shifted = ordered.slice(start).concat(ordered.slice(0, start));
    rings.push(shifted);
    shifted.forEach((id) => remaining.delete(id));
  }

  return rings.flat();
}

function buildFrameSlots(tiles, adjacency, centers, boardCenter, geometry, slotCount) {
  const boundary = tiles.filter((tile) => (adjacency.get(tile.id) || []).length < 6);
  const vectors = [
    { x: geometry.hStep, y: 0 },
    { x: -geometry.hStep, y: 0 },
    { x: geometry.hStep / 2, y: geometry.vStep },
    { x: -geometry.hStep / 2, y: geometry.vStep },
    { x: geometry.hStep / 2, y: -geometry.vStep },
    { x: -geometry.hStep / 2, y: -geometry.vStep }
  ];
  const keyFor = (x, y) => Math.round(x * 10) + ":" + Math.round(y * 10);
  const centerByKey = new Map();
  for (const center of centers.values()) {
    centerByKey.set(keyFor(center.x, center.y), true);
  }

  const outer = new Map();
  for (let i = 0; i < boundary.length; i += 1) {
    const center = centers.get(boundary[i].id);
    for (let j = 0; j < vectors.length; j += 1) {
      const nx = center.x + vectors[j].x;
      const ny = center.y + vectors[j].y;
      const key = keyFor(nx, ny);
      if (centerByKey.has(key)) {
        continue;
      }
      if (!outer.has(key)) {
        outer.set(key, { x: nx, y: ny });
      }
    }
  }

  let points = [...outer.values()].sort((a, b) => {
    return Math.atan2(a.y - boardCenter.y, a.x - boardCenter.x) - Math.atan2(b.y - boardCenter.y, b.x - boardCenter.x);
  });

  if (!points.length) {
    return [];
  }

  const start = points
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => {
      const dy = a.slot.y - b.slot.y;
      if (Math.abs(dy) > 40) return dy;
      return a.slot.x - b.slot.x;
    })[0].index;
  points = points.slice(start).concat(points.slice(0, start));

  if (points.length !== slotCount) {
    const sampled = [];
    for (let i = 0; i < slotCount; i += 1) {
      sampled.push(points[Math.floor(i * points.length / slotCount)]);
    }
    points = sampled;
  }

  return points.map((slot, index) => ({
    slotIndex: index,
    x: slot.x,
    y: slot.y,
    angle: Math.atan2(slot.y - boardCenter.y, slot.x - boardCenter.x)
  }));
}

function scoreCenterQuality(bounds, markersFound, refineMetrics) {
  const areaRatio = (bounds.w * bounds.h) / (NORMALIZED_BOARD_SIZE * NORMALIZED_BOARD_SIZE);
  const markerScore = clamp((markersFound - CENTER_QUALITY_THRESHOLDS.markerCountWarn) /
    (CENTER_QUALITY_THRESHOLDS.markerCountGood - CENTER_QUALITY_THRESHOLDS.markerCountWarn), 0, 1);
  const areaScore = clamp(1 - Math.abs(0.56 - areaRatio) * 2.2, 0, 1);
  const residual = refineMetrics && Number.isFinite(refineMetrics.meanResidualPx)
    ? refineMetrics.meanResidualPx
    : NORMALIZED_BOARD_SIZE * 0.2;
  const inlierRatio = refineMetrics && Number.isFinite(refineMetrics.inlierRatio)
    ? refineMetrics.inlierRatio
    : 0;
  const residualScore = clamp(1 - residual / 16, 0, 1);
  const inlierScore = clamp((inlierRatio - 0.22) / 0.5, 0, 1);
  const overall = clamp(markerScore * 0.2 + areaScore * 0.15 + inlierScore * 0.35 + residualScore * 0.3, 0, 1);
  return {
    areaRatio,
    markersFound,
    markerScore,
    areaScore,
    inlierRatio,
    meanResidualPx: residual,
    refineApplied: Boolean(refineMetrics && refineMetrics.applied),
    overall
  };
}

function detectTokenMarkers(ctx) {
  if (!window.cv) {
    return { markers: [], markerCount: 0 };
  }
  const src = cv.imread(ctx.canvas);
  
  // 1. Convert to HSV to find bright/white regions (tokens)
  const hsv = new cv.Mat();
  cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
  cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
  
  // 2. Threshold: Tokens are white/gray.
  // HSV ranges: H: 0-180, S: 0-255, V: 0-255 in OpenCV.js
  // We want low saturation (< 80) and high value (> 160).
  const lower = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 160, 0]);
  const upper = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 85, 255, 0]);
  
  const mask = new cv.Mat();
  cv.inRange(hsv, lower, upper, mask);
  
  // 3. Find contours of these white blobs
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(mask, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  
  const markers = [];
  const minArea = (src.cols * src.rows) * 0.00015;
  const maxArea = (src.cols * src.rows) * 0.01;
  
  for (let i = 0; i < contours.size(); ++i) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area < minArea || area > maxArea) continue;
    
    // Check bounding box aspect ratio
    const rect = cv.boundingRect(cnt);
    const aspect = rect.width / Math.max(1, rect.height);
    if (aspect < 0.6 || aspect > 1.6) continue;
    
    // Check circularity
    const perimeter = cv.arcLength(cnt, true);
    const circularity = 4 * Math.PI * area / Math.max(1, perimeter * perimeter);
    if (circularity > 0.55) {
      const M = cv.moments(cnt);
      if (M.m00 > 0) {
        const cx = M.m10 / M.m00;
        const cy = M.m01 / M.m00;
        markers.push({
          x: cx,
          y: cy,
          radius: Math.max(rect.width, rect.height) / 2,
          area: area,
          fill: 1.0,
          roundness: circularity
        });
      }
    }
  }
  
  src.delete(); hsv.delete(); lower.delete(); upper.delete(); mask.delete(); 
  contours.delete(); hierarchy.delete();
  
  // Sort by circularity
  markers.sort((a, b) => b.roundness - a.roundness);
  
  return {
    markers: markers.slice(0, 36),
    markerCount: Math.min(markers.length, 36)
  };
}

function estimateSimilarityFromPairs(srcA, srcB, dstA, dstB) {
  const vx = srcB.x - srcA.x;
  const vy = srcB.y - srcA.y;
  const wx = dstB.x - dstA.x;
  const wy = dstB.y - dstA.y;
  const srcLen = Math.hypot(vx, vy);
  const dstLen = Math.hypot(wx, wy);
  if (srcLen < 1e-5 || dstLen < 1e-5) {
    return null;
  }

  const scale = dstLen / srcLen;
  if (scale < 0.72 || scale > 1.4) {
    return null;
  }
  const angSrc = Math.atan2(vy, vx);
  const angDst = Math.atan2(wy, wx);
  const theta = angDst - angSrc;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const tx = dstA.x - scale * (cos * srcA.x - sin * srcA.y);
  const ty = dstA.y - scale * (sin * srcA.x + cos * srcA.y);

  return { scale, cos, sin, tx, ty };
}

function applySimilarity(point, t) {
  return {
    x: t.scale * (t.cos * point.x - t.sin * point.y) + t.tx,
    y: t.scale * (t.sin * point.x + t.cos * point.y) + t.ty
  };
}

function matchPredictedToMarkers(predicted, markers, maxDistance) {
  const candidates = [];
  for (let i = 0; i < predicted.length; i += 1) {
    const p = predicted[i];
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let j = 0; j < markers.length; j += 1) {
      const m = markers[j];
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = j;
      }
    }
    if (bestIdx >= 0 && bestDist <= maxDistance) {
      candidates.push({
        predictedIndex: i,
        markerIndex: bestIdx,
        distance: bestDist
      });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);
  const usedMarkers = new Set();
  const usedPredicted = new Set();
  const pairs = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    if (usedMarkers.has(c.markerIndex) || usedPredicted.has(c.predictedIndex)) {
      continue;
    }
    usedMarkers.add(c.markerIndex);
    usedPredicted.add(c.predictedIndex);
    pairs.push(c);
  }
  return pairs;
}

function refineCentersByMarkers(layout, frameSlots, markers) {
  const predicted = layout.tiles.map((tile) => {
    const c = layout.centers.get(tile.id);
    return { tileId: tile.id, x: c.x, y: c.y };
  });

  if (!markers || markers.length < 3) {
    return {
      centers: layout.centers,
      frameSlots,
      metrics: {
        applied: false,
        inlierRatio: 0,
        meanResidualPx: NORMALIZED_BOARD_SIZE * 0.2,
        inliers: [],
        markerCount: markers ? markers.length : 0
      }
    };
  }

  const initialPairs = matchPredictedToMarkers(predicted, markers, NORMALIZED_BOARD_SIZE * 0.2);
  if (initialPairs.length < 3) {
    return {
      centers: layout.centers,
      frameSlots,
      metrics: {
        applied: false,
        inlierRatio: 0,
        meanResidualPx: NORMALIZED_BOARD_SIZE * 0.2,
        inliers: [],
        markerCount: markers.length
      }
    };
  }

  const maxIters = Math.min(220, initialPairs.length * initialPairs.length);
  const inlierThreshold = NORMALIZED_BOARD_SIZE * 0.065;
  let best = null;

  for (let iter = 0; iter < maxIters; iter += 1) {
    const a = initialPairs[Math.floor(Math.random() * initialPairs.length)];
    let b = initialPairs[Math.floor(Math.random() * initialPairs.length)];
    if (a === b) {
      continue;
    }
    const srcA = predicted[a.predictedIndex];
    const srcB = predicted[b.predictedIndex];
    const dstA = markers[a.markerIndex];
    const dstB = markers[b.markerIndex];
    const t = estimateSimilarityFromPairs(srcA, srcB, dstA, dstB);
    if (!t) {
      continue;
    }

    let inlierCount = 0;
    let residualSum = 0;
    const inliers = [];
    for (let i = 0; i < initialPairs.length; i += 1) {
      const pair = initialPairs[i];
      const src = predicted[pair.predictedIndex];
      const pred = applySimilarity(src, t);
      const dst = markers[pair.markerIndex];
      const d = Math.hypot(pred.x - dst.x, pred.y - dst.y);
      if (d <= inlierThreshold) {
        inlierCount += 1;
        residualSum += d;
        inliers.push(pair);
      }
    }
    if (inlierCount < 3) {
      continue;
    }
    const meanResidual = residualSum / inlierCount;
    const score = inlierCount * 1000 - meanResidual;
    if (!best || score > best.score) {
      best = { t, inliers, inlierCount, meanResidual, score };
    }
  }

  if (!best || best.inlierCount < 3) {
    return {
      centers: layout.centers,
      frameSlots,
      metrics: {
        applied: false,
        inlierRatio: 0,
        meanResidualPx: NORMALIZED_BOARD_SIZE * 0.2,
        inliers: [],
        markerCount: markers.length
      }
    };
  }

  const refinedCenters = new Map();
  for (const [tileId, center] of layout.centers.entries()) {
    refinedCenters.set(tileId, applySimilarity(center, best.t));
  }
  const refinedSlots = frameSlots.map((slot) => {
    const p = applySimilarity(slot, best.t);
    return {
      ...slot,
      x: p.x,
      y: p.y
    };
  });

  return {
    centers: refinedCenters,
    frameSlots: refinedSlots,
    metrics: {
      applied: true,
      inlierRatio: best.inlierCount / Math.max(1, initialPairs.length),
      meanResidualPx: best.meanResidual,
      inliers: best.inliers,
      markerCount: markers.length
    }
  };
}

function buildHsvBuffer(ctx) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  const hsv = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i += 1) {
    const idx = i * 4;
    const out = i * 3;
    const c = rgbToHsv(data[idx], data[idx + 1], data[idx + 2]);
    hsv[out] = c.h;
    hsv[out + 1] = c.s;
    hsv[out + 2] = c.v;
  }
  return { w, h, hsv };
}

function hueDelta(a, b) {
  let d = Math.abs(a - b);
  if (d > 180) {
    d = 360 - d;
  }
  return d;
}

function detectHexPatchCentroids(ctx, geometry) {
  const targetW = 360;
  const scaleDown = Math.max(1, ctx.canvas.width / targetW);
  const w = Math.max(1, Math.round(ctx.canvas.width / scaleDown));
  const h = Math.max(1, Math.round(ctx.canvas.height / scaleDown));
  const canvas = createCanvas(w, h);
  const cctx = canvas.getContext("2d", { willReadFrequently: true });
  cctx.drawImage(ctx.canvas, 0, 0, w, h);
  const buffer = buildHsvBuffer(cctx);
  const visited = new Uint8Array(w * h);
  const queue = [];
  const centroids = [];

  const scaledHexArea = (geometry.hexW * geometry.hexH * 0.74) / (scaleDown * scaleDown);
  const minArea = Math.max(90, Math.round(scaledHexArea * 0.24));
  const maxArea = Math.max(minArea + 1, Math.round(scaledHexArea * 1.55));

  const isOceanHSV = (hue, sat, val) => hue >= 184 && hue <= 228 && sat >= 0.22 && val >= 0.12;

  const push = (x, y, seed) => {
    if (x < 0 || y < 0 || x >= w || y >= h) {
      return;
    }
    const idx = y * w + x;
    if (visited[idx]) {
      return;
    }
    const base = idx * 3;
    const hue = buffer.hsv[base];
    const sat = buffer.hsv[base + 1];
    const val = buffer.hsv[base + 2];
    if (sat < 0.11 || val < 0.1 || isOceanHSV(hue, sat, val)) {
      return;
    }
    if (hueDelta(hue, seed.hue) > 17 || Math.abs(sat - seed.sat) > 0.2 || Math.abs(val - seed.val) > 0.24) {
      return;
    }
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const start = y * w + x;
      if (visited[start]) {
        continue;
      }
      const sidx = start * 3;
      const sh = buffer.hsv[sidx];
      const ss = buffer.hsv[sidx + 1];
      const sv = buffer.hsv[sidx + 2];
      if (ss < 0.11 || sv < 0.1 || isOceanHSV(sh, ss, sv)) {
        visited[start] = 1;
        continue;
      }

      visited[start] = 1;
      queue.push(start);
      const seed = { hue: sh, sat: ss, val: sv };
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (queue.length) {
        const idx = queue.pop();
        const px = idx % w;
        const py = Math.floor(idx / w);
        count += 1;
        sumX += px;
        sumY += py;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);

        push(px + 1, py, seed);
        push(px - 1, py, seed);
        push(px, py + 1, seed);
        push(px, py - 1, seed);
      }

      if (count < minArea || count > maxArea) {
        continue;
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const fill = count / Math.max(1, bw * bh);
      const aspect = bw / Math.max(1, bh);
      if (fill < 0.18 || aspect < 0.56 || aspect > 1.8) {
        continue;
      }

      centroids.push({
        x: (sumX / Math.max(1, count)) * scaleDown,
        y: (sumY / Math.max(1, count)) * scaleDown,
        area: count
      });
    }
  }

  centroids.sort((a, b) => b.area - a.area);
  return centroids.slice(0, 64);
}

function fitSimilarityFromMatches(predicted, markers, pairs, maxIters, inlierThreshold) {
  if (!pairs || pairs.length < 3) {
    return null;
  }
  let best = null;

  for (let iter = 0; iter < maxIters; iter += 1) {
    const a = pairs[Math.floor(Math.random() * pairs.length)];
    let b = pairs[Math.floor(Math.random() * pairs.length)];
    if (a === b) {
      continue;
    }
    const srcA = predicted[a.predictedIndex];
    const srcB = predicted[b.predictedIndex];
    const dstA = markers[a.markerIndex];
    const dstB = markers[b.markerIndex];
    const t = estimateSimilarityFromPairs(srcA, srcB, dstA, dstB);
    if (!t) {
      continue;
    }

    let inlierCount = 0;
    let residualSum = 0;
    for (let i = 0; i < pairs.length; i += 1) {
      const pair = pairs[i];
      const src = predicted[pair.predictedIndex];
      const pred = applySimilarity(src, t);
      const dst = markers[pair.markerIndex];
      const d = Math.hypot(pred.x - dst.x, pred.y - dst.y);
      if (d <= inlierThreshold) {
        inlierCount += 1;
        residualSum += d;
      }
    }
    if (inlierCount < 3) {
      continue;
    }
    const meanResidual = residualSum / inlierCount;
    const score = inlierCount * 1000 - meanResidual;
    if (!best || score > best.score) {
      best = { t, inlierCount, meanResidual, score };
    }
  }

  return best;
}

function sampleHexPatchScore(buffer, x, y, geometry) {
  const outerR = geometry.hexW * 0.34;
  const innerR = geometry.hexW * 0.2;
  const count = 24;
  let valid = 0;
  let hueX = 0;
  let hueY = 0;
  let satSum = 0;
  let valSum = 0;
  let oceanHits = 0;

  for (let i = 0; i < count; i += 1) {
    const a = (Math.PI * 2 * i) / count;
    const r = i % 2 === 0 ? innerR : outerR;
    const sx = Math.round(x + Math.cos(a) * r);
    const sy = Math.round(y + Math.sin(a) * r);
    if (sx < 0 || sy < 0 || sx >= buffer.w || sy >= buffer.h) {
      continue;
    }
    const idx = (sy * buffer.w + sx) * 3;
    const h = buffer.hsv[idx];
    const s = buffer.hsv[idx + 1];
    const v = buffer.hsv[idx + 2];
    if (s < 0.09 || v < 0.08) {
      continue;
    }
    if (h >= 182 && h <= 228 && s >= 0.22 && v >= 0.1) {
      oceanHits += 1;
      continue;
    }
    const rad = (h * Math.PI) / 180;
    hueX += Math.cos(rad);
    hueY += Math.sin(rad);
    satSum += s;
    valSum += v;
    valid += 1;
  }

  if (valid < 9) {
    return -1;
  }

  const coherence = Math.hypot(hueX, hueY) / valid;
  const satAvg = satSum / valid;
  const valAvg = valSum / valid;
  const oceanPenalty = oceanHits / count;
  return coherence * 0.6 + satAvg * 0.25 + valAvg * 0.15 - oceanPenalty * 0.35;
}

function refineCentersByColorPatches(ctx, centers, geometry) {
  const buffer = buildHsvBuffer(ctx);
  const patchCentroids = detectHexPatchCentroids(ctx, geometry);

  const predicted = [...centers.entries()].map(([tileId, c]) => ({ tileId, x: c.x, y: c.y }));
  const patchPairs = matchPredictedToMarkers(predicted, patchCentroids, geometry.hStep * 0.34);

  const fit = fitSimilarityFromMatches(
    predicted,
    patchCentroids,
    patchPairs,
    Math.min(260, Math.max(40, patchPairs.length * patchPairs.length)),
    geometry.hStep * 0.22
  );

  let globallyAligned = new Map(centers);
  let globalApplied = false;
  if (fit && fit.inlierCount >= 3 && fit.t.scale >= 0.82 && fit.t.scale <= 1.28) {
    globallyAligned = new Map();
    for (const [tileId, c] of centers.entries()) {
      globallyAligned.set(tileId, applySimilarity(c, fit.t));
    }
    globalApplied = true;
  }

  // Outward bias for top and bottom rows
  // Find spiral order and row info
  let outwardAnchored = new Map(globallyAligned);
  try {
    // Find row info for each tileId
    const tileRows = {};
    let minRow = Infinity, maxRow = -Infinity;
    // Try to infer from centers map (x, y) and geometry
    // But we need spiral order and tile row info
    // Instead, try to get from geometry.rows if available
    let modeRows = geometry && geometry.rows ? geometry.rows : null;
    if (!modeRows && typeof window !== "undefined" && window.MODE_ROWS) {
      modeRows = window.MODE_ROWS.four || window.MODE_ROWS.six;
    }
    // Fallback: assume standard 5 rows
    if (!modeRows) modeRows = [3, 4, 5, 4, 3];
    // Build tileId → row mapping
    let idx = 0;
    for (let row = 0; row < modeRows.length; row++) {
      for (let col = 0; col < modeRows[row]; col++) {
        tileRows[idx] = row;
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
        idx++;
      }
    }
    // Compute board center
    let sumX = 0, sumY = 0, n = 0;
    for (const c of globallyAligned.values()) {
      sumX += c.x;
      sumY += c.y;
      n++;
    }
    const boardCenter = { x: sumX / n, y: sumY / n };
    // Outward bias factor
    const outwardBias = 0.13;
    // For each tile in top or bottom row, nudge outward toward patch centroid
    for (let i = 0; i < patchPairs.length; i++) {
      const pair = patchPairs[i];
      const tileId = predicted[pair.predictedIndex].tileId;
      const row = tileRows[tileId];
      if (row === minRow || row === maxRow) {
        const center = globallyAligned.get(tileId);
        const patch = patchCentroids[pair.markerIndex];
        // Vector from board center to patch
        const vx = patch.x - boardCenter.x;
        const vy = patch.y - boardCenter.y;
        outwardAnchored.set(tileId, {
          x: center.x + vx * outwardBias,
          y: center.y + vy * outwardBias
        });
      }
    }
  } catch (e) {
    // If anything fails, skip bias
  }

  const anchored = new Map(outwardAnchored);
  for (let i = 0; i < patchPairs.length; i += 1) {
    const pair = patchPairs[i];
    const tile = predicted[pair.predictedIndex];
    const patch = patchCentroids[pair.markerIndex];
    const old = anchored.get(tile.tileId);
    anchored.set(tile.tileId, {
      x: old.x * 0.55 + patch.x * 0.45,
      y: old.y * 0.55 + patch.y * 0.45
    });
  }

  const searchR = Math.max(8, Math.round(Math.min(geometry.hStep, geometry.vStep) * 0.34));
  const step = 3;
  const refined = new Map();
  let moved = 0;
  let shiftSum = 0;

  for (const [tileId, center] of anchored.entries()) {
    let bestX = center.x;
    let bestY = center.y;
    let bestScore = sampleHexPatchScore(buffer, center.x, center.y, geometry);

    for (let dy = -searchR; dy <= searchR; dy += step) {
      for (let dx = -searchR; dx <= searchR; dx += step) {
        const px = center.x + dx;
        const py = center.y + dy;
        if (px < 0 || py < 0 || px >= buffer.w || py >= buffer.h) {
          continue;
        }
        const distPenalty = Math.hypot(dx, dy) / Math.max(1, searchR);
        const score = sampleHexPatchScore(buffer, px, py, geometry) - distPenalty * 0.18;
        if (score > bestScore) {
          bestScore = score;
          bestX = px;
          bestY = py;
        }
      }
    }

    const shift = Math.hypot(bestX - center.x, bestY - center.y);
    if (shift > 0.75) {
      moved += 1;
      shiftSum += shift;
    }
    refined.set(tileId, { x: bestX, y: bestY });
  }

  return {
    centers: refined,
    metrics: {
      moved,
      matchedPatchCentroids: patchPairs.length,
      globalPatchFitApplied: globalApplied,
      globalPatchFitScale: fit ? fit.t.scale : 1,
      globalPatchFitResidual: fit ? fit.meanResidual : 0,
      avgShiftPx: moved > 0 ? shiftSum / moved : 0,
      applied: moved > 0
    }
  };
}

export async function detectCenters(image, modeKey) {
  const mode = modeKey === "six" ? "six" : "four";
  const source = drawImageToCanvas(image);
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  if (!isColonistScreenshot(sourceCtx)) {
    throw new Error("Only Colonist screenshots are supported.");
  }

  const rawBounds = detectBoardBounds(sourceCtx, source.width, source.height);
  
  // Make the bounds perfectly square to prevent aspect ratio distortion when scaling to 960x960
  const size = Math.max(rawBounds.w, rawBounds.h);
  const cx = rawBounds.x + rawBounds.w / 2;
  const cy = rawBounds.y + rawBounds.h / 2;
  const bounds = {
    x: Math.floor(cx - size / 2),
    y: Math.floor(cy - size / 2),
    w: size,
    h: size
  };

  const normalized = createCanvas(NORMALIZED_BOARD_SIZE, NORMALIZED_BOARD_SIZE);
  const normalizedCtx = normalized.getContext("2d", { willReadFrequently: true });
  normalizedCtx.drawImage(
    source,
    bounds.x,
    bounds.y,
    bounds.w,
    bounds.h,
    0,
    0,
    NORMALIZED_BOARD_SIZE,
    NORMALIZED_BOARD_SIZE
  );

  const normalizedBounds = { x: 0, y: 0, w: NORMALIZED_BOARD_SIZE, h: NORMALIZED_BOARD_SIZE };
  const layout = buildLayout(MODE_ROWS[mode], normalizedBounds);
  const frameSlots = buildFrameSlots(
    layout.tiles,
    layout.adjacency,
    layout.centers,
    layout.boardCenter,
    layout.geometry,
    MODE_FRAME_SLOTS[mode]
  );

  const markerInfo = detectTokenMarkers(normalizedCtx);
  const refined = refineCentersByMarkers(layout, frameSlots, markerInfo.markers);
  const colorPatchRefined = refineCentersByColorPatches(normalizedCtx, refined.centers, layout.geometry);
  const quality = scoreCenterQuality(normalizedBounds, markerInfo.markerCount, refined.metrics);
  const spiralOrder = buildSpiralOrder(
    layout.tiles,
    layout.adjacency,
    colorPatchRefined.centers,
    layout.boardCenter
  );

  const centers = layout.tiles.map((tile) => {
    const center = colorPatchRefined.centers.get(tile.id);
    return { tileId: tile.id, row: tile.row, col: tile.col, x: center.x, y: center.y };
  });

  normalizedCtx.save();
  normalizedCtx.strokeStyle = "rgba(73, 221, 109, 0.85)";
  normalizedCtx.lineWidth = 1.6;
  for (let i = 0; i < markerInfo.markers.length; i += 1) {
    const m = markerInfo.markers[i];
    normalizedCtx.beginPath();
    normalizedCtx.arc(m.x, m.y, 5, 0, Math.PI * 2);
    normalizedCtx.stroke();
  }
  normalizedCtx.restore();

  return {
    modeKey: mode,
    bounds: {
      source,
      original: bounds,
      normalized: normalizedBounds
    },
    centers,
    frameSlots: refined.frameSlots,
    spiralOrder,
    geometry: layout.geometry,
    markerDebug: {
      markers: markerInfo.markers,
      refinement: refined.metrics,
      colorPatchRefinement: colorPatchRefined.metrics
    },
    quality,
    debugCanvas: normalized
  };
}
