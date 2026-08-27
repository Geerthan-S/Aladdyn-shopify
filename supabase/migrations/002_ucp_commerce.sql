begin;

create table public.chat_commerce_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null,
  provider text not null default 'shopify',
  store_domain text not null,
  ucp_version text not null default '2026-04-08',
  mcp_endpoint text not null,
  cart_id text,
  cart_state_json jsonb not null default '{"lineItems":[],"context":{},"attribution":{}}'::jsonb,
  provider_cart_json jsonb,
  cart_version integer not null default 0 check (cart_version >= 0),
  checkout_id text,
  checkout_status text,
  continue_url text,
  channel text not null default 'web_chat',
  campaign text,
  last_products_json jsonb not null default '[]'::jsonb,
  last_variant_id text,
  last_operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_commerce_sessions_unique_conversation unique (user_id, conversation_id),
  constraint chat_commerce_sessions_provider_check check (provider = 'shopify'),
  constraint chat_commerce_sessions_ucp_version_check check (ucp_version = '2026-04-08'),
  constraint chat_commerce_sessions_domain_format
    check (store_domain = lower(store_domain) and store_domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$'),
  constraint chat_commerce_sessions_conversation_format
    check (conversation_id ~ '^[a-zA-Z0-9_-]{1,120}$'),
  constraint chat_commerce_sessions_endpoint_https
    check (mcp_endpoint ~ '^https://[a-z0-9.-]+/api/ucp/mcp$'),
  constraint chat_commerce_sessions_continue_https
    check (continue_url is null or continue_url ~ '^https://')
);

create table public.commerce_operations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_commerce_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null,
  provider text not null default 'shopify',
  operation_type text not null,
  idempotency_key text not null,
  request_hash text not null,
  provider_request_id text,
  status text not null default 'processing',
  response_snapshot jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_operations_unique_key unique (user_id, idempotency_key),
  constraint commerce_operations_provider_check check (provider = 'shopify'),
  constraint commerce_operations_status_check
    check (status in ('processing', 'completed', 'failed')),
  constraint commerce_operations_idempotency_hash
    check (idempotency_key ~ '^[a-f0-9]{64}$' and request_hash ~ '^[a-f0-9]{64}$')
);

alter table public.chat_commerce_sessions
  add constraint chat_commerce_sessions_last_operation_fk
  foreign key (last_operation_id) references public.commerce_operations(id) on delete set null;

create index commerce_operations_session_created_idx
  on public.commerce_operations (session_id, created_at desc);

alter table public.chat_commerce_sessions enable row level security;
alter table public.commerce_operations enable row level security;

-- Browser roles have no policies. Authenticated users access only minimal DTOs
-- through /api/chat, where every query is scoped by both user and conversation.
revoke all on public.chat_commerce_sessions from anon, authenticated;
revoke all on public.commerce_operations from anon, authenticated;

