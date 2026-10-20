import { describe, it, expect, vi } from "vitest";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { buildGraph } from "../src/lib/graph/graph";
import { ASSISTANTS } from "../src/lib/graph/assistants";
import { TOOL_DEFINITIONS } from "../src/lib/graph/toolDefinitions";
import { createFakeChatModel } from "./fakeChatModel";
import * as mockChamadosModule from "../src/lib/tools/mockChamados";

function configFor(threadId: string, script: AIMessage[]) {
  return {
    configurable: {
      thread_id: threadId,
      assistant: ASSISTANTS.suporte,
      model: createFakeChatModel(script),
      tools: TOOL_DEFINITIONS,
    },
  };
}

function firstToolMessage(messages: unknown[]) {
  return messages.find(
    (m) => (m as { _getType?: () => string })._getType?.() === "tool"
  ) as { content: string } | undefined;
}

describe("Aurora support graph — required scenarios", () => {
  it("scenario 1a: lists open chamados using the real tool result", async () => {
    const graph = buildGraph();
    const config = configFor("t-list", [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "listar_chamados", args: { situacao: "aberto" }, id: "c1" },
        ],
      }),
      new AIMessage({
        content: "Os chamados abertos são CH-101 e CH-103.",
      }),
    ]);

    const result = await graph.invoke(
      { messages: [new HumanMessage("Liste todos os chamados abertos.")] },
      config
    );

    // the real tool ran and only open chamados came back
    const toolOutput = firstToolMessage(result.messages)?.content ?? "";
    expect(toolOutput).toContain("CH-101");
    expect(toolOutput).toContain("CH-103");
    expect(toolOutput).not.toContain("CH-102");

    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).toContain("CH-101");
    expect(finalMessage.content).toContain("CH-103");
    expect(finalMessage.content).not.toContain("CH-102");
  });

  it("scenario 1b: handles an unknown chamado id without inventing data", async () => {
    const graph = buildGraph();
    const config = configFor("t-notfound", [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "consultar_chamado", args: { id: "CH-999" }, id: "c1" },
        ],
      }),
      new AIMessage({
        content: "Não encontrei o chamado CH-999 na nossa base.",
      }),
    ]);

    const result = await graph.invoke(
      { messages: [new HumanMessage("Consulte o CH-999.")] },
      config
    );

    // the tool reported the miss instead of fabricating a chamado
    const toolOutput = JSON.parse(
      firstToolMessage(result.messages)?.content ?? "{}"
    );
    expect(toolOutput.error).toContain("não encontrado");
    expect(toolOutput.error).toContain("CH-999");

    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).toContain("Não encontrei");
  });

  it("scenario 2: blocks escalation of a resolved chamado before any approval step", async () => {
    const graph = buildGraph();
    const config = configFor("t-resolved", [
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "registrar_escalonamento",
            args: {
              chamadoId: "CH-102",
              resumo: "Cliente insiste em reabrir",
              justificativa: "Pedido do cliente",
            },
            id: "c1",
          },
        ],
      }),
    ]);

    const result = await graph.invoke(
      {
        messages: [
          new HumanMessage(
            "Consulte o CH-102 e prepare um escalonamento se ele estiver aberto."
          ),
        ],
      },
      config
    );

    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).toContain("resolvido");

    const state = await graph.getState(config);
    expect(state.values.escalationRegistered).toBe(false);
    // blocked before any human-approval pause: the graph never interrupted
    expect(state.next).toEqual([]);
    expect(state.tasks).toHaveLength(0);
  });

  it("scenario 3a: rejecting the proposal ends the flow without registering anything", async () => {
    const graph = buildGraph();
    const config = configFor("t-reject", [
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

    await graph.invoke(
      { messages: [new HumanMessage("Escalone o CH-101.")] },
      config
    );

    const pausedState = await graph.getState(config);
    const proposal = pausedState.tasks[0]?.interrupts?.[0]?.value;
    expect(proposal).toEqual({
      chamadoId: "CH-101",
      resumo: "Falha recorrente de login",
      justificativa: "Vários usuários afetados",
    });

    const result = await graph.invoke(
      new Command({ resume: { approved: false } }),
      config
    );

    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).toContain("rejeitado");

    const finalState = await graph.getState(config);
    expect(finalState.values.escalationRegistered).toBe(false);
  });

  it("scenario 3b/4: approving registers once, and a repeated resume does not duplicate it", async () => {
    const graph = buildGraph();
    const config = configFor("t-approve", [
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
      new AIMessage({
        content: "Escalonamento do CH-101 registrado com sucesso.",
      }),
    ]);

    await graph.invoke(
      { messages: [new HumanMessage("Escalone o CH-101.")] },
      config
    );

    const result = await graph.invoke(
      new Command({ resume: { approved: true } }),
      config
    );
    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).toContain("registrado");

    const stateAfterFirstApproval = await graph.getState(config);
    const firstRecord = stateAfterFirstApproval.values.escalationRecord;
    expect(firstRecord?.chamadoId).toBe("CH-101");

    let secondAttemptError: unknown = null;
    try {
      await graph.invoke(new Command({ resume: { approved: true } }), config);
    } catch (err) {
      secondAttemptError = err;
    }

    const stateAfterSecondAttempt = await graph.getState(config);
    expect(stateAfterSecondAttempt.values.escalationRecord).toEqual(
      firstRecord
    );
    if (!secondAttemptError) {
      expect(stateAfterSecondAttempt.values.escalationRegistered).toBe(true);
    }
  });

  it("scenario 3c: an approved escalation does not leak approval into a later blocked turn in the same thread", async () => {
    const graph = buildGraph();
    const config = configFor("t-approve-then-blocked", [
      // turn 1: propose escalating CH-101 (open)
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
      // turn 1: after the approved registration
      new AIMessage({
        content: "Escalonamento do CH-101 registrado com sucesso.",
      }),
      // turn 2: tries to escalate CH-102, which is already resolved
      new AIMessage({
        content: "",
        tool_calls: [
          {
            name: "registrar_escalonamento",
            args: {
              chamadoId: "CH-102",
              resumo: "Cliente insiste em reabrir",
              justificativa: "Pedido do cliente",
            },
            id: "c2",
          },
        ],
      }),
    ]);

    // turn 1: propose, approve, register
    await graph.invoke(
      { messages: [new HumanMessage("Escalone o CH-101.")] },
      config
    );
    await graph.invoke(new Command({ resume: { approved: true } }), config);

    const stateAfterApproval = await graph.getState(config);
    const approvedRecord = stateAfterApproval.values.escalationRecord;
    expect(approvedRecord?.chamadoId).toBe("CH-101");
    expect(stateAfterApproval.values.escalationApproved).toBe(true);

    // turn 2, same thread: the escalation must be blocked, not registered
    const result = await graph.invoke(
      { messages: [new HumanMessage("Agora escalone o CH-102.")] },
      config
    );

    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).toContain("Não é possível escalonar");
    expect(finalMessage.content).toContain("CH-102");
    expect(finalMessage.content).toContain("resolvido");

    const finalState = await graph.getState(config);
    // the stale approval from turn 1 did not route turn 2 to registerEscalation
    expect(finalState.values.escalationApproved).toBe(false);
    // the record still describes only the CH-101 escalation from turn 1
    expect(finalState.values.escalationRecord).toEqual(approvedRecord);
    // and no misleading "already registered" tool result was emitted for c2
    const turn2Texts = (finalState.values.messages as { content: unknown }[])
      .map((m) => String(m.content))
      .join(" | ");
    expect(turn2Texts).not.toContain("alreadyRegistered");
    // blocked before any human-approval pause on this turn
    expect(finalState.next).toEqual([]);
    expect(finalState.tasks).toHaveLength(0);
  });

  it("scenario 5: recovers from a transient tool failure within the retry limit", async () => {
    const spy = vi.spyOn(mockChamadosModule, "consultarChamado");
    let calls = 0;
    spy.mockImplementation((input) => {
      calls += 1;
      if (calls === 1) throw new Error("falha transitória simulada");
      const chamado = mockChamadosModule.MOCK_CHAMADOS.find(
        (c) => c.id === input.id
      );
      if (!chamado) throw new Error("not found in test fixture");
      return chamado;
    });

    const graph = buildGraph();
    const config = configFor("t-flaky", [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "consultar_chamado", args: { id: "CH-101" }, id: "c1" },
        ],
      }),
      new AIMessage({ content: "O chamado CH-101 está aberto." }),
    ]);

    const result = await graph.invoke(
      { messages: [new HumanMessage("Consulte o CH-101.")] },
      config
    );

    expect(calls).toBe(2);
    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).toContain("aberto");

    spy.mockRestore();
  });

  it("scenario 6: does not execute an unrecognized tool", async () => {
    const graph = buildGraph();
    const config = configFor("t-unknown-tool", [
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "apagar_chamado", args: { id: "CH-101" }, id: "c1" },
        ],
      }),
      new AIMessage({
        content:
          "Não tenho uma ferramenta para apagar chamados, só posso listar, consultar e escalonar.",
      }),
    ]);

    const result = await graph.invoke(
      { messages: [new HumanMessage("Apague o CH-101.")] },
      config
    );

    const toolMessage = firstToolMessage(result.messages);
    const content = JSON.parse(toolMessage?.content ?? "{}");
    expect(content.error).toContain("desconhecida");

    const finalMessage = result.messages[result.messages.length - 1];
    expect(finalMessage.content).not.toContain("CH-101 apagado");
  });

  it("scenario 7: does not mix context between different thread_ids", async () => {
    const graph = buildGraph();
    const configA = configFor("session-a", [
      new AIMessage({ content: "Olá, aqui é a sessão A." }),
    ]);
    const configB = configFor("session-b", [
      new AIMessage({ content: "Olá, aqui é a sessão B." }),
    ]);

    await graph.invoke(
      { messages: [new HumanMessage("oi, sou da sessão A")] },
      configA
    );
    await graph.invoke(
      { messages: [new HumanMessage("oi, sou da sessão B")] },
      configB
    );

    const stateA = await graph.getState(configA);
    const stateB = await graph.getState(configB);

    const textA = stateA.values.messages
      .map((m: { content: unknown }) => m.content)
      .join(" | ");
    const textB = stateB.values.messages
      .map((m: { content: unknown }) => m.content)
      .join(" | ");

    expect(textA).toContain("sessão A");
    expect(textA).not.toContain("sessão B");
    expect(textB).toContain("sessão B");
    expect(textB).not.toContain("sessão A");
  });
});
