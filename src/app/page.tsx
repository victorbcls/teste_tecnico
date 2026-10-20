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

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <AssistantSelector value={assistantId} onChange={setAssistantId} />
        <button
          className="rounded bg-slate-200 px-3 py-1 text-sm hover:bg-slate-300"
          onClick={handleNewConversation}
        >
          Nova conversa
        </button>
      </div>

      <ChatWindow entries={entries} />

      {pendingProposal && (
        <ApprovalCard proposal={pendingProposal} onDecide={handleDecision} />
      )}

      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-slate-300 px-3 py-2"
          value={input}
          disabled={loading || !!pendingProposal}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Digite sua mensagem..."
        />
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          onClick={handleSend}
          disabled={loading || !!pendingProposal}
        >
          Enviar
        </button>
      </div>
    </main>
  );
}
