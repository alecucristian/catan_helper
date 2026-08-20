// test
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
const swapResourcesEl = document.getElementById("swapResources");
const swapTokensEl = document.getElementById("swapTokens");
const swapPortsEl = document.getElementById("swapPorts");
const statusEl = document.getElementById("status");

const playerSeatEl = document.getElementById("playerSeat");
const startDraftBtn = document.getElementById("startDraftBtn");
const undoDraftBtn = document.getElementById("undoDraftBtn");
const resetDraftBtn = document.getElementById("resetDraftBtn");
const recommendationsPanelEl = document.getElementById("recommendationsPanel");
const recommendationsSummaryEl = document.getElementById("recommendationsSummary");
const recommendationsListEl = document.getElementById("recommendationsList");
const draftStatusTitleEl = document.getElementById("draftStatusTitle");

let state = {
	modeKey: "four",
	tiles: [],
	adjacency: new Map(),
	spiral: [],
	frameSlots: [],
	ports: []
};

// Draft tracking state
let draftActive = false;
let draftSeat = 1; // User's seat: 1, 2, 3, or 4
let draftStep = 0; // Index in draft order
let draftPlacements = []; // Array of { interId, player }
let draftBlockedIds = new Set(); // Intersections blocked by Catan distance rules

let swapMode = null; // null | "resources" | "tokens" | "ports"
let swapSelectedTileId = null;

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
			.sort((a, b) => {
				const dy = a.center.y - b.center.y;
				if (Math.abs(dy) > 40) return dy;
				return a.center.x - b.center.x;
			})[0].index;
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
		.sort((a, b) => {
			const dy = a.slot.y - b.slot.y;
			if (Math.abs(dy) > 40) return dy;
			return a.slot.x - b.slot.x;
		})[0]?.idx || 0;
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
	window.appState = state;
	window.updateBoardAndCode = function() {
		codeEl.value = boardCodeFromTiles(state.tiles, state.spiral, state.ports);
		renderBoard();
	};
	const mode = MODES[state.modeKey];
	const geometry = tileGeometry(mode.rows, state.tiles);
	const centers = geometry.centers;
	const seaPadding = Math.round(geometry.hexW * 0.85);
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

		if (swapMode === "ports") {
			if (swapSelectedTileId === "slot:" + slot.index) {
				borderHex.classList.add("selected-for-swap");
			}
			borderHex.style.cursor = "pointer";
			borderHex.addEventListener("click", () => {
				if (swapSelectedTileId === null) {
					swapSelectedTileId = "slot:" + slot.index;
					renderBoard();
				} else if (swapSelectedTileId === "slot:" + slot.index) {
					swapSelectedTileId = null;
					renderBoard();
				} else if (swapSelectedTileId.startsWith("slot:")) {
					const otherSlotIndex = parseInt(swapSelectedTileId.split(":")[1], 10);
					const p1 = state.ports.find(p => p.slotIndex === otherSlotIndex);
					const p2 = state.ports.find(p => p.slotIndex === slot.index);
					
					if (p1 && p2) {
						const tmp = p1.label;
						p1.label = p2.label;
						p2.label = tmp;
					} else if (p1 && !p2) {
						p1.slotIndex = slot.index;
					} else if (!p1 && p2) {
						p2.slotIndex = otherSlotIndex;
					}
					
					swapSelectedTileId = null;
					codeEl.value = boardCodeFromTiles(state.tiles, state.spiral, state.ports);
					renderBoard();
				}
			});
		}

		boardEl.appendChild(borderHex);
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

		if (swapMode !== null) {
			if (swapSelectedTileId === tile.id) {
				el.classList.add("selected-for-swap");
			}
			el.addEventListener("click", () => {
				if (swapSelectedTileId === null) {
					swapSelectedTileId = tile.id;
					renderBoard();
				} else if (swapSelectedTileId === tile.id) {
					swapSelectedTileId = null;
					renderBoard();
				} else {
					const t1 = state.tiles.find(t => t.id === swapSelectedTileId);
					const t2 = tile;
					if (swapMode === "resources") {
						const tmp = t1.resource;
						t1.resource = t2.resource;
						t2.resource = tmp;
					} else if (swapMode === "tokens") {
						const tmp = t1.token;
						t1.token = t2.token;
						t2.token = tmp;
					}
					swapSelectedTileId = null;
					codeEl.value = boardCodeFromTiles(state.tiles, state.spiral, state.ports);
					renderBoard();
				}
			});
		} else if (!draftActive) {
			el.style.cursor = "pointer";
			el.addEventListener("click", () => {
				if (typeof window.openHexEditModal === "function") {
					window.openHexEditModal(tile.id);
				}
			});
		}

		boardEl.appendChild(el);
	}

	if (draftActive) {
		renderDraftOverlay();
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

function setSwapMode(mode) {
	swapMode = mode;
	swapSelectedTileId = null;
	swapResourcesEl.classList.toggle("swap-active", mode === "resources");
	swapTokensEl.classList.toggle("swap-active", mode === "tokens");
	if (swapPortsEl) swapPortsEl.classList.toggle("swap-active", mode === "ports");
	
	if (mode) {
		setStatus("Swap mode active: Click a hex (or port) to select, then click another to swap their " + mode + ".");
	} else {
		setStatus("Swap mode disabled.");
	}
	renderBoard(); // re-render to clear any selection
}

swapResourcesEl.addEventListener("click", () => {
	setSwapMode(swapMode === "resources" ? null : "resources");
});

swapTokensEl.addEventListener("click", () => {
	setSwapMode(swapMode === "tokens" ? null : "tokens");
});

if (swapPortsEl) {
	swapPortsEl.addEventListener("click", () => {
		setSwapMode(swapMode === "ports" ? null : "ports");
	});
}

function getIntersections() {
	const mode = MODES[state.modeKey];
	const geometry = tileGeometry(mode.rows, state.tiles);
	const centers = geometry.centers;
	const W = geometry.hexW;
	const H = geometry.hexH;

	const corners = [];

	state.tiles.forEach((tile) => {
		const center = centers.get(tile.id);
		if (!center) return;

		// 6 relative offsets for pointy-topped hex corners
		const offsets = [
			{ dx: 0, dy: -H / 2 },
			{ dx: 0.46 * W, dy: -H / 4 },
			{ dx: 0.46 * W, dy: H / 4 },
			{ dx: 0, dy: H / 2 },
			{ dx: -0.46 * W, dy: H / 4 },
			{ dx: -0.46 * W, dy: -H / 4 }
		];

		offsets.forEach((offset) => {
			corners.push({
				x: center.x + offset.dx,
				y: center.y + offset.dy,
				tileId: tile.id,
				resource: tile.resource,
				token: tile.token
			});
		});
	});

	// Merge close corners
	const uniqueIntersections = [];
	const tolerance = 15; // px

	corners.forEach((c) => {
		let found = uniqueIntersections.find((ui) => {
			const dx = ui.x - c.x;
			const dy = ui.y - c.y;
			return dx * dx + dy * dy < tolerance * tolerance;
		});

		if (found) {
			if (!found.tiles.some(t => t.id === c.tileId)) {
				found.tiles.push({
					id: c.tileId,
					resource: c.resource,
					token: c.token
				});
			}
		} else {
			uniqueIntersections.push({
				id: `inter_${uniqueIntersections.length}`,
				x: c.x,
				y: c.y,
				tiles: [{
					id: c.tileId,
					resource: c.resource,
					token: c.token
				}]
			});
		}
	});

	return uniqueIntersections;
}

// Get Catan drafting order
function getDraftOrder() {
	const mode = state.modeKey === "six" ? "six" : "four";
	if (mode === "six") {
		return [1, 2, 3, 4, 5, 6, 6, 5, 4, 3, 2, 1];
	}
	return [1, 2, 3, 4, 4, 3, 2, 1];
}

// Check if two intersections are connected by an edge
function isAdjacentIntersection(i1, i2, H) {
	const dx = i1.x - i2.x;
	const dy = i1.y - i2.y;
	const dist = Math.sqrt(dx * dx + dy * dy);
	return dist < H * 0.65;
}

// Calculate which intersections are blocked
function recalculateBlockedIntersections(allInters, H) {
	draftBlockedIds.clear();
	draftPlacements.forEach((placement) => {
		draftBlockedIds.add(placement.interId);
		const inter = allInters.find(i => i.id === placement.interId);
		if (inter) {
			allInters.forEach((other) => {
				if (isAdjacentIntersection(inter, other, H)) {
					draftBlockedIds.add(other.id);
				}
			});
		}
	});
}

// Score a single intersection taking into account current blocked state
function scoreDraftIntersection(inter, allInters, H, scarcityMultipliers) {
	let rawPips = 0;
	let weightedPips = 0;
	const resources = new Set();
	const adjacentTiles = [];
	const tokens = [];

	inter.tiles.forEach((tile) => {
		if (tile.resource && tile.resource !== "desert") {
			resources.add(tile.resource);
			const token = tile.token;
			if (token) {
				const pipMap = {
					2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1
				};
				const tilePips = pipMap[token] || 0;
				rawPips += tilePips;
				
				const mult = scarcityMultipliers[tile.resource] || 1.0;
				weightedPips += tilePips * mult;
				
				adjacentTiles.push({
					resource: tile.resource,
					token: token,
					pips: tilePips
				});
				tokens.push(token);
			} else {
				adjacentTiles.push({
					resource: tile.resource,
					token: null,
					pips: 0
				});
			}
		}
	});

	const diversity = resources.size;
	let score = weightedPips;

	if (diversity > 1) {
		score += (diversity - 1) * 1.0;
	}

	if (resources.has("wood") && resources.has("brick")) {
		score += 1.5;
	}
	if (resources.has("wheat") && resources.has("ore")) {
		score += 1.5;
	}
	if (resources.has("wheat") && resources.has("ore") && resources.has("sheep")) {
		score += 1.0;
	}

	// 1. Roll Diversification
	const uniqueTokens = new Set(tokens);
	if (uniqueTokens.size === tokens.length && tokens.length > 0) {
		score += 0.5; 
	} else if (tokens.length - uniqueTokens.size > 0) {
		score -= (tokens.length - uniqueTokens.size) * 0.5; 
	}

	// 2. Expansion Paths
	let openPaths = 3;
	allInters.forEach((other) => {
		if (isAdjacentIntersection(inter, other, H)) {
			if (draftBlockedIds.has(other.id)) {
				openPaths--;
			}
		}
	});
	if (openPaths === 3) {
		score += 0.5;
	} else if (openPaths <= 1) {
		score -= 1.0; 
	}

	// 3. Port proximity (scaled by matching resource production)
	let adjacentPort = null;
	const portBySlot = new Map(state.ports.map((port) => [port.slotIndex, port]));

	state.frameSlots.forEach((slot) => {
		const port = portBySlot.get(slot.index);
		if (port) {
			const dx = inter.x - slot.x;
			const dy = inter.y - slot.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < H * 0.6) {
				adjacentPort = port;
			}
		}
	});

	if (adjacentPort) {
		const portResource = adjacentPort.label.split(" ")[0];
		if (resources.has(portResource)) {
			let localPips = 0;
			adjacentTiles.forEach(t => {
				if (t.resource === portResource) {
					localPips += t.pips;
				}
			});
			score += localPips * 0.35;
		} else if (adjacentPort.label === "3:1") {
			score += 1.0; 
		} else {
			score += 0.5; 
		}
	}

	const ownedResources = new Set();
	draftPlacements.forEach((p) => {
		if (p.player === draftSeat) {
			const existingInter = allInters.find(i => i.id === p.interId);
			if (existingInter) {
				existingInter.tiles.forEach((tile) => {
					if (tile.resource && tile.resource !== "desert") {
						ownedResources.add(tile.resource);
					}
				});
			}
		}
	});

	if (ownedResources.size > 0) {
		let newResourceCount = 0;
		resources.forEach((res) => {
			if (!ownedResources.has(res)) {
				newResourceCount++;
			}
		});
		score += newResourceCount * 2.5;
	}

	return {
		id: inter.id,
		x: inter.x,
		y: inter.y,
		score: score,
		pips: rawPips,
		diversity: diversity,
		resources: Array.from(resources),
		adjacentTiles: adjacentTiles.sort((a,b) => b.pips - a.pips),
		port: adjacentPort ? adjacentPort.label : null
	};
}

