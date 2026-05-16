(function () {
	const detectBtn = document.getElementById("detectFromImage");
	const imageInput = document.getElementById("boardImageInput");
	const codeInput = document.getElementById("boardCode");
	const generateBtn = document.getElementById("generateBoard");
	const statusEl = document.getElementById("status");
	const modeEl = document.getElementById("mode");

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
	const RESOURCE_LETTERS = {
		wood: "W",
		brick: "B",
		sheep: "S",
		wheat: "G",
		ore: "O",
		desert: "D"
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

	function setStatus(msg, error) {
		statusEl.textContent = msg;
		statusEl.style.color = error ? "#9f2a20" : "var(--muted)";
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
		const canvas = document.createElement("canvas");
		canvas.width = sampleW;
		canvas.height = sampleH;
		const sampleCtx = canvas.getContext("2d", { willReadFrequently: true });
		sampleCtx.drawImage(ctx.canvas, 0, 0, sampleW, sampleH);
		const imageData = sampleCtx.getImageData(0, 0, sampleW, sampleH).data;
		const mask = new Uint8Array(sampleW * sampleH);

		for (let y = 0; y < sampleH; y += 1) {
			for (let x = 0; x < sampleW; x += 1) {
				const index = (y * sampleW + x) * 4;
				const hsv = rgbToHsv(imageData[index], imageData[index + 1], imageData[index + 2]);
				if (hsv.s >= 0.28 && hsv.v >= 0.18 && !(hsv.h >= 160 && hsv.h <= 250)) {
					mask[y * sampleW + x] = 1;
				}
			}
		}

		const visited = new Uint8Array(sampleW * sampleH);
		const queue = [];
		let best = null;
		const tryPush = (x, y) => {
			if (x < 0 || y < 0 || x >= sampleW || y >= sampleH) {
				return;
			}
			const index = y * sampleW + x;
			if (!mask[index] || visited[index]) {
				return;
			}
			visited[index] = 1;
			queue.push(index);
		};

		for (let y = 0; y < sampleH; y += 1) {
			for (let x = 0; x < sampleW; x += 1) {
				const start = y * sampleW + x;
				if (!mask[start] || visited[start]) {
					continue;
				}
				let minX = x;
				let maxX = x;
				let minY = y;
				let maxY = y;
				let count = 0;
				visited[start] = 1;
				queue.push(start);

				while (queue.length) {
					const index = queue.pop();
					const px = index % sampleW;
					const py = Math.floor(index / sampleW);
					count += 1;
					minX = Math.min(minX, px);
					maxX = Math.max(maxX, px);
					minY = Math.min(minY, py);
					maxY = Math.max(maxY, py);
					tryPush(px + 1, py);
					tryPush(px - 1, py);
					tryPush(px, py + 1);
					tryPush(px, py - 1);
				}

				if (!best || count > best.count) {
					best = { minX, maxX, minY, maxY, count };
				}
			}
		}

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

		const boardCenter = {
			x: bounds.x + bounds.w / 2,
			y: bounds.y + bounds.h / 2
		};

		return {
			tiles,
			adjacency,
			centers,
			boardCenter,
			geometry: {
				hexW,
				hexH,
				hStep,
				vStep
			}
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

		let orderedOuter = [...outerByKey.values()].sort((a, b) => {
			const aa = Math.atan2(a.y - boardCenter.y, a.x - boardCenter.x);
			const ba = Math.atan2(b.y - boardCenter.y, b.x - boardCenter.x);
			return aa - ba;
		});

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
			hsvPoints.push(
				sampleHSV(
					ctx,
					center.x + sample[0] * geometry.hexW,
					center.y + sample[1] * geometry.hexH,
					Math.max(2, Math.round(geometry.hexW * 0.035))
				)
			);
		}
		return averageHsv(hsvPoints);
	}

	function hueDelta(a, b) {
		const d = Math.abs(a - b) % 360;
		return d > 180 ? 360 - d : d;
	}

	function resourceScore(avg, resource) {
		const profile = {
			wood: { h: 108, s: 0.5, v: 0.42, wh: 0.04, ws: 1.8, wv: 1.6 },
			brick: { h: 12, s: 0.55, v: 0.52, wh: 0.045, ws: 1.5, wv: 1.2 },
			sheep: { h: 104, s: 0.42, v: 0.72, wh: 0.04, ws: 1.3, wv: 1.4 },
			wheat: { h: 50, s: 0.52, v: 0.72, wh: 0.045, ws: 1.4, wv: 1.3 },
			ore: { h: 0, s: 0.11, v: 0.53, wh: 0.0, ws: 3.2, wv: 1.2 },
			desert: { h: 42, s: 0.24, v: 0.78, wh: 0.05, ws: 1.2, wv: 1.0 }
		}[resource];
		const dh = profile.wh === 0 ? 0 : hueDelta(avg.h, profile.h) * profile.wh;
		const ds = (avg.s - profile.s) * profile.ws;
		const dv = (avg.v - profile.v) * profile.wv;
		return -(dh * dh + ds * ds + dv * dv);
	}

	function normalizeResources(tileInfo, modeKey) {
		const target = MODE_RESOURCE_COUNTS[modeKey] || MODE_RESOURCE_COUNTS.four;
		const remaining = new Map(Object.entries(target).map(([key, value]) => [key, value]));
		const assigned = new Array(tileInfo.length).fill(null);
		const unassigned = new Set(tileInfo.map((_, index) => index));

		while (unassigned.size > 0) {
			let best = null;
			remaining.forEach((count, resource) => {
				if (count <= 0) {
					return;
				}
				unassigned.forEach((index) => {
					const score = resourceScore(tileInfo[index].avg, resource);
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

		return assigned;
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
		const canvas = document.createElement("canvas");
		canvas.width = outWidth;
		canvas.height = outHeight;
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
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
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
			return {
				value,
				mask: normalizeMask(buildInkMask(canvas, { circleRadius: 0.38, redBoost: true }).mask)
			};
		});
	})();

	const harborTemplates = (() => {
		const width = 132;
		const height = 26;
		return Object.entries(HARBOR_LABELS).map(([code, label]) => {
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext("2d");
			ctx.fillStyle = "#fff";
			ctx.fillRect(0, 0, width, height);
			ctx.font = "800 " + Math.round(height * 0.72) + "px Trebuchet MS, Segoe UI, sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillStyle = "#111";
			ctx.fillText(label, width / 2, height * 0.56);
			return {
				code,
				mask: normalizeMask(buildInkMask(canvas).mask)
			};
		});
	})();

	function locateTokenCenter(ctx, center, geometry) {
		return {
			x: center.x,
			y: center.y + geometry.hexH * 0.18
		};
	}

	function classifyToken(ctx, center, geometry) {
		const tokenCenter = locateTokenCenter(ctx, center, geometry);
		const extracted = extractInkMask(
			ctx,
			tokenCenter.x - geometry.hexW * 0.2,
			tokenCenter.y - geometry.hexW * 0.2,
			geometry.hexW * 0.4,
			geometry.hexW * 0.4,
			56,
			56,
			{ circleRadius: 0.38, redBoost: true }
		);
		if (extracted.energy < 800) {
			return null;
		}
		const normalized = normalizeMask(extracted.mask);
		let best = null;
		for (let i = 0; i < tokenTemplates.length; i += 1) {
			const template = tokenTemplates[i];
			const score = cosineSimilarity(normalized, template.mask);
			if (!best || score > best.score) {
				best = { value: template.value, score };
			}
		}
		return best && best.score > 0.22 ? best.value : null;
	}

	function harborTypeFromIcon(ctx, slot, geometry) {
		const iconX = slot.x - Math.cos(slot.angle) * geometry.hexW * 0.18;
		const iconY = slot.y - Math.sin(slot.angle) * geometry.hexW * 0.18;
		const avg = sampleHSV(ctx, iconX, iconY, Math.max(3, Math.floor(geometry.hexW * 0.09)));
		if (avg.s < 0.15) {
			return "O";
		}
		if (avg.h >= 34 && avg.h <= 64) {
			return "G";
		}
		if (avg.h <= 20 || avg.h >= 345) {
			return "B";
		}
		if (avg.h >= 70 && avg.h <= 150) {
			return avg.v < 0.56 ? "W" : "S";
		}
		return "T";
	}

	function classifyHarbor(ctx, slot, geometry) {
		const extracted = extractInkMask(
			ctx,
			slot.x - geometry.hexW * 0.42,
			slot.y - geometry.hexH * 0.16,
			geometry.hexW * 0.84,
			geometry.hexH * 0.32,
			132,
			26,
			{}
		);
		if (extracted.energy < 250) {
			return harborTypeFromIcon(ctx, slot, geometry);
		}
		const normalized = normalizeMask(extracted.mask);
		let best = null;
		for (let i = 0; i < harborTemplates.length; i += 1) {
			const template = harborTemplates[i];
			const score = cosineSimilarity(normalized, template.mask);
			if (!best || score > best.score) {
				best = { code: template.code, score };
			}
		}
		if (best && best.score > 0.18) {
			return best.code;
		}
		return harborTypeFromIcon(ctx, slot, geometry);
	}

	function detectHarborCode(ctx, frameSlots, geometry, portCount) {
		const scored = frameSlots.map((slot) => {
			const avg = sampleHSV(ctx, slot.x, slot.y, Math.max(4, Math.round(geometry.hexW * 0.12)));
			return {
				slot,
				score: avg.v - avg.s * 1.8
			};
		});
		const selected = scored
			.sort((a, b) => b.score - a.score)
			.slice(0, portCount)
			.map((entry) => entry.slot)
			.sort((a, b) => a.index - b.index);

		return selected.map((slot) => String(slot.index) + classifyHarbor(ctx, slot, geometry)).join("");
	}

	function buildCode(resourcesById, tokensById, spiral) {
		return spiral.map((id) => {
			const resource = resourcesById.get(id);
			const token = tokensById.get(id);
			return (RESOURCE_LETTERS[resource] || "S") + (token === null ? "" : String(token));
		}).join(" ");
	}

	async function detectBoardCode(file) {
		const modeKey = modeEl.value === "six" ? "six" : "four";
		const img = await loadImage(file);
		const canvas = document.createElement("canvas");
		canvas.width = img.naturalWidth;
		canvas.height = img.naturalHeight;
		const ctx = canvas.getContext("2d");
		ctx.drawImage(img, 0, 0);

		const rows = MODE_ROWS[modeKey];
		const bounds = detectBoardBounds(ctx, canvas.width, canvas.height, rows);
		const layout = buildLayout(rows, bounds);
		const spiral = buildSpiralOrder(layout.tiles, layout.adjacency, layout.centers, layout.boardCenter);
		const frameSlots = buildFrameSlots(layout.tiles, layout.adjacency, layout.centers, layout.boardCenter, layout.geometry, modeKey === "six" ? 22 : 18);
		const tileInfo = layout.tiles.map((tile) => ({
			id: tile.id,
			avg: sampleTileHsv(ctx, layout.centers.get(tile.id), layout.geometry)
		}));
		const resources = normalizeResources(tileInfo, modeKey);
		const resourcesById = new Map();
		tileInfo.forEach((info, index) => {
			resourcesById.set(info.id, resources[index]);
		});

		const tokensById = new Map();
		layout.tiles.forEach((tile) => {
			const resource = resourcesById.get(tile.id);
			const token = resource === "desert" ? null : classifyToken(ctx, layout.centers.get(tile.id), layout.geometry);
			tokensById.set(tile.id, token);
		});

		const tileCode = buildCode(resourcesById, tokensById, spiral);
		const harborCode = detectHarborCode(ctx, frameSlots, layout.geometry, MODE_PORT_SLOTS[modeKey]);
		return harborCode ? tileCode + " P" + harborCode : tileCode;
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

		setStatus("Analyzing image and detecting board code...", false);
		detectBtn.disabled = true;
		generateBtn.disabled = true;

		try {
			const code = await detectBoardCode(file);
			codeInput.value = code;
			generateBtn.click();
			setStatus("Detected board code from image.", false);
		} catch (error) {
			setStatus((error && error.message) || "Could not detect code from image.", true);
		} finally {
			detectBtn.disabled = false;
			generateBtn.disabled = false;
		}
	});
})();
