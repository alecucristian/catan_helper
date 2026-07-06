import {
  MODE_RESOURCE_COUNTS,
  RESOURCE_OPTIONS,
  RESOURCE_TEMPLATE_FILES,
  TILE_CONFIDENCE_THRESHOLD
} from "./constants.js";
import { clamp } from "./math-utils.js";
import { createCanvas, rgbToHsv } from "./canvas-utils.js";

let templateStore = null;
let templateStorePromise = null;

const RESOURCE_BODY_HEX = {
  wood: "#139539",
  sheep: "#90b50a",
  ore: "#a8aca9",
  wheat: "#f7be2d",
  desert: "#d9d196",
  brick: "#e46d2b"
};

const RESOURCE_TEXTURE_PRIORS = {
  wood: 0.22,
  brick: 0.2,
  sheep: 0.16,
  wheat: 0.14,
  ore: 0.12,
  desert: 0.1
};

function parseHexColor(hex) {
  const clean = String(hex || "").replace("#", "").trim();
  if (clean.length !== 6) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

const RESOURCE_BODY_PRIORS = (() => {
  const priors = {};
  for (let i = 0; i < RESOURCE_OPTIONS.length; i += 1) {
    const resource = RESOURCE_OPTIONS[i];
    const rgb = parseHexColor(RESOURCE_BODY_HEX[resource]);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    priors[resource] = {
      h: hsv.h,
      s: hsv.s,
      v: hsv.v,
      texture: RESOURCE_TEXTURE_PRIORS[resource] || 0.14
    };
  }
  return priors;
})();

function normalizeVector(vector) {
  let mag = 0;
  for (let i = 0; i < vector.length; i += 1) {
    mag += vector[i] * vector[i];
  }
  mag = Math.sqrt(mag);
  if (!mag) {
    return vector.map(() => 0);
  }
  return vector.map((value) => value / mag);
}

export function cosineSimilarity(a, b) {
  let score = 0;
  for (let i = 0; i < a.length; i += 1) {
    score += a[i] * b[i];
  }
  return score;
}

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

export function calibrateCanvasColors(sourceCanvas) {
  const calibrated = createCanvas(sourceCanvas.width, sourceCanvas.height);
  const ctx = calibrated.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(sourceCanvas, 0, 0);
  const img = ctx.getImageData(0, 0, calibrated.width, calibrated.height);
  const data = img.data;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const count = Math.max(1, data.length / 4);
  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
  }

  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  const gray = (meanR + meanG + meanB) / 3;
  const scaleR = gray / Math.max(1, meanR);
  const scaleG = gray / Math.max(1, meanG);
  const scaleB = gray / Math.max(1, meanB);

  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(Math.pow((data[i] * scaleR) / 255, 0.95) * 255, 0, 255);
    data[i + 1] = clamp(Math.pow((data[i + 1] * scaleG) / 255, 0.95) * 255, 0, 255);
    data[i + 2] = clamp(Math.pow((data[i + 2] * scaleB) / 255, 0.95) * 255, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
  return calibrated;
}

export function extractEdgeVector(canvas, outWidth, outHeight) {
  const sample = createCanvas(outWidth, outHeight);
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, outWidth, outHeight);
  const data = ctx.getImageData(0, 0, outWidth, outHeight).data;
  const luminance = new Float32Array(outWidth * outHeight);

  for (let i = 0; i < luminance.length; i += 1) {
    const idx = i * 4;
    luminance[i] = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
  }

  const edge = new Array(outWidth * outHeight).fill(0);
  for (let y = 1; y < outHeight - 1; y += 1) {
    for (let x = 1; x < outWidth - 1; x += 1) {
      const i = y * outWidth + x;
      const gx =
        -luminance[(y - 1) * outWidth + (x - 1)]
        - 2 * luminance[y * outWidth + (x - 1)]
        - luminance[(y + 1) * outWidth + (x - 1)]
        + luminance[(y - 1) * outWidth + (x + 1)]
        + 2 * luminance[y * outWidth + (x + 1)]
        + luminance[(y + 1) * outWidth + (x + 1)];
      const gy =
        -luminance[(y - 1) * outWidth + (x - 1)]
        - 2 * luminance[(y - 1) * outWidth + x]
        - luminance[(y - 1) * outWidth + (x + 1)]
        + luminance[(y + 1) * outWidth + (x - 1)]
        + 2 * luminance[(y + 1) * outWidth + x]
        + luminance[(y + 1) * outWidth + (x + 1)];
      edge[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  return normalizeVector(edge);
}

export function buildInkMask(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const mask = new Array(width * height).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const hsv = rgbToHsv(r, g, b);
      const luminance = r * 0.299 + g * 0.587 + b * 0.114;
      const darkInk = Math.max(0, (170 - luminance) / 170);
      const satInk = Math.max(0, (hsv.s - 0.18) * 1.2);
      mask[i] = darkInk * 0.72 + satInk * 0.28;
    }
  }

  return normalizeVector(mask);
}

export function makeVariants(sourceCanvas, outWidth, outHeight, scales, offsets) {
  const variants = [];
  for (let i = 0; i < scales.length; i += 1) {
    for (let j = 0; j < offsets.length; j += 1) {
      const variant = createCanvas(outWidth, outHeight);
      const ctx = variant.getContext("2d", { willReadFrequently: true });
      const scale = scales[i];
      const offset = offsets[j];
      const drawW = outWidth * scale;
      const drawH = outHeight * scale;
      const dx = (outWidth - drawW) / 2 + offset.dx;
      const dy = (outHeight - drawH) / 2 + offset.dy;
      ctx.clearRect(0, 0, outWidth, outHeight);
      ctx.drawImage(sourceCanvas, dx, dy, drawW, drawH);
      variants.push(variant);
    }
  }
  return variants;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load template: " + url));
    img.src = url;
  });
}

