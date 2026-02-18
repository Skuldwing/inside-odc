import { useMemo, useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import api from "../api";

const starterPrompts = [
  "Fais-moi un resume hebdo des KPI ODC.",
  "Donne 5 actions pour augmenter l'engagement social ce mois-ci.",
  "Propose un plan de relance des participants absents.",
];

export default function AiAssistant() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Bonjour. Je suis l'assistant IA ODC. Pose-moi une question operationnelle sur les activites, participants ou KPI social.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const history = useMemo(
    () => messages.filter((m) => m.role === "user" || m.role === "assistant"),
    [messages]
  );

  const sendMessage = async (text) => {
    const content = String(text || "").trim();
    if (!content || loading) return;

    const userMsg = { role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const res = await api.post("/ai/chat", {
        message: content,
        history: history.slice(-8),
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.data?.reply || "Pas de reponse." },
      ]);
    } catch (err) {
      setError(err?.response?.data?.error || "Erreur assistant IA");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Je ne peux pas repondre pour le moment. Verifie la configuration IA et reessaie.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-r from-orange-500 to-orange-600 text-white border-none">
        <div className="flex items-center gap-3">
          <Bot className="w-6 h-6" />
          <div>
            <h1 className="text-2xl font-semibold">Assistant IA ODC</h1>
            <p className="text-orange-100 text-sm">
              Aide operationnelle pour activites, import, et KPI social
            </p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap gap-2">
          {starterPrompts.map((p) => (
            <button
              key={p}
              className="btn-ghost border text-xs"
              onClick={() => sendMessage(p)}
              disabled={loading}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="h-[430px] overflow-y-auto space-y-4 pr-1">
          {messages.map((m, idx) => (
            <div
              key={`${m.role}-${idx}`}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  m.role === "user"
                    ? "bg-orange-500 text-white"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm bg-slate-100 text-slate-500">
                Assistant en cours de reponse...
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
        >
          <input
            className="input"
            placeholder="Ex: Resume les KPI social du mois et propose 3 actions."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button className="btn-primary" disabled={loading || !input.trim()}>
            <Send className="w-4 h-4" />
            Envoyer
          </button>
        </form>
      </div>
    </div>
  );
}
