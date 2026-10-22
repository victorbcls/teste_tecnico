"use client";

import { useEffect, useState } from "react";
import { ChatWindow, ChatEntry } from "../components/ChatWindow";
import { ApprovalCard, Proposal } from "../components/ApprovalCard";
import { Sidebar } from "../components/Sidebar";
import { MessageInput } from "../components/MessageInput";
import { AssistantId } from "../lib/graph/assistants";

function newThreadId(): string {
  return crypto.randomUUID();
}

function threadKey(assistantId: AssistantId): string {
  return `aurora-thread-${assistantId}`;
}

const ASSISTANT_META: Record<
  AssistantId,
  { label: string; icon: string; tagline: string }
> = {
  suporte: {
    label: "Suporte",
    icon: "🛠️",
    tagline: "Chamados, consultas e escalonamento com aprovação humana",
  },
  viagens: {
    label: "Viagens",
    icon: "🧳",
    tagline: "Documentação de viagens com busca semântica (RAG)",
  },
};

export default function Home() {
  const [assistantId, setAssistantId] = useState<AssistantId>("suporte");
  const [threadId, setThreadId] = useState<string>("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [pendingProposal, setPendingProposal] = useState<Proposal | null>(
    null
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading) {
      setLoadingSeconds(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setLoadingSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    const key = threadKey(assistantId);
    const existing = sessionStorage.getItem(key);
    const id = existing ?? newThreadId();
    if (!existing) sessionStorage.setItem(key, id);
    setThreadId(id);
    setEntries([]);
    setPendingProposal(null);
  }, [assistantId]);

  async function send(body: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId, assistantId, ...body }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEntries((prev) => [
          ...prev,
          { role: "system", content: json.error, timestamp: Date.now() },
        ]);
        return;
      }
      if (json.proposal) {
        setPendingProposal(json.proposal);
      } else {
        setPendingProposal(null);
        if (json.message) {
          setEntries((prev) => [
            ...prev,
            {
              role: "assistant",
              content: json.message,
              timestamp: Date.now(),
            },
          ]);
        }
      }
    } catch (e) {
      setEntries((prev) => [
        ...prev,
        {
          role: "system",
          content: e instanceof Error ? e.message : "Erro de rede",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || !threadId) return;
    setEntries((prev) => [
      ...prev,
      { role: "user", content: input, timestamp: Date.now() },
    ]);
    const message = input;
    setInput("");
    await send({ message });
  }

  async function handleDecision(approved: boolean) {
    setPendingProposal(null);
    await send({ resume: { approved } });
  }

  function handleNewConversation() {
    const id = newThreadId();
    sessionStorage.setItem(threadKey(assistantId), id);
    setThreadId(id);
    setEntries([]);
    setPendingProposal(null);
    setSidebarOpen(false);
  }

  function handleSelectAssistant(id: AssistantId) {
    setAssistantId(id);
    setSidebarOpen(false);
  }

  const meta = ASSISTANT_META[assistantId];
  const busy = loading || !!pendingProposal;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-100">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 border-r border-slate-200 lg:block">
        <Sidebar
          assistantId={assistantId}
          onSelectAssistant={handleSelectAssistant}
          onNewConversation={handleNewConversation}
          disabled={busy}
        />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-xl">
            <Sidebar
              assistantId={assistantId}
              onSelectAssistant={handleSelectAssistant}
              onNewConversation={handleNewConversation}
              disabled={busy}
              onClose={() => setSidebarOpen(false)}
            />
          </aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-5 w-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-xl leading-none">{meta.icon}</span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-slate-900">
              {meta.label}
            </h1>
            <p className="truncate text-xs text-slate-500">{meta.tagline}</p>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-2 sm:px-4">
          <ChatWindow
            entries={entries}
            loading={loading}
            loadingSeconds={loadingSeconds}
          />

          <div className="shrink-0 space-y-3 pb-4">
            {pendingProposal && (
              <ApprovalCard
                proposal={pendingProposal}
                onDecide={handleDecision}
              />
            )}
            <MessageInput
              value={input}
              onChange={setInput}
              onSend={handleSend}
              disabled={busy}
              loading={loading}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
