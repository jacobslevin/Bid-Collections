# Bid Collections

This repository contains:

- A Rails API backend for bid package workflows.
- A React + Vite frontend in `frontend/`.

## Target Runtime

- Ruby: `2.4.5`
- Rails: `5.2.x` (currently `~> 5.2.8`)
- Node (frontend): `14.0.0` via `frontend/.nvmrc`
- React (frontend): `17.x` (aligned with host apps using `react_on_rails` `11.1.4`)

## API Surface

- `POST /api/projects`
- `POST /api/projects/:id/bid_packages/preview`
- `POST /api/projects/:id/bid_packages`
- `POST /api/bid_packages/:id/invites`
- `GET /api/bid_packages/:id/dashboard`
- `GET /api/bid_packages/:id/comparison`
- `GET /api/bid_packages/:id/export.csv`
- `GET /api/invites/:token`
- `POST /api/invites/:token/unlock`
- `GET /api/invites/:token/bid`
- `PUT /api/invites/:token/bid`
- `POST /api/invites/:token/bid/submit`

## CSV Import Notes

- Canonical required fields: `category, manufacturer, product_name, sku, description, quantity, uom`
- `spec_item_id` is optional and auto-generated when absent.
- Alias support exists for Designer Pages style headers (for example: `Brand -> manufacturer`, `Code -> sku`, `Product Name -> product_name`, `DP Categories -> category`).
- In default mode, quantity is required and must be numeric.
- For Designer Pages profile (`source_profile=designer_pages` or auto-detected), quantity defaults to `1` and UOM defaults to `EA` when blank.
- For Designer Pages profile, rows without `Product ID` are skipped entirely.
- For Designer Pages profile, rows with `Product ID` are kept even if other fields are blank; import-safe defaults are applied (`sku` from product id, fallback product/manufacturer/category/description).
- Bidder-facing source fields are preserved on `SpecItem`: `image_url`, `source_url`, `notes`, `description`, `attributes_text`, `nested_products`.

## Run Locally

### Backend (Rails API)

```bash
bundle install
bin/rails db:create db:migrate
bin/rails s
```

Optional test run:

```bash
bundle exec rspec
```

### Frontend (React + Vite)

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Default URLs:

- Backend API: `http://127.0.0.1:3000`
- Frontend dev server: `http://127.0.0.1:5173`

## Working As A Module In Another Project

This repository now includes a mountable engine entrypoint:

- `lib/bid_collections.rb`
- `lib/bid_collections/engine.rb`
- `bid_collections.gemspec`

You can continue running this project standalone locally, and also mount it
inside another Rails `5.2` app.

### Mount In Host App (Engine mode)

1. Add to host app `Gemfile`:

```ruby
gem 'bid_collections', path: '../bid-collections'
```

2. Bundle:

```bash
bundle install
```

3. Mount engine in host app `config/routes.rb`:

```ruby
mount BidCollections::Engine => '/bid_collections'
```

4. Install engine migrations into host app:

```bash
bin/rails railties:install:migrations
bin/rails db:migrate
```

5. Call engine API through mounted path, for example:

- `/bid_collections/api/projects`
- `/bid_collections/api/bid_packages`

### Keep Running Standalone Locally

Standalone run remains unchanged:

```bash
bundle install
bin/rails db:create db:migrate
bin/rails s
```
