export function isPrototypeSchemaMissing(error: unknown) {
  const details = error as { code?: string; message?: string } | null;
  const message = details?.message ?? "";
  return (
    details?.code === "42P01" ||
    details?.code === "PGRST205" ||
    /Could not find the table|relation .* does not exist|schema cache/i.test(
      message,
    )
  );
}
