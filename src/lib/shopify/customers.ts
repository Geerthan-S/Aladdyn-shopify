import "server-only";

import type { ConnectionRecord } from "@/lib/shopify/connection";
import { shopifyGraphQL } from "@/lib/shopify/admin-graphql";
import { hasAllScopes } from "@/lib/shopify/scopes";

const CUSTOMERS_QUERY = `query SyncCustomers($first:Int!,$after:String){
  customers(first:$first,after:$after,sortKey:UPDATED_AT){
    nodes { id displayName tags updatedAt numberOfOrders amountSpent { amount currencyCode } }
    pageInfo { hasNextPage endCursor }
  }
}`;

export function canSyncCustomers(connection: ConnectionRecord) {
  return hasAllScopes(connection.granted_scopes, ["read_customers"]);
}

export async function fetchCustomerPage(
  connection: ConnectionRecord,
  after: string | null,
) {
  if (!canSyncCustomers(connection)) return null;
  const result = await shopifyGraphQL<{
    customers: {
      nodes: Array<{
        id: string;
        displayName: string;
        tags: string[];
        updatedAt: string;
        numberOfOrders: string;
        amountSpent: { amount: string; currencyCode: string };
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(connection, CUSTOMERS_QUERY, { first: 50, after });
  return result.data.customers;
}
