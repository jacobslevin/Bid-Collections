# Frontend Prototype (React + Vite)

Compatibility target:

- Node.js: `14.x` (host uses nvm `14.0.0`)
- React: `17.x` (aligned for host apps using `react_on_rails` `11.1.4`)

Run locally:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Environment variables:

```bash
# Default Rails API host
VITE_API_BASE_URL=http://127.0.0.1:3000

# Default API path prefix
VITE_API_PREFIX=/api
```

If `VITE_API_BASE_URL` is not set, `src/lib/api.js` will default by Vite mode:
- `development` -> `http://127.0.0.1:3000`
- `staging` -> `https://staging.designerpages.com`
- `production` -> `https://www.designerpages.com`

For example, when this frontend is served from another app and bid-collections
is exposed behind `/bid_collections/api`, use:

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000
VITE_API_PREFIX=/bid_collections/api
```

Screens included:
- Projects
- Import Bid Package
- Package Dashboard
- Dealer Unlock
- Dealer Bid Entry
- Comparison Dashboard

This frontend is wired to real API calls in `src/lib/api.js`.
