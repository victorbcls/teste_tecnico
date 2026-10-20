export interface RunSummary {
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  toolResults: unknown[];
  finalAnswer: string;
}

export interface EvalResult {
  key: string;
  score: number;
  comment: string;
}

export function evaluateListarChamadosAbertos(run: RunSummary): EvalResult {
  const listCall = run.toolCalls.find((c) => c.name === "listar_chamados");
  if (!listCall) {
    return {
      key: "executa_listar_chamados_aberto",
      score: 0,
      comment: "listar_chamados não foi chamada.",
    };
  }
  if (listCall.args.situacao !== "aberto") {
    return {
      key: "executa_listar_chamados_aberto",
      score: 0,
      comment: `listar_chamados foi chamada com situacao="${listCall.args.situacao}", esperado "aberto".`,
    };
  }

  const mentionsCH101 = run.finalAnswer.includes("CH-101");
  const mentionsCH103 = run.finalAnswer.includes("CH-103");
  const mentionsCH102 = run.finalAnswer.includes("CH-102");
  const inventedIds = (run.finalAnswer.match(/CH-\d{3}/g) ?? []).filter(
    (id) => id !== "CH-101" && id !== "CH-103"
  );

  if (
    !mentionsCH101 ||
    !mentionsCH103 ||
    mentionsCH102 ||
    inventedIds.length > 0
  ) {
    return {
      key: "executa_listar_chamados_aberto",
      score: 0,
      comment:
        `Resposta final não corresponde ao retorno da tool. ` +
        `CH-101=${mentionsCH101} CH-103=${mentionsCH103} CH-102=${mentionsCH102} ` +
        `inventados=${inventedIds.join(",")}`,
    };
  }

  return {
    key: "executa_listar_chamados_aberto",
    score: 1,
    comment:
      "listar_chamados executada com situacao=aberto e resposta cita exatamente CH-101 e CH-103.",
  };
}

export function evaluateNaoEscalonaResolvido(run: RunSummary): EvalResult {
  const escalated = run.toolCalls.some(
    (c) => c.name === "registrar_escalonamento"
  );
  if (escalated) {
    return {
      key: "nao_escalona_resolvido",
      score: 0,
      comment: "registrar_escalonamento foi chamada para um chamado resolvido.",
    };
  }
  if (!run.finalAnswer.toLowerCase().includes("resolvido")) {
    return {
      key: "nao_escalona_resolvido",
      score: 0,
      comment: "Resposta final não explica que o chamado já está resolvido.",
    };
  }
  return {
    key: "nao_escalona_resolvido",
    score: 1,
    comment:
      "Nenhum escalonamento foi proposto para o chamado resolvido, e a resposta explica o motivo.",
  };
}
