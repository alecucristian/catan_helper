(function () {
const detectBtn = document.getElementById("detectFromImage");
const imageInput = document.getElementById("boardImageInput");
const codeInput = document.getElementById("boardCode");
const generateBtn = document.getElementById("generateBoard");
const statusEl = document.getElementById("status");
const modeEl = document.getElementById("mode");
const reviewPanel = document.getElementById("importReview");
const reviewSummaryEl = document.getElementById("importReviewSummary");
const reviewListEl = document.getElementById("importReviewList");

if (!detectBtn || !imageInput || !codeInput || !generateBtn || !statusEl || !modeEl) {
return;
}

const MODE_ROWS = {
four: [3, 4, 5, 4, 3],
six: [3, 4, 5, 6, 5, 4, 3]
};
const MODE_PORT_SLOTS = {
four: 9,
six: 11
};
const MODE_FRAME_SLOTS = {
four: 18,
six: 22
};
const RESOURCE_LETTERS = {
wood: "W",
brick: "B",
sheep: "S",
wheat: "G",
ore: "O",
desert: "D"
};
const RESOURCE_OPTIONS = ["wood", "brick", "sheep", "wheat", "ore", "desert"];
const RESOURCE_LABELS = {
wood: "Wood",
brick: "Brick",
sheep: "Sheep",
wheat: "Wheat",
ore: "Ore",
desert: "Desert"
};
const MODE_RESOURCE_COUNTS = {
four: { wood: 4, brick: 3, sheep: 4, wheat: 4, ore: 3, desert: 1 },
six: { wood: 6, brick: 5, sheep: 6, wheat: 6, ore: 5, desert: 2 }
};
const TOKEN_VALUES = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
const HARBOR_LABELS = {
T: "3:1",
W: "wood 2:1",
B: "brick 2:1",
S: "sheep 2:1",
G: "wheat 2:1",
O: "ore 2:1"
};
const HARBOR_OPTIONS = ["T", "W", "B", "S", "G", "O"];
const REVIEW_THRESHOLD = {
resource: 0.6,
token: 0.58,
harbor: 0.56,
board: 0.52
};
const CANONICAL_BOARD_SIZE = 920;
let reviewState = null;

function setStatus(msg, error) {
statusEl.textContent = msg;
statusEl.style.color = error ? "#9f2a20" : "var(--muted)";
}

function clearReview() {
reviewState = null;
if (!reviewPanel) {
return;
}
reviewPanel.hidden = true;
reviewPanel.dataset.state = "clear";
if (reviewSummaryEl) {
reviewSummaryEl.textContent = "";
}
if (reviewListEl) {
reviewListEl.innerHTML = "";
}
}

function summarizeConfidence(score) {
if (score >= 0.82) {
return "high confidence";
}
if (score >= 0.62) {
return "medium confidence";
}
return "low confidence";
}

function loadImage(file) {
return new Promise((resolve, reject) => {
const img = new Image();
img.onload = () => resolve(img);
img.onerror = () => reject(new Error("Could not load image."));
img.src = URL.createObjectURL(file);
});
}

function rgbToHsv(r, g, b) {
r /= 255;
g /= 255;
b /= 255;
const max = Math.max(r, g, b);
const min = Math.min(r, g, b);
const d = max - min;
let h = 0;
if (d !== 0) {
switch (max) {
case r:
h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
break;
case g:
h = ((b - r) / d + 2) * 60;
break;
default:
h = ((r - g) / d + 4) * 60;
}
}
const s = max === 0 ? 0 : d / max;
return { h, s, v: max };
}

function averageHsv(points) {
let sx = 0;
let sy = 0;
let ss = 0;
let sv = 0;
for (let i = 0; i < points.length; i += 1) {
const p = points[i];
const rad = p.h * Math.PI / 180;
sx += Math.cos(rad);
sy += Math.sin(rad);
ss += p.s;
sv += p.v;
}
const h = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
return {
h,
s: ss / points.length,
v: sv / points.length
};
}

function hueDelta(a, b) {
const d = Math.abs(a - b) % 360;
return d > 180 ? 360 - d : d;
}

function clamp(value, min, max) {
return Math.max(min, Math.min(max, value));
}

function createCanvas(width, height) {
const canvas = document.createElement("canvas");
canvas.width = Math.max(1, Math.round(width));
canvas.height = Math.max(1, Math.round(height));
return canvas;
}

function drawImageToCanvas(img) {
const canvas = createCanvas(img.naturalWidth, img.naturalHeight);
const ctx = canvas.getContext("2d", { willReadFrequently: true });
ctx.drawImage(img, 0, 0);
return canvas;
}

function classifyBoardPixel(hsv) {
if (hsv.v < 0.12 || hsv.v > 0.96) {
return false;
}
if (hsv.s > 0.18 && !(hsv.h >= 160 && hsv.h <= 255 && hsv.v > 0.28)) {
return true;
}
if (hsv.v > 0.2 && hsv.v < 0.88 && hsv.s > 0.06 && (hsv.h < 80 || hsv.h > 95)) {
return true;
}
return hsv.v > 0.22 && hsv.v < 0.82 && hsv.s > 0.02 && hsv.h >= 18 && hsv.h <= 60;
}

function extractLargestComponent(mask, width, height) {
const visited = new Uint8Array(width * height);
const queue = [];
let best = null;
const push = (x, y) => {
if (x < 0 || y < 0 || x >= width || y >= height) {
return;
}
const index = y * width + x;
if (!mask[index] || visited[index]) {
return;
}
visited[index] = 1;
queue.push(index);
};

for (let y = 0; y < height; y += 1) {
for (let x = 0; x < width; x += 1) {
const start = y * width + x;
if (!mask[start] || visited[start]) {
continue;
}
visited[start] = 1;
queue.push(start);
const points = [];
let minX = x;
let maxX = x;
let minY = y;
let maxY = y;
let count = 0;

while (queue.length) {
const index = queue.pop();
const px = index % width;
const py = Math.floor(index / width);
points.push({ x: px, y: py });
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
best = { points, count, minX, maxX, minY, maxY };
}
}
}

return best;
}

function buildBoardMaskFromCanvas(canvas) {
const sourceCtx = canvas.getContext("2d", { willReadFrequently: true });
const sampleW = Math.min(280, canvas.width);
const scale = canvas.width / sampleW;
const sampleH = Math.max(1, Math.round(canvas.height / scale));
const sampleCanvas = createCanvas(sampleW, sampleH);
const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true });
ctx.drawImage(sourceCtx.canvas, 0, 0, sampleW, sampleH);
const imageData = ctx.getImageData(0, 0, sampleW, sampleH).data;
const mask = new Uint8Array(sampleW * sampleH);

for (let y = 0; y < sampleH; y += 1) {
for (let x = 0; x < sampleW; x += 1) {
const index = (y * sampleW + x) * 4;
const hsv = rgbToHsv(imageData[index], imageData[index + 1], imageData[index + 2]);
if (classifyBoardPixel(hsv)) {
mask[y * sampleW + x] = 1;
}
}
}

const component = extractLargestComponent(mask, sampleW, sampleH);
if (!component || component.count < 300) {
throw new Error("Could not find a Catan board in the uploaded image.");
}

return {
scale,
component: {
count: component.count,
minX: component.minX * scale,
maxX: (component.maxX + 1) * scale,
minY: component.minY * scale,
maxY: (component.maxY + 1) * scale,
points: component.points.map((point) => ({
x: (point.x + 0.5) * scale,
y: (point.y + 0.5) * scale
}))
}
};
}

