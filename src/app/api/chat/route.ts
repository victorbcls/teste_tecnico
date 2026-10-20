import { NextResponse } from "next/server";
import { Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { buildGraph } from "../../../lib/graph/graph";
import { ASSISTANTS, AssistantId } from "../../../lib/graph/assistants";
import { TOOL_DEFINITIONS } from "../../../lib/graph/toolDefinitions";
import { createOllamaChatModel } from "../../../lib/llm";
import { createLimiter } from "../../../lib/tools/concurrencyLimiter";

const MAX_ACTIVE = Number(process.env.MAX_ACTIVE_EXECUTIONS ?? 5);
const limiter = createLimiter(MAX_ACTIVE);
const graph = buildGraph();

interface ChatRequestBody {
  threadId: string;
  assistantId: AssistantId;
  message?: string;
  resume?: { approved: boolean };
}

export async function POST(req: Request) {
  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.threadId || !body.assistantId) {
    return NextResponse.json(
      { error: "threadId e assistantId são obrigatórios" },
      { status: 400 }
    );
  }
  const assistant = ASSISTANTS[body.assistantId];
  if (!assistant) {
    return NextResponse.json(
      { error: `assistantId desconhecido: ${body.assistantId}` },
      { status: 400 }
    );
  }
  if (!body.message && !body.resume) {
    return NextResponse.json(
      { error: "informe message ou resume" },
      { status: 400 }
    );
  }

  const config = {
    configurable: {
      thread_id: body.threadId,
      assistant,
      model: createOllamaChatModel(),
      tools: TOOL_DEFINITIONS,
    },
  };

  let release: (() => void) | null = null;
  try {
    release = await limiter.acquire();

    if (body.resume) {
      await graph.invoke(new Command({ resume: body.resume }), config);
    } else {
      await graph.invoke(
        { messages: [new HumanMessage(body.message as string)] },
        config
      );
    }
    release();
    release = null;

    const state = await graph.getState(config);
    const pendingInterrupt = state.tasks[0]?.interrupts?.[0]?.value ?? null;
    const messages = state.values.messages as Array<{ content: unknown }>;
    const lastMessage = messages[messages.length - 1];

    return NextResponse.json({
      proposal: pendingInterrupt,
      message: pendingInterrupt ? null : lastMessage?.content ?? null,
    });
  } catch (err) {
    if (release) release();
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
