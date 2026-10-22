import { AssistantId } from "../lib/graph/assistants";

const ASSISTANT_CARDS: {
  id: AssistantId;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    id: "suporte",
    label: "Suporte",
    icon: "🛠️",
    description: "Chamados, consultas e escalonamento",
  },
  {
    id: "viagens",
    label: "Viagens",
    icon: "🧳",
    description: "Documentação de viagens (RAG)",
  },
];

export function Sidebar({
  assistantId,
  onSelectAssistant,
  onNewConversation,
  disabled,
  onClose,
}: {
  assistantId: AssistantId;
  onSelectAssistant: (id: AssistantId) => void;
  onNewConversation: () => void;
  disabled?: boolean;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-6 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow-sm">
            A
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-slate-900">
              Aurora
            </p>
            <p className="text-[11px] leading-tight text-slate-400">
              Assistant
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onNewConversation}
        disabled={disabled}
        className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-4 w-4"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
        </svg>
        Nova conversa
      </button>

      <div className="flex flex-col gap-1.5">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Assistentes
        </p>
        {ASSISTANT_CARDS.map((card) => {
          const selected = card.id === assistantId;
          return (
            <button
              key={card.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectAssistant(card.id)}
              aria-pressed={selected}
              className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? "bg-indigo-50 ring-1 ring-inset ring-indigo-200"
                  : "hover:bg-slate-50"
              }`}
            >
              <span className="text-lg leading-none">{card.icon}</span>
              <span className="flex flex-col">
                <span
                  className={`text-sm font-medium ${
                    selected ? "text-indigo-900" : "text-slate-800"
                  }`}
                >
                  {card.label}
                </span>
                <span className="text-xs text-slate-400">
                  {card.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-400">
        Demonstração com LangGraph + Ollama, rodando localmente. Nenhum dado
        real é processado.
      </div>
    </div>
  );
}
