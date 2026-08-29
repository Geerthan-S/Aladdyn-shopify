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
