function authHeaders(cfg) {
  return {
    "APCA-API-KEY-ID": cfg.alpaca.key,
    "APCA-API-SECRET-KEY": cfg.alpaca.secret
  };
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} from ${url}: ${body}`);
  }
  return res.json();
}

async function getClock(cfg) {
  const url = `${cfg.alpaca.tradingBaseUrl}/v2/clock`;
  return fetchJson(url, authHeaders(cfg));
}

async function getLatestTrade(cfg, symbol) {
  const url = `${cfg.alpaca.dataBaseUrl}/v2/stocks/${encodeURIComponent(symbol)}/trades/latest`;
  const json = await fetchJson(url, authHeaders(cfg));
  return json.trade || null;
}

async function getLatestQuote(cfg, symbol) {
  const url = `${cfg.alpaca.dataBaseUrl}/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`;
  const json = await fetchJson(url, authHeaders(cfg));
  return json.quote || null;
}

async function getLatestPoint(cfg, symbol) {
  try {
    const trade = await getLatestTrade(cfg, symbol);
    if (trade && Number.isFinite(Number(trade.p))) {
      return {
        source: "latest_trade",
        point: {
          timestamp: String(trade.t),
          price: Number(trade.p)
        }
      };
    }
  } catch {
    // Fall through to quote midpoint.
  }

  const quote = await getLatestQuote(cfg, symbol);
  const bid = Number(quote?.bp);
  const ask = Number(quote?.ap);
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
    return { source: null, point: null };
  }

  return {
    source: "latest_quote_mid",
    point: {
      timestamp: String(quote.t),
      price: (bid + ask) / 2
    }
  };
}

module.exports = {
  getClock,
  getLatestPoint
};
