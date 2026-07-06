export function createImportState(modeKey) {
  return {
    modeKey,
    centers: [],
    frameSlots: [],
    tiles: [],
    bounds: null,
    quality: null,
    tileQuality: null,
    needsReview: true,
    stage: "centers"
  };
}
