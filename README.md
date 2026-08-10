# Restaurant Management System — Ethiopia

Mobile-first POS + inventory for small restaurants & cafés in Ethiopia.

**Stack:** Next.js 15 (App Router) + TypeScript + Tailwind + Supabase

## What is included (Phase 1)

- **Fast Sales Entry** — searchable menu, big touch targets, <10s goal
- **Automatic stock deduction** via recipes (hard-reject on insufficient stock)
- **Offline-ready** — sales are queued with `client_generated_id` and synced via a transactional Postgres RPC
- **Inventory view** with live stock levels
- **Simple Dashboard** — today’s sales, payment mix, low-stock alerts
- Currency formatted as **ETB 1,250.00**
- Payment types: Cash, Telebirr, CBE Birr, Other
- Ethiopian date display field (display-only)

## Quick Start

### 1. Create a Supabase project
1. Go to [database.new](https://database.new) and create a project.
2. In the SQL Editor, run the entire contents of `supabase/migrations/001_initial_schema.sql`.
3. (Optional) Run the seed data at the bottom of the same file.

### 2. Clone & configure
```bash
git clone https://github.com/Habte338/restaurant-management-ethiopia.git
cd restaurant-management-ethiopia
cp .env.example .env.local
```

Fill in your Supabase values:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Install & run
```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Core RPC

All sales go through the Postgres function `create_sale_with_stock_deduction`.
It guarantees:
- Idempotency (`client_generated_id`)
- Atomic stock check + deduction
- Hard reject if any ingredient would go negative
- Correct handling of concurrent offline syncs

## Project Structure

```
app/
  sales/          ← main cashier screen (mobile-first)
  inventory/      ← live stock levels
  dashboard/      ← today’s KPIs
lib/
  supabase/       ← browser + server clients
  offline-queue.ts
supabase/
  migrations/     ← schema + RPC
```

## Roadmap (from original spec)

- Phase 2: Recipes admin, Purchases, Customer Ledger (wollo)
- Phase 3: Daily Closing + PDF, Reports, full Admin
- Phase 4: Thermal receipts, multi-branch, expenses

Built for Ethiopian small restaurants — offline-first, ETB, Telebirr/CBE Birr, credit culture ready.
