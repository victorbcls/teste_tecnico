export interface ChatEntry {
  role: "user" | "assistant" | "system";
  content: string;
}

export function ChatWindow({ entries }: { entries: ChatEntry[] }) {
  return (
    <div className="flex-1 overflow-y-auto rounded border border-slate-200 p-3">
      {entries.length === 0 && (
        <p className="text-sm text-slate-400">
          Pergunte algo, por exemplo: &quot;Liste todos os chamados
          abertos.&quot;
        </p>
      )}
      {entries.map((entry, index) => (
        <div
          key={index}
          className={`mb-2 max-w-[80%] rounded px-3 py-2 text-sm ${
            entry.role === "user"
              ? "ml-auto bg-blue-600 text-white"
              : entry.role === "system"
                ? "bg-red-100 text-red-800"
                : "bg-slate-100 text-slate-900"
          }`}
        >
          {entry.content}
        </div>
      ))}
    </div>
  );
}
