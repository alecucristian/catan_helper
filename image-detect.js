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

	function classifyResource(ctx, cx, cy, tileSize) {
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

	function tokenPatch(sourceCtx, x, y, size, mode) {
		const out = document.createElement("canvas");
		out.width = 160;
		out.height = 160;
		const g = out.getContext("2d");
		g.drawImage(sourceCtx.canvas, x, y, size, size, 0, 0, 160, 160);
		const img = g.getImageData(0, 0, 160, 160);
		const d = img.data;
		for (let i = 0; i < d.length; i += 4) {
			const r = d[i];
			const gg = d[i + 1];
			const b = d[i + 2];
			const hsv = rgbToHsv(r, gg, b);
			let ink = false;
			if (mode === "dark") {
				ink = hsv.v < 0.45 || (r > 120 && gg < 120 && b < 120);
			} else {
				ink = hsv.v < 0.58 || (r > 120 && gg < 120 && b < 120);
			}
			if (ink) {
				d[i] = 0;
				d[i + 1] = 0;
				d[i + 2] = 0;
			} else {
				d[i] = 255;
				d[i + 1] = 255;
				d[i + 2] = 255;
			}
		}
		g.putImageData(img, 0, 0);
		return out;
	}

	async function ocrToken(worker, sourceCtx, cx, cy, tileSize) {
		const tries = [
			{ scale: 0.36, dx: 0, dy: 0, mode: "dark" },
			{ scale: 0.34, dx: 0, dy: 0, mode: "normal" },
			{ scale: 0.38, dx: -0.02, dy: 0, mode: "dark" },
			{ scale: 0.38, dx: 0.02, dy: 0, mode: "dark" },
			{ scale: 0.34, dx: 0, dy: -0.02, mode: "normal" }
		];
		const votes = new Map();

		for (let i = 0; i < tries.length; i += 1) {
			const t = tries[i];
			const size = Math.max(34, Math.floor(tileSize * t.scale));
			const px = Math.max(0, Math.floor(cx + t.dx * tileSize - size / 2));
			const py = Math.max(0, Math.floor(cy + t.dy * tileSize - size / 2));
			const patch = tokenPatch(sourceCtx, px, py, size, t.mode);
			const result = await worker.recognize(patch);
			const text = (result.data.text || "").replace(/\s+/g, "");
			const match = text.match(/(10|11|12|[2-9])/);
			if (match) {
				const token = Number.parseInt(match[1], 10);
				if (token >= 2 && token <= 12 && token !== 7) {
					votes.set(token, (votes.get(token) || 0) + 1);
				}
			}
		}

		if (!votes.size) {
			return null;
		}

		const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
		return best[0];
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

		if (!window.Tesseract) {
			throw new Error("OCR library not available. Reload and try again.");
		}

		const worker = await window.Tesseract.createWorker("eng");
		await worker.setParameters({
			tessedit_char_whitelist: "0123456789",
			tessedit_pageseg_mode: "8",
			preserve_interword_spaces: "0"
		});

		try {
			const tokens = [];
			for (let i = 0; i < centers.length; i += 1) {
				const p = centers[i];
				const cx = Math.floor(bounds.x + p.x * bounds.w);
				const cy = Math.floor(bounds.y + p.y * bounds.h);
				const resource = classifyResource(ctx, cx, cy, tileScale);
				let token = await ocrToken(worker, ctx, cx, cy, tileScale);
				if (resource === "desert") {
					token = null;
				}
				if (resource !== "desert" && token === null) {
					token = 5;
				}
				const letter = RESOURCE_LETTERS[resource] || "S";
				tokens.push(letter + (token === null ? "" : String(token)));
			}

			const harborCode = modeKey === "four" ? harborCodeFromImage(ctx, bounds) : "";
			return tokens.join(" ") + (harborCode ? " P" + harborCode : "");
		} finally {
			await worker.terminate();
		}
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