function estimatePrincipalAngle(points) {
let meanX = 0;
let meanY = 0;
for (let i = 0; i < points.length; i += 1) {
meanX += points[i].x;
meanY += points[i].y;
}
meanX /= points.length;
meanY /= points.length;
let xx = 0;
let xy = 0;
let yy = 0;
for (let i = 0; i < points.length; i += 1) {
const dx = points[i].x - meanX;
const dy = points[i].y - meanY;
xx += dx * dx;
xy += dx * dy;
yy += dy * dy;
}
return 0.5 * Math.atan2(2 * xy, xx - yy);
}

function rotateCanvas(canvas, angle) {
const sin = Math.abs(Math.sin(angle));
const cos = Math.abs(Math.cos(angle));
const width = canvas.width;
const height = canvas.height;
const outWidth = Math.ceil(width * cos + height * sin);
const outHeight = Math.ceil(width * sin + height * cos);
const outCanvas = createCanvas(outWidth, outHeight);
const ctx = outCanvas.getContext("2d", { willReadFrequently: true });
ctx.translate(outWidth / 2, outHeight / 2);
ctx.rotate(angle);
ctx.drawImage(canvas, -width / 2, -height / 2);
return outCanvas;
}

function componentBounds(component) {
return {
x: component.minX,
y: component.minY,
w: component.maxX - component.minX,
h: component.maxY - component.minY
};
}

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

function detectBoardBounds(ctx, w, h, rows) {
const sampleW = Math.min(220, w);
const scale = w / sampleW;
const sampleH = Math.max(1, Math.round(h / scale));
const canvas = createCanvas(sampleW, sampleH);
const sampleCtx = canvas.getContext("2d", { willReadFrequently: true });
sampleCtx.drawImage(ctx.canvas, 0, 0, sampleW, sampleH);
const imageData = sampleCtx.getImageData(0, 0, sampleW, sampleH).data;
const mask = new Uint8Array(sampleW * sampleH);

for (let y = 0; y < sampleH; y += 1) {
for (let x = 0; x < sampleW; x += 1) {
const index = (y * sampleW + x) * 4;
const hsv = rgbToHsv(imageData[index], imageData[index + 1], imageData[index + 2]);
if (classifyBoardPixel(hsv)) {
mask[y * sampleW + x] = 1;
}
}
}

const best = extractLargestComponent(mask, sampleW, sampleH);
if (!best || best.count < 400) {
return fallbackBoardBounds(w, h);
}

const landBounds = {
x: best.minX * scale,
y: best.minY * scale,
w: (best.maxX - best.minX + 1) * scale,
h: (best.maxY - best.minY + 1) * scale
};
const maxCols = Math.max.apply(null, rows);
const widthHex = landBounds.w / (maxCols * 0.88 + 0.2);
const heightHex = landBounds.h / (((rows.length - 1) * 0.86 * 0.76) + 0.86);
const hexW = Math.max(widthHex, heightHex);
const padX = hexW * 1.1;
const padY = hexW * 1.05;
const x = Math.max(0, Math.round(landBounds.x - padX));
const y = Math.max(0, Math.round(landBounds.y - padY));
const right = Math.min(w, Math.round(landBounds.x + landBounds.w + padX));
const bottom = Math.min(h, Math.round(landBounds.y + landBounds.h + padY));
return {
x,
y,
w: right - x,
h: bottom - y
};
}