function getResourceProductionPips(spots, resource) {
	let pips = 0;
	spots.forEach(spot => {
		spot.adjacentTiles.forEach(tile => {
			if (tile.resource === resource) {
				pips += tile.pips;
			}
		});
	});
	return pips;
}

function recommendPairs(scoredInters, allInters, H) {
	const minDistance = H * 0.65;
	const pairs = [];
	
	for (let i = 0; i < scoredInters.length; i++) {
		const inter1 = scoredInters[i];
		for (let j = i + 1; j < scoredInters.length; j++) {
			const inter2 = scoredInters[j];
			
			// Check distance constraint
			const dx = inter1.x - inter2.x;
			const dy = inter1.y - inter2.y;
			const dist = Math.sqrt(dx*dx + dy*dy);
			if (dist < minDistance) {
				continue;
			}
			
			// Combined production pips
			const combinedPips = inter1.pips + inter2.pips;
			
			// Combined resource set
			const allResources = new Set([...inter1.resources, ...inter2.resources]);
			const combinedDiversity = allResources.size;
			
			let pairScore = inter1.score + inter2.score;
			
			// 1. Resource coverage bonuses
			if (combinedDiversity === 5) {
				pairScore += 3.0; // Perfect coverage bonus
			} else if (combinedDiversity === 4) {
				pairScore += 1.5;
			}
			
			// 2. Archetype synergies
			const combinedPipsByResource = {};
			["wood", "brick", "sheep", "wheat", "ore"].forEach(res => {
				combinedPipsByResource[res] = getResourceProductionPips([inter1, inter2], res);
			});

			const OWS = (combinedPipsByResource["ore"] || 0) + (combinedPipsByResource["wheat"] || 0) + (combinedPipsByResource["sheep"] || 0);
			const woodBrick = (combinedPipsByResource["wood"] || 0) + (combinedPipsByResource["brick"] || 0);
			const wheatSheep = (combinedPipsByResource["wheat"] || 0) + (combinedPipsByResource["sheep"] || 0);

			if (OWS >= 12) {
				pairScore += 2.0; // Ore-Wheat-Sheep strategy synergy
			}
			if (woodBrick >= 8 && wheatSheep >= 6) {
				pairScore += 1.5; // Road Builder strategy synergy
			}

			pairs.push({
				spot1: inter1,
				spot2: inter2,
				score: pairScore,
				pips: combinedPips,
				diversity: combinedDiversity,
				resources: Array.from(allResources)
			});
		}
	}
	
	return pairs.sort((a,b) => b.score - a.score).slice(0, 5);
}