async function ensureTemplateStore() {
  if (templateStore) {
    return templateStore;
  }
  if (templateStorePromise) {
    return templateStorePromise;
  }

  templateStorePromise = (async () => {
    const resources = {};
    for (let i = 0; i < RESOURCE_OPTIONS.length; i += 1) {
      const resource = RESOURCE_OPTIONS[i];
      const rel = RESOURCE_TEMPLATE_FILES[resource];
      const url = new URL(rel, import.meta.url).toString();
      const img = await loadImage(url);
      const base = createCanvas(56, 56);
      base.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, 56, 56);
      const variants = makeVariants(base, 56, 56, [0.9, 1, 1.1], [
        { dx: 0, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 }
      ]);
      resources[resource] = {
        edgeVectors: variants.map((variant) => extractEdgeVector(variant, 56, 56)),
        inkVectors: variants.map((variant) => buildInkMask(variant))
      };
    }
    templateStore = resources;
    return templateStore;
  })();

  try {
    return await templateStorePromise;
  } finally {
    templateStorePromise = null;
  }
}

export function bestSimilarity(vector, bank) {
  let best = -Infinity;
  for (let i = 0; i < bank.length; i += 1) {
    const score = cosineSimilarity(vector, bank[i]);
    if (score > best) {
      best = score;
    }
  }
  return best;
}

function zScoreNormalize(entries) {
  const values = entries.map((entry) => entry.score);
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const variance = values.reduce((sum, value) => {
    const d = value - mean;
    return sum + d * d;
  }, 0) / Math.max(1, values.length - 1);
  const std = Math.sqrt(Math.max(variance, 1e-8));
  return entries.map((entry) => ({
    ...entry,
    score: (entry.score - mean) / std
  }));
}

function computeColorImportance(scores, assignedResource) {
  const assigned = scores.find((entry) => entry.resource === assignedResource);
  const others = scores.filter((entry) => entry.resource !== assignedResource);
  if (!assigned || !others.length) {
    return { colorImportance: 0.5, iconImportance: 0.5 };
  }

  let bestOtherBody = -Infinity;
  let bestOtherIcon = -Infinity;
  for (let i = 0; i < others.length; i += 1) {
    bestOtherBody = Math.max(bestOtherBody, others[i].bodyScore);
    bestOtherIcon = Math.max(bestOtherIcon, others[i].iconScore);
  }

  const bodyMargin = assigned.bodyScore - bestOtherBody;
  const iconMargin = assigned.iconScore - bestOtherIcon;
  const bodyPositive = Math.max(0, bodyMargin);
  const iconPositive = Math.max(0, iconMargin);

  let colorImportance = 0.5;
  if (bodyPositive + iconPositive > 1e-6) {
    colorImportance = bodyPositive / (bodyPositive + iconPositive);
  } else {
    colorImportance = Math.abs(bodyMargin) / (Math.abs(bodyMargin) + Math.abs(iconMargin) + 1e-6);
  }
  colorImportance = clamp(colorImportance, 0, 1);
  return {
    colorImportance,
    iconImportance: 1 - colorImportance
  };
}


