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

## API

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/trial` | Trial limits |
| POST | `/api/orders` | Create an order (returns `{id}`) |
| GET  | `/api/orders/:id` | Get order status |
| PUT  | `/api/orders/:id/transcript` | Save the transcript (marks ready) |

Orders are stored in `backend/data/orders.json` (capped at 500). CORS is wide-open so
GitHub Pages can call it.