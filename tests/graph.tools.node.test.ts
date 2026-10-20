import { describe, it, expect } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { toolsNode } from "../src/lib/graph/nodes/tools";
import { ASSISTANTS } from "../src/lib/graph/assistants";
import { GraphStateType } from "../src/lib/graph/state";
import { fakeEmbeddings } from "./fakeEmbeddings";
import { resetRagCache } from "../src/lib/tools/ragTool";

function stateWithToolCall(
  name: string,
  args: Record<string, unknown>
): GraphStateType {
  const aiMessage = new AIMessage({
    content: "",
    tool_calls: [{ name, args, id: "call-1" }],
  });
  return {
    messages: [aiMessage],
    escalationApproved: null,
    escalationRegistered: false,
    escalationRecord: null,
  } as unknown as GraphStateType;
}

describe("toolsNode", () => {
  it("executes listar_chamados and returns the filtered result as JSON", async () => {
    const state = stateWithToolCall("listar_chamados", {
      situacao: "aberto",
    });
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.suporte },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.map((c: { id: string }) => c.id).sort()).toEqual([
      "CH-101",
      "CH-103",
    ]);
  });

  it("returns a NotFoundError payload for an unknown chamado id", async () => {
    const state = stateWithToolCall("consultar_chamado", { id: "CH-999" });
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.suporte },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.error).toContain("CH-999");
  });

  it("blocks a tool outside the assistant's allowlist", async () => {
    const state = stateWithToolCall("listar_chamados", {
      situacao: "aberto",
    });
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.viagens },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.error).toContain("não é permitida");
  });

  it("returns an UnknownToolError payload for an unrecognized tool name", async () => {
    const state = stateWithToolCall("apagar_chamado", {});
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.suporte },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.error).toContain("desconhecida");
  });

  it("executes call_rag for the viagens assistant and returns sourced chunks", async () => {
    resetRagCache();
    const state = stateWithToolCall("call_rag", {
      query: "Preciso de visto e seguro para a França?",
    });
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.viagens, embeddings: fakeEmbeddings },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.found).toBe(true);
    expect(content.chunks[0].source).toBe("franca.md");
  });

  it("blocks call_rag for the suporte assistant", async () => {
    const state = stateWithToolCall("call_rag", { query: "qualquer coisa" });
    const result = await toolsNode(state, {
      configurable: { assistant: ASSISTANTS.suporte, embeddings: fakeEmbeddings },
    });
    const content = JSON.parse(result.messages[0].content as string);
    expect(content.error).toContain("não é permitida");
  });
});
