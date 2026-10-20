import { describe, it, expect } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { registerEscalationNode } from "../src/lib/graph/nodes/registerEscalation";
import { GraphStateType } from "../src/lib/graph/state";

function stateWithEscalationCall(): GraphStateType {
  const aiMessage = new AIMessage({
    content: "",
    tool_calls: [
      {
        name: "registrar_escalonamento",
        args: {
          chamadoId: "CH-101",
          resumo: "Login falhando para múltiplos usuários",
          justificativa: "Impacto recorrente, requer atenção humana",
        },
        id: "call-esc-1",
      },
    ],
  });
  return {
    messages: [aiMessage],
    escalationApproved: true,
    escalationRegistered: false,
    escalationRecord: null,
  } as unknown as GraphStateType;
}

describe("registerEscalationNode", () => {
  it("registers the escalation from the pending tool call", async () => {
    const result = await registerEscalationNode(stateWithEscalationCall());
    expect(result.escalationRegistered).toBe(true);
    expect(result.escalationRecord?.chamadoId).toBe("CH-101");
    const content = JSON.parse(
      (result.messages?.[0]?.content as string) ?? "{}"
    );
    expect(content.registered).toBe(true);
  });

  it("does not create a new record when already registered (idempotent resume)", async () => {
    const existingRecord = {
      chamadoId: "CH-101",
      resumo: "Login falhando",
      justificativa: "Impacto recorrente",
      registeredAt: "2026-10-20T10:00:00.000Z",
    };
    const state = {
      ...stateWithEscalationCall(),
      escalationRegistered: true,
      escalationRecord: existingRecord,
    } as unknown as GraphStateType;

    const result = await registerEscalationNode(state);
    const content = JSON.parse(
      (result.messages?.[0]?.content as string) ?? "{}"
    );
    expect(content.alreadyRegistered).toBe(true);
    expect(content.record).toEqual(existingRecord);
    expect(
      (result.messages?.[0] as { tool_call_id?: string }).tool_call_id
    ).toBe("call-esc-1");
  });

  it("throws when there is no pending registrar_escalonamento call", async () => {
    const state = {
      messages: [new AIMessage({ content: "oi" })],
      escalationApproved: null,
      escalationRegistered: false,
      escalationRecord: null,
    } as unknown as GraphStateType;
    await expect(registerEscalationNode(state)).rejects.toThrow(
      /sem uma proposta/
    );
  });
});
