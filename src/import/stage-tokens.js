import {
  TOKEN_TEMPLATE_FILES,
  MODE_TOKEN_POOLS,
  NORMALIZED_BOARD_SIZE
} from "./constants.js";
import { clamp } from "./math-utils.js";
import { createCanvas, rgbToHsv } from "./canvas-utils.js";
import { calibrateCanvasColors, extractEdgeVector, buildInkMask, makeVariants, cosineSimilarity, bestSimilarity, hungarianMinimize } from "./stage-tiles.js";

let tokenTemplateStore = null;
let tokenTemplateStorePromise = null;

const TOKEN_VALUES = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];

function loadTemplateImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load token template: " + url));
    img.src = url.startsWith('file://') ? url.replace('file://', '') : url;
  });
}

async function ensureTokenTemplateStore() {
  if (tokenTemplateStore) {
    return tokenTemplateStore;
  }
  if (tokenTemplateStorePromise) {
    return tokenTemplateStorePromise;
  }

  tokenTemplateStorePromise = (async () => {
    const store = {};
    for (let i = 0; i < TOKEN_VALUES.length; i += 1) {
      const val = TOKEN_VALUES[i];
      const rel = TOKEN_TEMPLATE_FILES[val];
      const url = typeof window !== 'undefined' && window.document 
        ? new URL(rel, import.meta.url).toString() 
        : 'file:///home/alecu/projects/catan_helper/src/import/' + rel;
      const img = await loadTemplateImage(url);
      const base = createCanvas(56, 56);
      base.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, 56, 56);
      const variants = makeVariants(base, 56, 56, [0.9, 1, 1.1], [
        { dx: 0, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 }
      ]);
      store[val] = {
        edgeVectors: variants.map((variant) => extractEdgeVector(variant, 56, 56)),
        inkVectors: variants.map((variant) => buildInkMask(variant))
      };
    }
    tokenTemplateStore = store;
    return tokenTemplateStore;
  })();

  try {
    return await tokenTemplateStorePromise;
  } finally {
    tokenTemplateStorePromise = null;
  }
}

function globalAssignTokens(scoredLandTiles, modeKey) {
  const tokenPool = MODE_TOKEN_POOLS[modeKey] || MODE_TOKEN_POOLS.four;
  if (scoredLandTiles.length !== tokenPool.length) {
    return scoredLandTiles;
  }

  let maxScore = -Infinity;
  const scoreMatrix = scoredLandTiles.map((entry) => {
    const row = tokenPool.map((tokenVal) => {
      const score = entry.scores[tokenVal] ?? -8;
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
    return scoredLandTiles;
  }

  return scoredLandTiles.map((entry, index) => {
    const assignedToken = tokenPool[assignment[index]];
    const assignedScore = entry.scores[assignedToken] ?? -Infinity;
    
    let secondBestScore = -Infinity;
    TOKEN_VALUES.forEach((val) => {
      if (val !== assignedToken) {
        secondBestScore = Math.max(secondBestScore, entry.scores[val] ?? -Infinity);
      }
    });

    const confidence = clamp(0.5 + (assignedScore - secondBestScore) * 0.25, 0, 1);

    return {
      ...entry,
      token: assignedToken,
      tokenConfidence: confidence
    };
  });
}

export async function detectTokens(centerStageResult, tileStageResult) {
  const templates = await ensureTokenTemplateStore();
  const modeKey = centerStageResult.modeKey === "six" ? "six" : "four";
  const calibratedCanvas = calibrateCanvasColors(centerStageResult.debugCanvas);
  const ctx = calibratedCanvas.getContext("2d", { willReadFrequently: true });

  const hexW = centerStageResult.geometry.hexW;
  const hexH = centerStageResult.geometry.hexH;
  const searchDist = hexW * 0.28;

  const landTiles = tileStageResult.tiles.filter((tile) => tile.resource !== "desert");

  const scoredLandTiles = landTiles.map((tile) => {
    const tileCenter = centerStageResult.centers.find((c) => c.tileId === tile.tileId);
    let cx = tileCenter.x;
    let cy = tileCenter.y;

    let closestMarker = null;
    let minDist = Infinity;
    const markers = centerStageResult.markerDebug.markers || [];
    for (let i = 0; i < markers.length; i += 1) {
      const m = markers[i];
      const d = Math.hypot(m.x - tileCenter.x, m.y - tileCenter.y);
      if (d < searchDist && d < minDist) {
        minDist = d;
        closestMarker = m;
      }
    }

    if (closestMarker) {
      cx = closestMarker.x;
      cy = closestMarker.y;
    }

    const scores = {};
    const spanW = hexW * 0.32;
    const spanH = hexW * 0.32;

    const patch = createCanvas(56, 56);
    const patchCtx = patch.getContext("2d", { willReadFrequently: true });
    patchCtx.drawImage(ctx.canvas, cx - spanW / 2, cy - spanH / 2, spanW, spanH, 0, 0, 56, 56);
    const edgeVector = extractEdgeVector(patch, 56, 56);
    const inkVector = buildInkMask(patch);

    // Detect red text!
    // Sample the center pixels to see if they are red.
    const data = patchCtx.getImageData(0, 0, 56, 56).data;
    let redCount = 0;
    let darkCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const hsv = rgbToHsv(data[i], data[i+1], data[i+2]);
      const luma = data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114;
      if (luma < 180) {
        darkCount++;
        if (hsv.s > 0.4 && (hsv.h < 20 || hsv.h > 340)) {
          redCount++;
        }
      }
    }
    const isRed = darkCount > 0 && (redCount / darkCount) > 0.3;

    let bestToken = null;
    let bestScore = -Infinity;
    let secondBestScore = -Infinity;

    TOKEN_VALUES.forEach((val) => {
      const t = templates[val];
      const edgeScore = bestSimilarity(edgeVector, t.edgeVectors);
      const inkScore = bestSimilarity(inkVector, t.inkVectors);
      
      let score = (inkScore * 0.74 + edgeScore * 0.26);
      
      // Boost 6 and 8 if red, heavily penalize if not.
      if (val === 6 || val === 8) {
        score += isRed ? 0.4 : -0.8;
      } else {
        score += isRed ? -0.8 : 0;
      }

      scores[val] = score;

      if (score > bestScore) {
        secondBestScore = bestScore;
        bestScore = score;
        bestToken = val;
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    });

    const confidence = clamp(0.5 + (bestScore - secondBestScore) * 0.25, 0, 1);

    return {
      tileId: tile.tileId,
      scores,
      x: cx,
      y: cy,
      token: bestToken,
      tokenConfidence: confidence
    };
  });

  const globallyAssigned = globalAssignTokens(scoredLandTiles, modeKey);

  const allTiles = tileStageResult.tiles.map((tile) => {
    if (tile.resource === "desert") {
      return {
        ...tile,
        token: null,
        tokenConfidence: 1
      };
    }
    const assigned = globallyAssigned.find((t) => t.tileId === tile.tileId);
    return {
      ...tile,
      token: assigned.token,
      tokenConfidence: assigned.tokenConfidence
    };
  });

  return {
    modeKey,
    tiles: allTiles
  };
}