function looksLikeAppBoard(ctx, bounds) {
const samples = [
{ x: bounds.x + bounds.w * 0.08, y: bounds.y + bounds.h * 0.5 },
{ x: bounds.x + bounds.w * 0.92, y: bounds.y + bounds.h * 0.5 },
{ x: bounds.x + bounds.w * 0.5, y: bounds.y + bounds.h * 0.08 },
{ x: bounds.x + bounds.w * 0.5, y: bounds.y + bounds.h * 0.92 }
];
let hits = 0;
for (let i = 0; i < samples.length; i += 1) {
const avg = sampleHSV(ctx, samples[i].x, samples[i].y, Math.max(4, Math.round(Math.min(bounds.w, bounds.h) * 0.025)));
if (avg.h >= 175 && avg.h <= 225 && avg.s >= 0.24 && avg.v >= 0.32) {
hits += 1;
}
}
return hits >= 3;
}

function extractPerspectiveQuad(points) {
let tl = points[0];
let tr = points[0];
let br = points[0];
let bl = points[0];
for (let i = 1; i < points.length; i += 1) {
const point = points[i];
if (point.x + point.y < tl.x + tl.y) {
tl = point;
}
if (point.x - point.y > tr.x - tr.y) {
tr = point;
}
if (point.x + point.y > br.x + br.y) {
br = point;
}
if (point.y - point.x > bl.y - bl.x) {
bl = point;
}
}
const center = {
x: (tl.x + tr.x + br.x + bl.x) / 4,
y: (tl.y + tr.y + br.y + bl.y) / 4
};
const expand = 1.16;
return [tl, tr, br, bl].map((point) => ({
x: center.x + (point.x - center.x) * expand,
y: center.y + (point.y - center.y) * expand
}));
}

function solveLinearSystem(matrix, vector) {
const size = vector.length;
const aug = matrix.map((row, index) => row.concat(vector[index]));
for (let col = 0; col < size; col += 1) {
let pivot = col;
for (let row = col + 1; row < size; row += 1) {
if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) {
pivot = row;
}
}
if (Math.abs(aug[pivot][col]) < 1e-9) {
throw new Error("Could not stabilize the board perspective.");
}
if (pivot !== col) {
const tmp = aug[col];
aug[col] = aug[pivot];
aug[pivot] = tmp;
}
const divisor = aug[col][col];
for (let j = col; j <= size; j += 1) {
aug[col][j] /= divisor;
}
for (let row = 0; row < size; row += 1) {
if (row === col) {
continue;
}
const factor = aug[row][col];
for (let j = col; j <= size; j += 1) {
aug[row][j] -= factor * aug[col][j];
}
}
}
return aug.map((row) => row[size]);
}

function buildHomography(fromPoints, toPoints) {
const matrix = [];
const vector = [];
for (let i = 0; i < 4; i += 1) {
const src = fromPoints[i];
const dst = toPoints[i];
matrix.push([src.x, src.y, 1, 0, 0, 0, -src.x * dst.x, -src.y * dst.x]);
vector.push(dst.x);
matrix.push([0, 0, 0, src.x, src.y, 1, -src.x * dst.y, -src.y * dst.y]);
vector.push(dst.y);
}
const solved = solveLinearSystem(matrix, vector);
return [
solved[0], solved[1], solved[2],
solved[3], solved[4], solved[5],
solved[6], solved[7], 1
];
}

function applyHomography(matrix, x, y) {
const denom = matrix[6] * x + matrix[7] * y + matrix[8];
return {
x: (matrix[0] * x + matrix[1] * y + matrix[2]) / denom,
y: (matrix[3] * x + matrix[4] * y + matrix[5]) / denom
};
}

function bilinearSample(imageData, width, height, x, y) {
const x0 = clamp(Math.floor(x), 0, width - 1);
const y0 = clamp(Math.floor(y), 0, height - 1);
const x1 = clamp(x0 + 1, 0, width - 1);
const y1 = clamp(y0 + 1, 0, height - 1);
const fx = clamp(x - x0, 0, 1);
const fy = clamp(y - y0, 0, 1);
const idx00 = (y0 * width + x0) * 4;
const idx10 = (y0 * width + x1) * 4;
const idx01 = (y1 * width + x0) * 4;
const idx11 = (y1 * width + x1) * 4;
const out = [0, 0, 0, 255];
for (let channel = 0; channel < 3; channel += 1) {
const top = imageData[idx00 + channel] * (1 - fx) + imageData[idx10 + channel] * fx;
const bottom = imageData[idx01 + channel] * (1 - fx) + imageData[idx11 + channel] * fx;
out[channel] = Math.round(top * (1 - fy) + bottom * fy);
}
return out;
}

function warpPerspective(sourceCanvas, sourceQuad, outWidth, outHeight) {
const dstPoints = [
{ x: 0, y: 0 },
{ x: outWidth - 1, y: 0 },
{ x: outWidth - 1, y: outHeight - 1 },
{ x: 0, y: outHeight - 1 }
];
const matrix = buildHomography(dstPoints, sourceQuad);
const outCanvas = createCanvas(outWidth, outHeight);
const outCtx = outCanvas.getContext("2d", { willReadFrequently: true });
const srcCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
const srcData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
const outImage = outCtx.createImageData(outWidth, outHeight);
for (let y = 0; y < outHeight; y += 1) {
for (let x = 0; x < outWidth; x += 1) {
const source = applyHomography(matrix, x, y);
const pixel = bilinearSample(srcData, sourceCanvas.width, sourceCanvas.height, source.x, source.y);
const index = (y * outWidth + x) * 4;
outImage.data[index] = pixel[0];
outImage.data[index + 1] = pixel[1];
outImage.data[index + 2] = pixel[2];
outImage.data[index + 3] = 255;
}
}
outCtx.putImageData(outImage, 0, 0);
return outCanvas;
}

