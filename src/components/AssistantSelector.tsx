import { AssistantId } from "../lib/graph/assistants";

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
    <select
      className="rounded border border-slate-300 px-2 py-1 text-sm"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as AssistantId)}
    >
      <option value="suporte">Suporte</option>
      <option value="viagens">Viagens</option>
    </select>
  );
}
