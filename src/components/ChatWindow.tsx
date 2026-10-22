"use client";

import { useEffect, useRef } from "react";

export interface ChatEntry {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Render **bold** and "- item" bullet lines without pulling in a markdown dependency. */
function MessageText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const bullet = /^\s*[-*]\s+/.test(line);
        const parts = line
          .replace(/^\s*[-*]\s+/, "")
          .split(/(\*\*[^*]+\*\*)/g)
          .filter(Boolean);
        const content = parts.map((part, j) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={j}>{part.slice(2, -2)}</strong>
          ) : (
            <span key={j}>{part}</span>
          )
        );
        return (
          <span key={i} className="block">
            {bullet ? <span className="mr-1.5 text-slate-400">•</span> : null}
            {content}
          </span>
        );
      })}
    </>
  );
}

function Avatar({ role }: { role: ChatEntry["role"] }) {
  if (role === "user") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-white">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.76-3.58-5-8-5Z" />
        </svg>
      </div>
    );
  }
  if (role === "system") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm">
        ⚠️
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white shadow-sm">
      A
    </div>
  );
}

const BUBBLE_STYLES: Record<ChatEntry["role"], string> = {
  user: "bg-indigo-600 text-white rounded-br-md",
  assistant:
    "bg-white text-slate-800 border border-slate-200 rounded-bl-md shadow-sm",
  system: "bg-red-50 text-red-700 border border-red-200 rounded-bl-md",
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
    <div className="flex-1 space-y-4 overflow-y-auto px-2 py-4 sm:px-4">
      {entries.length === 0 && !loading && (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-slate-400">
          <span className="text-3xl">💬</span>
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
          className={`flex animate-[fade-in-up_0.25s_ease-out] items-end gap-2 ${
            entry.role === "user" ? "flex-row-reverse" : ""
          }`}
        >
          <Avatar role={entry.role} />
          <div
            className={`flex max-w-[75%] flex-col gap-1 rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${BUBBLE_STYLES[entry.role]}`}
          >
            <MessageText text={entry.content} />
            {!!entry.timestamp && (
              <span
                className={`text-[10px] ${entry.role === "user" ? "text-indigo-200" : "text-slate-400"}`}
              >
                {formatTime(entry.timestamp)}
              </span>
            )}
          </div>
        </div>
      ))}
      {loading && (
        <div className="flex animate-[fade-in-up_0.25s_ease-out] items-end gap-2">
          <Avatar role="assistant" />
          <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-500 shadow-sm">
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
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
