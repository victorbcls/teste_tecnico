import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import {
  ListarChamadosInputSchema,
  ConsultarChamadoInputSchema,
} from "../../tools/schemas";
import { listarChamados, consultarChamado } from "../../tools/mockChamados";
import {
  InvalidInputError,
  UnknownToolError,
  ToolNotAllowedError,
} from "../../tools/errors";
import { executeWithRetry } from "../../tools/executeWithRetry";
import { AssistantConfig } from "../assistants";
import { GraphStateType } from "../state";

const TOOL_HANDLERS: Record<string, (args: unknown) => Promise<unknown>> = {
  listar_chamados: async (rawArgs: unknown) => {
    const parsed = ListarChamadosInputSchema.safeParse(rawArgs);
    if (!parsed.success) throw new InvalidInputError(parsed.error.message);
    return listarChamados(parsed.data);
  },
  consultar_chamado: async (rawArgs: unknown) => {
    const parsed = ConsultarChamadoInputSchema.safeParse(rawArgs);
    if (!parsed.success) throw new InvalidInputError(parsed.error.message);
    return consultarChamado(parsed.data);
  },
};

const KNOWN_TOOL_NAMES = Object.keys(TOOL_HANDLERS);

async function runTool(name: string, rawArgs: unknown): Promise<unknown> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    throw new UnknownToolError(name);
  }
  return handler(rawArgs);
}

export async function toolsNode(
  state: GraphStateType,
  config: { configurable?: { assistant?: AssistantConfig } }
): Promise<{ messages: BaseMessage[] }> {
  const assistant = config.configurable?.assistant;
  if (!assistant) {
    throw new Error("toolsNode requer config.configurable.assistant");
  }
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage.tool_calls ?? [];
  const results: ToolMessage[] = [];

  for (const call of toolCalls) {
    const toolCallId = call.id ?? call.name;
    try {
      if (!KNOWN_TOOL_NAMES.includes(call.name)) {
        throw new UnknownToolError(call.name);
      }
      if (!assistant.allowedTools.includes(call.name)) {
        throw new ToolNotAllowedError(call.name, assistant.id);
      }
      const output = await executeWithRetry(() =>
        runTool(call.name, call.args)
      );
      results.push(
        new ToolMessage({
          tool_call_id: toolCallId,
          content: JSON.stringify(output),
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "erro desconhecido";
      results.push(
        new ToolMessage({
          tool_call_id: toolCallId,
          content: JSON.stringify({ error: message }),
        })
      );
    }
  }

  return { messages: results };
}
