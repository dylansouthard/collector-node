const express = require("express");
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./config");
const { getClock, getLatestPoint } = require("./alpaca");
const {
  ensureDir,
  loadSymbolPoints,
  mergePoints,
  saveSymbolPoints,
  loadState,
  saveState,
  tailPoints
} = require("./storage");

const cfg = loadConfig();
const app = express();
app.use(express.json());

ensureDir(cfg.data_dir);

let tickInFlight = false;
let lastTickSummary = null;

function appendLogLine(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  ensureDir(path.dirname(cfg.log_file));
  fs.appendFileSync(cfg.log_file, line, "utf-8");
}

function samePrice(a, b, epsilon = 1e-6) {
  return Math.abs(Number(a) - Number(b)) <= epsilon;
}

async function runCollectionTick() {
  if (tickInFlight) {
    appendLogLine("[tick] skipped reason=tick_already_running");
    return { skipped: true, reason: "tick already running" };
  }
  tickInFlight = true;

  try {
    const tickStarted = Date.now();
    const state = loadState(cfg.state_file);
    const prevMarketOpen = state.last_run_market_open;
    const stateSymbols = state.symbols || {};

    const clock = await getClock(cfg);
    const marketOpen = Boolean(clock.is_open);
    appendLogLine(
      `[tick] start market_open=${marketOpen} prev_market_open=${prevMarketOpen} symbols=${cfg.symbols.length}`
    );

    const results = {};
    for (const symbol of cfg.symbols) {
      const symbolStarted = Date.now();
      const stat = {
        symbol,
        saved: false,
        save_reason: null,
        price_source: null,
        price: null,
        price_timestamp: null,
        series_points: 0,
        last_point_ts: null,
        error: null
      };

      try {
        const { source, point } = await getLatestPoint(cfg, symbol);
        const existing = loadSymbolPoints(cfg.data_dir, symbol);

        if (!point) {
          stat.save_reason = "No latest trade/quote available";
          stat.series_points = existing.length;
          stat.last_point_ts = existing.length ? existing[existing.length - 1].timestamp : null;
          results[symbol] = stat;
          appendLogLine(
            `[symbol] ${symbol} status=no_data market_open=${marketOpen} reason="${stat.save_reason}" duration_ms=${Date.now() - symbolStarted}`
          );
          continue;
        }

        stat.price_source = source;
        stat.price = point.price;
        stat.price_timestamp = point.timestamp;

        const prevSeenPrice = stateSymbols[symbol]?.last_seen_price;
        const shouldSkip =
          cfg.skip_closed_unchanged &&
          marketOpen === false &&
          prevMarketOpen === false &&
          prevSeenPrice !== undefined &&
          samePrice(prevSeenPrice, point.price);

        if (shouldSkip) {
          stat.saved = false;
          stat.save_reason = "Skipped: market closed on consecutive runs and price unchanged";
          stat.series_points = existing.length;
          stat.last_point_ts = existing.length ? existing[existing.length - 1].timestamp : null;
          appendLogLine(
            `[symbol] ${symbol} status=skipped market_open=${marketOpen} price=${point.price} reason="${stat.save_reason}" duration_ms=${Date.now() - symbolStarted}`
          );
        } else {
          const merged = mergePoints(existing, [point], cfg.max_points);
          saveSymbolPoints(cfg.data_dir, symbol, merged, cfg.timeframe);
          stat.saved = true;
          stat.save_reason = "Saved current price point";
          stat.series_points = merged.length;
          stat.last_point_ts = merged.length ? merged[merged.length - 1].timestamp : null;
          appendLogLine(
            `[symbol] ${symbol} status=saved market_open=${marketOpen} price=${point.price} points=${merged.length} duration_ms=${Date.now() - symbolStarted}`
          );
        }

        stateSymbols[symbol] = {
          last_seen_price: point.price,
          last_seen_timestamp: point.timestamp
        };
      } catch (err) {
        stat.error = `${err.name || "Error"}: ${err.message || String(err)}`;
        appendLogLine(
          `[symbol] ${symbol} status=error market_open=${marketOpen} error="${stat.error}" duration_ms=${Date.now() - symbolStarted}`
        );
      }

      results[symbol] = stat;
    }

    state.last_run_market_open = marketOpen;
    state.last_run_timestamp_utc = new Date().toISOString();
    state.symbols = stateSymbols;
    saveState(cfg.state_file, state);

    const summary = {
      timestamp_utc: new Date().toISOString(),
      market_open: marketOpen,
      previous_run_market_open: prevMarketOpen,
      symbols: cfg.symbols,
      results
    };

    lastTickSummary = summary;
    appendLogLine(`[tick] done market_open=${marketOpen} duration_ms=${Date.now() - tickStarted}`);
    return summary;
  } finally {
    tickInFlight = false;
  }
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "traderbot-collector-node",
    interval_ms: cfg.interval_ms,
    symbols: cfg.symbols,
    last_tick: lastTickSummary?.timestamp_utc || null
  });
});

app.post("/collect", async (req, res) => {
  try {
    const out = await runCollectionTick();
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: `${err.name || "Error"}: ${err.message || String(err)}` });
  }
});

app.get("/api/points", (req, res) => {
  const symbolsRaw = String(req.query.symbols || "").trim();
  const symbols = symbolsRaw
    ? symbolsRaw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : cfg.symbols;
  const limit = Number(req.query.limit || 80);

  const pointsBySymbol = {};
  for (const symbol of symbols) {
    pointsBySymbol[symbol] = tailPoints(cfg.data_dir, symbol, limit);
  }

  res.json({
    symbols,
    limit,
    points_by_symbol: pointsBySymbol
  });
});

app.post("/api/points", (req, res) => {
  const symbols = Array.isArray(req.body?.symbols)
    ? req.body.symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
    : cfg.symbols;
  const limit = Number(req.body?.limit || 80);

  const pointsBySymbol = {};
  for (const symbol of symbols) {
    pointsBySymbol[symbol] = tailPoints(cfg.data_dir, symbol, limit);
  }

  res.json({
    symbols,
    limit,
    points_by_symbol: pointsBySymbol
  });
});

app.listen(cfg.api_port, async () => {
  console.log(`[collector-node] listening on :${cfg.api_port}`);
  console.log(`[collector-node] data dir: ${cfg.data_dir}`);
  console.log(`[collector-node] log file: ${cfg.log_file}`);
  console.log(`[collector-node] symbols: ${cfg.symbols.join(", ")}`);
  await runCollectionTick().catch((err) => {
    console.error(`[collector-node] initial collect failed: ${err.message || String(err)}`);
  });
  setInterval(() => {
    runCollectionTick().catch((err) => {
      console.error(`[collector-node] collect failed: ${err.message || String(err)}`);
    });
  }, cfg.interval_ms);
});
