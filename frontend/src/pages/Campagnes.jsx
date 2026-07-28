import { useEffect, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Underline } from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
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
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Link as LinkIcon,
  Palette,
} from "lucide-react";
import api from "../api";
import { useAuth } from "../auth/useAuth";

/* ── Toolbar button ──────────────────────────────────────────── */
function TBtn({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-orange-100 text-orange-600"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-slate-200 mx-1 self-center" />;
}

/* ── Templates automatiques ─────────────────────────────────── */
function TemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [subject, setSubject] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedSlug, setSavedSlug] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [dirty, setDirty] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false }),
    ],
    content: "",
    onUpdate: ({ editor: e }) => {
      setDirty(true);
      setSavedSlug(null);
    },
  });

  const loadTemplate = useCallback((tpl) => {
    setSelected(tpl);
    setSubject(tpl.subject);
    setSavedSlug(null);
    setPreviewMode(false);
    setDirty(false);
    if (editor) editor.commands.setContent(tpl.body_html || "");
  }, [editor]);

  useEffect(() => {
    api.get("/email-templates").then((r) => {
      setTemplates(r.data);
      if (r.data.length > 0) loadTemplate(r.data[0]);
    });
  }, []);

  useEffect(() => {
    if (editor && selected) editor.commands.setContent(selected.body_html || "");
  }, [editor, selected?.slug]);

  async function save() {
    if (!selected || !editor) return;
    setSaving(true);
    const body_html = editor.getHTML();
    try {
      await api.put(`/email-templates/${selected.slug}`, { subject, body_html });
      setSavedSlug(selected.slug);
      setDirty(false);
      setTemplates((prev) =>
        prev.map((t) => (t.slug === selected.slug ? { ...t, subject, body_html } : t))
      );
      setSelected((t) => ({ ...t, subject, body_html }));
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
      setSubject(def.subject);
      editor?.commands.setContent(def.body_html || "");
      setSelected((t) => ({ ...t, ...def }));
      setDirty(false);
      setSavedSlug(null);
    } catch {
      alert("Erreur lors de la réinitialisation.");
    }
  }

  function insertVariable(v) {
    editor?.chain().focus().insertContent(v).run();
  }

  function setLink() {
    const url = window.prompt("URL du lien :", "https://");
    if (!url) return;
    if (url === "") { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  const canSave = dirty || subject !== (selected?.subject || "");

  return (
    <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[520px]">
      {/* sidebar */}
      <div className="w-64 flex-shrink-0 space-y-1">
        {templates.map((tpl) => (
          <button
            key={tpl.slug}
            onClick={() => loadTemplate(tpl)}
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
              <button onClick={reset} className="btn-ghost border text-sm px-3" title="Remettre aux valeurs par défaut">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={save}
                disabled={saving || !canSave}
                className="btn-primary text-sm px-4 disabled:opacity-50"
              >
                {saving ? "Sauvegarde..." : savedSlug === selected.slug && !canSave ? (
                  <span className="flex items-center gap-1"><Check className="w-4 h-4" /> Sauvegardé</span>
                ) : (
                  <span className="flex items-center gap-1"><Save className="w-4 h-4" /> Sauvegarder</span>
                )}
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {previewMode ? (
              <div className="flex-1 flex flex-col">
                <div className="bg-slate-50 px-6 py-2 text-xs text-slate-500 border-b border-slate-100">
                  Objet : <strong>{subject}</strong>
                </div>
                <iframe
                  srcDoc={editor?.getHTML() || ""}
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
                    value={subject}
                    onChange={(e) => { setSubject(e.target.value); setDirty(true); }}
                  />
                </div>

                {/* formatting toolbar */}
                <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center gap-0.5 flex-wrap">
                  {/* heading */}
                  <select
                    className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 mr-1"
                    value={
                      editor?.isActive("heading", { level: 1 }) ? "h1" :
                      editor?.isActive("heading", { level: 2 }) ? "h2" :
                      editor?.isActive("heading", { level: 3 }) ? "h3" : "p"
                    }
                    onChange={(e) => {
                      if (e.target.value === "p") editor?.chain().focus().setParagraph().run();
                      else editor?.chain().focus().setHeading({ level: parseInt(e.target.value.slice(1)) }).run();
                    }}
                  >
                    <option value="p">Paragraphe</option>
                    <option value="h1">Titre 1</option>
                    <option value="h2">Titre 2</option>
                    <option value="h3">Titre 3</option>
                  </select>

                  <Divider />

                  <TBtn active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()} title="Gras (Ctrl+B)">
                    <Bold className="w-4 h-4" />
                  </TBtn>
                  <TBtn active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italique (Ctrl+I)">
                    <Italic className="w-4 h-4" />
                  </TBtn>
                  <TBtn active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Souligné (Ctrl+U)">
                    <UnderlineIcon className="w-4 h-4" />
                  </TBtn>
                  <TBtn active={editor?.isActive("strike")} onClick={() => editor?.chain().focus().toggleStrike().run()} title="Barré">
                    <Strikethrough className="w-4 h-4" />
                  </TBtn>

                  <Divider />

                  {/* text color */}
                  <label className="relative p-1.5 rounded hover:bg-slate-100 cursor-pointer" title="Couleur du texte">
                    <Palette className="w-4 h-4 text-slate-600" />
                    <input
                      type="color"
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                      onInput={(e) => editor?.chain().focus().setColor(e.target.value).run()}
                    />
                  </label>

                  <Divider />

                  <TBtn active={editor?.isActive({ textAlign: "left" })} onClick={() => editor?.chain().focus().setTextAlign("left").run()} title="Aligner à gauche">
                    <AlignLeft className="w-4 h-4" />
                  </TBtn>
                  <TBtn active={editor?.isActive({ textAlign: "center" })} onClick={() => editor?.chain().focus().setTextAlign("center").run()} title="Centrer">
                    <AlignCenter className="w-4 h-4" />
                  </TBtn>
                  <TBtn active={editor?.isActive({ textAlign: "right" })} onClick={() => editor?.chain().focus().setTextAlign("right").run()} title="Aligner à droite">
                    <AlignRight className="w-4 h-4" />
                  </TBtn>
                  <TBtn active={editor?.isActive({ textAlign: "justify" })} onClick={() => editor?.chain().focus().setTextAlign("justify").run()} title="Justifier">
                    <AlignJustify className="w-4 h-4" />
                  </TBtn>

                  <Divider />

                  <TBtn active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Liste à puces">
                    <List className="w-4 h-4" />
                  </TBtn>
                  <TBtn active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Liste numérotée">
                    <ListOrdered className="w-4 h-4" />
                  </TBtn>

                  <Divider />

                  <TBtn active={editor?.isActive("link")} onClick={setLink} title="Insérer un lien">
                    <LinkIcon className="w-4 h-4" />
                  </TBtn>

                  {/* variables */}
                  {(selected.variables || []).length > 0 && (
                    <>
                      <Divider />
                      <span className="text-xs text-slate-400 mx-1 whitespace-nowrap">Insérer :</span>
                      {(selected.variables || []).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); insertVariable(v); }}
                          className="font-mono text-xs bg-orange-50 border border-orange-200 text-orange-600 rounded px-2 py-0.5 hover:bg-orange-100 transition-colors mx-0.5"
                        >
                          {v}
                        </button>
                      ))}
                    </>
                  )}
                </div>

                {/* editor content */}
                <div className="flex-1 overflow-y-auto rich-editor">
                  <EditorContent editor={editor} className="h-full" />
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
