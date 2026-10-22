import { AssistantId } from "../lib/graph/assistants";

const OPTIONS: { id: AssistantId; label: string; icon: string }[] = [
  { id: "suporte", label: "Suporte", icon: "🛠️" },
  { id: "viagens", label: "Viagens", icon: "🧳" },
];

export function AssistantSelector({
  value,
  onChange,
  disabled,
}: {
  value: AssistantId;
  onChange: (id: AssistantId) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Assistant"
      className="inline-flex gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm"
    >
      {OPTIONS.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span aria-hidden>{option.icon}</span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
