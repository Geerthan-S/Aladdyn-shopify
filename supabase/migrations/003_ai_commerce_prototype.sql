begin;

-- A merchant account may own multiple Shopify installations. The current UI
-- selects the most recently verified connection; the schema no longer assumes
-- one store per user.
alter table public.shopify_connections
  drop constraint if exists shopify_connections_unique_user;
create index if not exists shopify_connections_user_verified_idx
  on public.shopify_connections (user_id, verified_at desc nulls last);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null unique references public.shopify_connections(id) on delete cascade,
  shop_domain text not null unique,
  shopify_shop_id text,
  name text,
  currency_code text,
  timezone text,
  sync_status text not null default 'not_synced',
  sync_product_count integer not null default 0 check (sync_product_count >= 0),
  last_synced_at timestamptz,
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_sync_status_check
    check (sync_status in ('not_synced', 'syncing', 'ready', 'failed'))
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  shopify_product_id text not null,
  handle text,
  name text not null,
  category text,
  vendor text,
  description text not null default '',
  tags text[] not null default '{}',
  colors text[] not null default '{}',
  sizes text[] not null default '{}',
  price_min numeric(14,2),
  price_max numeric(14,2),
  currency_code text,
  availability text not null default 'unknown',
  images jsonb not null default '[]'::jsonb,
  variants jsonb not null default '[]'::jsonb,
  collections jsonb not null default '[]'::jsonb,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (store_id, shopify_product_id),
  constraint products_availability_check
    check (availability in ('available', 'unavailable', 'unknown'))
);
create index products_store_search_idx on public.products (store_id, availability, price_min);
create index products_tags_idx on public.products using gin (tags);

-- Protected customer rows are populated only when read_customers is granted
-- and Shopify protected customer data access has been approved.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  shopify_customer_id text not null,
  display_name text,
  tags text[] not null default '{}',
  protected_data_authorized boolean not null default false,
  commerce_summary jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (store_id, shopify_customer_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  shopify_order_id text not null,
  shopify_customer_id text,
  purchased_items jsonb not null default '[]'::jsonb,
  total_amount numeric(14,2),
  currency_code text,
  ordered_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (store_id, shopify_order_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  customer_key text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, session_id),
  constraint conversations_status_check check (status in ('active', 'closed'))
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  client_message_id text,
  role text not null,
  content text not null,
  tool_name text,
  generated_context jsonb,
  model text,
  created_at timestamptz not null default now(),
  unique (conversation_id, client_message_id),
  constraint messages_role_check check (role in ('user', 'assistant', 'tool'))
);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);

create table public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_key text not null,
  preferred_categories text[] not null default '{}',
  preferred_colors text[] not null default '{}',
  preferred_sizes text[] not null default '{}',
  budget_min numeric(14,2),
  budget_max numeric(14,2),
  profile_json jsonb not null default '{}'::jsonb,
  source text not null default 'conversation',
  updated_at timestamptz not null default now(),
  unique (store_id, customer_key)
);

create table public.cart_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.conversations(id) on delete cascade,
  commerce_session_id uuid references public.chat_commerce_sessions(id) on delete set null,
  provider_cart_id text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cart_sessions_status_check check (status in ('active', 'checkout_started', 'completed', 'abandoned'))
);

alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.cart_sessions enable row level security;

-- All prototype context is exposed only through authenticated server routes.
revoke all on public.stores, public.products, public.customers, public.orders,
  public.conversations, public.messages, public.customer_profiles,
  public.cart_sessions from anon, authenticated;

create or replace function public.persist_shopify_connection(
  p_user_id uuid,
  p_shop_domain text,
  p_shopify_shop_id text,
  p_shop_name text,
  p_status text,
  p_granted_scopes text[],
  p_token_ciphertext text,
  p_token_iv text,
  p_token_auth_tag text,
  p_key_version integer,
  p_access_token_expires_at timestamptz,
  p_refresh_token_expires_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.shopify_connections;
  connection_uuid uuid;
begin
  select * into existing
  from public.shopify_connections
  where shop_domain = p_shop_domain
  for update;

  if existing.id is not null
    and existing.user_id <> p_user_id
    and existing.status not in ('disconnected', 'uninstalled') then
    raise exception 'SHOP_OWNERSHIP_CONFLICT' using errcode = 'P0001';
  end if;

  if existing.id is not null then
    connection_uuid := existing.id;
    update public.shopify_connections set
      user_id = p_user_id,
      shopify_shop_id = p_shopify_shop_id,
      shop_name = p_shop_name,
      status = p_status,
      api_version = '2026-07',
      granted_scopes = p_granted_scopes,
      installed_at = now(),
      verified_at = now(),
      disconnected_at = null,
      last_error_code = null,
      last_error_message = null,
      updated_at = now()
    where id = connection_uuid;
  else
    insert into public.shopify_connections (
      user_id, shop_domain, shopify_shop_id, shop_name, status,
      api_version, granted_scopes, installed_at, verified_at
    ) values (
      p_user_id, p_shop_domain, p_shopify_shop_id, p_shop_name, p_status,
      '2026-07', p_granted_scopes, now(), now()
    ) returning id into connection_uuid;
  end if;

  insert into public.shopify_connection_secrets (
    connection_id, token_ciphertext, token_iv, token_auth_tag, key_version,
    access_token_expires_at, refresh_token_expires_at
  ) values (
    connection_uuid, p_token_ciphertext, p_token_iv, p_token_auth_tag, p_key_version,
    p_access_token_expires_at, p_refresh_token_expires_at
  ) on conflict (connection_id) do update set
    token_ciphertext = excluded.token_ciphertext,
    token_iv = excluded.token_iv,
    token_auth_tag = excluded.token_auth_tag,
    key_version = excluded.key_version,
    access_token_expires_at = excluded.access_token_expires_at,
    refresh_token_expires_at = excluded.refresh_token_expires_at,
    updated_at = now();

  return connection_uuid;
end;
$$;

revoke all on function public.persist_shopify_connection(uuid, text, text, text, text, text[], text, text, text, integer, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.persist_shopify_connection(uuid, text, text, text, text, text[], text, text, text, integer, timestamptz, timestamptz) to service_role;

commit;
