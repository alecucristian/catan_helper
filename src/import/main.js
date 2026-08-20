import { initImportUI } from "./import-ui.js";

function initToolTabs() {
  const tabs = document.querySelectorAll(".tool-tab");
  const panels = document.querySelectorAll(".tool-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const panelId = tab.getAttribute("data-panel");

      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));

      tab.classList.add("active");
      const activePanel = document.getElementById(`panel-${panelId}`);
      if (activePanel) {
        activePanel.classList.add("active");
      }
    });
  });
}

function initBoardAutoscale() {
  const viewport = document.getElementById("boardViewport");
  const scaler = document.getElementById("boardScaler");
  const wrap = document.getElementById("boardWrap");
  const board = document.getElementById("board");

  if (!viewport || !scaler || !wrap || !board) {
    return;
  }

  function scaleBoard() {
    const boardWidth = board.offsetWidth;
    const boardHeight = board.offsetHeight;

    if (!boardWidth || !boardHeight) {
      return;
    }

    const screenWidth = document.documentElement.clientWidth || window.innerWidth;
    const parentWidth = viewport.parentElement ? viewport.parentElement.clientWidth : screenWidth;
    const availableWidth = Math.max(240, Math.min(screenWidth - 24, parentWidth - 12));
    
    // Zoom out slightly (0.93 factor) so ports and ocean frame have breathing room
    const rawScale = availableWidth / boardWidth;
    const scale = Math.min(0.96, rawScale * 0.93);

    wrap.style.width = `${boardWidth}px`;
    wrap.style.height = `${boardHeight}px`;
    wrap.style.transform = `scale(${scale})`;
    wrap.style.transformOrigin = "top left";

    scaler.style.width = `${Math.round(boardWidth * scale)}px`;
    scaler.style.height = `${Math.round(boardHeight * scale)}px`;
    scaler.style.margin = "0 auto";
  }

  window.addEventListener("resize", scaleBoard);
  window.addEventListener("orientationchange", scaleBoard);

  const observer = new MutationObserver(() => {
    requestAnimationFrame(scaleBoard);
  });
  observer.observe(board, { childList: true, attributes: true, subtree: true });

  setTimeout(scaleBoard, 30);
  setTimeout(scaleBoard, 150);
  setTimeout(scaleBoard, 500);
}

function initPipPhotoAndModalEdit() {
  let activeEditTileId = null;
  const pipModal = document.getElementById("pipPhotoModal");
  const pipImg = document.getElementById("pipPhotoImg");
  const togglePipBtn = document.getElementById("togglePipPhotoBtn");
  const pipCloseBtn = document.getElementById("pipCloseBtn");
  const pipMinBtn = document.getElementById("pipMinimizeBtn");

  const hexEditModal = document.getElementById("hexEditModal");
  const hexEditTitle = document.getElementById("hexEditTitle");
  const hexEditCloseBtn = document.getElementById("hexEditCloseBtn");

  window.openPipPhoto = function (url) {
    if (!url || !pipModal || !pipImg) {
      return;
    }
    pipImg.src = url;
    pipModal.classList.remove("hidden", "minimized");
    if (togglePipBtn) {
      togglePipBtn.classList.remove("hidden");
    }
  };

  if (togglePipBtn) {
    togglePipBtn.addEventListener("click", () => {
      if (!pipModal) return;
      if (pipModal.classList.contains("hidden")) {
        pipModal.classList.remove("hidden", "minimized");
      } else {
        pipModal.classList.toggle("minimized");
      }
    });
  }

  if (pipCloseBtn) {
    pipCloseBtn.addEventListener("click", () => {
      if (pipModal) pipModal.classList.add("hidden");
    });
  }

  if (pipMinBtn) {
    pipMinBtn.addEventListener("click", () => {
      if (pipModal) pipModal.classList.toggle("minimized");
    });
  }

  window.openHexEditModal = function (tileId) {
    if (!hexEditModal || !window.appState || !window.appState.tiles) return;
    const tile = window.appState.tiles.find((t) => t.id === tileId);
    if (!tile) return;

    activeEditTileId = tileId;
    if (hexEditTitle) {
      hexEditTitle.textContent = `Edit Hex #${tileId + 1} (${tile.resource.toUpperCase()} ${tile.token || ""})`;
    }

    document.querySelectorAll(".res-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-res") === tile.resource);
    });

    document.querySelectorAll(".token-btn").forEach((btn) => {
      const val = btn.getAttribute("data-token");
      const isCurrent = val === "null" ? tile.token === null : Number(val) === tile.token;
      btn.classList.toggle("active", isCurrent);
    });

    hexEditModal.classList.remove("hidden");
  };

  if (hexEditCloseBtn) {
    hexEditCloseBtn.addEventListener("click", () => {
      if (hexEditModal) hexEditModal.classList.add("hidden");
    });
  }

  if (hexEditModal) {
    hexEditModal.addEventListener("click", (e) => {
      if (e.target === hexEditModal) {
        hexEditModal.classList.add("hidden");
      }
    });
  }

  document.querySelectorAll(".res-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (activeEditTileId === null || !window.appState) return;
      const res = btn.getAttribute("data-res");
      const tile = window.appState.tiles.find((t) => t.id === activeEditTileId);
      if (tile && res) {
        tile.resource = res;
        if (res === "desert") tile.token = null;
        if (typeof window.updateBoardAndCode === "function") window.updateBoardAndCode();
        window.openHexEditModal(activeEditTileId);
      }
    });
  });

  document.querySelectorAll(".token-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (activeEditTileId === null || !window.appState) return;
      const rawVal = btn.getAttribute("data-token");
      const tokenVal = rawVal === "null" ? null : Number(rawVal);
      const tile = window.appState.tiles.find((t) => t.id === activeEditTileId);
      if (tile) {
        tile.token = tokenVal;
        if (typeof window.updateBoardAndCode === "function") window.updateBoardAndCode();
        window.openHexEditModal(activeEditTileId);
      }
    });
  });
}

initImportUI();
initToolTabs();
initBoardAutoscale();
initPipPhotoAndModalEdit();