// Get the placement order number (e.g. "1st placement", "2nd placement") for a player's turn
function getPlacementNumber(player, stepIndex, draftOrder) {
	let count = 0;
	for (let i = 0; i <= stepIndex; i++) {
		if (draftOrder[i] === player) {
			count++;
		}
	}
	return count === 1 ? "1st" : "2nd";
}

// Start draft placement assistant
function startPlacementDraft() {
	if (!state.tiles.length) {
		setStatus("No board generated yet. Please generate or randomize first.", true);
		return;
	}
	
	draftActive = true;
	draftSeat = parseInt(playerSeatEl.value, 10);
	draftStep = 0;
	draftPlacements = [];
	draftBlockedIds.clear();
	
	undoDraftBtn.disabled = false;
	resetDraftBtn.disabled = false;
	recommendationsPanelEl.hidden = false;
	
	renderBoard();
}

function resetDraft() {
	draftActive = false;
	draftStep = 0;
	draftPlacements = [];
	draftBlockedIds.clear();
	
	undoDraftBtn.disabled = true;
	resetDraftBtn.disabled = true;
	recommendationsPanelEl.hidden = true;
	
	renderBoard();
}

function undoDraft() {
	if (draftPlacements.length > 0) {
		draftPlacements.pop();
		draftStep = Math.max(0, draftStep - 1);
		renderBoard();
	}
}

