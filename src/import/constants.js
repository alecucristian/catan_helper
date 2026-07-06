export const MODE_ROWS = {
  four: [3, 4, 5, 4, 3],
  six: [3, 4, 5, 6, 5, 4, 3]
};

export const MODE_FRAME_SLOTS = {
  four: 18,
  six: 22
};

export const MODE_RESOURCE_COUNTS = {
  four: { wood: 4, brick: 3, sheep: 4, wheat: 4, ore: 3, desert: 1 },
  six: { wood: 6, brick: 5, sheep: 6, wheat: 6, ore: 5, desert: 2 }
};

export const RESOURCE_OPTIONS = ["wood", "brick", "sheep", "wheat", "ore", "desert"];

export const RESOURCE_LABELS = {
  wood: "Wood",
  brick: "Brick",
  sheep: "Sheep",
  wheat: "Wheat",
  ore: "Ore",
  desert: "Desert"
};

export const RESOURCE_TEMPLATE_FILES = {
  wood: "../../templates/res_wood.png",
  brick: "../../templates/res_brick.png",
  sheep: "../../templates/res_sheep.png",
  wheat: "../../templates/res_grain.png",
  ore: "../../templates/res_ore.png",
  desert: "../../templates/res_desert.png"
};

export const CENTER_QUALITY_THRESHOLDS = {
  markerCountWarn: 10,
  markerCountGood: 16,
  residualWarn: 0.16,
  residualGood: 0.09
};

export const TILE_CONFIDENCE_THRESHOLD = 0.58;

export const NORMALIZED_BOARD_SIZE = 960;

export const TOKEN_TEMPLATE_FILES = {
  2: "../../templates/num_2.png",
  3: "../../templates/num_3.png",
  4: "../../templates/num_4.png",
  5: "../../templates/num_5.png",
  6: "../../templates/num_6.png",
  8: "../../templates/num_8.png",
  9: "../../templates/num_9.png",
  10: "../../templates/num_10.png",
  11: "../../templates/num_11.png",
  12: "../../templates/num_12.png"
};

export const HARBOR_TEMPLATE_FILES = {
  "3:1": "../../templates/harbor_3to1.png",
  "wood 2:1": "../../templates/harbor_wood.png",
  "brick 2:1": "../../templates/harbor_brick.png",
  "sheep 2:1": "../../templates/harbor_sheep.png",
  "wheat 2:1": "../../templates/harbor_grain.png",
  "ore 2:1": "../../templates/harbor_ore.png"
};

export const MODE_TOKEN_POOLS = {
  four: [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11],
  six: [2, 5, 4, 6, 3, 9, 8, 11, 11, 10, 6, 3, 8, 4, 8, 10, 10, 9, 12, 12, 5, 4, 9, 5, 6, 3, 11, 2]
};

export const MODE_HARBOR_POOLS = {
  four: ["3:1", "3:1", "3:1", "3:1", "wood 2:1", "brick 2:1", "sheep 2:1", "wheat 2:1", "ore 2:1"],
  six: ["3:1", "3:1", "3:1", "3:1", "3:1", "3:1", "wood 2:1", "brick 2:1", "sheep 2:1", "wheat 2:1", "ore 2:1"]
};