function buildVisionPipeline(canvas, rows) {
const maskInfo = buildBoardMaskFromCanvas(canvas);
const angle = estimatePrincipalAngle(maskInfo.component.points);
const alignedCanvas = Math.abs(angle) > 0.05 ? rotateCanvas(canvas, -angle) : canvas;
const alignedCtx = alignedCanvas.getContext("2d", { willReadFrequently: true });
const alignedMask = buildBoardMaskFromCanvas(alignedCanvas);
const coarseBounds = componentBounds(alignedMask.component);
const fastPath = looksLikeAppBoard(alignedCtx, coarseBounds);
let rectifiedCanvas = alignedCanvas;
let perspectiveApplied = false;
if (!fastPath) {
const quad = extractPerspectiveQuad(alignedMask.component.points);
rectifiedCanvas = warpPerspective(alignedCanvas, quad, CANONICAL_BOARD_SIZE, CANONICAL_BOARD_SIZE);
perspectiveApplied = true;
}
const rectifiedCtx = rectifiedCanvas.getContext("2d", { willReadFrequently: true });
const bounds = detectBoardBounds(rectifiedCtx, rectifiedCanvas.width, rectifiedCanvas.height, rows);
const boardArea = bounds.w * bounds.h;
const canvasArea = rectifiedCanvas.width * rectifiedCanvas.height;
const boardConfidence = clamp(
(boardArea / canvasArea) * 2.4 + (fastPath ? 0.2 : 0) + (perspectiveApplied ? 0.08 : 0) - Math.min(Math.abs(angle), 0.9) * 0.1,
0,
1
);
return {
canvas: rectifiedCanvas,
ctx: rectifiedCtx,
bounds,
meta: {
rotationRadians: -angle,
fastPath,
perspectiveApplied,
boardConfidence
}
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
tiles.forEach((tile) => byKey.set(tileKey(tile.row, tile.col), tile.id));
const adjacency = new Map();

for (const tile of tiles) {
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
offsets.forEach((offset) => {
const id = byKey.get(tileKey(tile.row - 1, tile.col + offset));
if (id !== undefined) {
neighbors.add(id);
}
});
}
if (down !== null) {
const offsets = down === current - 1 ? [-1, 0] : [0, 1];
offsets.forEach((offset) => {
const id = byKey.get(tileKey(tile.row + 1, tile.col + offset));
if (id !== undefined) {
neighbors.add(id);
}
});
}
adjacency.set(tile.id, [...neighbors]);
}
return adjacency;
}

function buildLayout(rows, bounds) {
const tiles = buildSkeleton(rows);
const adjacency = buildAdjacency(tiles, rows);
const maxCols = Math.max.apply(null, rows);
const widthFactor = maxCols * 0.88 + 2.1;
const heightFactor = ((rows.length - 1) * 0.86 * 0.76) + 0.86 + 1.9;
const hexW = Math.min(bounds.w / widthFactor, bounds.h / heightFactor);
const hexH = hexW * 0.86;
const hStep = hexW * 0.88;
const vStep = hexH * 0.76;
const landWidth = maxCols * hStep + hexW * 0.2;
const landHeight = (rows.length - 1) * vStep + hexH;
const seaPaddingX = (bounds.w - landWidth) / 2;
const seaPaddingY = (bounds.h - landHeight) / 2;
const centers = new Map();
tiles.forEach((tile) => {
const rowCount = rows[tile.row];
const x = bounds.x + seaPaddingX + ((maxCols - rowCount) * hStep) / 2 + tile.col * hStep + hexW / 2;
const y = bounds.y + seaPaddingY + tile.row * vStep + hexH / 2;
centers.set(tile.id, { x, y });
});
const boardCenter = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
return {
tiles,
adjacency,
centers,
boardCenter,
geometry: { hexW, hexH, hStep, vStep }
};
}