// Main logic to render draft dots and status panel
function renderDraftOverlay() {
	const allInters = getIntersections();
	const mode = MODES[state.modeKey];
	const geometry = tileGeometry(mode.rows, state.tiles);
	const H = geometry.hexH;
	const W = geometry.hexW;
	const seaPadding = Math.round(W * 0.85);

	recalculateBlockedIntersections(allInters, H);

	// Compute global scarcity multipliers
	const pipMap = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
	const globalResourcePips = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
	state.tiles.forEach(tile => {
		if (tile.resource && globalResourcePips[tile.resource] !== undefined) {
			globalResourcePips[tile.resource] += pipMap[tile.token] || 0;
		}
	});
	const averagePips = Object.values(globalResourcePips).reduce((a, b) => a + b, 0) / 5;
	const scarcityMultipliers = {};
	Object.keys(globalResourcePips).forEach(res => {
		const pips = globalResourcePips[res];
		scarcityMultipliers[res] = pips > 0 ? Math.min(2.0, Math.max(0.5, averagePips / pips)) : 1.0;
	});

	const draftOrder = getDraftOrder();
	
	// Check if draft is finished
	if (draftStep >= draftOrder.length) {
		draftStatusTitleEl.textContent = "Draft Complete!";
		recommendationsSummaryEl.textContent = "All starting settlements placed.";
		recommendationsListEl.innerHTML = "";
		
		// Draw final placements
		allInters.forEach((inter) => {
			const placement = draftPlacements.find(p => p.interId === inter.id);
			if (placement) {
				drawClaimedDot(inter, placement.player);
			}
		});
		return;
	}

	const currentPlayer = draftOrder[draftStep];
	const placementNum = getPlacementNumber(currentPlayer, draftStep, draftOrder);
	const isUserTurn = currentPlayer === draftSeat;

	draftStatusTitleEl.textContent = `Draft Turn ${draftStep + 1}/${draftOrder.length}`;
	
	// Create interactive dots for all intersections
	allInters.forEach((inter) => {
		const placement = draftPlacements.find(p => p.interId === inter.id);
		if (placement) {
			drawClaimedDot(inter, placement.player);
			return;
		}

		if (draftBlockedIds.has(inter.id)) {
			drawBlockedDot(inter);
			return;
		}

		// Spot is free!
		drawClickableDot(inter);
	});

	if (isUserTurn) {
		const unblocked = allInters.filter(i => !draftBlockedIds.has(i.id));
		const scored = unblocked.map(i => scoreDraftIntersection(i, allInters, H, scarcityMultipliers));
		scored.sort((a, b) => b.score - a.score);

		if (draftSeat === 4 && draftStep === 3) {
			// Player 4 wrap: recommend complementary pairs!
			const pairs = recommendPairs(scored, allInters, H);
			recommendationsSummaryEl.textContent = `Your Turn (Player 4) - Placing your first settlement. Recommending best complementary PAIRS for your back-to-back turn.`;
			
			recommendationsListEl.innerHTML = "";
			pairs.forEach((pair, idx) => {
				const label = String.fromCharCode(65 + idx); // A, B, C, D, E
				
				// Highlight first pair on board
				const dot1 = boardEl.querySelector(`.intersection-dot[data-id="${pair.spot1.id}"]`);
				const dot2 = boardEl.querySelector(`.intersection-dot[data-id="${pair.spot2.id}"]`);
				
				if (dot1 && idx === 0) { dot1.classList.add("recommended"); dot1.textContent = `${label}1`; }
				if (dot2 && idx === 0) { dot2.classList.add("recommended"); dot2.textContent = `${label}2`; }

				// Render list item
				const item = document.createElement("div");
				item.className = "import-review-item";
				item.style.cursor = "pointer";
				
				const header = document.createElement("div");
				header.className = "import-review-label";
				header.textContent = `Pair ${label} (Combined Score: ${pair.score.toFixed(1)}, Pips: ${pair.pips})`;
				
				const detail = document.createElement("div");
				detail.className = "import-review-meta";
				detail.innerHTML = `
					<strong>Spot 1:</strong> ${spotText(pair.spot1)}<br>
					<strong>Spot 2:</strong> ${spotText(pair.spot2)}<br>
					<strong>Resources:</strong> ${pair.resources.join(", ")}
				`;
				item.appendChild(header);
				item.appendChild(detail);
				recommendationsListEl.appendChild(item);

				item.addEventListener("mouseenter", () => {
					const d1 = boardEl.querySelector(`.intersection-dot[data-id="${pair.spot1.id}"]`);
					const d2 = boardEl.querySelector(`.intersection-dot[data-id="${pair.spot2.id}"]`);
					if (d1) d1.classList.add("highlighted");
					if (d2) d2.classList.add("highlighted");
				});
				item.addEventListener("mouseleave", () => {
					const d1 = boardEl.querySelector(`.intersection-dot[data-id="${pair.spot1.id}"]`);
					const d2 = boardEl.querySelector(`.intersection-dot[data-id="${pair.spot2.id}"]`);
					if (d1) d1.classList.remove("highlighted");
					if (d2) d2.classList.remove("highlighted");
				});
			});
		} else {
			// Regular individual spot recommendations
			const topRecommendations = scored.slice(0, 3);
			recommendationsSummaryEl.textContent = `Your Turn (Player ${draftSeat}) - Placing your ${placementNum} settlement! Best positions recommended.`;
			
			recommendationsListEl.innerHTML = "";
			topRecommendations.forEach((spot, idx) => {
				const rank = idx + 1;
				
				const dot = boardEl.querySelector(`.intersection-dot[data-id="${spot.id}"]`);
				if (dot) {
					dot.classList.add("recommended");
					dot.textContent = String(rank);
				}

				const item = document.createElement("div");
				item.className = "import-review-item";
				item.style.cursor = "pointer";
				
				const header = document.createElement("div");
				header.className = "import-review-label";
				header.textContent = `Choice #${rank} (Score: ${spot.score.toFixed(1)}, Pips: ${spot.pips})`;
				
				const detail = document.createElement("div");
				detail.className = "import-review-meta";
				detail.innerHTML = `
					<strong>Resources:</strong> ${spotText(spot)}<br>
					<strong>Port:</strong> ${spot.port || "None"}
				`;
				item.appendChild(header);
				item.appendChild(detail);
				recommendationsListEl.appendChild(item);

				item.addEventListener("mouseenter", () => {
					if (dot) dot.classList.add("highlighted");
				});
				item.addEventListener("mouseleave", () => {
					if (dot) dot.classList.remove("highlighted");
				});
			});

			if (topRecommendations.length === 0) {
				recommendationsSummaryEl.textContent = "No valid starting positions left!";
			}
		}
	} else {
		// Other player's turn
		recommendationsSummaryEl.textContent = `Player ${currentPlayer}'s turn to place their ${placementNum} settlement. Click on the board to log their selection.`;
		recommendationsListEl.innerHTML = `
			<p class="import-review-empty">
				Waiting for Player ${currentPlayer} to make a choice...<br>
				Please watch where they place their settlement and click that corner on the screen to update the tracker.
			</p>
		`;
	}

	// Sub-renderers
	function drawClaimedDot(inter, playerNum) {
		const dot = document.createElement("div");
		dot.className = `intersection-dot claimed player-${playerNum}`;
		positionDot(dot, inter, 24);
		dot.title = `Player ${playerNum}'s Settlement`;
		boardEl.appendChild(dot);
	}

	function drawBlockedDot(inter) {
		const dot = document.createElement("div");
		dot.className = "intersection-dot blocked";
		positionDot(dot, inter, 14);
		boardEl.appendChild(dot);
	}

	function drawClickableDot(inter) {
		const dot = document.createElement("div");
		dot.className = "intersection-dot";
		dot.setAttribute("data-id", inter.id);
		positionDot(dot, inter, 20);
		
		dot.addEventListener("click", () => {
			draftPlacements.push({ interId: inter.id, player: currentPlayer });
			draftStep += 1;
			renderBoard();
		});

		// Hover tooltips
		dot.addEventListener("mouseenter", () => {
			const spotStats = scoreDraftIntersection(inter, allInters, H);
			setStatus(`Intersection: ${spotText(spotStats)} | Pips: ${spotStats.pips} | Port: ${spotStats.port || 'None'}`);
		});
		dot.addEventListener("mouseleave", () => {
			setStatus("");
		});

		boardEl.appendChild(dot);
	}

	function positionDot(dot, inter, size) {
		dot.style.left = inter.x + seaPadding - size / 2 + "px";
		dot.style.top = inter.y + seaPadding - size / 2 + "px";
	}

	function spotText(spot) {
		return spot.adjacentTiles.map(t => t.resource + (t.token ? ` ${t.token}` : '')).join(", ");
	}
}

// Bind draft buttons
startDraftBtn.addEventListener("click", startPlacementDraft);
undoDraftBtn.addEventListener("click", undoDraft);
resetDraftBtn.addEventListener("click", resetDraft);

modeEl.addEventListener("change", () => {
	updateHint();
	applyBoardCode();
});
generateEl.addEventListener("click", applyBoardCode);
randomizeEl.addEventListener("click", randomizeBoard);
if (typeof tokensOnlyEl !== 'undefined' && tokensOnlyEl) tokensOnlyEl.addEventListener("click", reshuffleTokensOnly);
codeEl.addEventListener("keydown", (event) => {
	if (event.key === "Enter") {
		event.preventDefault();
		applyBoardCode();
	}
});

updateHint();
applyBoardCode();
