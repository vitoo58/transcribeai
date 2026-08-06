# TranscribeAI API — Node backend (zero npm dependencies)

Free trial limit + order storage for TranscribeAI. Uses only Node's built-in
modules (`http`, `fs`) — no `package.json`, no `node_modules`, nothing from npm.

## Run locally

```bash
node server.js
# http://localhost:3000
```

## Test

```bash
node test.js
```

## Deploy to Render

1. Push this `backend/` folder (or the whole repo) to GitHub.
2. In Render: *New → Web Service* → point to the repo.
3. Root directory: `backend` · Build: `node --version` · Start: `node server.js`.
4. Set env vars (optional): `TRIAL_DAYS=7`, `MAX_FREE_TRANSCRIPTS=3`, `CORS_ORIGIN=*`.
5. Copy the URL (e.g. `https://transcribeai-api.onrender.com`) and paste it into
   `js/config.js` as `apiBase`.

On Railway: deploy the `backend/` directory with `NODE_ENV` unset and port picked
up from `$PORT` automatically.

## Storage

Orders live in a SQLite database (`data/orders.db`, via the built-in `node:sqlite`
module — zero npm dependencies). On startup it automatically migrates any existing
`data/orders.json` into the database and renames it to `orders.json.migrated`.
WAL mode is enabled for durability. Old orders are trimmed past `MAX_ORDERS`
(default 50000). Override `DB_FILE` to point elsewhere.

## Configuration (env)

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | 3000 | HTTP port |
| `TRIAL_DAYS` | 7 | Trial length in days |
| `MAX_FREE_TRANSCRIPTS` | 3 | Free transcriptions in the trial |
| `RATE_LIMIT_PER_MIN` | 60 | Max requests/min per IP |
| `MAX_ORDERS` | 50000 | Orders kept before trimming oldest |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |
| `DB_FILE` | `data/orders.db` | SQLite file path |

Almost all of these are injectable at the repo level for Render.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/trial` | Trial limits (no auth) |
| POST | `/api/orders` | Create an order (returns `{id, authCode}`) |
| GET  | `/api/orders/:id` | Get order (requires `X-Auth-Token` header) |
| PUT  | `/api/orders/:id/transcript` | Save the transcript (requires `X-Auth-Token`) |
| DELETE | `/api/orders/:id` | Delete the order (requires `X-Auth-Token`) |

## Security

- **Per-order auth**: `POST /api/orders` returns a random `authCode` (48 hex chars).
  All reads/writes/deletes of an order require it via the `X-Auth-Token` header.
  The `authCode` is never returned by GET/PUT responses. The frontend stores it in
  `localStorage` and sends it automatically.
- **Rate limiting**: 60 requests/min per IP (`RATE_LIMIT_PER_MIN`), returns 429.
- **Input validation**: email regex, 5MB body cap, field length caps, transcript size caps.
- **Write serialization**: SQLite serializes writes automatically (single writer),
  so no lost update race remains.
- **Security headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
- Data is stored locally on the server's disk. For durable storage on Render, attach
  a disk mounted at `data/` (see `render.yaml`). TLS is provided by Render.