function extractTileBodyFeatures(ctx, center, geometry) {
  const patch = createCanvas(72, 72);
  const patchCtx = patch.getContext("2d", { willReadFrequently: true });
  const spanW = geometry.hexW * 0.74;
  const spanH = geometry.hexH * 0.74;
  patchCtx.drawImage(ctx.canvas, center.x - spanW / 2, center.y - spanH / 2, spanW, spanH, 0, 0, 72, 72);
  const data = patchCtx.getImageData(0, 0, 72, 72).data;

  let sumH = 0;
  let sumS = 0;
  let sumV = 0;
  let count = 0;
  let textureEnergy = 0;

  const luma = new Float32Array(72 * 72);
  for (let y = 0; y < 72; y += 1) {
    for (let x = 0; x < 72; x += 1) {
      const idx = y * 72 + x;
      const p = idx * 4;
      luma[idx] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255;
    }
  }

  for (let y = 2; y < 70; y += 1) {
    for (let x = 2; x < 70; x += 1) {
      const nx = ((x + 0.5) / 72) * 2 - 1;
      const ny = ((y + 0.5) / 72) * 2 - 1;
      const hexMask = (Math.abs(nx) + Math.abs(ny) * 0.85) <= 0.92;
      if (!hexMask) {
        continue;
      }

      const tokenDx = nx;
      const tokenDy = ny;
      if (tokenDx * tokenDx + tokenDy * tokenDy < 0.36) {
        continue;
      }

      const iconDx = nx;
      const iconDy = ny + 0.21;
      if (iconDx * iconDx + iconDy * iconDy < 0.055) {
        continue;
      }

      const idx = y * 72 + x;
      const p = idx * 4;
      const hsv = rgbToHsv(data[p], data[p + 1], data[p + 2]);
      sumH += hsv.h;
      sumS += hsv.s;
      sumV += hsv.v;
      count += 1;

      const gx = luma[idx + 1] - luma[idx - 1];
      const gy = luma[idx + 72] - luma[idx - 72];
      textureEnergy += Math.sqrt(gx * gx + gy * gy);
    }
  }

  if (!count) {
    return { h: 0, s: 0, v: 0, texture: 0 };
  }

  return {
    h: sumH / count,
    s: sumS / count,
    v: sumV / count,
    texture: textureEnergy / count
  };
}

function scoreBodyFeatures(features, resource) {
  const h = features.h;
  const s = features.s;
  const v = features.v;

  let score = 0;

  switch (resource) {
    case "brick":
      // Red/Orange, high saturation
      if (h < 35 || h > 340) score += 2;
      else if (h < 45) score += 1;
      else score -= 2;
      if (s > 0.45) score += 1;
      else score -= 1;
      break;

    case "wheat":
      // Yellow/Orange, high saturation
      if (h >= 30 && h <= 65) score += 2;
      else if (h > 20 && h < 75) score += 1;
      else score -= 2;
      if (s > 0.45) score += 1;
      else score -= 1;
      break;

    case "sheep":
      // Light Green / Yellow-Green
      if (h >= 55 && h <= 125) score += 2;
      else if (h > 45 && h < 140) score += 1;
      else score -= 2;
      if (s > 0.4) score += 1;
      else score -= 1;
      if (v > 0.5) score += 0.5;
      break;

    case "wood":
      // Dark Green
      if (h >= 90 && h <= 165) score += 2;
      else if (h > 75 && h < 180) score += 1;
      else score -= 2;
      if (v < 0.75) score += 1; // Wood is usually darker
      else score -= 1;
      break;

    case "ore":
      // Gray (low saturation)
      if (s < 0.38) score += 3;
      else if (s < 0.45) score += 1;
      else score -= 3;
      break;

    case "desert":
      // Sand/Yellowish, but lower saturation than Wheat
      if (h >= 35 && h <= 75) score += 1;
      else score -= 1;
      if (s > 0.25 && s < 0.55) score += 2;
      else score -= 1;
      break;
  }

  return score;
}

function buildRepeatedLabelPool(targetCounts, orderedLabels) {
  const pool = [];
  for (let i = 0; i < orderedLabels.length; i += 1) {
    const label = orderedLabels[i];
    const count = targetCounts[label] || 0;
    for (let c = 0; c < count; c += 1) {
      pool.push(label);
    }
  }
  return pool;
}

