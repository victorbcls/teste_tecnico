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
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-hidden>
          ⚠️
        </span>
        <p className="text-sm font-semibold text-amber-900">
          Proposta de escalonamento — {proposal.chamadoId}
        </p>
      </div>
      <dl className="mt-2 space-y-1 text-sm text-amber-900">
        <div>
          <dt className="inline font-medium">Resumo: </dt>
          <dd className="inline">{proposal.resumo}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Justificativa: </dt>
          <dd className="inline">{proposal.justificativa}</dd>
        </div>
      </dl>
      <div className="mt-3 flex gap-2">
        <button
          className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
          onClick={() => onDecide(true)}
        >
          Aprovar
        </button>
        <button
          className="rounded-full border border-red-300 bg-white px-4 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
          onClick={() => onDecide(false)}
        >
          Rejeitar
        </button>
      </div>
    </div>
  );
}
