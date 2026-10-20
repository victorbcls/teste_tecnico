export interface Proposal {
  chamadoId: string;
  resumo: string;
  justificativa: string;
}

export function ApprovalCard({
  proposal,
  onDecide,
}: {
  proposal: Proposal;
  onDecide: (approved: boolean) => void;
}) {
  return (
    <div className="rounded border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-900">
        Proposta de escalonamento — {proposal.chamadoId}
      </p>
      <p className="mt-1 text-sm text-amber-900">
        <span className="font-medium">Resumo:</span> {proposal.resumo}
      </p>
      <p className="mt-1 text-sm text-amber-900">
        <span className="font-medium">Justificativa:</span>{" "}
        {proposal.justificativa}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          className="rounded bg-emerald-600 px-3 py-1 text-sm text-white"
          onClick={() => onDecide(true)}
        >
          Aprovar
        </button>
        <button
          className="rounded bg-red-600 px-3 py-1 text-sm text-white"
          onClick={() => onDecide(false)}
        >
          Rejeitar
        </button>
      </div>
    </div>
  );
}
