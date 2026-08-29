export type CommerceToolAction<
  TName extends string = string,
  TInput = unknown,
> = {
  tool: TName;
  input: TInput;
};

export function assertCommerceToolPermission(input: {
  actorId: string;
  ownerId: string;
  connectionStatus: string;
  tool: string;
  allowedTools: ReadonlySet<string>;
}) {
  if (
    input.actorId !== input.ownerId ||
    input.connectionStatus !== "connected" ||
    !input.allowedTools.has(input.tool)
  ) {
    throw new Error("Commerce action is not permitted");
  }
}

export async function executeCommerceTool<TAction, TResult>(input: {
  action: TAction;
  authorize: (action: TAction) => void | Promise<void>;
  execute: (action: TAction) => Promise<TResult>;
}) {
  await input.authorize(input.action);
  return input.execute(input.action);
}
