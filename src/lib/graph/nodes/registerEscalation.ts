import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { RegistrarEscalonamentoInputSchema } from "../../tools/schemas";
import { InvalidInputError } from "../../tools/errors";
import { GraphStateType, EscalationRecord } from "../state";

function buildEscalationRecord(rawArgs: unknown): EscalationRecord {
  const parsed = RegistrarEscalonamentoInputSchema.safeParse(rawArgs);
  if (!parsed.success) throw new InvalidInputError(parsed.error.message);
  return {
    chamadoId: parsed.data.chamadoId,
    resumo: parsed.data.resumo,
    justificativa: parsed.data.justificativa,
    registeredAt: new Date().toISOString(),
  };
}

export async function registerEscalationNode(state: GraphStateType) {
  if (state.escalationRegistered && state.escalationRecord) {
    return {
      messages: [
        new ToolMessage({
          tool_call_id: "registrar_escalonamento",
          content: JSON.stringify({
            alreadyRegistered: true,
            record: state.escalationRecord,
          }),
        }),
      ],
    };
  }

  const lastAiMessage = [...state.messages]
    .reverse()
    .find(
      (m) => m instanceof AIMessage && (m.tool_calls?.length ?? 0) > 0
    ) as AIMessage | undefined;
  const escalationCall = lastAiMessage?.tool_calls?.find(
    (c) => c.name === "registrar_escalonamento"
  );
  if (!escalationCall) {
    throw new InvalidInputError(
      "registerEscalationNode chamado sem uma proposta de registrar_escalonamento pendente"
    );
  }

  const record = buildEscalationRecord(escalationCall.args);

  return {
    escalationRegistered: true,
    escalationRecord: record,
    messages: [
      new ToolMessage({
        tool_call_id: escalationCall.id ?? "registrar_escalonamento",
        content: JSON.stringify({ registered: true, record }),
      }),
    ],
  };
}
