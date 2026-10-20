import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import {
  ListarChamadosInputSchema,
  ConsultarChamadoInputSchema,
} from "../../tools/schemas";
import { listarChamados, consultarChamado } from "../../tools/mockChamados";
import { CallRagInputSchema, callRag } from "../../tools/ragTool";
import {
  InvalidInputError,
  UnknownToolError,
  ToolNotAllowedError,
} from "../../tools/errors";
import { executeWithRetry } from "../../tools/executeWithRetry";
import { AssistantConfig } from "../assistants";
import { GraphStateType } from "../state";
import { EmbeddingsLike } from "../../rag/embeddings";

type ToolHandler = (
  args: unknown,
  embeddings?: EmbeddingsLike
) => Promise<unknown>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
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
  call_rag: async (rawArgs: unknown, embeddings?: EmbeddingsLike) => {
    const parsed = CallRagInputSchema.safeParse(rawArgs);
    if (!parsed.success) throw new InvalidInputError(parsed.error.message);
    if (!embeddings) {
      throw new Error(
        "toolsNode requer config.configurable.embeddings para executar call_rag"
      );
    }
    return callRag(parsed.data, embeddings);
  },
};

const KNOWN_TOOL_NAMES = Object.keys(TOOL_HANDLERS);

async function runTool(
  name: string,
  rawArgs: unknown,
  embeddings?: EmbeddingsLike
): Promise<unknown> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    throw new UnknownToolError(name);
  }
  return handler(rawArgs, embeddings);
}

export async function toolsNode(
  state: GraphStateType,
  config: {
    configurable?: {
      assistant?: AssistantConfig;
      embeddings?: EmbeddingsLike;
    };
  }
): Promise<{ messages: BaseMessage[] }> {
  const assistant = config.configurable?.assistant;
  if (!assistant) {
    throw new Error("toolsNode requer config.configurable.assistant");
  }
  const embeddings = config.configurable?.embeddings;
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
        runTool(call.name, call.args, embeddings)
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
