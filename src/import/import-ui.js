import { createImportState } from "./state-model.js";
import { DETECTION_SERVICE_URL } from "./constants.js";
import { loadImage } from "./canvas-utils.js";

function getElements() {
  return {
    detectBtn: document.getElementById("detectFromImage"),
    imageInput: document.getElementById("boardImageInput"),
    modeEl: document.getElementById("mode"),
    statusEl: document.getElementById("status"),
    reviewPanel: document.getElementById("importReview"),
    reviewSummaryEl: document.getElementById("importReviewSummary"),
    reviewListEl: document.getElementById("importReviewList")
  };
}

function setStatus(statusEl, msg, error = false) {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = msg;
  statusEl.style.color = error ? "#9f2a20" : "var(--muted)";
}

function clearReview(reviewPanel, reviewSummaryEl, reviewListEl) {
  if (!reviewPanel || !reviewListEl || !reviewSummaryEl) {
    return;
  }
  reviewPanel.hidden = true;
  reviewSummaryEl.textContent = "";
  reviewListEl.innerHTML = "";
  const visual = reviewPanel.querySelector(".import-review-visual");
  if (visual) {
    visual.remove();
  }
}

function buildCenterOverlayDataUrl(centerResult) {
  if (!centerResult || !centerResult.bounds || !centerResult.bounds.source || !centerResult.bounds.original) {
    return null;
  }

  const source = centerResult.bounds.source;
  const originalBounds = centerResult.bounds.original;
  const normalizedBounds = centerResult.bounds.normalized || { w: 960, h: 960 };
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);

  const mapToSource = (p) => ({
    x: originalBounds.x + (p.x / Math.max(1, normalizedBounds.w)) * originalBounds.w,
    y: originalBounds.y + (p.y / Math.max(1, normalizedBounds.h)) * originalBounds.h
  });

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillStyle = "rgba(20, 24, 31, 0.8)";
  ctx.font = "12px Trebuchet MS, Segoe UI, sans-serif";
  const centers = centerResult.centers || [];
  const spiralOrder = centerResult.spiralOrder || [];
  const spiralIndexByTileId = new Map();
  for (let i = 0; i < spiralOrder.length; i += 1) {
    spiralIndexByTileId.set(spiralOrder[i], i + 1);
  }
  for (let i = 0; i < centers.length; i += 1) {
    const mapped = mapToSource(centers[i]);
    const label = spiralIndexByTileId.get(centers[i].tileId) || (i + 1);
    ctx.beginPath();
    ctx.arc(mapped.x, mapped.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mapped.x, mapped.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 72, 72, 0.95)";
    ctx.fill();
    ctx.fillStyle = "rgba(20, 24, 31, 0.85)";
    ctx.fillRect(mapped.x + 8, mapped.y - 9, 18, 14);
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillText(String(label), mapped.x + 11, mapped.y + 1);
  }

  const frameSlots = centerResult.frameSlots || [];
  ctx.strokeStyle = "rgba(70, 185, 255, 0.8)";
  for (let i = 0; i < frameSlots.length; i += 1) {
    const s = mapToSource(frameSlots[i]);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 212, 107, 0.85)";
  ctx.lineWidth = 2;
  ctx.strokeRect(originalBounds.x, originalBounds.y, originalBounds.w, originalBounds.h);
  ctx.restore();

  return canvas.toDataURL("image/png");
}

function renderCentersPreview(state, reviewPanel, reviewListEl) {
  if (!state || !state.centersOverlayUrl || !reviewPanel || !reviewListEl) {
    return;
  }

  const existing = reviewPanel.querySelector(".import-review-visual");
  if (existing) {
    existing.remove();
  }

  const block = document.createElement("div");
  block.className = "import-review-visual";

  const title = document.createElement("div");
  title.className = "import-review-visual-title";
  title.textContent = "Detected hex centers on full selected image (spiral order labels)";

  const image = document.createElement("img");
  image.className = "import-review-centers-image";
  image.alt = "Board preview with detected hex centers";
  image.src = state.centersOverlayUrl;

  block.append(title, image);
  reviewListEl.parentNode.insertBefore(block, reviewListEl);
}

