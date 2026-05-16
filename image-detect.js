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

	function boardBounds(ctx, w, h) {
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

	function tileCenters(rows) {
		const maxCols = Math.max.apply(null, rows);
		const points = [];
		const v = 0.866;
		for (let r = 0; r < rows.length; r += 1) {
			const rowCount = rows[r];
			for (let c = 0; c < rowCount; c += 1) {
				points.push({
					x: (maxCols - rowCount) / 2 + c,
					y: r * v
				});
			}
		}
		const minX = Math.min.apply(null, points.map((p) => p.x));
		const maxX = Math.max.apply(null, points.map((p) => p.x));
		const minY = Math.min.apply(null, points.map((p) => p.y));
		const maxY = Math.max.apply(null, points.map((p) => p.y));
		return points.map((p) => ({
			x: (p.x - minX) / (maxX - minX || 1),
			y: (p.y - minY) / (maxY - minY || 1)
		}));
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

	function sampleTileHsv(ctx, cx, cy, tileSize) {
		const ring = [
			[-0.36, 0],
			[0.36, 0],
			[0, -0.36],
			[0, 0.36],
			[-0.24, 0.24],
			[0.24, 0.24],
			[-0.24, -0.24],
			[0.24, -0.24]
		];
		const hsvPoints = [];
		for (let i = 0; i < ring.length; i += 1) {
			const ox = ring[i][0];
			const oy = ring[i][1];
			const sx = Math.max(0, Math.floor(cx + ox * tileSize));
			const sy = Math.max(0, Math.floor(cy + oy * tileSize));
			const pixel = ctx.getImageData(sx, sy, 1, 1).data;
			hsvPoints.push(rgbToHsv(pixel[0], pixel[1], pixel[2]));
		}

		const avg = averageHsv(hsvPoints);
		return avg;
	}

	function classifyResourceFromHsv(avg) {
		if (avg.s < 0.16) {
			return "ore";
		}
		if (avg.h >= 20 && avg.h <= 58 && avg.s < 0.33) {
			return "desert";
		}
		if (avg.h >= 32 && avg.h <= 66 && avg.s >= 0.33) {
			return "wheat";
		}
		if ((avg.h <= 24 || avg.h >= 345) && avg.s > 0.28) {
			return "brick";
		}
		if (avg.h >= 70 && avg.h <= 150) {
			return avg.v < 0.56 ? "wood" : "sheep";
		}
		if (avg.s < 0.2) {
			return "ore";
		}
		return "sheep";
	}

	function hueDelta(a, b) {
		const d = Math.abs(a - b) % 360;
		return d > 180 ? 360 - d : d;
	}

	function resourceScore(avg, resource) {
		const p = {
			wood: { h: 108, s: 0.5, v: 0.42, wh: 0.04, ws: 1.8, wv: 1.6 },
			brick: { h: 12, s: 0.55, v: 0.52, wh: 0.045, ws: 1.5, wv: 1.2 },
			sheep: { h: 104, s: 0.42, v: 0.72, wh: 0.04, ws: 1.3, wv: 1.4 },
			wheat: { h: 50, s: 0.52, v: 0.72, wh: 0.045, ws: 1.4, wv: 1.3 },
			ore: { h: 0, s: 0.11, v: 0.53, wh: 0.0, ws: 3.2, wv: 1.2 },
			desert: { h: 42, s: 0.24, v: 0.78, wh: 0.05, ws: 1.2, wv: 1.0 }
		}[resource];
		const dh = p.wh === 0 ? 0 : hueDelta(avg.h, p.h) * p.wh;
		const ds = (avg.s - p.s) * p.ws;
		const dv = (avg.v - p.v) * p.wv;
		return -(dh * dh + ds * ds + dv * dv);
	}

	function normalizeResources(tileInfo, modeKey) {
		const target = MODE_RESOURCE_COUNTS[modeKey] || MODE_RESOURCE_COUNTS.four;
		const remaining = new Map(Object.entries(target).map(([k, v]) => [k, v]));
		const assigned = new Array(tileInfo.length).fill(null);
		const unassigned = new Set(tileInfo.map((_, idx) => idx));

		while (unassigned.size > 0) {
			let best = null;
			remaining.forEach((count, resource) => {
				if (count <= 0) {
					return;
				}
				unassigned.forEach((idx) => {
					const score = resourceScore(tileInfo[idx].avg, resource);
					if (!best || score > best.score) {
						best = { idx, resource, score };
					}
				});
			});
			if (!best) {
				throw new Error("Could not normalize image-detected resources.");
			}
			assigned[best.idx] = best.resource;
			remaining.set(best.resource, (remaining.get(best.resource) || 0) - 1);
			unassigned.delete(best.idx);
		}

		return assigned;
	}


	function harborSlotCenters(bounds) {
		const slotCounts = [3, 3, 3, 3, 3, 3];
		const rx = bounds.w * 0.57;
		const ry = bounds.h * 0.57;
		const cx = bounds.x + bounds.w / 2;
		const cy = bounds.y + bounds.h / 2;
		const corners = [];
		for (let i = 0; i < 6; i += 1) {
			const angle = -Math.PI / 2 + i * Math.PI / 3;
			corners.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle), angle });
		}

		const out = [];
		let idx = 0;
		for (let s = 0; s < 6; s += 1) {
			const a = corners[s];
			const b = corners[(s + 1) % 6];
			for (let i = 0; i < slotCounts[s]; i += 1) {
				const t = (i + 1) / (slotCounts[s] + 1);
				const x = a.x + (b.x - a.x) * t;
				const y = a.y + (b.y - a.y) * t;
				const ang = Math.atan2(y - cy, x - cx);
				out.push({ index: idx, x, y, angle: ang });
				idx += 1;
			}
		}
		return out;
	}

	function sampleHSV(ctx, x, y, r) {
		const vals = [];
		for (let oy = -r; oy <= r; oy += 2) {
			for (let ox = -r; ox <= r; ox += 2) {
				if (ox * ox + oy * oy > r * r) {
					continue;
				}
				const px = Math.max(0, Math.min(ctx.canvas.width - 1, Math.floor(x + ox)));
				const py = Math.max(0, Math.min(ctx.canvas.height - 1, Math.floor(y + oy)));
				const d = ctx.getImageData(px, py, 1, 1).data;
				vals.push(rgbToHsv(d[0], d[1], d[2]));
			}
		}
		return averageHsv(vals);
	}

	function harborTypeFromIcon(ctx, x, y, rad) {
		const avg = sampleHSV(ctx, x, y, Math.max(3, rad));
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

	function harborCodeFromImage(ctx, bounds) {
		const slots = harborSlotCenters(bounds);
		const boatDist = Math.max(bounds.w, bounds.h) * 0.19;
		const parityScore = [0, 0];

		for (let p = 0; p < 2; p += 1) {
			for (let i = p; i < slots.length; i += 2) {
				const slot = slots[i];
				const bx = slot.x + Math.cos(slot.angle) * boatDist;
				const by = slot.y + Math.sin(slot.angle) * boatDist;
				const hsv = sampleHSV(ctx, bx, by, Math.max(4, Math.floor(bounds.w * 0.008)));
				if (hsv.v > 0.65 && hsv.s < 0.35) {
					parityScore[p] += 1;
				}
			}
		}

		const parity = parityScore[0] >= parityScore[1] ? 0 : 1;
		const selected = [];
		for (let i = parity; i < slots.length; i += 2) {
			selected.push(slots[i]);
		}

		const harborEntries = selected.map((slot) => {
			const bx = slot.x + Math.cos(slot.angle) * boatDist;
			const by = slot.y + Math.sin(slot.angle) * boatDist;
			const textProbe = sampleHSV(ctx, bx - Math.cos(slot.angle) * 6, by + Math.sin(slot.angle) * 3, Math.max(5, Math.floor(bounds.w * 0.01)));
			let type = "T";
			if (!(textProbe.s > 0.32 && (textProbe.h > 260 || textProbe.h < 20))) {
				const ix = bx - Math.cos(slot.angle) * Math.max(12, bounds.w * 0.035);
				const iy = by - Math.sin(slot.angle) * Math.max(12, bounds.w * 0.035);
				type = harborTypeFromIcon(ctx, ix, iy, Math.floor(bounds.w * 0.012));
			}
			return String(slot.index) + type;
		});

		return harborEntries.join("");
	}

	async function detectBoardCode(file) {
		const img = await loadImage(file);
		const canvas = document.createElement("canvas");
		canvas.width = img.naturalWidth;
		canvas.height = img.naturalHeight;
		const ctx = canvas.getContext("2d");
		ctx.drawImage(img, 0, 0);

		const bounds = boardBounds(ctx, canvas.width, canvas.height);
		const modeKey = modeEl.value === "six" ? "six" : "four";
		const rows = MODE_ROWS[modeKey];
		const centers = tileCenters(rows);
		const tileScale = Math.min(bounds.w / Math.max.apply(null, rows), bounds.h / rows.length);

		const tileInfo = [];
		for (let i = 0; i < centers.length; i += 1) {
			const p = centers[i];
			const cx = Math.floor(bounds.x + p.x * bounds.w);
			const cy = Math.floor(bounds.y + p.y * bounds.h);
			const avg = sampleTileHsv(ctx, cx, cy, tileScale);
			tileInfo.push({
				avg,
				resourceGuess: classifyResourceFromHsv(avg)
			});
		}

		const resources = normalizeResources(tileInfo, modeKey);
		const tokens = [];
		for (let i = 0; i < tileInfo.length; i += 1) {
			const letter = RESOURCE_LETTERS[resources[i]] || "S";
			tokens.push(letter);
		}

		return tokens.join(" ");
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
