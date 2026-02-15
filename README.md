# Bid Collections Prototype Backend Skeleton

This repository contains the core Rails API backend skeleton for the Bid Collections MVP:

- Rails API app runtime scaffolding
- Data model migrations
- ActiveRecord models and associations
- API routes and controller skeletons
- CSV import preview/commit, comparison, and export service objects
- RSpec request spec scaffolding

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

## Current Environment Constraints

- Ruby syntax checks pass.
- `bundle install` and `bundle exec rspec` were not runnable in this sandbox because outbound network to RubyGems is blocked.

## Local Run (on your machine)

```bash
bundle install
bin/rails db:create db:migrate
bundle exec rspec
bin/rails s
```

## Frontend Prototype

A React/Vite UI shell is included in `/frontend` with the six MVP screens and mock data.

```bash
cd frontend
npm install
npm run dev
```
