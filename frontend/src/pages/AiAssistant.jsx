import { useMemo, useRef, useEffect, useState } from "react";
import { Send, Sparkles, Zap } from "lucide-react";
import api from "../api";

const starterPrompts = [
  "Résume les KPI de cette année.",
  "Quelles sont les 5 activités avec le plus de participants ?",
  "Donne-moi la répartition hommes/femmes des bénéficiaires.",
  "Quels partenaires ont le plus de bénéficiaires ce mois-ci ?",
  "Liste les activités des 30 derniers jours.",
];

export default function AiAssistant() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Bonjour ! Je suis Pobarr, votre assistant ODC. Je peux interroger vos données en temps réel — activités, participants, KPI sociaux, partenaires. Posez-moi une question.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  const history = useMemo(
    () => messages.filter((m) => m.role === "user" || m.role === "assistant"),
    [messages]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const content = String(text || "").trim();
    if (!content || loading) return;

    setMessages((prev) => [...prev, { role: "user", content }]);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const res = await api.post("/ai/chat", {
        message: content,
        history: history.slice(-10),
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.data?.reply || "Pas de réponse." },
      ]);
    } catch (err) {
      setError(err?.response?.data?.error || "Erreur Pobarr");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Je ne peux pas répondre pour le moment. Vérifie la configuration et réessaie.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4">

      {/* Header */}
      <div className="card p-5 bg-gradient-to-r from-orange-500 to-orange-600 text-white border-none flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl font-bold">
            P
          </div>
          <div>
            <h1 className="text-xl font-bold">Pobarr</h1>
            <p className="text-orange-100 text-xs">
              Assistant ODC · accès temps réel aux activités, participants et KPI
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-xs bg-white/20 rounded-full px-3 py-1">
            <Zap className="w-3 h-3" /> Live data
          </div>
        </div>
      </div>

      {/* Suggestions */}
      <div className="flex-shrink-0 flex flex-wrap gap-2">
        {starterPrompts.map((p) => (
          <button
            key={p}
            className="btn-ghost border text-xs"
            onClick={() => sendMessage(p)}
            disabled={loading}
          >
            <Sparkles className="w-3 h-3" />
            {p}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="card p-4 flex-1 overflow-y-auto space-y-4">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "assistant" && (
              <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold mr-2 flex-shrink-0 mt-1">
                P
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                m.role === "user"
                  ? "bg-orange-500 text-white"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
              P
            </div>
            <div className="bg-slate-100 rounded-2xl px-4 py-3 flex gap-1">
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="flex-shrink-0 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Input */}
      <form
        className="flex-shrink-0 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
      >
        <input
          className="input flex-1"
          placeholder="Ex: Combien de participants en mars ? Quelles activités ce mois-ci ?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          autoFocus
        />
        <button className="btn-primary" disabled={loading || !input.trim()}>
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
