import { ShopifyCompletion } from "./completion-client";

export default async function ShopifyCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <ShopifyCompletion error={error} />;
}
