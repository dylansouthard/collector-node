const fs = require("fs");
const path = require("path");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function symbolFilePath(dataDir, symbol) {
  return path.join(dataDir, `${String(symbol).toUpperCase()}.json`);
}

function readJson(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) return fallbackValue;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallbackValue;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function normalizePoint(point) {
  if (!point || typeof point !== "object") return null;
  const ts = String(point.timestamp || "").trim();
  const price = Number(point.price);
  if (!ts || !Number.isFinite(price)) return null;
  return { timestamp: ts, price };
}

function loadSymbolPoints(dataDir, symbol) {
  const payload = readJson(symbolFilePath(dataDir, symbol), null);
  const rawBars = payload && Array.isArray(payload.bars) ? payload.bars : [];
  const points = rawBars.map(normalizePoint).filter(Boolean);
  points.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return points;
}

function mergePoints(existing, additions, maxPoints) {
  const map = new Map();
  for (const p of existing) {
    const n = normalizePoint(p);
    if (n) map.set(n.timestamp, n);
  }
  for (const p of additions) {
    const n = normalizePoint(p);
    if (n) map.set(n.timestamp, n);
  }
  const merged = Array.from(map.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (merged.length <= maxPoints) return merged;
  return merged.slice(merged.length - maxPoints);
}

function saveSymbolPoints(dataDir, symbol, points, timeframe) {
  const payload = {
    symbol: String(symbol).toUpperCase(),
    timeframe: String(timeframe),
    updated_at: new Date().toISOString(),
    bars: points
  };
  const filePath = symbolFilePath(dataDir, symbol);
  writeJson(filePath, payload);
  return filePath;
}

function loadState(stateFile) {
  const state = readJson(stateFile, { last_run_market_open: null, symbols: {} });
  if (!state || typeof state !== "object") return { last_run_market_open: null, symbols: {} };
  if (!state.symbols || typeof state.symbols !== "object") state.symbols = {};
  return state;
}

function saveState(stateFile, state) {
  writeJson(stateFile, state);
}

function tailPoints(dataDir, symbol, limit) {
  const points = loadSymbolPoints(dataDir, symbol);
  const n = Math.max(1, Number(limit || 1));
  return points.slice(Math.max(points.length - n, 0));
}

module.exports = {
  ensureDir,
  loadSymbolPoints,
  mergePoints,
  saveSymbolPoints,
  loadState,
  saveState,
  tailPoints
};
