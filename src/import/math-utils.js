export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
