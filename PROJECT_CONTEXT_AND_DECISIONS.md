# Bid Collections MVP: Context and Decision Log

## What This File Is
This document captures how the Bid Collections MVP evolved through iterative product feedback and implementation decisions, and how those decisions map to the current codebase.

Primary repo path:
`/Users/jacobslevin/Documents/Documents - Jacob’s Mac Studio/Jake 2.0/Codex/Bid Collection`

Primary repo URL:
`https://github.com/jacobslevin/Bid-Collections`

---

## Product Goal (as implemented)
Enable a designer to:
1. Create/select a project.
2. Import a bid package from CSV.
3. Invite vendors via secure link + password.
4. Collect dealer bids (draft + submit).
5. Compare bids side-by-side with averages, deltas, totals, filtering, and export.
6. Reopen submitted bids and track submission versions/history.

---

## Core Tech Stack
- Backend: Ruby on Rails (API)
- Frontend: React + Vite
- Data: PostgreSQL
- Local dev: Rails on `localhost:3000`, Vite typically on `localhost:5173` or fallback `5174`

---

## Key Product Decisions from Iteration

## 1) Keep MVP standalone and fast to test
- No full user auth system for designers/dealers.
- Dealer access is by invite token + password.
- Focus on import, invite, bid entry, comparison, export.

## 2) “Project” handling simplified but restored in UI
- Early simplification removed projects from UI.
- Later restored projects as a first-class tab and flow:
  - Create project
  - Select project before importing bid package
- Backend keeps project relationships for future Designer Pages integration.

## 3) CSV import behavior tailored to real files
- Rows without Product ID (`spec_item_id`) are ignored for Designer Pages profile.
- Required field constraints were relaxed/adjusted to match real exports.
- `Qty` header alias added so quantity maps correctly (not defaulting to 1).
- Code/Tag label shown throughout UI instead of SKU wording.

## 4) Bid comparison UX optimized for decision-making
- Dealer columns grouped visually.
- Delta shown as percent vs avg (`% Avg Delta`).
- Added per-line best-price highlighting.
- Added total bid amount row, sticky visibility, responder summary filters/sort.
- Dealer column order follows responder summary sort.
- Added table sorting via column headers.

## 5) Dealer submission lifecycle upgraded
- Submitted bids are locked.
- Admin can reopen submitted bids.
- Each submit captures immutable snapshot (`BidSubmissionVersion`).
- History modal can view versions and line-item snapshots.

## 6) Password handling changed for usability (explicit MVP tradeoff)
- Original secure model stored only bcrypt digest.
- Team requested easy operational UX (view/edit/reuse password for email).
- Added plaintext storage field for invite password for MVP convenience:
  - Admin can see/edit invite password inline.
  - Email action includes password automatically.
- This is intentionally less secure and should be revisited for production.

## 7) Vendor selection aligned with intended future integration
- Added Vendors tab using local seed-like data file.
- Invite creation now uses vendor dropdown instead of free-form typed entry.
- Designed as stand-in for future Designer Pages vendor directory sync.

## 8) Admin controls expanded
- Delete project
- Delete bid package
- Delete invite
- Copy invite link
- Email invite with prefilled subject/body/link/password

## 9) Dealer CSV workflow
- Dealer can download CSV template and re-import updates.
- Import matcher supports multiple keys:
  - `row_index` (0-based and 1-based)
  - `spec_item_id`
  - `code/tag`
  - fallback by row order
- Extended price added (`quantity * unit_price`) in dealer and comparison views.

---

## Current Tabs and Purpose
- `Vendors`: display source vendor contact list used for invite dropdown.
- `Projects`: create/delete projects.
- `Import Package`: select project, upload CSV, preview, create bid package.
- `Bid Package Dashboard`: load package, invite bidders, manage invites, history/reopen/delete.
- `Dealer Unlock`: token/password access screen.
- `Dealer Bid`: dealer line-item entry, CSV download/import, draft/save/submit.
- `Comparison`: side-by-side analysis, totals, filters, sort, export.

---

## Important Data and Model Notes
- `Project` -> has many `BidPackage`
- `BidPackage` -> has many `SpecItem`, `Invite`
- `Invite` -> has one `Bid`
- `Bid` -> has many `BidLineItem`, has many `BidSubmissionVersion`

Notable fields:
- `invites.password_digest` (bcrypt)
- `invites.password_plaintext` (MVP usability tradeoff)
- `bids.state` (`draft` / `submitted`)
- `bid_submission_versions` stores snapshot payload + total per submission

---

## API/Behavior Highlights
- Admin dashboard endpoints provide invite row status and links.
- Invite password updates are persisted and reflected inline.
- Reopen endpoint transitions submitted bid back to draft.
- History endpoint returns version metadata + snapshot line items.

---

## Notable UX/Formatting Improvements
- Money formatting standardized to include commas and 2 decimals.
- `Code/Tag` terminology used across key tables.
- Comparison totals and deltas visible for faster evaluation.
- Cleaner import form and dashboard module order.

---

## Known MVP Tradeoffs / Risks
1. `password_plaintext` is convenient but insecure for production.
2. CSV mapping remains profile/alias-driven; unusual exports may require new aliases.
3. Invite email flow relies on local default mail client (`mailto:`).
4. No full auth/audit model yet; intended for rapid prototype validation.

---

## Local Run Notes
From project root:

```bash
cd "/Users/jacobslevin/Documents/Documents - Jacob’s Mac Studio/Jake 2.0/Codex/Bid Collection"
bin/rails db:migrate
bin/rails s
```

Frontend:

```bash
cd "/Users/jacobslevin/Documents/Documents - Jacob’s Mac Studio/Jake 2.0/Codex/Bid Collection/frontend"
npm run dev
```

If Vite says 5173 is in use, it may run on 5174.

---

## Suggested Next Production Hardening Steps
1. Remove plaintext password storage; replace with secure reset/regenerate flow.
2. Add designer authentication + authorization.
3. Add structured activity/audit logs.
4. Add robust import profiles + schema validation UI.
5. Add background jobs for email sending and large CSV processing.

