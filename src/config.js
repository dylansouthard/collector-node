const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Prefer a collector-local env file for server deployments.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
// Optional fallback to parent project .env for local development convenience.
dotenv.config({ path: path.resolve(process.cwd(), "../.env"), override: false });

const DEFAULTS = {
  interval_ms: 60_000,
  api_port: 8787,
  symbols: ["SPY"],
  timeframe: "1Hour",
  max_points: 600,
  data_dir: "../data/research",
  state_file: "../data/research/state-node.json",
  log_file: "../logs/research/collector-node.log",
  skip_closed_unchanged: true
};

function resolvePath(maybeRelativePath) {
  if (!maybeRelativePath) return maybeRelativePath;
  if (path.isAbsolute(maybeRelativePath)) return maybeRelativePath;
  return path.resolve(process.cwd(), maybeRelativePath);
}

function normalizeSymbols(symbols) {
  if (!Array.isArray(symbols)) return [];
  return [...new Set(symbols.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean))];
}

function loadFileConfig() {
  const configPath = path.resolve(process.cwd(), "config.json");
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

function loadConfig() {
  const fileCfg = loadFileConfig();
  const cfg = { ...DEFAULTS, ...fileCfg };

  cfg.interval_ms = Number(process.env.INTERVAL_MS || cfg.interval_ms);
  cfg.api_port = Number(process.env.API_PORT || cfg.api_port);
  cfg.max_points = Number(process.env.MAX_POINTS || cfg.max_points);
  cfg.timeframe = String(process.env.TIMEFRAME || cfg.timeframe);
  cfg.skip_closed_unchanged = String(process.env.SKIP_CLOSED_UNCHANGED || cfg.skip_closed_unchanged) !== "false";

  const envSymbols = process.env.SYMBOLS ? process.env.SYMBOLS.split(",") : null;
  cfg.symbols = normalizeSymbols(envSymbols || cfg.symbols);
  cfg.data_dir = resolvePath(process.env.DATA_DIR || cfg.data_dir);
  cfg.state_file = resolvePath(process.env.STATE_FILE || cfg.state_file);
  cfg.log_file = resolvePath(process.env.LOG_FILE || cfg.log_file);

  const alpacaKey = process.env.ALPACA_PAPER_KEY || process.env.ALPACA_KEY;
  const alpacaSecret = process.env.ALPACA_PAPER_SECRET || process.env.ALPACA_SECRET;
  const tradingBaseUrl = process.env.ALPACA_TRADING_BASE_URL || "https://paper-api.alpaca.markets";
  const dataBaseUrl = process.env.ALPACA_DATA_BASE_URL || "https://data.alpaca.markets";

  if (!alpacaKey || !alpacaSecret) {
    throw new Error("Missing ALPACA_PAPER_KEY / ALPACA_PAPER_SECRET in environment");
  }

  return {
    ...cfg,
    alpaca: {
      key: alpacaKey,
      secret: alpacaSecret,
      tradingBaseUrl,
      dataBaseUrl
    }
  };
}

module.exports = {
  loadConfig
};
