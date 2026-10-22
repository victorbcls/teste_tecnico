"use client";

import { useEffect, useState } from "react";
import { ChatWindow, ChatEntry } from "../components/ChatWindow";
import { ApprovalCard, Proposal } from "../components/ApprovalCard";
import { AssistantSelector } from "../components/AssistantSelector";
import { AssistantId } from "../lib/graph/assistants";

function newThreadId(): string {
  return crypto.randomUUID();
}

function threadKey(assistantId: AssistantId): string {
  return `aurora-thread-${assistantId}`;
}

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
          { role: "system", content: json.error },
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
            { role: "assistant", content: json.message },
          ]);
        }
      }
    } catch (e) {
      setEntries((prev) => [
        ...prev,
        {
          role: "system",
          content: e instanceof Error ? e.message : "Erro de rede",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || !threadId) return;
    setEntries((prev) => [...prev, { role: "user", content: input }]);
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
  }

  const assistantTagline =
    assistantId === "suporte"
      ? "Chamados, consultas e escalonamento com aprovação humana"
      : "Documentação de viagens com busca semântica (RAG)";

  return (
    <main className="mx-auto flex h-screen w-full max-w-2xl flex-col gap-4 p-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            Aurora{" "}
            <span className="font-normal text-slate-400">Assistant</span>
          </h1>
          <p className="text-xs text-slate-500">{assistantTagline}</p>
        </div>
        <div className="flex items-center gap-2">
          <AssistantSelector
            value={assistantId}
            onChange={setAssistantId}
            disabled={loading || !!pendingProposal}
          />
          <button
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleNewConversation}
            disabled={loading}
          >
            Nova conversa
          </button>
        </div>
      </header>

      <ChatWindow
        entries={entries}
        loading={loading}
        loadingSeconds={loadingSeconds}
      />

      {pendingProposal && (
        <ApprovalCard proposal={pendingProposal} onDecide={handleDecision} />
      )}

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition-shadow focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
          value={input}
          disabled={loading || !!pendingProposal}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Digite sua mensagem..."
        />
        <button
          className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleSend}
          disabled={loading || !!pendingProposal}
        >
          {loading ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </main>
  );
}
