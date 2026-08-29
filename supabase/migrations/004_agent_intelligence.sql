begin;

create extension if not exists vector with schema extensions;

create table public.shopping_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id text not null,
  session_id text not null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint shopping_events_type_check check (
    event_type in (
      'PRODUCT_VIEW', 'SEARCH', 'PRODUCT_CLICK', 'ADD_CART',
      'REMOVE_CART', 'PURCHASE', 'PRODUCT_DISLIKE'
    )
  ),
  constraint shopping_events_customer_length check (char_length(customer_id) between 1 and 200),
  constraint shopping_events_session_length check (char_length(session_id) between 1 and 120),
  constraint shopping_events_metadata_size check (octet_length(metadata::text) <= 16384)
);
create index shopping_events_customer_created_idx
  on public.shopping_events (store_id, customer_id, created_at desc);
create index shopping_events_session_created_idx
  on public.shopping_events (store_id, session_id, created_at desc);

create table public.merchant_knowledge (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  type text not null,
  content text not null,
  embedding extensions.vector(1536),
  embedding_model text,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_knowledge_type_check check (
    type in ('SHIPPING', 'RETURNS', 'PAYMENT', 'FAQ', 'BRAND_VOICE', 'POLICIES')
  ),
  constraint merchant_knowledge_content_length check (char_length(content) between 1 and 20000),
  unique (store_id, type, content_hash)
);
create index merchant_knowledge_store_type_idx
  on public.merchant_knowledge (store_id, type);

create table public.product_embeddings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  embedding extensions.vector(1536) not null,
  embedding_model text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_embeddings_store_idx on public.product_embeddings (store_id);

alter table public.shopping_events enable row level security;
alter table public.merchant_knowledge enable row level security;
alter table public.product_embeddings enable row level security;

revoke all on public.shopping_events, public.merchant_knowledge,
  public.product_embeddings from anon, authenticated;

create or replace function public.match_product_embeddings(
  p_store_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 8,
  p_similarity_threshold double precision default 0.25
) returns table (
  product_id uuid,
  shopify_product_id text,
  name text,
  category text,
  description text,
  colors text[],
  sizes text[],
  price_min numeric,
  price_max numeric,
  currency_code text,
  availability text,
  images jsonb,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    p.id,
    p.shopify_product_id,
    p.name,
    p.category,
    left(p.description, 1200),
    p.colors,
    p.sizes,
    p.price_min,
    p.price_max,
    p.currency_code,
    p.availability,
    p.images,
    1 - (pe.embedding <=> p_query_embedding) as similarity
  from public.product_embeddings pe
  join public.products p on p.id = pe.product_id
  where pe.store_id = p_store_id
    and p.store_id = p_store_id
    and 1 - (pe.embedding <=> p_query_embedding) >= p_similarity_threshold
  order by pe.embedding <=> p_query_embedding
  limit least(greatest(p_match_count, 1), 20);
$$;

create or replace function public.match_merchant_knowledge(
  p_store_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 5,
  p_similarity_threshold double precision default 0.2
) returns table (
  id uuid,
  type text,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    mk.id,
    mk.type,
    mk.content,
    mk.metadata,
    1 - (mk.embedding <=> p_query_embedding) as similarity
  from public.merchant_knowledge mk
  where mk.store_id = p_store_id
    and mk.embedding is not null
    and 1 - (mk.embedding <=> p_query_embedding) >= p_similarity_threshold
  order by mk.embedding <=> p_query_embedding
  limit least(greatest(p_match_count, 1), 10);
$$;

revoke all on function public.match_product_embeddings(uuid, extensions.vector, integer, double precision) from public, anon, authenticated;
revoke all on function public.match_merchant_knowledge(uuid, extensions.vector, integer, double precision) from public, anon, authenticated;
grant execute on function public.match_product_embeddings(uuid, extensions.vector, integer, double precision) to service_role;
grant execute on function public.match_merchant_knowledge(uuid, extensions.vector, integer, double precision) to service_role;

commit;
