"use client";

import { useEffect, useRef } from "react";

export interface ChatEntry {
  role: "user" | "assistant" | "system";
  content: string;
}

const ROLE_STYLES: Record<ChatEntry["role"], string> = {
  user: "ml-auto bg-indigo-600 text-white rounded-br-md",
  assistant:
    "bg-white text-slate-800 border border-slate-200 rounded-bl-md shadow-sm",
  system: "mx-auto bg-red-50 text-red-700 border border-red-200 text-center",
};

const ROLE_LABELS: Record<ChatEntry["role"], string> = {
  user: "Você",
  assistant: "Assistente",
  system: "Erro",
};

export function ChatWindow({
  entries,
  loading,
  loadingSeconds,
}: {
  entries: ChatEntry[];
  loading?: boolean;
  loadingSeconds?: number;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries, loading]);

  return (
    <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      {entries.length === 0 && !loading && (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-slate-400">
          <span className="text-2xl">💬</span>
          <p className="text-sm">
            Pergunte algo, por exemplo:
            <br />
            <span className="font-medium text-slate-500">
              &quot;Liste todos os chamados abertos.&quot;
            </span>
          </p>
        </div>
      )}
      {entries.map((entry, index) => (
        <div
          key={index}
          className={`flex max-w-[80%] flex-col gap-0.5 rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${ROLE_STYLES[entry.role]}`}
        >
          {entry.role !== "user" && (
            <span className="text-[11px] font-semibold uppercase tracking-wide opacity-60">
              {ROLE_LABELS[entry.role]}
            </span>
          )}
          <span className="whitespace-pre-wrap">{entry.content}</span>
        </div>
      ))}
      {loading && (
        <div className="flex max-w-[80%] items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-500 shadow-sm">
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" />
          </span>
          {!!loadingSeconds && loadingSeconds > 2 && (
            <span>
              pensando{" "}
              {loadingSeconds >= 60
                ? `${Math.floor(loadingSeconds / 60)}min ${loadingSeconds % 60}s`
                : `${loadingSeconds}s`}
              {loadingSeconds > 20 ? " — modelos locais podem demorar" : ""}
            </span>
          )}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
