-- The customer's picture on Dreamship's imported order (docs/dreamship.md › Part B; CLAUDE.md allowed write 7).
-- One job per paid Shopify order with personalised Dreamship lines. The job only uploads artwork and sets it on lines;
-- it never submits, cancels or changes an order's status. Additive.
create table public.printer_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dreamship_artwork')),
  shopify_order_id text not null,
  shopify_order_name text,
  -- Per personalised line: Shopify line id, variant, print area, the picture's source and crop, and its result.
  lines jsonb not null,
  status text not null default 'waiting' check (status in ('waiting','picture_set','needs_attention','failed')),
  reason text,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  dreamship_order_id bigint,
  dreamship_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, shopify_order_id)
);
create index printer_jobs_due_idx on public.printer_jobs (status, next_attempt_at);
create index printer_jobs_recent_idx on public.printer_jobs (created_at desc);
create trigger printer_jobs_updated_at before update on public.printer_jobs for each row execute function public.set_updated_at();
alter table public.printer_jobs enable row level security;
revoke all on public.printer_jobs from anon, authenticated;
