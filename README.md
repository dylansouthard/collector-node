# collector-node

Node.js collector service for TraderBot research data.

## Purpose

- Poll Alpaca at a configurable interval.
- Save points to `data/research/<SYMBOL>.json` in the same format used by Python.
- Expose API endpoints to fetch the most recent `X` points for an array of symbols.

## Setup

1. Copy config:

```bash
cp config.example.json config.json
```

2. Copy environment file:

```bash
cp .env.example .env
```

3. Install deps:

```bash
npm install
```

4. Set Alpaca keys in `.env`:

```env
ALPACA_PAPER_KEY=...
ALPACA_PAPER_SECRET=...
```

The service reads `collector-node/.env` first.
For local dev, it can also fall back to `../.env` if keys are not set in local `.env`.

## Run

```bash
npm start
```

## API

- `GET /health`
- `POST /collect` (manual collect trigger)
- `GET /api/points?symbols=SPY,QQQ&limit=80`
- `POST /api/points`

Request body for POST `/api/points`:

```json
{
  "symbols": ["SPY", "QQQ"],
  "limit": 80
}
```

## Storage format

Per-symbol file:

```json
{
  "symbol": "SPY",
  "timeframe": "1Hour",
  "updated_at": "2026-02-21T06:00:00.000Z",
  "bars": [
    {
      "timestamp": "2026-02-21T06:00:00.000Z",
      "price": 687.12
    }
  ]
}
```
