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

    // Measure true screen & parent width
    const screenWidth = document.documentElement.clientWidth || window.innerWidth;
    const parentWidth = viewport.parentElement ? viewport.parentElement.clientWidth : screenWidth;
    const maxAvailableWidth = Math.max(240, Math.min(screenWidth - 16, parentWidth - 8));
    
    const scale = Math.min(1, maxAvailableWidth / boardWidth);

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

initImportUI();
initToolTabs();
initBoardAutoscale();
