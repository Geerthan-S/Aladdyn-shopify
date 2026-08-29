export function buildCommerceSystemPrompt(input: {
  rules: string[];
  context: string;
}) {
  return `${input.rules
    .map((rule) => rule.trim())
    .filter(Boolean)
    .join("\n\n")}\n\n# Controlled Store Context\n${input.context}`;
}
