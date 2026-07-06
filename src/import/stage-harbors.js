import {
  HARBOR_TEMPLATE_FILES,
  MODE_HARBOR_POOLS,
  MODE_FRAME_SLOTS
} from "./constants.js";
import { clamp } from "./math-utils.js";
import { createCanvas } from "./canvas-utils.js";
import { calibrateCanvasColors, extractEdgeVector, buildInkMask, cosineSimilarity, bestSimilarity, hungarianMinimize } from "./stage-tiles.js";

let harborTemplateStore = null;
let harborTemplateStorePromise = null;

const HARBOR_TYPES = ["3:1", "wood 2:1", "brick 2:1", "sheep 2:1", "wheat 2:1", "ore 2:1"];

function loadTemplateImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load harbor template: " + url));
    img.src = url;
  });
}

function makeHarborVariants(sourceCanvas, outWidth, outHeight, scales, angles, offsets) {
  const variants = [];
  for (const scale of scales) {
    for (const angle of angles) {
      for (const offset of offsets) {
        const variant = createCanvas(outWidth, outHeight);
        const ctx = variant.getContext("2d", { willReadFrequently: true });
        ctx.clearRect(0, 0, outWidth, outHeight);
        ctx.save();
        ctx.translate(outWidth / 2, outHeight / 2);
        ctx.rotate(angle);
        ctx.scale(scale, scale);
        ctx.drawImage(sourceCanvas, -outWidth / 2 + offset.dx, -outHeight / 2 + offset.dy);
        ctx.restore();
        variants.push(variant);
      }
    }
  }
  return variants;
}

async function ensureHarborTemplateStore() {
  if (harborTemplateStore) {
    return harborTemplateStore;
  }
  if (harborTemplateStorePromise) {
    return harborTemplateStorePromise;
  }

  harborTemplateStorePromise = (async () => {
    const store = {};
    const angles = [0, Math.PI / 3, 2 * Math.PI / 3, Math.PI, 4 * Math.PI / 3, 5 * Math.PI / 3];
    const scales = [0.9, 1.0, 1.1];
    const offsets = [{ dx: 0, dy: 0 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 }];

    for (let i = 0; i < HARBOR_TYPES.length; i += 1) {
      const type = HARBOR_TYPES[i];
      const rel = HARBOR_TEMPLATE_FILES[type];
      const url = new URL(rel, import.meta.url).toString();
      const img = await loadTemplateImage(url);
      const base = createCanvas(56, 56);
      base.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, 56, 56);
      
      const variants = makeHarborVariants(base, 56, 56, scales, angles, offsets);
      store[type] = {
        edgeVectors: variants.map((variant) => extractEdgeVector(variant, 56, 56)),
        inkVectors: variants.map((variant) => buildInkMask(variant))
      };
    }
    harborTemplateStore = store;
    return harborTemplateStore;
  })();

  try {
    return await harborTemplateStorePromise;
  } finally {
    harborTemplateStorePromise = null;
  }
}

function globalAssignHarbors(scoredSlots, modeKey) {
  const harborsPool = [...MODE_HARBOR_POOLS[modeKey]];
  const totalSlots = MODE_FRAME_SLOTS[modeKey];
  const emptyCount = totalSlots - harborsPool.length;
  for (let i = 0; i < emptyCount; i += 1) {
    harborsPool.push("empty");
  }

  if (scoredSlots.length !== harborsPool.length) {
    return scoredSlots;
  }

  const emptyThreshold = 0.53;

  let maxScore = -Infinity;
  const scoreMatrix = scoredSlots.map((entry) => {
    const row = harborsPool.map((label) => {
      let score = emptyThreshold;
      if (label !== "empty") {
        score = entry.scores[label] ?? -8;
      }
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
    return scoredSlots;
  }

  return scoredSlots.map((entry, index) => {
    const assignedLabel = harborsPool[assignment[index]];
    return {
      ...entry,
      assigned: assignedLabel
    };
  });
}

export async function detectHarbors(centerStageResult) {
  const templates = await ensureHarborTemplateStore();
  const modeKey = centerStageResult.modeKey === "six" ? "six" : "four";
  const calibratedCanvas = calibrateCanvasColors(centerStageResult.debugCanvas);
  const ctx = calibratedCanvas.getContext("2d", { willReadFrequently: true });

  const hexW = centerStageResult.geometry.hexW;
  const frameSlots = centerStageResult.frameSlots;

  const scoredSlots = frameSlots.map((slot) => {
    const scores = {};
    const spanW = hexW * 0.34;
    const spanH = hexW * 0.34;

    const patch = createCanvas(56, 56);
    const patchCtx = patch.getContext("2d", { willReadFrequently: true });
    patchCtx.drawImage(ctx.canvas, slot.x - spanW / 2, slot.y - spanH / 2, spanW, spanH, 0, 0, 56, 56);

    const edgeVector = extractEdgeVector(patch, 56, 56);
    const inkVector = buildInkMask(patch);

    HARBOR_TYPES.forEach((type) => {
      const t = templates[type];
      const edgeScore = bestSimilarity(edgeVector, t.edgeVectors);
      const inkScore = bestSimilarity(inkVector, t.inkVectors);
      scores[type] = (inkScore * 0.74 + edgeScore * 0.26);
    });

    return {
      index: slot.slotIndex,
      scores
    };
  });

  const assignedSlots = globalAssignHarbors(scoredSlots, modeKey);
  const detectedPorts = assignedSlots
    .filter((slot) => slot.assigned !== "empty")
    .map((slot) => ({
      slotIndex: slot.index,
      label: slot.assigned
    }));

  return {
    modeKey,
    ports: detectedPorts
  };
}
