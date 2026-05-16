const MODES = {
	four: {
		name: "4 Player Base",
		rows: [3, 4, 5, 4, 3],
		resources: {
			wood: 4,
			brick: 3,
			sheep: 4,
			wheat: 4,
			ore: 3,
			desert: 1
		},
		tokens: [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11],
		ports: ["3:1", "3:1", "3:1", "3:1", "wood 2:1", "brick 2:1", "sheep 2:1", "wheat 2:1", "ore 2:1"],
		portSlots: 9,
		frameSlots: 18
	},
	six: {
		name: "6 Player Expansion",
		rows: [3, 4, 5, 6, 5, 4, 3],
		resources: {
			wood: 6,
			brick: 5,
			sheep: 6,
			wheat: 6,
			ore: 5,
			desert: 2
		},
		tokens: [2, 5, 4, 6, 3, 9, 8, 11, 11, 10, 6, 3, 8, 4, 8, 10, 10, 9, 12, 12, 5, 4, 9, 5, 6, 3, 11, 2],
		ports: ["3:1", "3:1", "3:1", "3:1", "3:1", "3:1", "wood 2:1", "brick 2:1", "sheep 2:1", "wheat 2:1", "ore 2:1"],
		portSlots: 11,
		frameSlots: 22
	}
};

const RESOURCE_CONFIG = {
	wood: { letter: "W", label: "wood" },
	brick: { letter: "B", label: "brick" },
	sheep: { letter: "S", label: "sheep" },
	wheat: { letter: "G", label: "wheat" },
	ore: { letter: "O", label: "ore" },
	desert: { letter: "D", label: "desert" }
};

const RESOURCE_ALIASES = {
	w: "wood",
	wood: "wood",
	b: "brick",
	brick: "brick",
	s: "sheep",
	sheep: "sheep",
	g: "wheat",
	grain: "wheat",
	wheat: "wheat",
	o: "ore",
	ore: "ore",
	d: "desert",
	desert: "desert"
};

const RESOURCE_PARSE_ORDER = [
	"wood",
	"brick",
	"sheep",
	"wheat",
	"grain",
	"desert",
	"ore",
	"w",
	"b",
	"s",
	"g",
	"o",
	"d"
];

const HARBOR_CODE_TO_LABEL = {
	"3": "3:1",
	W: "wood 2:1",
	B: "brick 2:1",
	S: "sheep 2:1",
	G: "wheat 2:1",
	O: "ore 2:1"
};

const HARBOR_LABEL_TO_CODE = {
	"3:1": "3",
	"wood 2:1": "W",
	"brick 2:1": "B",
	"sheep 2:1": "S",
	"wheat 2:1": "G",
	"ore 2:1": "O"
};

const boardEl = document.getElementById("board");
const modeEl = document.getElementById("mode");
const codeEl = document.getElementById("boardCode");
const generateEl = document.getElementById("generateBoard");
const randomizeEl = document.getElementById("randomizeBoard");
const tokensOnlyEl = document.getElementById("tokensOnly");
const statusEl = document.getElementById("status");

let state = {
	modeKey: "four",
	tiles: [],
	adjacency: new Map(),
	spiral: [],
	frameSlots: [],
	ports: []
};

function shuffle(input) {
	const arr = [...input];
	for (let i = arr.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		const tmp = arr[i];
		arr[i] = arr[j];
		arr[j] = tmp;
	}
	return arr;
}