export function hungarianMinimize(costMatrix) {
  const n = costMatrix.length;
  const m = n ? costMatrix[0].length : 0;
  if (!n || n !== m) {
    return [];
  }

  const u = new Array(n + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0);
  const way = new Array(m + 1).fill(0);

  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(Infinity);
    const used = new Array(m + 1).fill(false);
    while (true) {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j += 1) {
        if (used[j]) {
          continue;
        }
        const cur = costMatrix[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j += 1) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
      if (p[j0] === 0) {
        break;
      }
    }
    while (true) {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
      if (j0 === 0) {
        break;
      }
    }
  }

  const assignment = new Array(n).fill(-1);
  for (let j = 1; j <= m; j += 1) {
    if (p[j] > 0) {
      assignment[p[j] - 1] = j - 1;
    }
  }
  return assignment;
}

function globalAssignResources(entries, modeKey) {
  const targetCounts = MODE_RESOURCE_COUNTS[modeKey] || MODE_RESOURCE_COUNTS.four;
  const labelPool = buildRepeatedLabelPool(targetCounts, RESOURCE_OPTIONS);
  if (entries.length !== labelPool.length) {
    return entries;
  }

  let maxScore = -Infinity;
  const scoreMatrix = entries.map((entry) => {
    const row = labelPool.map((label) => {
      const found = entry.scores.find((option) => option.resource === label);
      const score = found ? found.score : -8;
      if (score > maxScore) {
        maxScore = score;
      }
      return score;
    });
    return row;
  });

  if (!Number.isFinite(maxScore)) {
    maxScore = 0;
  }

  const costMatrix = scoreMatrix.map((row) => row.map((score) => maxScore - score));
  const assignment = hungarianMinimize(costMatrix);
  if (!assignment.length) {
    return entries;
  }

  return entries.map((entry, index) => {
    const assigned = labelPool[assignment[index]];
    const assignedScore = entry.scores.find((option) => option.resource === assigned)?.score ?? -Infinity;
    const nextScore = entry.scores.find((option) => option.resource !== assigned)?.score ?? assignedScore - 1;
    return {
      ...entry,
      resource: assigned,
      confidence: clamp(0.44 + (assignedScore - nextScore) * 0.2 + Math.max(0, assignedScore) * 0.08, 0, 1)
    };
  });
}

function scoreTileResources(ctx, center, geometry) {
  const bodyFeatures = extractTileBodyFeatures(ctx, center, geometry);
  const scoreByResource = {};

  for (let j = 0; j < RESOURCE_OPTIONS.length; j += 1) {
    const resource = RESOURCE_OPTIONS[j];
    const bodyScore = scoreBodyFeatures(bodyFeatures, resource);
    scoreByResource[resource] = bodyScore;
  }

  const normalized = zScoreNormalize(RESOURCE_OPTIONS.map((resource) => ({
    resource,
    score: scoreByResource[resource],
    bodyScore: scoreByResource[resource]
  })));

  return {
    ranked: normalized.sort((a, b) => b.score - a.score),
    bodyFeatures
  };
}



export async function detectTiles(centerStageResult) {
  const modeKey = centerStageResult.modeKey === "six" ? "six" : "four";
  const ctx = centerStageResult.debugCanvas.getContext("2d", { willReadFrequently: true });

  const scored = centerStageResult.centers.map((tileCenter) => ({
    ...(() => {
      const scoredTile = scoreTileResources(ctx, tileCenter, centerStageResult.geometry);
      return {
        scores: scoredTile.ranked,
        bodyFeatures: scoredTile.bodyFeatures
      };
    })(),
    ...tileCenter,
  }));

  const assigned = globalAssignResources(scored, modeKey).map((tile) => ({
    tileId: tile.tileId,
    row: tile.row,
    col: tile.col,
    resource: tile.resource || tile.scores[0].resource,
    confidence: tile.confidence || clamp(0.45 + (tile.scores[0].score - (tile.scores[1]?.score ?? tile.scores[0].score - 1)) * 0.2, 0, 1),
    colorImportance: 1.0,
    iconImportance: 0.0,
    bodyFeatures: tile.bodyFeatures,
    alternatives: tile.scores.slice(0, 3)
  }));

  const lowConfidenceCount = assigned.filter((tile) => tile.confidence < TILE_CONFIDENCE_THRESHOLD).length;
  const averageConfidence = assigned.reduce((sum, tile) => sum + tile.confidence, 0) / Math.max(1, assigned.length);
  const averageColorImportance = 1.0;

  return {
    modeKey,
    tiles: assigned,
    quality: {
      lowConfidenceCount,
      averageConfidence,
      averageColorImportance,
      threshold: TILE_CONFIDENCE_THRESHOLD
    }
  };
}
