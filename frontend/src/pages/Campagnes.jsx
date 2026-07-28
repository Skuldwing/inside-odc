import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Plus,
  Mail,
  MessageSquare,
  Calendar,
  ShieldAlert,
  Zap,
  Save,
  RotateCcw,
  Check,
  ChevronRight,
  Code2,
} from "lucide-react";
import api from "../api";
import { useAuth } from "../auth/useAuth";

/* ── Templates automatiques ─────────────────────────────────── */
function TemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ subject: "", body_html: "" });
  const [saving, setSaving] = useState(false);
  const [savedSlug, setSavedSlug] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const editorRef = useRef(null);

  useEffect(() => {
    api.get("/email-templates").then((r) => {
      setTemplates(r.data);
      if (r.data.length > 0) select(r.data[0]);
    });
  }, []);

  function select(tpl) {
    setSelected(tpl);
    setForm({ subject: tpl.subject, body_html: tpl.body_html });
    setSavedSlug(null);
    setPreviewMode(false);
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.put(`/email-templates/${selected.slug}`, form);
      setSavedSlug(selected.slug);
      setTemplates((prev) =>
        prev.map((t) => (t.slug === selected.slug ? { ...t, ...form } : t))
      );
      setSelected((t) => ({ ...t, ...form }));
    } catch {
      alert("Erreur lors de la sauvegarde.");
    }
    setSaving(false);
  }

  async function reset() {
    if (!selected) return;
    if (!window.confirm("Remettre ce template aux valeurs par défaut ?")) return;
    try {
      const res = await api.delete(`/email-templates/${selected.slug}/reset`);
      const def = res.data.template;
      setTemplates((prev) =>
        prev.map((t) => (t.slug === selected.slug ? { ...t, ...def } : t))
      );
      setForm({ subject: def.subject, body_html: def.body_html });
      setSelected((t) => ({ ...t, ...def }));
      setSavedSlug(null);
    } catch {
      alert("Erreur lors de la réinitialisation.");
    }
  }

  function handleEditorMount(editor) {
    editorRef.current = editor;
  }

  function insertVariable(variable) {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    editor.executeEdits("insert-variable", [
      { identifier: { major: 1, minor: 1 }, range: selection, text: variable, forceMoveMarkers: true },
    ]);
    editor.focus();
  }

  function formatDocument() {
    editorRef.current?.getAction("editor.action.formatDocument")?.run();
  }

  const dirty =
    selected &&
    (form.subject !== selected.subject || form.body_html !== selected.body_html);

  return (
    <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[520px]">
      {/* sidebar */}
      <div className="w-64 flex-shrink-0 space-y-1">
        {templates.map((tpl) => (
          <button
            key={tpl.slug}
            onClick={() => select(tpl)}
            className={`w-full text-left rounded-xl px-4 py-3 transition-colors flex items-center justify-between gap-2 ${
              selected?.slug === tpl.slug
                ? "bg-orange-50 border border-orange-200 text-orange-700"
                : "border border-transparent hover:bg-slate-50 text-slate-700"
            }`}
          >
            <p className="text-sm font-medium leading-tight">{tpl.label}</p>
            {selected?.slug === tpl.slug && (
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
            )}
          </button>
        ))}
      </div>

      {/* editor panel */}
      {selected && (
        <div className="flex-1 card p-0 overflow-hidden flex flex-col">
          {/* header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-800">{selected.label}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{selected.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewMode((v) => !v)}
                className={`btn-ghost border text-sm px-3 ${previewMode ? "bg-slate-100" : ""}`}
              >
                {previewMode ? "Éditeur" : "Aperçu"}
              </button>
              <button
                onClick={reset}
                className="btn-ghost border text-sm px-3"
                title="Remettre aux valeurs par défaut"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={save}
                disabled={saving || !dirty}
                className="btn-primary text-sm px-4 disabled:opacity-50"
              >
                {saving ? (
                  "Sauvegarde..."
                ) : savedSlug === selected.slug && !dirty ? (
                  <span className="flex items-center gap-1">
                    <Check className="w-4 h-4" /> Sauvegardé
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Save className="w-4 h-4" /> Sauvegarder
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {previewMode ? (
              <div className="flex-1 flex flex-col">
                <div className="bg-slate-50 px-6 py-2 text-xs text-slate-500 border-b border-slate-100">
                  Objet : <strong>{form.subject}</strong>
                </div>
                <iframe
                  srcDoc={form.body_html}
                  sandbox="allow-same-origin"
                  title="Aperçu email"
                  className="flex-1 w-full"
                  style={{ border: "none", display: "block" }}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* subject */}
                <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-3">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    Objet
                  </label>
                  <input
                    className="input flex-1 text-sm"
                    value={form.subject}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, subject: e.target.value }))
                    }
                  />
                </div>

                {/* editor toolbar */}
                <div className="px-4 py-2 bg-[#1e1e1e] border-b border-[#333] flex items-center gap-3 flex-wrap">
                  {(selected.variables || []).length > 0 && (
                    <>
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        Insérer :
                      </span>
                      {(selected.variables || []).map((v) => (
                        <button
                          key={v}
                          onClick={() => insertVariable(v)}
                          title={`Insérer ${v} au curseur`}
                          className="font-mono text-xs bg-orange-900/40 border border-orange-600/40 text-orange-300 rounded px-2 py-0.5 hover:bg-orange-600/30 transition-colors"
                        >
                          {v}
                        </button>
                      ))}
                      <div className="w-px h-4 bg-slate-600 mx-1" />
                    </>
                  )}
                  <button
                    onClick={formatDocument}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    title="Formater le HTML (Shift+Alt+F)"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    Formater
                  </button>
                  <span className="ml-auto text-xs text-slate-600">
                    Ctrl+F rechercher · Ctrl+H remplacer · Shift+Alt+F formater
                  </span>
                </div>

                {/* Monaco editor */}
                <div className="flex-1 min-h-0">
                  <Editor
                    height="100%"
                    defaultLanguage="html"
                    value={form.body_html}
                    theme="vs-dark"
                    onMount={handleEditorMount}
                    onChange={(value) =>
                      setForm((f) => ({ ...f, body_html: value ?? "" }))
                    }
                    options={{
                      fontSize: 13,
                      lineNumbers: "on",
                      minimap: { enabled: false },
                      wordWrap: "on",
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      formatOnPaste: true,
                      formatOnType: false,
                      tabSize: 2,
                      insertSpaces: true,
                      folding: true,
                      renderLineHighlight: "line",
                      scrollbar: { verticalScrollbarSize: 6 },
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Page principale ─────────────────────────────────────────── */
export default function Campagnes() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState("campagnes");
  const [isOpen, setIsOpen] = useState(false);
  const [campagnes, setCampagnes] = useState([]);

  const [form, setForm] = useState({
    name: "",
    type: "email",
    message: "",
  });

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="card p-8 text-center max-w-md">
          <ShieldAlert className="mx-auto mb-4 text-orange-500" size={40} />
          <h2 className="text-xl font-semibold mb-2">Accès restreint</h2>
          <p className="text-slate-500">
            Cette page est réservée aux administrateurs.
          </p>
        </div>
      </div>
    );
  }

  const fetchCampagnes = async () => {
    try {
      const res = await api.get("/campagnes");
      setCampagnes(res.data);
    } catch (err) {
      console.error("Erreur chargement campagnes", err);
    }
  };

  useEffect(() => {
    fetchCampagnes();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/campagnes", form);
      fetchCampagnes();
      setForm({ name: "", type: "email", message: "" });
      setIsOpen(false);
    } catch (err) {
      console.error("Erreur création campagne", err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Campagnes</h1>
          <p className="page-subtitle">
            Campagnes de communication et templates d'emails automatiques
          </p>
        </div>

        {tab === "campagnes" && (
          <button onClick={() => setIsOpen(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Nouvelle campagne
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab("campagnes")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "campagnes"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <span className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Campagnes
          </span>
        </button>
        <button
          onClick={() => setTab("templates")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "templates"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <span className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Templates automatiques
          </span>
        </button>
      </div>

      {/* Tab content */}
      {tab === "templates" ? (
        <TemplatesTab />
      ) : (
        <>
          {isOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
              <div className="card-solid w-full max-w-lg p-6">
                <h2 className="text-xl font-semibold mb-4">
                  Nouvelle campagne
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">
                      Nom de la campagne
                    </label>
                    <input
                      required
                      className="input mt-1"
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">
                      Type de campagne
                    </label>
                    <select
                      className="select mt-1"
                      value={form.type}
                      onChange={(e) =>
                        setForm({ ...form, type: e.target.value })
                      }
                    >
                      <option value="email">Email</option>
                      <option value="sms">SMS</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Message</label>
                    <textarea
                      required
                      rows="4"
                      className="input mt-1"
                      value={form.message}
                      onChange={(e) =>
                        setForm({ ...form, message: e.target.value })
                      }
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="btn-ghost border"
                    >
                      Annuler
                    </button>
                    <button type="submit" className="btn-primary">
                      Créer
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="card overflow-x-auto">
            <table className="table">
              <thead className="table-head">
                <tr>
                  <th className="text-left px-4 py-3">Campagne</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Message</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {campagnes.map((c) => (
                  <tr key={c.id} className="table-row">
                    <td className="px-4 py-3 font-medium">{c.name}</td>

                    <td className="px-4 py-3">
                      {c.type === "email" ? (
                        <span className="flex items-center gap-1 text-blue-600">
                          <Mail className="w-4 h-4" /> Email
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-green-600">
                          <MessageSquare className="w-4 h-4" /> SMS
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-slate-600 truncate max-w-xs">
                      {c.message}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {c.created_at || c.date}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`badge ${
                          c.status === "envoyee"
                            ? "bg-green-100 text-green-700"
                            : c.status === "programmee"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