function buildSkeleton(rows) {
	const tiles = [];
	let id = 0;
	for (let r = 0; r < rows.length; r += 1) {
		for (let c = 0; c < rows[r]; c += 1) {
			tiles.push({
				id,
				row: r,
				col: c,
				resource: null,
				token: null,
				locked: false
			});
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

function resourcePool(resourceCounts) {
	const pool = [];
	Object.entries(resourceCounts).forEach(([resource, count]) => {
		for (let i = 0; i < count; i += 1) {
			pool.push(resource);
		}
	});
	return pool;
}

function isRed(value) {
	return value === 6 || value === 8;
}

function hasAdjacentReds(tiles, adjacency) {
	const byId = new Map(tiles.map((tile) => [tile.id, tile]));
	for (const tile of tiles) {
		if (!isRed(tile.token)) {
			continue;
		}
		const neighbors = adjacency.get(tile.id) || [];
		for (const id of neighbors) {
			const neighbor = byId.get(id);
			if (neighbor && isRed(neighbor.token)) {
				return true;
			}
		}
	}
	return false;
}

function tileGeometry(rows, tiles) {
	const hexW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hex-w"));
	const hexH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hex-h"));
	const maxCols = Math.max(...rows);
	const vStep = hexH * 0.76;
	const hStep = hexW * 0.88;

	const centers = new Map();
	tiles.forEach((tile) => {
		const rowCount = rows[tile.row];
		const x = ((maxCols - rowCount) * hStep) / 2 + tile.col * hStep + hexW / 2;
		const y = tile.row * vStep + hexH / 2;
		centers.set(tile.id, { x, y });
	});

	const width = maxCols * hStep + hexW * 0.2;
	const height = (rows.length - 1) * vStep + hexH;
	return { centers, width, height, hexW, hexH };
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

function buildSpiralOrder(tiles, adjacency, rows) {
	const geometry = tileGeometry(rows, tiles);
	const centerX = geometry.width / 2;
	const centerY = geometry.height / 2;
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

		if (ring.length === 0) {
			for (const id of remaining) {
				ring.push(id);
			}
		}

		const ordered = sortClockwiseByCenter(ring, geometry.centers, centerX, centerY);
		const start = ordered
			.map((id, index) => ({ id, index, center: geometry.centers.get(id) }))
			.sort((a, b) => (a.center.y - b.center.y) || (a.center.x - b.center.x))[0].index;
		const shifted = ordered.slice(start).concat(ordered.slice(0, start));
		rings.push(shifted);
		shifted.forEach((id) => remaining.delete(id));
	}

	return rings.flat();
}

function buildFrameSlots(boundary, centers, boardCenter, slotCount) {
	const hexW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hex-w"));
	const hexH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hex-h"));
	const hStep = hexW * 0.88;
	const vStep = hexH * 0.76;
	const neighborVectors = [
		{ x: hStep, y: 0 },
		{ x: -hStep, y: 0 },
		{ x: hStep / 2, y: vStep },
		{ x: -hStep / 2, y: vStep },
		{ x: hStep / 2, y: -vStep },
		{ x: -hStep / 2, y: -vStep }
	];

	const keyFor = (x, y) => Math.round(x * 10) + ":" + Math.round(y * 10);
	const centerByKey = new Map();
	for (const center of centers.values()) {
		centerByKey.set(keyFor(center.x, center.y), center);
	}

	const outerByKey = new Map();
	for (const tile of boundary) {
		const center = centers.get(tile.id);
		for (const vector of neighborVectors) {
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
		.map((slot, idx) => ({ slot, idx }))
		.sort((a, b) => (a.slot.y - b.slot.y) || (a.slot.x - b.slot.x))[0]?.idx || 0;
	orderedOuter = orderedOuter.slice(start).concat(orderedOuter.slice(0, start));

	if (orderedOuter.length !== slotCount) {
		const sampled = [];
		for (let i = 0; i < slotCount; i += 1) {
			sampled.push(orderedOuter[Math.floor(i * orderedOuter.length / slotCount)]);
		}
		orderedOuter = sampled;
	}

	const boundaryCenters = boundary.map((tile) => centers.get(tile.id));
	const nearestLandPoints = (slot) => {
		const adjacent = slot.adjacentLand
			.map((land) => ({
				land,
				d: (land.x - slot.x) ** 2 + (land.y - slot.y) ** 2
			}))
			.sort((a, b) => a.d - b.d)
			.slice(0, 2)
			.map((entry) => entry.land);

		if (adjacent.length === 2) {
			return adjacent;
		}

		return boundaryCenters
			.map((land) => ({
				land,
				d: (land.x - slot.x) ** 2 + (land.y - slot.y) ** 2
			}))
			.sort((a, b) => a.d - b.d)
			.slice(0, 2)
			.map((entry) => entry.land);
	};

	return orderedOuter.map((slot, index) => {
		const angle = Math.atan2(slot.y - boardCenter.y, slot.x - boardCenter.x);
		const [landA, landB] = nearestLandPoints(slot);

		return {
			index,
			x: slot.x,
			y: slot.y,
			angle,
			settlementA: landA,
			settlementB: landB
		};
	});
}

function selectHarborSlots(frameSlots, harborCount) {
	if (harborCount * 2 === frameSlots.length) {
		const start = Math.floor(Math.random() * 2);
		return frameSlots.filter((_, index) => index % 2 === start);
	}

	const selected = [];
	const used = new Set();
	const step = frameSlots.length / harborCount;

	for (let i = 0; i < harborCount; i += 1) {
		let index = Math.floor(i * step);
		while (used.has(index)) {
			index = (index + 1) % frameSlots.length;
		}
		used.add(index);
		selected.push(frameSlots[index]);
	}

	return selected;
}

function parseBoardCode(text) {
	const trimmed = text.trim();
	if (!trimmed) {
		return [];
	}

	const compact = trimmed.replace(/[\s,;]+/g, "").toLowerCase();
	const entries = [];
	let index = 0;

	while (index < compact.length) {
		let resourceMatch = null;
		for (const candidate of RESOURCE_PARSE_ORDER) {
			if (compact.startsWith(candidate, index)) {
				resourceMatch = candidate;
				break;
			}
		}

		if (!resourceMatch) {
			throw new Error('Invalid code near "' + trimmed.slice(index) + '". Use values like O6S4W10 or O6 S4 W10.');
		}

		index += resourceMatch.length;
		let tokenText = "";
		while (index < compact.length && /\d/.test(compact[index])) {
			tokenText += compact[index];
			index += 1;
		}

		const resourceName = RESOURCE_ALIASES[resourceMatch];
		const token = tokenText ? Number.parseInt(tokenText, 10) : null;

		if (token !== null && (token < 2 || token > 12 || token === 7)) {
			throw new Error('Invalid token "' + token + '". Use 2-12 except 7.');
		}

		entries.push({
			resource: resourceName,
			token,
			raw: resourceMatch + tokenText
		});
	}

	return entries;
}

function splitBoardCodeSections(text) {
	const trimmed = text.trim();
	if (!trimmed) {
		return { tileText: "", harborText: "" };
	}

	const compact = trimmed.replace(/[\s,;]+/g, "");
	const markerIndex = compact.toUpperCase().indexOf("P");
	if (markerIndex === -1) {
		return { tileText: compact, harborText: "" };
	}

	return {
		tileText: compact.slice(0, markerIndex),
		harborText: compact.slice(markerIndex + 1)
	};
}

function normalizeHarborCode(rawCode) {
	const cleaned = rawCode.trim().toUpperCase();
	if (!cleaned) {
		return null;
	}
	const harborMap = { T: "3", W: "W", B: "B", S: "S", G: "G", O: "O" };
	return harborMap[cleaned] || null;
}

function parseHarborCode(text) {
	const trimmed = text.trim();
	if (!trimmed) {
		return [];
	}

	const compact = trimmed.replace(/[\s,;]+/g, "");
	if (!compact) {
		return [];
	}

	const entries = [];
	let index = 0;
	while (index < compact.length) {
		let digits = "";
		while (index < compact.length && /\d/.test(compact[index])) {
			digits += compact[index];
			index += 1;
		}

		if (!digits || index >= compact.length) {
			throw new Error('Invalid harbor code near "' + compact.slice(Math.max(0, index - 1)) + '". Use values like P1T3W5O.');
		}

		const harborCode = normalizeHarborCode(compact[index]);
		if (!harborCode) {
			throw new Error('Unknown harbor value "' + compact[index] + '". Use T, W, B, S, G, or O.');
		}
		index += 1;

		entries.push({
			slotIndex: Number.parseInt(digits, 10),
			code: harborCode,
			label: HARBOR_CODE_TO_LABEL[harborCode]
		});
	}

	return entries;
}

function boardCodeFromTiles(tiles, spiralIds = null, ports = []) {
	const byId = new Map(tiles.map((tile) => [tile.id, tile]));
	const orderedTiles = spiralIds ? spiralIds.map((id) => byId.get(id)).filter(Boolean) : tiles;
	const tileCode = orderedTiles
		.map((tile) => resourceLetter(tile.resource) + (tile.token === null ? "" : String(tile.token)))
		.join(" ");

	const harborCode = ports.length
		? " P" + [...ports].sort((a, b) => a.slotIndex - b.slotIndex).map((port) => String(port.slotIndex) + harborCompactCodeFromLabel(port.label)).join("")
		: "";

	return tileCode + harborCode;
}

function explicitHarborsToPorts(mode, harborEntries) {
	if (harborEntries.length !== mode.portSlots) {
		return null;
	}

	const availablePortPool = [...mode.ports];
	const usedSlots = new Set();
	const ports = [];

	harborEntries.forEach((entry) => {
		if (entry.slotIndex < 0 || entry.slotIndex >= mode.frameSlots) {
			throw new Error("Harbor slot " + entry.slotIndex + " is out of range for this board mode.");
		}
		if (usedSlots.has(entry.slotIndex)) {
			throw new Error("Duplicate harbor slot " + entry.slotIndex + " in the code.");
		}
		usedSlots.add(entry.slotIndex);
		const poolIndex = availablePortPool.indexOf(entry.label);
		if (poolIndex === -1) {
			throw new Error("Harbor type " + entry.label + " appears too many times in the code.");
		}
		availablePortPool.splice(poolIndex, 1);
		ports.push({ slotIndex: entry.slotIndex, label: entry.label });
	});

	return ports.sort((a, b) => a.slotIndex - b.slotIndex);
}

function harborCodeFromLabel(label) {
	return HARBOR_LABEL_TO_CODE[label] || "3";
}

function harborCompactCodeFromLabel(label) {
	const code = harborCodeFromLabel(label);
	return code === "3" ? "T" : code;
}

function createEmptyTilesFromMode(mode) {
	const skeleton = buildSkeleton(mode.rows);
	const adjacency = buildAdjacency(skeleton, mode.rows);
	const spiral = buildSpiralOrder(skeleton, adjacency, mode.rows);
	const tiles = spiral.map((id) => ({
		...skeleton.find((tile) => tile.id === id),
		resource: null,
		token: null,
		locked: false
	}));
	return { tiles, adjacency, spiral };
}

function consumeCounts(source, consumed) {
	const next = { ...source };
	Object.entries(consumed).forEach(([key, count]) => {
		next[key] = (next[key] || 0) - count;
	});
	return next;
}

function countConsumedResources(entries) {
	const consumed = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, desert: 0 };
	entries.forEach((entry) => {
		consumed[entry.resource] += 1;
	});
	return consumed;
}

function collectTokens(entries) {
	return entries.filter((entry) => entry.token !== null).map((entry) => entry.token);
}

function buildRandomBoard(modeKey) {
	const mode = MODES[modeKey];
	const skeleton = buildSkeleton(mode.rows);
	const adjacency = buildAdjacency(skeleton, mode.rows);
	const spiral = buildSpiralOrder(skeleton, adjacency, mode.rows);
	const resourceAssigned = assignResources(skeleton, mode.resources);
	const tokenResult = assignTokensOfficial(resourceAssigned, adjacency, spiral, mode.tokens);

	if (!tokenResult.ok) {
		throw new Error("Could not generate a valid board.");
	}

	return {
		modeKey,
		tiles: tokenResult.tiles,
		adjacency,
		spiral,
		frameSlots: buildFrameSlotsFromTiles(tokenResult.tiles, adjacency, mode),
		ports: buildPorts(mode, tokenResult.tiles, adjacency)
	};
}

function assignResources(tiles, counts) {
	const shuffled = shuffle(resourcePool(counts));
	return tiles.map((tile, index) => ({ ...tile, resource: shuffled[index], token: null }));
}

function assignTokensOfficial(tiles, adjacency, spiralIds, tokens, maxAttempts = 120) {
	const deserts = new Set(tiles.filter((tile) => tile.resource === "desert").map((tile) => tile.id));
	if (tiles.length - deserts.size !== tokens.length) {
		return { ok: false, attempts: 0, tiles };
	}

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const nextTiles = tiles.map((tile) => ({ ...tile, token: null }));
		const byId = new Map(nextTiles.map((tile) => [tile.id, tile]));
		const clockwise = Math.random() > 0.5;
		const offset = Math.floor(Math.random() * spiralIds.length);
		const base = spiralIds.slice(offset).concat(spiralIds.slice(0, offset));
		const order = clockwise ? base : [...base].reverse();
		let tokenIndex = 0;

		for (const id of order) {
			if (deserts.has(id)) {
				continue;
			}
			byId.get(id).token = tokens[tokenIndex];
			tokenIndex += 1;
		}

		if (!hasAdjacentReds(nextTiles, adjacency)) {
			return { ok: true, attempts: attempt, tiles: nextTiles };
		}
	}

	return { ok: false, attempts: maxAttempts, tiles };
}

function buildFrameSlotsFromTiles(tiles, adjacency, mode) {
	const geometry = tileGeometry(mode.rows, tiles);
	const boardCenter = { x: geometry.width / 2, y: geometry.height / 2 };
	const boundary = tiles.filter((tile) => (adjacency.get(tile.id) || []).length < 6);
	return buildFrameSlots(boundary, geometry.centers, boardCenter, mode.frameSlots);
}

function buildPorts(mode, tiles, adjacency, explicitHarbors = []) {
	const geometry = tileGeometry(mode.rows, tiles);
	const boardCenter = { x: geometry.width / 2, y: geometry.height / 2 };
	const boundary = tiles.filter((tile) => (adjacency.get(tile.id) || []).length < 6);
	const frameSlots = buildFrameSlots(boundary, geometry.centers, boardCenter, mode.frameSlots);
	if (explicitHarbors.length > mode.portSlots) {
		throw new Error("The code has more harbor locations than this board mode allows.");
	}

	const remainingPortPool = [...mode.ports];
	const explicitPorts = [];
	const usedSlots = new Set();

	explicitHarbors.forEach((entry) => {
		if (entry.slotIndex < 0 || entry.slotIndex >= mode.frameSlots) {
			throw new Error("Harbor slot " + entry.slotIndex + " is out of range for this board mode.");
		}
		if (usedSlots.has(entry.slotIndex)) {
			throw new Error("Duplicate harbor slot " + entry.slotIndex + " in the code.");
		}
		usedSlots.add(entry.slotIndex);
		const poolIndex = remainingPortPool.indexOf(entry.label);
		if (poolIndex === -1) {
			throw new Error("Harbor type " + entry.label + " appears too many times in the code.");
		}
		remainingPortPool.splice(poolIndex, 1);
		explicitPorts.push({ slotIndex: entry.slotIndex, label: entry.label });
	});

	if (explicitHarbors.length === mode.portSlots) {
		return explicitPorts.sort((a, b) => a.slotIndex - b.slotIndex);
	}

	const remainingSlots = frameSlots.filter((slot) => !usedSlots.has(slot.index));
	const needed = mode.portSlots - explicitPorts.length;
	if (needed > remainingSlots.length) {
		throw new Error("The harbor locations do not fit this board layout.");
	}

	const pickedSlots = selectHarborSlots(remainingSlots, needed);
	const remainingPorts = shuffle(remainingPortPool);
	const ports = [...explicitPorts];

	for (let i = 0; i < needed; i += 1) {
		ports.push({
			slotIndex: pickedSlots[i].index,
			label: remainingPorts[i]
		});
	}

	return ports.sort((a, b) => a.slotIndex - b.slotIndex);
}

function resourceLetter(resource) {
	return RESOURCE_CONFIG[resource]?.letter || "";
}

function resourceLabel(resource) {
	return RESOURCE_CONFIG[resource]?.label || resource;
}

function normalizeTileShape(tiles) {
	return tiles.map((tile) => ({
		id: tile.id,
		row: tile.row,
		col: tile.col,
		resource: tile.resource,
		token: tile.token,
		locked: Boolean(tile.locked)
	}));
}

function countResourceUsage(tiles) {
	const usage = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, desert: 0 };
	tiles.forEach((tile) => {
		usage[tile.resource] += 1;
	});
	return usage;
}

function countFixedTokens(entries) {
	const tokens = new Map();
	entries.forEach((entry) => {
		if (entry.token !== null) {
			tokens.set(entry.token, (tokens.get(entry.token) || 0) + 1);
		}
	});
	return tokens;
}

function generateFromBoardCode(modeKey, codeText) {
	const mode = MODES[modeKey];
	const { tileText, harborText } = splitBoardCodeSections(codeText);
	const codeEntries = parseBoardCode(tileText);
	const harborEntries = parseHarborCode(harborText);
	if (codeEntries.length === 0) {
		return buildRandomBoard(modeKey);
	}

	const skeleton = buildSkeleton(mode.rows);
	const adjacency = buildAdjacency(skeleton, mode.rows);
	const spiral = buildSpiralOrder(skeleton, adjacency, mode.rows);
	if (codeEntries.length > spiral.length) {
		throw new Error("The code has more tiles than this board mode allows.");
	}

	const fixedResourceUsage = countConsumedResources(codeEntries);
	const resourceCounts = consumeCounts(mode.resources, fixedResourceUsage);
	const tokenCounts = [...mode.tokens];
	const fixedTokenCounts = countFixedTokens(codeEntries);

	fixedTokenCounts.forEach((count, token) => {
		for (let i = 0; i < count; i += 1) {
			const index = tokenCounts.indexOf(token);
			if (index === -1) {
				throw new Error("Token " + token + " appears too many times in the code.");
			}
			tokenCounts.splice(index, 1);
		}
	});

	const tiles = spiral.map((tileId, index) => ({
		...skeleton.find((tile) => tile.id === tileId),
		resource: null,
		token: null,
		locked: index < codeEntries.length
	}));

	codeEntries.forEach((entry, index) => {
		tiles[index].resource = entry.resource;
		tiles[index].token = entry.token;
	});

	const remainingResources = resourcePool(resourceCounts);
	const remainingResourceTiles = tiles.filter((tile) => tile.resource === null);
	if (remainingResources.length !== remainingResourceTiles.length) {
		throw new Error("The code does not match the tile counts for this mode.");
	}

	const resourceShuffled = shuffle(remainingResources);
	remainingResourceTiles.forEach((tile, index) => {
		tile.resource = resourceShuffled[index];
	});

	const needsTokens = tiles.filter((tile) => tile.resource !== "desert" && tile.token === null);
	if (needsTokens.length !== tokenCounts.length) {
		throw new Error("The code does not match the number-token counts for this mode.");
	}

	for (let attempt = 1; attempt <= 240; attempt += 1) {
		const shuffledTokens = shuffle(tokenCounts);
		needsTokens.forEach((tile, index) => {
			tile.token = shuffledTokens[index];
		});

		if (!hasAdjacentReds(tiles, adjacency)) {
			let ports = explicitHarborsToPorts(mode, harborEntries);
			if (!ports) {
				ports = harborEntries.length > 0 ? buildPorts(mode, tiles, adjacency, harborEntries) : buildPorts(mode, tiles, adjacency);
			}

			return {
				modeKey,
				tiles: normalizeTileShape(tiles),
				adjacency,
				spiral,
				frameSlots: buildFrameSlotsFromTiles(tiles, adjacency, mode),
				ports
			};
		}
	}

	throw new Error("The fixed code creates an impossible red-token layout. Adjust the code and try again.");
}

function renderBoard() {
	const mode = MODES[state.modeKey];
	const geometry = tileGeometry(mode.rows, state.tiles);
	const centers = geometry.centers;
	const seaPadding = Math.round(geometry.hexW * 0.95);
	const boardWidth = geometry.width + seaPadding * 2;
	const boardHeight = geometry.height + seaPadding * 2;

	boardEl.innerHTML = "";
	boardEl.style.width = boardWidth + "px";
	boardEl.style.height = boardHeight + "px";

	const portBySlot = new Map(state.ports.map((port) => [port.slotIndex, port]));
	state.frameSlots.forEach((slot) => {
		const hx = slot.x + seaPadding;
		const hy = slot.y + seaPadding;
		const borderHex = document.createElement("article");
		const port = portBySlot.get(slot.index);
		borderHex.className = "border-hex" + (port ? " harbor-border" : "");
		borderHex.style.left = hx - geometry.hexW / 2 + "px";
		borderHex.style.top = hy - geometry.hexH / 2 + "px";
		boardEl.appendChild(borderHex);

		if (port) {
			const labelEl = document.createElement("div");
			labelEl.className = "harbor-label";
			labelEl.textContent = port.label;
			borderHex.appendChild(labelEl);
		}
	});

	for (const tile of state.tiles) {
		const center = centers.get(tile.id);
		const el = document.createElement("article");
		el.className = "hex " + tile.resource;
		el.style.left = center.x + seaPadding - geometry.hexW / 2 + "px";
		el.style.top = center.y + seaPadding - geometry.hexH / 2 + "px";
		el.setAttribute("aria-label", resourceLabel(tile.resource) + " tile");

		const resourceLabelEl = document.createElement("div");
		resourceLabelEl.className = "resource";
		resourceLabelEl.textContent = tile.resource;
		el.appendChild(resourceLabelEl);

		if (tile.token !== null) {
			const token = document.createElement("div");
			token.className = "token" + (isRed(tile.token) ? " red" : "");
			token.textContent = String(tile.token);
			el.appendChild(token);
		}

		boardEl.appendChild(el);
	}

}

function setStatus(message, isError = false) {
	statusEl.textContent = message;
	statusEl.style.color = isError ? "#9f2a20" : "var(--muted)";
}

function applyBoardCode() {
	try {
		state = generateFromBoardCode(modeEl.value, codeEl.value);
		renderBoard();
		codeEl.value = boardCodeFromTiles(state.tiles, state.spiral, state.ports);
		setStatus(
			codeEl.value.trim()
				? "Generated board from code in " + MODES[state.modeKey].name + "."
				: MODES[state.modeKey].name + " generated at random."
		);
	} catch (error) {
		setStatus(error.message, true);
	}
}

function randomizeBoard() {
	try {
		state = buildRandomBoard(modeEl.value);
		renderBoard();
		codeEl.value = boardCodeFromTiles(state.tiles, state.spiral, state.ports);
		setStatus(MODES[state.modeKey].name + " generated at random.");
	} catch (error) {
		setStatus(error.message, true);
	}
}

function reshuffleTokensOnly() {
	const mode = MODES[state.modeKey];
	if (!state.tiles.length) {
		applyBoardCode();
		return;
	}
	const resourceLocked = state.tiles.map((tile) => ({ ...tile, token: null }));
	const tokenResult = assignTokensOfficial(resourceLocked, state.adjacency, state.spiral, mode.tokens);
	if (!tokenResult.ok) {
		setStatus("Token reshuffle failed to satisfy official constraints. Try full randomize.", true);
		return;
	}
	state.tiles = normalizeTileShape(tokenResult.tiles);
	renderBoard();
	setStatus("Numbers reshuffled in " + tokenResult.attempts + " attempt(s).");
}

function initMode() {
	applyBoardCode();
}

function assignResourcesWithPartialCode(modeKey, codeEntries) {
	const mode = MODES[modeKey];
	const skeleton = buildSkeleton(mode.rows);
	const adjacency = buildAdjacency(skeleton, mode.rows);
	const spiral = buildSpiralOrder(skeleton, adjacency, mode.rows);
	if (codeEntries.length > spiral.length) {
		throw new Error("The code has more tiles than this board mode allows.");
	}

	const tiles = spiral.map((tileId, index) => ({
		...skeleton.find((tile) => tile.id === tileId),
		resource: null,
		token: null,
		locked: index < codeEntries.length
	}));

	codeEntries.forEach((entry, index) => {
		tiles[index].resource = entry.resource;
		tiles[index].token = entry.token;
	});

	const resourceUsage = countResourceUsage(tiles.filter((tile) => tile.resource !== null));
	const availableResources = consumeCounts(mode.resources, resourceUsage);
	const remainingResources = resourcePool(availableResources);
	const blanks = tiles.filter((tile) => tile.resource === null);
	if (remainingResources.length !== blanks.length) {
		throw new Error("The code does not match the tile counts for this mode.");
	}
	shuffle(remainingResources).forEach((resource, index) => {
		blanks[index].resource = resource;
	});

	return { mode, tiles, adjacency, spiral };
}

function countResourceUsage(tiles) {
	const usage = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, desert: 0 };
	tiles.forEach((tile) => {
		usage[tile.resource] += 1;
	});
	return usage;
}

function consumeCounts(source, consumed) {
	const next = { ...source };
	Object.entries(consumed).forEach(([key, count]) => {
		next[key] = (next[key] || 0) - count;
	});
	return next;
}

function countFixedTokens(entries) {
	const tokens = new Map();
	entries.forEach((entry) => {
		if (entry.token !== null) {
			tokens.set(entry.token, (tokens.get(entry.token) || 0) + 1);
		}
	});
	return tokens;
}

function createBoardFromCode(modeKey, codeText) {
	const mode = MODES[modeKey];
	const codeEntries = parseBoardCode(codeText);
	if (codeEntries.length === 0) {
		return buildRandomBoard(modeKey);
	}

	const { tiles, adjacency, spiral } = assignResourcesWithPartialCode(modeKey, codeEntries);
	const fixedTokenCounts = countFixedTokens(codeEntries);
	const remainingTokens = [...mode.tokens];
	fixedTokenCounts.forEach((count, token) => {
		for (let i = 0; i < count; i += 1) {
			const index = remainingTokens.indexOf(token);
			if (index === -1) {
				throw new Error("Token " + token + " appears too many times in the code.");
			}
			remainingTokens.splice(index, 1);
		}
	});

	const needsTokens = tiles.filter((tile) => tile.resource !== "desert" && tile.token === null);
	if (needsTokens.length !== remainingTokens.length) {
		throw new Error("The code does not match the number-token counts for this mode.");
	}

	for (let attempt = 1; attempt <= 240; attempt += 1) {
		const shuffledTokens = shuffle(remainingTokens);
		needsTokens.forEach((tile, index) => {
			tile.token = shuffledTokens[index];
		});

		if (!hasAdjacentReds(tiles, adjacency)) {
			return {
				modeKey,
				tiles: normalizeTileShape(tiles),
				adjacency,
				spiral,
				frameSlots: buildFrameSlotsFromTiles(tiles, adjacency, mode),
				ports: buildPorts(mode, tiles, adjacency)
			};
		}
	}

	throw new Error("The fixed code creates an impossible red-token layout. Adjust the code and try again.");
}

function buildRandomBoard(modeKey) {
	const mode = MODES[modeKey];
	const skeleton = buildSkeleton(mode.rows);
	const adjacency = buildAdjacency(skeleton, mode.rows);
	const spiral = buildSpiralOrder(skeleton, adjacency, mode.rows);
	const resourceAssigned = assignResources(skeleton, mode.resources);
	const tokenResult = assignTokensOfficial(resourceAssigned, adjacency, spiral, mode.tokens);

	if (!tokenResult.ok) {
		throw new Error("Could not generate a valid board.");
	}

	const tiles = normalizeTileShape(tokenResult.tiles);
	const ports = buildPorts(mode, tiles, adjacency);
	codeEl.value = boardCodeFromTiles(tiles, spiral, ports);
	return {
		modeKey,
		tiles,
		adjacency,
		spiral,
		frameSlots: buildFrameSlotsFromTiles(tiles, adjacency, mode),
		ports
	};
}

function buildFrameSlotsFromTiles(tiles, adjacency, mode) {
	const geometry = tileGeometry(mode.rows, tiles);
	const boardCenter = { x: geometry.width / 2, y: geometry.height / 2 };
	const boundary = tiles.filter((tile) => (adjacency.get(tile.id) || []).length < 6);
	return buildFrameSlots(boundary, geometry.centers, boardCenter, mode.frameSlots);
}

function buildPorts(mode, tiles, adjacency, explicitHarbors = []) {
	const geometry = tileGeometry(mode.rows, tiles);
	const boardCenter = { x: geometry.width / 2, y: geometry.height / 2 };
	const boundary = tiles.filter((tile) => (adjacency.get(tile.id) || []).length < 6);
	const frameSlots = buildFrameSlots(boundary, geometry.centers, boardCenter, mode.frameSlots);
	if (explicitHarbors.length > mode.portSlots) {
		throw new Error("The code has more harbor locations than this board mode allows.");
	}

	const remainingPortPool = [...mode.ports];
	const explicitPorts = [];
	const usedSlots = new Set();

	explicitHarbors.forEach((entry) => {
		if (entry.slotIndex < 0 || entry.slotIndex >= mode.frameSlots) {
			throw new Error("Harbor slot " + entry.slotIndex + " is out of range for this board mode.");
		}
		if (usedSlots.has(entry.slotIndex)) {
			throw new Error("Duplicate harbor slot " + entry.slotIndex + " in the code.");
		}
		usedSlots.add(entry.slotIndex);
		const poolIndex = remainingPortPool.indexOf(entry.label);
		if (poolIndex === -1) {
			throw new Error("Harbor type " + entry.label + " appears too many times in the code.");
		}
		remainingPortPool.splice(poolIndex, 1);
		explicitPorts.push({ slotIndex: entry.slotIndex, label: entry.label });
	});

	if (explicitHarbors.length === mode.portSlots) {
		return explicitPorts.sort((a, b) => a.slotIndex - b.slotIndex);
	}

	const remainingSlots = frameSlots.filter((slot) => !usedSlots.has(slot.index));
	const needed = mode.portSlots - explicitPorts.length;
	if (needed > remainingSlots.length) {
		throw new Error("The harbor locations do not fit this board layout.");
	}

	const pickedSlots = selectHarborSlots(remainingSlots, needed);
	const remainingPorts = shuffle(remainingPortPool);
	const ports = [...explicitPorts];

	for (let i = 0; i < needed; i += 1) {
		ports.push({
			slotIndex: pickedSlots[i].index,
			label: remainingPorts[i]
		});
	}

	return ports.sort((a, b) => a.slotIndex - b.slotIndex);
}

function resourceLabel(resource) {
	return RESOURCE_CONFIG[resource]?.label || resource;
}

function normalizeTileShape(tiles) {
	return tiles.map((tile) => ({
		id: tile.id,
		row: tile.row,
		col: tile.col,
		resource: tile.resource,
		token: tile.token,
		locked: Boolean(tile.locked)
	}));
}

function loadSelectedMode() {
	return modeEl.value === "six" ? "six" : "four";
}

function updateHint() {
	const mode = MODES[loadSelectedMode()];
	const totalTiles = mode.rows.reduce((sum, rowCount) => sum + rowCount, 0);
	document.getElementById("boardCodeHelp").textContent =
		"Spiral order, left to right. Harbor section uses only letters/numbers after P, like: P1T3W5O. Example: O6 S4 W10 P1T3W5O (" + totalTiles + " tiles max for this mode).";
}

modeEl.addEventListener("change", () => {
	updateHint();
	applyBoardCode();
});
generateEl.addEventListener("click", applyBoardCode);
randomizeEl.addEventListener("click", randomizeBoard);
tokensOnlyEl.addEventListener("click", reshuffleTokensOnly);
codeEl.addEventListener("keydown", (event) => {
	if (event.key === "Enter") {
		event.preventDefault();
		applyBoardCode();
	}
});

updateHint();
applyBoardCode();