function renderFinalReview(state, refs) {
  const { reviewPanel, reviewSummaryEl, reviewListEl } = refs;
  if (!reviewPanel || !reviewSummaryEl || !reviewListEl) {
    return;
  }
  reviewPanel.hidden = false;
  reviewListEl.innerHTML = "";

  const low = state.tileQuality ? state.tileQuality.lowConfidenceCount : 0;
  const avg = state.tileQuality ? state.tileQuality.averageConfidence : 1.0;
  reviewSummaryEl.textContent =
    "Import complete! " + low + " low-confidence tile(s), average confidence " + avg.toFixed(3) + ".";

  const overviewRows = [
    ["Stage", "Full Board Detected"],
    ["Mode", state.modeKey],
    ["Hex centers", String(state.centers.length)],
    ["Detected Harbors", String(state.ports.length)],
    ["Low-confidence tiles", String(low)],
    ["Average confidence", avg.toFixed(3)]
  ];

  for (let i = 0; i < overviewRows.length; i += 1) {
    const row = document.createElement("div");
    row.className = "import-review-item";

    const label = document.createElement("span");
    label.className = "import-review-label";
    label.textContent = overviewRows[i][0];

    const value = document.createElement("span");
    value.className = "import-review-meta";
    value.textContent = overviewRows[i][1];

    row.append(label, value);
    reviewListEl.appendChild(row);
  }

  const note = document.createElement("p");
  note.className = "import-review-empty";
  note.textContent = "The board has been updated with the detected layout.";
  reviewListEl.appendChild(note);

  renderCentersPreview(state, reviewPanel, reviewListEl);
}

export function initImportUI() {
  const refs = getElements();
  const { detectBtn, imageInput, modeEl, statusEl, reviewPanel, reviewSummaryEl, reviewListEl } = refs;
  if (!detectBtn || !imageInput || !modeEl || !statusEl) {
    return;
  }

  let state = createImportState(modeEl.value === "six" ? "six" : "four");

  detectBtn.addEventListener("click", () => {
    imageInput.value = "";
    imageInput.click();
  });

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files && imageInput.files[0];
    if (!file) {
      return;
    }

    clearReview(reviewPanel, reviewSummaryEl, reviewListEl);
    setStatus(statusEl, "Processing image using Python microservice...", false);
    detectBtn.disabled = true;

    try {
      const modeKey = modeEl.value === "six" ? "six" : "four";
      state = createImportState(modeKey);
      
      const image = await loadImage(file);
      
      const formData = new FormData();
      formData.append("image", file);
      formData.append("mode", modeKey);

      const serviceUrl = (window.appConfig && window.appConfig.DETECTION_SERVICE_URL) || window.DETECTION_SERVICE_URL || DETECTION_SERVICE_URL;
      const response = await fetch(serviceUrl, {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        let errMsg = "Board detection failed.";
        try {
          const errData = await response.json();
          errMsg = errData.detail || errMsg;
        } catch (e) {}
        throw new Error(errMsg);
      }

      const result = await response.json();

      state.centers = result.centers;
      state.frameSlots = result.frameSlots;
      state.bounds = {
        source: image,
        original: result.bounds.original,
        normalized: result.bounds.normalized
      };
      state.quality = result.quality;
      state.centersOverlayUrl = buildCenterOverlayDataUrl(state);
      state.tiles = result.tiles;
      state.tileQuality = result.tileQuality;
      state.ports = result.ports;
      state.stage = "harbors";
      state.needsReview = true;

      const mappedTiles = state.tiles.map((t) => ({
        id: t.tileId,
        resource: t.resource,
        token: t.token
      }));

      const codeFunc = window.boardCodeFromTiles || (window.app && window.app.boardCodeFromTiles);
      if (codeFunc) {
        const code = codeFunc(mappedTiles, result.spiralOrder, state.ports);
        const codeEl = document.getElementById("boardCode");
        if (codeEl) {
          codeEl.value = code;
        }
        const generateBtn = document.getElementById("generateBoard");
        if (generateBtn) {
          generateBtn.click();
        }
      }

      renderFinalReview(state, refs);
      setStatus(statusEl, "Board imported successfully from image!", false);
    } catch (error) {
      clearReview(reviewPanel, reviewSummaryEl, reviewListEl);
      setStatus(statusEl, (error && error.message) || "Detection failed.", true);
    } finally {
      detectBtn.disabled = false;
    }
  });
}
