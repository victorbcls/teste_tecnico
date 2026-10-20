import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { createFakeChatModel } from "./fakeChatModel";

let scriptedResponses: AIMessage[] = [];

vi.mock("../src/lib/llm", () => ({
  createOllamaChatModel: () => createFakeChatModel(scriptedResponses),
}));

const { POST } = await import("../src/app/api/chat/route");

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    scriptedResponses = [];
  });

  it("returns 400 when threadId is missing", async () => {
    const res = await POST(
      jsonRequest({ assistantId: "suporte", message: "oi" }) as any
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown assistantId", async () => {
    const res = await POST(
      jsonRequest({
        threadId: "t1",
        assistantId: "financeiro",
        message: "oi",
      }) as any
    );
    expect(res.status).toBe(400);
  });

  it("answers a simple query end to end", async () => {
    scriptedResponses = [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "listar_chamados", args: { situacao: "aberto" }, id: "c1" },
        ],
      }),
      new AIMessage({ content: "CH-101 e CH-103 estão abertos." }),
    ];
    const res = await POST(
      jsonRequest({
        threadId: "api-test-1",
        assistantId: "suporte",
        message: "Liste os chamados abertos.",
      }) as any
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.proposal).toBeNull();
    expect(json.message).toContain("CH-101");
  });

  it("returns a pending proposal when the graph pauses for approval", async () => {
    scriptedResponses = [
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "registrar_escalonamento",
            args: {
              chamadoId: "CH-101",
              resumo: "Falha recorrente",
              justificativa: "Vários usuários afetados",
            },
            id: "c1",
          },
        ],
      }),
    ];
    const res = await POST(
      jsonRequest({
        threadId: "api-test-2",
        assistantId: "suporte",
        message: "Escalone o CH-101.",
      }) as any
    );
    const json = await res.json();
    expect(json.proposal).toEqual({
      chamadoId: "CH-101",
      resumo: "Falha recorrente",
      justificativa: "Vários usuários afetados",
    });
  });

  it("resumes a paused thread with an approval decision", async () => {
    scriptedResponses = [
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "registrar_escalonamento",
            args: {
              chamadoId: "CH-101",
              resumo: "Falha recorrente",
              justificativa: "Vários usuários afetados",
            },
            id: "c1",
          },
        ],
      }),
      new AIMessage({ content: "Escalonamento do CH-101 registrado." }),
    ];
    await POST(
      jsonRequest({
        threadId: "api-test-3",
        assistantId: "suporte",
        message: "Escalone o CH-101.",
      }) as any
    );
    const res = await POST(
      jsonRequest({
        threadId: "api-test-3",
        assistantId: "suporte",
        resume: { approved: true },
      }) as any
    );
    const json = await res.json();
    expect(json.message).toContain("registrado");
  });
});
