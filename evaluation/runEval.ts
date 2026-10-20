import { evaluate } from "langsmith/evaluation";
import { HumanMessage } from "@langchain/core/messages";
import { buildGraph } from "../src/lib/graph/graph";
import { ASSISTANTS } from "../src/lib/graph/assistants";
import { TOOL_DEFINITIONS } from "../src/lib/graph/toolDefinitions";
import { createOllamaChatModel } from "../src/lib/llm";
import {
  evaluateListarChamadosAbertos,
  evaluateNaoEscalonaResolvido,
  RunSummary,
} from "./evaluators";

const DATASET_NAME = "aurora-support-eval";

async function runSupportGraph(input: { question: string }): Promise<RunSummary> {
  const graph = buildGraph();
  const threadId = `eval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const config = {
    configurable: {
      thread_id: threadId,
      assistant: ASSISTANTS.suporte,
      model: createOllamaChatModel(),
      tools: TOOL_DEFINITIONS,
    },
  };

  const result = await graph.invoke(
    { messages: [new HumanMessage(input.question)] },
    config
  );

  const toolCalls: RunSummary["toolCalls"] = [];
  const toolResults: unknown[] = [];
  for (const message of result.messages as Array<{
    tool_calls?: Array<{ name: string; args: Record<string, unknown> }>;
    content?: unknown;
    tool_call_id?: string;
  }>) {
    if (message.tool_calls?.length) toolCalls.push(...message.tool_calls);
    if (message.tool_call_id) {
      try {
        toolResults.push(JSON.parse(message.content as string));
      } catch {
        toolResults.push(message.content);
      }
    }
  }

  const messages = result.messages as Array<{ content?: unknown }>;
  const finalMessage = messages[messages.length - 1];

  return {
    toolCalls,
    toolResults,
    finalAnswer: String(finalMessage?.content ?? ""),
  };
}

function pickEvaluator(question: string) {
  return question.includes("CH-102")
    ? evaluateNaoEscalonaResolvido
    : evaluateListarChamadosAbertos;
}

async function main() {
  await evaluate(async (input: { question: string }) => runSupportGraph(input), {
    data: DATASET_NAME,
    evaluators: [
      (run, example) => {
        const question = (example?.inputs as { question: string }).question;
        const evaluator = pickEvaluator(question);
        return evaluator(run.outputs as unknown as RunSummary);
      },
    ],
    experimentPrefix: "aurora-support",
    metadata: {
      model: process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct",
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
