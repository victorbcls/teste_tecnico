import { describe, it, expect } from "vitest";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { buildGraph } from "../src/lib/graph/graph";
import { ASSISTANTS, AssistantId } from "../src/lib/graph/assistants";
import { TOOL_DEFINITIONS } from "../src/lib/graph/toolDefinitions";
import { createFakeChatModel } from "./fakeChatModel";
import { fakeEmbeddings } from "./fakeEmbeddings";
import { resetRagCache } from "../src/lib/tools/ragTool";

function configFor(
  threadId: string,
  assistantId: AssistantId,
  script: AIMessage[]
) {
  return {
    configurable: {
      thread_id: threadId,
      assistant: ASSISTANTS[assistantId],
      model: createFakeChatModel(script),
      embeddings: fakeEmbeddings,
      tools: TOOL_DEFINITIONS,
    },
  };
}

describe("assistants separation (bonus, B4)", () => {
  it("viagens retrieves with source for a question covered by the base", async () => {
    resetRagCache();
    const graph = buildGraph();
    const config = configFor("t-viagens-source", "viagens", [
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "call_rag",
            args: { query: "Preciso de visto e seguro para a França?" },
            id: "c1",
          },
        ],
      }),
      new AIMessage({
        content:
          "Para a França, não é exigido visto de turismo até 90 dias. Fonte: franca.md.",
      }),
    ]);

    const result = await graph.invoke(
      {
        messages: [
          new HumanMessage(
            "Qual documentação preciso para viajar para a França?"
          ),
        ],
      },
      config
    );

    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).toContain("franca.md");
  });

  it("viagens acknowledges missing evidence instead of inventing an answer", async () => {
    resetRagCache();
    const graph = buildGraph();
    const config = configFor("t-viagens-no-evidence", "viagens", [
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "call_rag",
            args: { query: "previsão do tempo amanhã" },
            id: "c1",
          },
        ],
      }),
      new AIMessage({
        content:
          "Não encontrei evidência na base de documentação de viagens para essa pergunta.",
      }),
    ]);

    const result = await graph.invoke(
      { messages: [new HumanMessage("Vai chover amanhã?")] },
      config
    );

    const finalMessage = result.messages[result.messages.length - 1];
    expect(String(finalMessage.content).toLowerCase()).toContain(
      "não encontrei"
    );
  });

  it("viagens cannot execute chamados tools", async () => {
    const graph = buildGraph();
    const config = configFor("t-viagens-blocked", "viagens", [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "listar_chamados", args: { situacao: "aberto" }, id: "c1" },
        ],
      }),
      new AIMessage({
        content:
          "Não tenho acesso a chamados de suporte, só à documentação de viagens.",
      }),
    ]);

    const result = await graph.invoke(
      { messages: [new HumanMessage("Liste os chamados abertos.")] },
      config
    );

    const toolMessage = result.messages.find(
      (m) => (m as { _getType?: () => string })._getType?.() === "tool"
    );
    const content = JSON.parse((toolMessage?.content as string) ?? "{}");
    expect(content.error).toContain("não é permitida");
  });

  it("viagens cannot reach the escalation write path", async () => {
    const graph = buildGraph();
    const config = configFor("t-viagens-blocked-escalation", "viagens", [
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "registrar_escalonamento",
            args: {
              chamadoId: "CH-101",
              resumo: "Falha recorrente de login",
              justificativa: "Vários usuários afetados",
            },
            id: "c1",
          },
        ],
      }),
    ]);

    const result = await graph.invoke(
      { messages: [new HumanMessage("Escalone o CH-101.")] },
      config
    );

    const toolMessage = result.messages.find(
      (m) => (m as { _getType?: () => string })._getType?.() === "tool"
    );
    const content = JSON.parse((toolMessage?.content as string) ?? "{}");
    expect(content.error).toContain("não é permitida");
    expect(content.error).toContain("registrar_escalonamento");

    const state = await graph.getState(config);
    // nothing was written and the graph never paused for human approval
    expect(state.values.escalationRegistered).toBe(false);
    expect(state.values.escalationRecord).toBeNull();
    expect(state.next).toEqual([]);
    expect(state.tasks).toHaveLength(0);
  });

  it("suporte cannot query the RAG base", async () => {
    const graph = buildGraph();
    const config = configFor("t-suporte-blocked", "suporte", [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "call_rag", args: { query: "qualquer coisa" }, id: "c1" },
        ],
      }),
      new AIMessage({
        content: "Não tenho acesso à base de documentação de viagens.",
      }),
    ]);

    const result = await graph.invoke(
      {
        messages: [
          new HumanMessage("Qual documentação preciso para a França?"),
        ],
      },
      config
    );

    const toolMessage = result.messages.find(
      (m) => (m as { _getType?: () => string })._getType?.() === "tool"
    );
    const content = JSON.parse((toolMessage?.content as string) ?? "{}");
    expect(content.error).toContain("não é permitida");
  });
});
