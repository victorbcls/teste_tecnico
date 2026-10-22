"use client";

import { useEffect, useRef } from "react";

export interface ChatEntry {
  role: "user" | "assistant" | "system";
  content: string;
}

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
    <div className="flex-1 overflow-y-auto rounded border border-slate-200 p-3">
      {entries.length === 0 && !loading && (
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
      {loading && (
        <div className="mb-2 flex max-w-[80%] items-center gap-2 rounded bg-slate-100 px-3 py-2 text-sm text-slate-500">
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
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