create or replace function public.begin_commerce_operation(
  p_user_id uuid,
  p_conversation_id text,
  p_store_domain text,
  p_ucp_version text,
  p_mcp_endpoint text,
  p_operation_type text,
  p_idempotency_key text,
  p_request_hash text,
  p_expected_cart_version integer,
  p_desired_cart_state jsonb,
  p_mutates_cart boolean default true,
  p_channel text default 'web_chat',
  p_campaign text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.chat_commerce_sessions;
  existing_operation public.commerce_operations;
  operation_uuid uuid;
  last_status text;
begin
  select * into existing_operation
  from public.commerce_operations
  where user_id = p_user_id and idempotency_key = p_idempotency_key;

  if existing_operation.id is not null then
    if existing_operation.request_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSE' using errcode = 'P0001';
    end if;
    select * into session_row from public.chat_commerce_sessions where id = existing_operation.session_id;
    return jsonb_build_object(
      'replayed', true,
      'operationId', existing_operation.id,
      'operationStatus', existing_operation.status,
      'response', existing_operation.response_snapshot,
      'session', to_jsonb(session_row)
    );
  end if;

  select * into session_row
  from public.chat_commerce_sessions
  where user_id = p_user_id and conversation_id = p_conversation_id
  for update;

  if session_row.id is null then
    if p_expected_cart_version <> 0 then
      raise exception 'CART_VERSION_CONFLICT' using errcode = 'P0001';
    end if;
    insert into public.chat_commerce_sessions (
      user_id, conversation_id, store_domain, ucp_version, mcp_endpoint,
      cart_state_json, channel, campaign
    ) values (
      p_user_id, p_conversation_id, p_store_domain, p_ucp_version,
      p_mcp_endpoint, p_desired_cart_state, p_channel, p_campaign
    ) returning * into session_row;
  else
    if session_row.store_domain <> p_store_domain then
      raise exception 'COMMERCE_STORE_CONFLICT' using errcode = 'P0001';
    end if;
    if session_row.cart_version <> p_expected_cart_version then
      raise exception 'CART_VERSION_CONFLICT' using errcode = 'P0001';
    end if;
    if session_row.last_operation_id is not null then
      select status into last_status from public.commerce_operations where id = session_row.last_operation_id;
      if last_status = 'processing' then
        raise exception 'CART_BUSY' using errcode = 'P0001';
      end if;
    end if;
  end if;

  insert into public.commerce_operations (
    session_id, user_id, conversation_id, operation_type,
    idempotency_key, request_hash, status
  ) values (
    session_row.id, p_user_id, p_conversation_id, p_operation_type,
    p_idempotency_key, p_request_hash, 'processing'
  ) returning id into operation_uuid;

  update public.chat_commerce_sessions set
    cart_state_json = case when p_mutates_cart then p_desired_cart_state else cart_state_json end,
    cart_version = cart_version + case when p_mutates_cart then 1 else 0 end,
    ucp_version = p_ucp_version,
    mcp_endpoint = p_mcp_endpoint,
    channel = p_channel,
    campaign = p_campaign,
    last_operation_id = operation_uuid,
    updated_at = now()
  where id = session_row.id
  returning * into session_row;

  return jsonb_build_object(
    'replayed', false,
    'operationId', operation_uuid,
    'operationStatus', 'processing',
    'response', null,
    'session', to_jsonb(session_row)
  );
end;
$$;

create or replace function public.finish_commerce_operation(
  p_user_id uuid,
  p_operation_id uuid,
  p_status text,
  p_response_snapshot jsonb default null,
  p_error_code text default null,
  p_cart_id text default null,
  p_provider_cart_json jsonb default null,
  p_checkout_id text default null,
  p_checkout_status text default null,
  p_continue_url text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  operation_row public.commerce_operations;
begin
  if p_status not in ('completed', 'failed') then
    raise exception 'INVALID_OPERATION_STATUS' using errcode = 'P0001';
  end if;

  select * into operation_row
  from public.commerce_operations
  where id = p_operation_id and user_id = p_user_id
  for update;

  if operation_row.id is null then
    raise exception 'OPERATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.commerce_operations set
    status = p_status,
    response_snapshot = p_response_snapshot,
    error_code = p_error_code,
    updated_at = now()
  where id = p_operation_id;

  if p_status = 'completed' then
    update public.chat_commerce_sessions set
      cart_id = coalesce(p_cart_id, cart_id),
      provider_cart_json = coalesce(p_provider_cart_json, provider_cart_json),
      checkout_id = coalesce(p_checkout_id, checkout_id),
      checkout_status = coalesce(p_checkout_status, checkout_status),
      continue_url = coalesce(p_continue_url, continue_url),
      updated_at = now()
    where id = operation_row.session_id
      and user_id = p_user_id
      and last_operation_id = p_operation_id;
  end if;
end;
$$;

revoke all on function public.begin_commerce_operation(uuid, text, text, text, text, text, text, text, integer, jsonb, boolean, text, text) from public, anon, authenticated;
revoke all on function public.finish_commerce_operation(uuid, uuid, text, jsonb, text, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.begin_commerce_operation(uuid, text, text, text, text, text, text, text, integer, jsonb, boolean, text, text) to service_role;
grant execute on function public.finish_commerce_operation(uuid, uuid, text, jsonb, text, text, jsonb, text, text, text) to service_role;

commit;
