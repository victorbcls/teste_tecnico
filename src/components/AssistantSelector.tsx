import { AssistantId } from "../lib/graph/assistants";

export function AssistantSelector({
  value,
  onChange,
}: {
  value: AssistantId;
  onChange: (id: AssistantId) => void;
}) {
  return (
    <select
      className="rounded border border-slate-300 px-2 py-1 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as AssistantId)}
    >
      <option value="suporte">Suporte</option>
      <option value="viagens">Viagens</option>
    </select>
  );
}
