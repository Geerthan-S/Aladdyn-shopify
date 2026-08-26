export function parseScopes(
  value: string | string[] | null | undefined,
): string[] {
  const scopes = Array.isArray(value) ? value : (value ?? "").split(",");
  return [
    ...new Set(scopes.map((scope) => scope.trim()).filter(Boolean)),
  ].sort();
}

export function compareScopes(configured: string[], granted: string[]) {
  const expected = parseScopes(configured);
  const actual = parseScopes(granted);
  return {
    configured: expected,
    granted: actual,
    missing: expected.filter((scope) => !actual.includes(scope)),
    extra: actual.filter((scope) => !expected.includes(scope)),
    needsReauthorization: expected.some((scope) => !actual.includes(scope)),
  };
}

export function hasAllScopes(granted: string[], required: readonly string[]) {
  const available = new Set(parseScopes(granted));
  return required.every((scope) => available.has(scope));
}
