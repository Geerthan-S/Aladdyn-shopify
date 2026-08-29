import "server-only";

import type { ConnectionRecord } from "@/lib/shopify/connection";
import { shopifyGraphQL } from "@/lib/shopify/admin-graphql";
import { hasAllScopes } from "@/lib/shopify/scopes";

const ORDERS_QUERY = (
  includeCustomer: boolean,
) => `query SyncOrders($first:Int!,$after:String){
  orders(first:$first,after:$after,sortKey:CREATED_AT,reverse:true){
    nodes {
      id createdAt currencyCode currentTotalPriceSet { shopMoney { amount currencyCode } }
      ${includeCustomer ? "customer { id }" : ""}
      lineItems(first:50){ nodes { title quantity variant { id product { id } } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

export async function fetchOrderPage(
  connection: ConnectionRecord,
  after: string | null,
  includeCustomer = false,
) {
  if (!hasAllScopes(connection.granted_scopes, ["read_orders"])) return null;
  const result = await shopifyGraphQL<{
    orders: {
      nodes: Array<{
        id: string;
        createdAt: string;
        currencyCode: string;
        currentTotalPriceSet: {
          shopMoney: { amount: string; currencyCode: string };
        };
        customer?: { id: string } | null;
        lineItems: {
          nodes: Array<{
            title: string;
            quantity: number;
            variant: { id: string; product: { id: string } } | null;
          }>;
        };
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(connection, ORDERS_QUERY(includeCustomer), { first: 50, after });
  return result.data.orders;
}
