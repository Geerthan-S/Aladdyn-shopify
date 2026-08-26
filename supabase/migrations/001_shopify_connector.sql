begin;

create extension if not exists pgcrypto;

create table public.shopify_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_domain text not null,
  shopify_shop_id text,
  shop_name text,
  status text not null default 'disconnected',
  api_version text not null default '2026-07',
  granted_scopes text[] not null default '{}',
  installed_at timestamptz,
  verified_at timestamptz,
  disconnected_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopify_connections_domain_format
    check (shop_domain = lower(shop_domain) and shop_domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$'),
  constraint shopify_connections_status_check
    check (status in ('connected', 'verification_failed', 'access_revoked', 'uninstalled', 'disconnected', 'needs_reauthorization')),
  constraint shopify_connections_api_version_check check (api_version = '2026-07'),
  constraint shopify_connections_unique_shop unique (shop_domain),
  constraint shopify_connections_unique_user unique (user_id)
);

create table public.shopify_connection_secrets (
  connection_id uuid primary key references public.shopify_connections(id) on delete cascade,
  token_ciphertext text not null,
  token_iv text not null,
  token_auth_tag text not null,
  key_version integer not null check (key_version > 0),
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shopify_oauth_states (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_domain text not null,
  redirect_path text not null default '/dashboard',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint shopify_oauth_states_domain_format
    check (shop_domain = lower(shop_domain) and shop_domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$'),
  constraint shopify_oauth_states_redirect_safe check (redirect_path ~ '^/[a-zA-Z0-9/_?&=-]*$')
);

create index shopify_oauth_states_expiry_idx on public.shopify_oauth_states (expires_at);

create table public.shopify_webhook_receipts (
  webhook_id text primary key,
  topic text not null,
  shop_domain text,
  processed_at timestamptz not null default now(),
  status text not null check (status in ('processing', 'processed', 'ignored', 'failed')),
  error_message text
);

create table public.connector_rate_limits (
  bucket_key text not null,
  window_started_at timestamptz not null,
  hit_count integer not null default 1,
  primary key (bucket_key, window_started_at)
);

alter table public.shopify_connections enable row level security;
alter table public.shopify_connection_secrets enable row level security;
alter table public.shopify_oauth_states enable row level security;
alter table public.shopify_webhook_receipts enable row level security;
alter table public.connector_rate_limits enable row level security;

create policy "Users read their own connection metadata"
  on public.shopify_connections for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No browser policies exist for secrets, OAuth state, webhook receipts, or rate limits.
-- They are intentionally service-role only.

create or replace function public.consume_shopify_oauth_state(
  p_state_hash text,
  p_shop_domain text
) returns table (user_id uuid, redirect_path text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.shopify_oauth_states
    set used_at = now()
  where state_hash = p_state_hash
    and shop_domain = p_shop_domain
    and used_at is null
    and expires_at > now()
  returning shopify_oauth_states.user_id, shopify_oauth_states.redirect_path;
end;
$$;

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

  if existing.id is not null and existing.user_id <> p_user_id then
    raise exception 'SHOP_OWNERSHIP_CONFLICT' using errcode = 'P0001';
  end if;

  select id into connection_uuid
  from public.shopify_connections
  where user_id = p_user_id
  for update;

  if connection_uuid is not null then
    update public.shopify_connections set
      shop_domain = p_shop_domain,
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

create or replace function public.check_connector_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  window_start timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  current_hits integer;
begin
  insert into public.connector_rate_limits (bucket_key, window_started_at, hit_count)
  values (p_bucket_key, window_start, 1)
  on conflict (bucket_key, window_started_at)
  do update set hit_count = connector_rate_limits.hit_count + 1
  returning hit_count into current_hits;

  return current_hits <= p_limit;
end;
$$;

revoke all on function public.consume_shopify_oauth_state(text, text) from public, anon, authenticated;
revoke all on function public.persist_shopify_connection(uuid, text, text, text, text, text[], text, text, text, integer, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.check_connector_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_shopify_oauth_state(text, text) to service_role;
grant execute on function public.persist_shopify_connection(uuid, text, text, text, text, text[], text, text, text, integer, timestamptz, timestamptz) to service_role;
grant execute on function public.check_connector_rate_limit(text, integer, integer) to service_role;

revoke all on public.shopify_connection_secrets from anon, authenticated;
revoke all on public.shopify_oauth_states from anon, authenticated;
revoke all on public.shopify_webhook_receipts from anon, authenticated;
revoke all on public.connector_rate_limits from anon, authenticated;

commit;
