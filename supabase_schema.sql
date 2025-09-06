
create schema if not exists fbmb;

create table if not exists fbmb.raw_ads (
  id bigserial primary key,
  uploaded_at timestamptz default now(),
  source_file text,
  payload jsonb not null
);

create table if not exists fbmb.raw_orders (
  id bigserial primary key,
  uploaded_at timestamptz default now(),
  source_file text,
  payload jsonb not null
);

create table if not exists fbmb.ads_norm (
  date date not null,
  campaign_name text,
  adset_name text,
  ad_name text,
  delivery_level text,                -- NEW: 'Campaign' | 'Ad set' | 'Ad' | etc.
  is_prospecting boolean,
  spend_bdt numeric,                  -- RULE: value only on delivery_level='Campaign'; else 0
  impressions bigint,
  ctr_all numeric,
  frequency numeric,
  conversations numeric,              -- RULE: value only on delivery_level='Campaign'; else 0
  inserted_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint pk_ads_norm primary key (date, campaign_name, adset_name, ad_name, delivery_level)
);

create table if not exists fbmb.orders_norm (
  order_id text primary key,
  order_date date not null,
  order_status text,
  paid_amount_bdt numeric default 0,
  due_amount_bdt numeric default 0,
  order_amount_bdt numeric generated always as (coalesce(paid_amount_bdt,0)+coalesce(due_amount_bdt,0)) stored,
  conversation_id text,
  successful_order_flag boolean generated always as (case when lower(coalesce(order_status,'')) like '%cancelled%' then false else true end) stored,
  classification text generated always as (case when (coalesce(paid_amount_bdt,0)+coalesce(due_amount_bdt,0)) < 2000 then 'MCO' else 'PCMO' end) stored,
  inserted_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists fbmb.daily_kpis (
  date date not null,
  scope text not null,
  scope_keys jsonb,
  revenue_bdt numeric,
  orders integer,
  ad_spend_bdt numeric,
  blended_cpa numeric,
  roas numeric,
  conv_to_order_pct numeric,
  aov numeric,
  mco_orders integer,
  pcmo_orders integer,
  mco_revenue numeric,
  pcmo_revenue numeric,
  inserted_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint pk_daily_kpis primary key (date, scope, scope_keys)
);

create table if not exists fbmb.alerts (
  date date not null,
  entity_level text not null,
  entity_id text,
  rule_id text not null,
  severity text not null,
  finding text not null,
  evidence jsonb,
  recommendation jsonb,
  confidence text default 'normal',
  inserted_at timestamptz default now(),
  constraint pk_alerts primary key (date, entity_level, entity_id, rule_id)
);

create table if not exists fbmb.north_star (
  date date primary key,
  revenue_hit boolean,
  orders_hit boolean,
  spend_hit boolean,
  roas_hit boolean,
  cpa_green boolean,
  points integer,
  color text,
  inserted_at timestamptz default now()
);

create or replace function fbmb.upsert_ads_norm(rows jsonb)
returns void language plpgsql as $$
declare r jsonb;
begin
  for r in select * from jsonb_array_elements(rows)
  loop
    insert into fbmb.ads_norm
      (date, campaign_name, adset_name, ad_name, delivery_level, is_prospecting, spend_bdt, impressions, ctr_all, frequency, conversations)
    values
      ((r->>'date')::date, r->>'campaign_name', r->>'adset_name', r->>'ad_name', r->>'delivery_level',
       (r->>'is_prospecting')::boolean, (r->>'spend_bdt')::numeric, (r->>'impressions')::bigint, (r->>'ctr_all')::numeric,
       (r->>'frequency')::numeric, (r->>'conversations')::numeric)
    on conflict (date, campaign_name, adset_name, ad_name, delivery_level) do update set
      is_prospecting=excluded.is_prospecting,
      spend_bdt=excluded.spend_bdt,
      impressions=excluded.impressions,
      ctr_all=excluded.ctr_all,
      frequency=excluded.frequency,
      conversations=excluded.conversations,
      updated_at=now();
  end loop;
end $$;

create or replace function fbmb.upsert_orders_norm(rows jsonb)
returns void language plpgsql as $$
declare r jsonb;
begin
  for r in select * from jsonb_array_elements(rows)
  loop
    insert into fbmb.orders_norm
      (order_id, order_date, order_status, paid_amount_bdt, due_amount_bdt, conversation_id)
    values
      (r->>'order_id', (r->>'order_date')::date, r->>'order_status', (r->>'paid_amount_bdt')::numeric, (r->>'due_amount_bdt')::numeric, r->>'conversation_id')
    on conflict (order_id) do update set
      order_date=excluded.order_date,
      order_status=excluded.order_status,
      paid_amount_bdt=excluded.paid_amount_bdt,
      due_amount_bdt=excluded.due_amount_bdt,
      conversation_id=excluded.conversation_id,
      updated_at=now();
  end loop;
end $$;

create or replace function fbmb.compute_daily_kpis(run_date date)
returns void language sql as $$
  with o as (
    select
      order_date as date,
      sum(case when successful_order_flag then order_amount_bdt else 0 end) as revenue_bdt,
      sum(case when successful_order_flag then 1 else 0 end) as orders,
      sum(case when classification='MCO' and successful_order_flag then 1 else 0 end) as mco_orders,
      sum(case when classification='PCMO' and successful_order_flag then 1 else 0 end) as pcmo_orders,
      sum(case when classification='MCO' and successful_order_flag then order_amount_bdt else 0 end) as mco_revenue,
      sum(case when classification='PCMO' and successful_order_flag then order_amount_bdt else 0 end) as pcmo_revenue
    from fbmb.orders_norm
    where order_date = run_date
    group by order_date
  ),
  a as (
    select
      date,
      sum(spend_bdt) as ad_spend_bdt,
      sum(conversations) as conversations
    from fbmb.ads_norm
    where date = run_date and lower(coalesce(delivery_level,'')) = 'campaign'
    group by date
  ),
  merged as (
    select
      coalesce(o.date, a.date) as date,
      coalesce(o.revenue_bdt,0) as revenue_bdt,
      coalesce(o.orders,0) as orders,
      coalesce(a.ad_spend_bdt,0) as ad_spend_bdt,
      nullif(a.conversations,0) as conversations,
      coalesce(o.mco_orders,0) as mco_orders,
      coalesce(o.pcmo_orders,0) as pcmo_orders,
      coalesce(o.mco_revenue,0) as mco_revenue,
      coalesce(o.pcmo_revenue,0) as pcmo_revenue
    from o full outer join a on o.date=a.date
  )
  insert into fbmb.daily_kpis (date, scope, scope_keys, revenue_bdt, orders, ad_spend_bdt, blended_cpa, roas, conv_to_order_pct, aov, mco_orders, pcmo_orders, mco_revenue, pcmo_revenue, inserted_at, updated_at)
  select
    date, 'account', '{}'::jsonb,
    revenue_bdt, orders, ad_spend_bdt,
    case when orders>0 then ad_spend_bdt/orders else null end as blended_cpa,
    case when ad_spend_bdt>0 then revenue_bdt/ad_spend_bdt else null end as roas,
    case when coalesce(conversations,0)>0 then (orders::numeric/conversations)*100 else null end as conv_to_order_pct,
    case when orders>0 then revenue_bdt/orders else null end as aov,
    mco_orders, pcmo_orders, mco_revenue, pcmo_revenue, now(), now()
  from merged
  on conflict (date, scope, scope_keys) do update set
    revenue_bdt=excluded.revenue_bdt,
    orders=excluded.orders,
    ad_spend_bdt=excluded.ad_spend_bdt,
    blended_cpa=excluded.blended_cpa,
    roas=excluded.roas,
    conv_to_order_pct=excluded.conv_to_order_pct,
    aov=excluded.aov,
    mco_orders=excluded.mco_orders,
    pcmo_orders=excluded.pcmo_orders,
    mco_revenue=excluded.mco_revenue,
    pcmo_revenue=excluded.pcmo_revenue,
    updated_at=now();
$$;