function sortClockwiseByCenter(ids, centers, cx, cy) {
return [...ids].sort((a, b) => {
const ac = centers.get(a);
const bc = centers.get(b);
return Math.atan2(ac.y - cy, ac.x - cx) - Math.atan2(bc.y - cy, bc.x - cx);
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
if (!ring.length) {
remaining.forEach((id) => ring.push(id));
}
const ordered = sortClockwiseByCenter(ring, centers, boardCenter.x, boardCenter.y);
const start = ordered
.map((id, index) => ({ id, index, center: centers.get(id) }))
.sort((a, b) => (a.center.y - b.center.y) || (a.center.x - b.center.x))[0].index;
const shifted = ordered.slice(start).concat(ordered.slice(0, start));
rings.push(shifted);
shifted.forEach((id) => remaining.delete(id));
}
return rings.flat();
}

function buildFrameSlots(tiles, adjacency, centers, boardCenter, geometry, slotCount) {
const boundary = tiles.filter((tile) => (adjacency.get(tile.id) || []).length < 6);
const neighborVectors = [
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
centerByKey.set(keyFor(center.x, center.y), center);
}
const outerByKey = new Map();
for (const tile of boundary) {
const center = centers.get(tile.id);
for (let i = 0; i < neighborVectors.length; i += 1) {
const vector = neighborVectors[i];
const nx = center.x + vector.x;
const ny = center.y + vector.y;
const neighborKey = keyFor(nx, ny);
if (centerByKey.has(neighborKey)) {
continue;
}
if (!outerByKey.has(neighborKey)) {
outerByKey.set(neighborKey, { x: nx, y: ny, adjacentLand: [] });
}
outerByKey.get(neighborKey).adjacentLand.push(center);
}
}
let orderedOuter = [...outerByKey.values()].sort((a, b) => Math.atan2(a.y - boardCenter.y, a.x - boardCenter.x) - Math.atan2(b.y - boardCenter.y, b.x - boardCenter.x));
const start = orderedOuter
.map((slot, index) => ({ slot, index }))
.sort((a, b) => (a.slot.y - b.slot.y) || (a.slot.x - b.slot.x))[0]?.index || 0;
orderedOuter = orderedOuter.slice(start).concat(orderedOuter.slice(0, start));
if (orderedOuter.length !== slotCount) {
const sampled = [];
for (let i = 0; i < slotCount; i += 1) {
sampled.push(orderedOuter[Math.floor(i * orderedOuter.length / slotCount)]);
}
orderedOuter = sampled;
}
return orderedOuter.map((slot, index) => ({
index,
x: slot.x,
y: slot.y,
angle: Math.atan2(slot.y - boardCenter.y, slot.x - boardCenter.x)
}));
}

function sampleHSV(ctx, x, y, radius) {
const values = [];
for (let oy = -radius; oy <= radius; oy += 2) {
for (let ox = -radius; ox <= radius; ox += 2) {
if (ox * ox + oy * oy > radius * radius) {
continue;
}
const px = Math.max(0, Math.min(ctx.canvas.width - 1, Math.floor(x + ox)));
const py = Math.max(0, Math.min(ctx.canvas.height - 1, Math.floor(y + oy)));
const data = ctx.getImageData(px, py, 1, 1).data;
values.push(rgbToHsv(data[0], data[1], data[2]));
}
}
return averageHsv(values);
}

function sampleTileHsv(ctx, center, geometry) {
const ring = [
[-0.28, -0.12],
[0.28, -0.12],
[-0.24, 0.14],
[0.24, 0.14],
[0, -0.28],
[-0.1, -0.02],
[0.1, -0.02]
];
const hsvPoints = [];
for (let i = 0; i < ring.length; i += 1) {
const sample = ring[i];
hsvPoints.push(sampleHSV(ctx, center.x + sample[0] * geometry.hexW, center.y + sample[1] * geometry.hexH, Math.max(2, Math.round(geometry.hexW * 0.035))));
}
return averageHsv(hsvPoints);
}

function resourceScore(avg, resource) {
const profile = {
wood: { h: 108, s: 0.48, v: 0.4, wh: 0.042, ws: 1.8, wv: 1.6 },
brick: { h: 12, s: 0.56, v: 0.52, wh: 0.045, ws: 1.5, wv: 1.2 },
sheep: { h: 104, s: 0.42, v: 0.72, wh: 0.04, ws: 1.3, wv: 1.4 },
wheat: { h: 50, s: 0.52, v: 0.72, wh: 0.045, ws: 1.4, wv: 1.3 },
ore: { h: 220, s: 0.14, v: 0.48, wh: 0.018, ws: 2.4, wv: 1.2 },
desert: { h: 42, s: 0.24, v: 0.78, wh: 0.05, ws: 1.2, wv: 1 }
}[resource];
const dh = hueDelta(avg.h, profile.h) * profile.wh;
const ds = (avg.s - profile.s) * profile.ws;
const dv = (avg.v - profile.v) * profile.wv;
return -(dh * dh + ds * ds + dv * dv);
}

function normalizeResources(tileInfo, modeKey) {
const target = MODE_RESOURCE_COUNTS[modeKey] || MODE_RESOURCE_COUNTS.four;
const remaining = new Map(Object.entries(target).map(([key, value]) => [key, value]));
const scoreSets = tileInfo.map((info) => RESOURCE_OPTIONS.map((resource) => ({ resource, score: resourceScore(info.avg, resource) })).sort((a, b) => b.score - a.score));
const assigned = new Array(tileInfo.length).fill(null);
const unassigned = new Set(tileInfo.map((_, index) => index));

while (unassigned.size > 0) {
let best = null;
remaining.forEach((count, resource) => {
if (count <= 0) {
return;
}
unassigned.forEach((index) => {
const score = scoreSets[index].find((entry) => entry.resource === resource).score;
if (!best || score > best.score) {
best = { index, resource, score };
}
});
});
if (!best) {
throw new Error("Could not normalize image-detected resources.");
}
assigned[best.index] = best.resource;
remaining.set(best.resource, (remaining.get(best.resource) || 0) - 1);
unassigned.delete(best.index);
}

return assigned.map((resource, index) => {
const options = scoreSets[index];
const assignedScore = options.find((entry) => entry.resource === resource).score;
const nextBest = options.filter((entry) => entry.resource !== resource)[0]?.score ?? assignedScore - 1;
const confidence = clamp(0.42 + (assignedScore - nextBest) * 0.22, 0, 1);
return {
resource,
confidence,
alternatives: options.slice(0, 3)
};
});
}

function buildInkMask(canvas, options = {}) {
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const { width, height } = canvas;
const data = ctx.getImageData(0, 0, width, height).data;
const mask = new Array(width * height).fill(0);
const luminances = [];
const allowed = new Array(width * height).fill(false);
let energy = 0;
for (let y = 0; y < height; y += 1) {
for (let x = 0; x < width; x += 1) {
const nx = (x + 0.5) / width - 0.5;
const ny = (y + 0.5) / height - 0.5;
if (options.circleRadius && (nx * nx + ny * ny) > options.circleRadius * options.circleRadius) {
continue;
}
const index = (y * width + x) * 4;
const r = data[index];
const g = data[index + 1];
const b = data[index + 2];
const luminance = r * 0.299 + g * 0.587 + b * 0.114;
allowed[y * width + x] = true;
luminances.push(luminance);
}
}
const background = luminances.length ? luminances.sort((a, b) => a - b)[Math.floor(luminances.length * 0.8)] : 255;
for (let y = 0; y < height; y += 1) {
for (let x = 0; x < width; x += 1) {
const maskIndex = y * width + x;
if (!allowed[maskIndex]) {
continue;
}
const index = maskIndex * 4;
const r = data[index];
const g = data[index + 1];
const b = data[index + 2];
const luminance = r * 0.299 + g * 0.587 + b * 0.114;
let ink = Math.max(0, background - luminance - 16);
if (options.redBoost) {
ink += Math.max(0, r - g) * 0.7;
}
mask[maskIndex] = ink;
energy += ink;
}
}
return { mask, energy };
}

function extractInkMask(ctx, x, y, width, height, outWidth, outHeight, options = {}) {
const canvas = createCanvas(outWidth, outHeight);
const maskCtx = canvas.getContext("2d", { willReadFrequently: true });
maskCtx.drawImage(ctx.canvas, x, y, width, height, 0, 0, outWidth, outHeight);
return buildInkMask(canvas, options);
}

function normalizeMask(mask) {
const magnitude = Math.sqrt(mask.reduce((sum, value) => sum + value * value, 0));
if (!magnitude) {
return mask.map(() => 0);
}
return mask.map((value) => value / magnitude);
}

function cosineSimilarity(a, b) {
let score = 0;
for (let i = 0; i < a.length; i += 1) {
score += a[i] * b[i];
}
return score;
}

const tokenTemplates = (() => {
const width = 56;
const height = 56;
return TOKEN_VALUES.map((value) => {
const canvas = createCanvas(width, height);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#fff";
ctx.fillRect(0, 0, width, height);
ctx.beginPath();
ctx.arc(width / 2, height / 2, width * 0.31, 0, Math.PI * 2);
ctx.fillStyle = "#faf4e6";
ctx.fill();
ctx.lineWidth = Math.max(1, width * 0.03);
ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
ctx.stroke();
ctx.font = "800 " + Math.round(String(value).length > 1 ? height * 0.28 : height * 0.34) + "px Trebuchet MS, Segoe UI, sans-serif";
ctx.textAlign = "center";
ctx.textBaseline = "middle";
ctx.fillStyle = value === 6 || value === 8 ? "#b52222" : "#2a241b";
ctx.fillText(String(value), width / 2, height * 0.53);
return { value, mask: normalizeMask(buildInkMask(canvas, { circleRadius: 0.38, redBoost: true }).mask) };
});
})();

const harborTemplates = (() => {
const width = 132;
const height = 26;
return Object.entries(HARBOR_LABELS).map(([code, label]) => {
const canvas = createCanvas(width, height);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#fff";
ctx.fillRect(0, 0, width, height);
ctx.font = "800 " + Math.round(height * 0.72) + "px Trebuchet MS, Segoe UI, sans-serif";
ctx.textAlign = "center";
ctx.textBaseline = "middle";
ctx.fillStyle = "#111";
ctx.fillText(label, width / 2, height * 0.56);
return { code, mask: normalizeMask(buildInkMask(canvas).mask) };
});
})();

function locateTokenCenter(center, geometry) {
return { x: center.x, y: center.y + geometry.hexH * 0.18 };
}

function classifyToken(ctx, center, geometry) {
const tokenCenter = locateTokenCenter(center, geometry);
const extracted = extractInkMask(ctx, tokenCenter.x - geometry.hexW * 0.2, tokenCenter.y - geometry.hexW * 0.2, geometry.hexW * 0.4, geometry.hexW * 0.4, 56, 56, { circleRadius: 0.38, redBoost: true });
if (extracted.energy < 700) {
return { value: null, confidence: 0.12, alternatives: [] };
}
const normalized = normalizeMask(extracted.mask);
const ranked = tokenTemplates.map((template) => ({ value: template.value, score: cosineSimilarity(normalized, template.mask) })).sort((a, b) => b.score - a.score);
const best = ranked[0];
const second = ranked[1] || best;
return {
value: best.score > 0.18 ? best.value : null,
confidence: clamp(0.38 + (best.score - second.score) * 3.2 + Math.max(0, best.score - 0.18) * 0.9, 0, 1),
alternatives: ranked.slice(0, 3)
};
}

function harborTypeFromIcon(ctx, slot, geometry) {
const iconX = slot.x - Math.cos(slot.angle) * geometry.hexW * 0.18;
const iconY = slot.y - Math.sin(slot.angle) * geometry.hexW * 0.18;
const avg = sampleHSV(ctx, iconX, iconY, Math.max(3, Math.floor(geometry.hexW * 0.09)));
if (avg.s < 0.15) {
return { code: "O", confidence: 0.45 };
}
if (avg.h >= 34 && avg.h <= 64) {
return { code: "G", confidence: 0.54 };
}
if (avg.h <= 20 || avg.h >= 345) {
return { code: "B", confidence: 0.54 };
}
if (avg.h >= 70 && avg.h <= 150) {
return { code: avg.v < 0.56 ? "W" : "S", confidence: 0.52 };
}
return { code: "T", confidence: 0.4 };
}

function classifyHarbor(ctx, slot, geometry) {
const extracted = extractInkMask(ctx, slot.x - geometry.hexW * 0.42, slot.y - geometry.hexH * 0.16, geometry.hexW * 0.84, geometry.hexH * 0.32, 132, 26, {});
if (extracted.energy < 220) {
return harborTypeFromIcon(ctx, slot, geometry);
}
const normalized = normalizeMask(extracted.mask);
const ranked = harborTemplates.map((template) => ({ code: template.code, score: cosineSimilarity(normalized, template.mask) })).sort((a, b) => b.score - a.score);
const best = ranked[0];
const second = ranked[1] || best;
if (best && best.score > 0.16) {
return {
code: best.code,
confidence: clamp(0.4 + (best.score - second.score) * 2.2 + Math.max(0, best.score - 0.16), 0, 1),
alternatives: ranked.slice(0, 3)
};
}
return harborTypeFromIcon(ctx, slot, geometry);
}

function detectHarbors(ctx, frameSlots, geometry, portCount) {
const scored = frameSlots.map((slot) => {
const avg = sampleHSV(ctx, slot.x, slot.y, Math.max(4, Math.round(geometry.hexW * 0.12)));
return {
slot,
score: avg.v - avg.s * 1.8
};
});
const cutoff = [...scored].sort((a, b) => b.score - a.score)[portCount - 1]?.score ?? 0;
const selected = [...scored]
.sort((a, b) => b.score - a.score)
.slice(0, portCount)
.map((entry) => entry.slot)
.sort((a, b) => a.index - b.index);
return selected.map((slot) => {
const classification = classifyHarbor(ctx, slot, geometry);
const presence = scored.find((entry) => entry.slot.index === slot.index)?.score ?? cutoff;
return {
slotIndex: slot.index,
code: classification.code,
confidence: clamp((classification.confidence || 0.45) * 0.65 + clamp(0.5 + (presence - cutoff) * 1.5, 0, 1) * 0.35, 0, 1),
alternatives: classification.alternatives || []
};
});
}

function buildTileCode(orderedTiles) {
return orderedTiles.map((tile) => {
const letter = RESOURCE_LETTERS[tile.resource] || "S";
return letter + (tile.token === null ? "" : String(tile.token));
}).join(" ");
}

function buildHarborCode(harbors) {
if (!harbors.length) {
return "";
}
return "P" + [...harbors].sort((a, b) => a.slotIndex - b.slotIndex).map((harbor) => String(harbor.slotIndex) + harbor.code).join("");
}

function buildDetectionState(modeKey, layout, spiral, resourceDetections, tokenDetections, harborDetections, meta) {
const orderedTiles = spiral.map((id, index) => {
const resource = resourceDetections.get(id);
const token = tokenDetections.get(id);
return {
id,
spiralIndex: index,
resource: resource.resource,
resourceConfidence: resource.confidence,
token: token?.value ?? null,
tokenConfidence: resource.resource === "desert" ? 1 : (token?.confidence ?? 0),
resourceAlternatives: resource.alternatives,
tokenAlternatives: token?.alternatives || []
};
});
const needsReview = orderedTiles.some((tile) => tile.resourceConfidence < REVIEW_THRESHOLD.resource || (tile.resource !== "desert" && tile.tokenConfidence < REVIEW_THRESHOLD.token)) || harborDetections.some((harbor) => harbor.confidence < REVIEW_THRESHOLD.harbor) || meta.boardConfidence < REVIEW_THRESHOLD.board;
return {
modeKey,
frameSlotCount: MODE_FRAME_SLOTS[modeKey],
orderedTiles,
harbors: harborDetections,
meta,
needsReview
};
}

function buildCodeFromDetection(state) {
const tileCode = buildTileCode(state.orderedTiles);
const harborCode = buildHarborCode(state.harbors);
return harborCode ? tileCode + " " + harborCode : tileCode;
}

function createOptions(select, values, formatLabel, includeBlank) {
if (includeBlank) {
const blank = document.createElement("option");
blank.value = "";
blank.textContent = "Unknown";
select.appendChild(blank);
}
values.forEach((value) => {
const option = document.createElement("option");
option.value = String(value);
option.textContent = formatLabel(value);
select.appendChild(option);
});
}

function syncCodeFromReview(triggerRender) {
if (!reviewState) {
return;
}
codeInput.value = buildCodeFromDetection(reviewState);
if (triggerRender) {
generateBtn.click();
}
}

function updateReviewSummary() {
if (!reviewState || !reviewPanel) {
return;
}
const uncertainItems = reviewState.orderedTiles.filter((tile) => tile.resourceConfidence < REVIEW_THRESHOLD.resource || (tile.resource !== "desert" && tile.tokenConfidence < REVIEW_THRESHOLD.token)).length + reviewState.harbors.filter((harbor) => harbor.confidence < REVIEW_THRESHOLD.harbor).length;
reviewState.needsReview = uncertainItems > 0 || reviewState.meta.boardConfidence < REVIEW_THRESHOLD.board;
reviewPanel.dataset.state = reviewState.needsReview ? "review" : "ready";
if (reviewSummaryEl) {
reviewSummaryEl.textContent = reviewState.needsReview
? "Needs review: " + uncertainItems + " low-confidence field(s), board confidence " + summarizeConfidence(reviewState.meta.boardConfidence) + "."
: "Imported with " + summarizeConfidence(reviewState.meta.boardConfidence) + ". No review needed.";
}
}

function renderReviewPanel(state) {
if (!reviewPanel || !reviewListEl) {
return;
}
reviewPanel.hidden = false;
reviewListEl.innerHTML = "";
state.orderedTiles.forEach((tile) => {
if (tile.resourceConfidence < REVIEW_THRESHOLD.resource) {
const row = document.createElement("label");
row.className = "import-review-item";
const text = document.createElement("span");
text.className = "import-review-label";
text.textContent = "Tile " + (tile.spiralIndex + 1) + " resource";
const meta = document.createElement("span");
meta.className = "import-review-meta";
meta.textContent = summarizeConfidence(tile.resourceConfidence);
const select = document.createElement("select");
select.className = "import-review-select";
createOptions(select, RESOURCE_OPTIONS, (value) => RESOURCE_LABELS[value]);
select.value = tile.resource;
select.addEventListener("change", () => {
tile.resource = select.value;
tile.resourceConfidence = 1;
if (tile.resource === "desert") {
tile.token = null;
tile.tokenConfidence = 1;
}
syncCodeFromReview(true);
renderReviewPanel(reviewState);
});
row.append(text, meta, select);
reviewListEl.appendChild(row);
}
if (tile.resource !== "desert" && tile.tokenConfidence < REVIEW_THRESHOLD.token) {
const row = document.createElement("label");
row.className = "import-review-item";
const text = document.createElement("span");
text.className = "import-review-label";
text.textContent = "Tile " + (tile.spiralIndex + 1) + " token";
const meta = document.createElement("span");
meta.className = "import-review-meta";
meta.textContent = summarizeConfidence(tile.tokenConfidence);
const select = document.createElement("select");
select.className = "import-review-select";
createOptions(select, TOKEN_VALUES, (value) => String(value), true);
select.value = tile.token === null ? "" : String(tile.token);
select.addEventListener("change", () => {
tile.token = select.value ? Number(select.value) : null;
tile.tokenConfidence = 1;
syncCodeFromReview(true);
renderReviewPanel(reviewState);
});
row.append(text, meta, select);
reviewListEl.appendChild(row);
}
});
state.harbors.forEach((harbor) => {
if (harbor.confidence >= REVIEW_THRESHOLD.harbor) {
return;
}
const row = document.createElement("label");
row.className = "import-review-item";
const text = document.createElement("span");
text.className = "import-review-label";
text.textContent = "Harbor slot " + harbor.slotIndex;
const meta = document.createElement("span");
meta.className = "import-review-meta";
meta.textContent = summarizeConfidence(harbor.confidence);
const select = document.createElement("select");
select.className = "import-review-select";
createOptions(select, HARBOR_OPTIONS, (value) => HARBOR_LABELS[value]);
select.value = harbor.code;
select.addEventListener("change", () => {
harbor.code = select.value;
harbor.confidence = 1;
syncCodeFromReview(true);
renderReviewPanel(reviewState);
});
row.append(text, meta, select);
reviewListEl.appendChild(row);
});
if (!reviewListEl.children.length) {
const empty = document.createElement("p");
empty.className = "import-review-empty";
empty.textContent = state.meta.fastPath
? "Fast-path screenshot detection succeeded."
: "The importer did not find any low-confidence fields to review.";
reviewListEl.appendChild(empty);
}
updateReviewSummary();
}

async function detectBoardCode(file) {
const modeKey = modeEl.value === "six" ? "six" : "four";
const rows = MODE_ROWS[modeKey];
const img = await loadImage(file);
const sourceCanvas = drawImageToCanvas(img);
const pipeline = buildVisionPipeline(sourceCanvas, rows);
const layout = buildLayout(rows, pipeline.bounds);
const spiral = buildSpiralOrder(layout.tiles, layout.adjacency, layout.centers, layout.boardCenter);
const frameSlots = buildFrameSlots(layout.tiles, layout.adjacency, layout.centers, layout.boardCenter, layout.geometry, MODE_FRAME_SLOTS[modeKey]);
const tileInfo = layout.tiles.map((tile) => ({ id: tile.id, avg: sampleTileHsv(pipeline.ctx, layout.centers.get(tile.id), layout.geometry) }));
const normalizedResources = normalizeResources(tileInfo, modeKey);
const resourcesById = new Map();
tileInfo.forEach((info, index) => {
resourcesById.set(info.id, normalizedResources[index]);
});
const tokensById = new Map();
layout.tiles.forEach((tile) => {
const resource = resourcesById.get(tile.id);
const token = resource.resource === "desert" ? { value: null, confidence: 1, alternatives: [] } : classifyToken(pipeline.ctx, layout.centers.get(tile.id), layout.geometry);
tokensById.set(tile.id, token);
});
const harbors = detectHarbors(pipeline.ctx, frameSlots, layout.geometry, MODE_PORT_SLOTS[modeKey]);
return buildDetectionState(modeKey, layout, spiral, resourcesById, tokensById, harbors, pipeline.meta);
}

detectBtn.addEventListener("click", () => {
imageInput.value = "";
imageInput.click();
});

imageInput.addEventListener("change", async () => {
const file = imageInput.files && imageInput.files[0];
if (!file) {
return;
}
clearReview();
setStatus("Analyzing image, rectifying the board, and detecting tiles, tokens, and harbors...", false);
detectBtn.disabled = true;
generateBtn.disabled = true;
try {
reviewState = await detectBoardCode(file);
codeInput.value = buildCodeFromDetection(reviewState);
generateBtn.click();
renderReviewPanel(reviewState);
setStatus(
reviewState.needsReview
? "Imported board code from image. Review the low-confidence fields before trusting the result."
: "Detected board code from image with no flagged low-confidence fields.",
false
);
} catch (error) {
clearReview();
setStatus((error && error.message) || "Could not detect code from image.", true);
} finally {
detectBtn.disabled = false;
generateBtn.disabled = false;
}
});
})();
