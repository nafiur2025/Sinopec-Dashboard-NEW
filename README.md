
# FB Media Buyer Copilot — Starter

**Stack**: Next.js + Netlify + Supabase Postgres. Timezone: Asia/Dhaka (UTC+6).

## Quick Start
1. Create a new Supabase project. Run `supabase_schema.sql` in the SQL editor.
2. Add env vars (Netlify & local `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `TZ=Asia/Dhaka`
   - `FX_SGD_TO_BDT=95`
3. Deploy to Netlify. The scheduled function `daily-recompute` runs at **01:00 UTC** (07:00 BST).
4. Go to `/upload`, select the Meta **Daily Report** and the **Sales CSV**, click **Upload & Ingest**.
5. Visit `/dashboard` and `/alerts`.

## Data Contract (Flexible Headers)
- Ads report: `'Campaign name'`, `'Ad Set Name'`, `'Ad name'`, `'Impressions'`, `'Frequency'`, `'CTR (all)'`, `'Messaging conversations started'`, `'Amount spent (SGD)'`, `'Reporting ends'`
- Orders report: `'Creation Date'`, `'Invoice Number'`, `'Order Status'`, `'Paid Amount'`, `'Due Amount'`

Headers are mapped via synonyms in the ingestion handler. Currencies in SGD are converted using `FX_SGD_TO_BDT`.

## KPIs & Targets
- Revenue, Orders, Spend, Blended CPA, ROAS, Conv→Order %, AOV
- Targets: Revenue ≥ 35,000/day; Orders 30–35/day; Spend 9,500–12,500/day; ROAS ≥ 5; CPA green ≤ 300.

## Alerts
R1–R5 per spec. The SQL function `generate_alerts(run_date)` requires ≥7 days of history; otherwise it exits quietly.
