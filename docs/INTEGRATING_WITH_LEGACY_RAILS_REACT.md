# Integrating Bid Collections Into a Rails + React App

This document describes two supported integration modes for host projects using
Ruby `2.4.5` and Rails `5.2`.

## Supported Modes

1. Service-style integration (run this backend as standalone API).
2. In-process integration via mountable engine gem.

Choose service-style for lower operational coupling, or engine mode for a single
runtime in the host app.

## A) Service-Style Integration Steps

### 1) Run bid-collections locally

From this repository:

```bash
bundle install
bin/rails db:create db:migrate
bin/rails s -p 3000
```

#### Ruby 2.4 / Rails 5.2 compatibility notes

- **Rails version**: This repo runs Rails `5.2.8.x` (despite some older references to 5.1).
- **API-only + ActionMailer**: If `config/environments/*.rb` sets `config.action_mailer.*`, ensure `config/application.rb` loads `action_mailer/railtie` (API-only apps don’t load it by default).
- **Nokogiri/Loofah on Ruby 2.4**: If you see `uninitialized constant Nokogiri::HTML4`, pin `loofah` to `< 2.21.0` (Ruby 2.4 commonly ends up with older Nokogiri).
- **MySQL FK mismatch (engine vs standalone)**: Some host apps use integer primary keys; this repo aims to tolerate that. If MySQL complains about incompatible FK types, ensure migrations reference the actual PK type of the parent table.

### 2) Run the React app from this repository

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

If you want the frontend to call the backend through a different path:

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000 \
VITE_API_PREFIX=/bid_collections/api \
npm run dev
```

### 3) Expose bid-collections endpoints through the host app

In the legacy app, proxy `/bid_collections/api` to
`http://127.0.0.1:3000/api` (Nginx, Apache, or Rack middleware).

Example Nginx idea:

```nginx
location /bid_collections/api/ {
  proxy_pass http://127.0.0.1:3000/api/;
}
```

### 4) Host React inside the legacy app

Choose one:

- Serve a built static bundle from the host app.
- Keep Vite dev server separate in development and use host navigation links.

The frontend now supports `VITE_API_PREFIX`, so no source-code path rewrites are
required when moving between standalone and embedded environments.

### 5) Add entry points in the host app

Add routes/menu links in the legacy app to the pages you want users to open,
for example:

- `/projects`
- `/import`
- `/vendors`
- `/package`
- `/comparison`

(These are React routes defined in this project.)

## B) Engine Integration Steps (In-process)

### 1) Add gem in host app

```ruby
gem 'bid_collections', path: '../bid-collections'
```

Then:

```bash
bundle install
```

### 2) Mount engine in host app routes

In host app `config/routes.rb`:

```ruby
mount BidCollections::Engine => '/bid_collections'
```

### 3) Copy and run engine migrations

```bash
bin/rails railties:install:migrations
bin/rails db:migrate
```

### 4) Point React API calls to mounted engine path

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000
VITE_API_PREFIX=/bid_collections/api
```

### 5) Keep local standalone workflow

This project still runs standalone for independent development/testing:

```bash
bundle install
bin/rails db:create db:migrate
bin/rails s
```
