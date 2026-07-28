import { useEffect, useState, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Underline } from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import {
  Plus, Mail, MessageSquare, Calendar, ShieldAlert, Zap,
  Save, RotateCcw, Check, ChevronRight, ChevronDown,
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link as LinkIcon,
  Palette, Highlighter, Image as ImageIcon, Upload,
  Undo2, Redo2, RemoveFormatting, Minus, Quote,
  Superscript as SuperscriptIcon, Subscript as SubscriptIcon,
  Table as TableIcon, Columns2, Rows3, Trash2, LayoutGrid,
} from "lucide-react";
import api from "../api";
import { useAuth } from "../auth/useAuth";

/* ── TextStyle étendu : taille + famille de police ─────────── */
const RichTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: el => el.style.fontSize || null,
        renderHTML: ({ fontSize }) => fontSize ? { style: `font-size:${fontSize}` } : {},
      },
      fontFamily: {
        default: null,
        parseHTML: el => el.style.fontFamily || null,
        renderHTML: ({ fontFamily }) => fontFamily ? { style: `font-family:${fontFamily}` } : {},
      },
    };
  },
});

/* ── Blocs pré-construits (formes) ──────────────────────────── */
const BLOCS = [
  {
    label: "Bouton orange",
    icon: "🟠",
    html: `<p style="text-align:center"><a href="#" style="background:#FF7900;color:#fff;padding:12px 28px;border-radius:5px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;font-family:Arial,sans-serif">Cliquez ici</a></p>`,
  },
  {
    label: "Bandeau titre",
    icon: "🟧",
    html: `<div style="background:#FF7900;padding:18px 24px;border-radius:6px;color:#fff;font-family:Arial,sans-serif"><strong style="font-size:18px">Titre du bandeau</strong></div>`,
  },
  {
    label: "Boîte information",
    icon: "🔵",
    html: `<div style="background:#EFF6FF;border-left:4px solid #3B82F6;padding:14px 18px;border-radius:0 6px 6px 0;font-family:Arial,sans-serif;color:#1E3A5F"><strong>ℹ️ Information</strong><br/>Ajoutez votre message ici.</div>`,
  },
  {
    label: "Boîte alerte",
    icon: "🟡",
    html: `<div style="background:#FFFBEB;border-left:4px solid #F59E0B;padding:14px 18px;border-radius:0 6px 6px 0;font-family:Arial,sans-serif;color:#78350F"><strong>⚠️ Attention</strong><br/>Message d'avertissement ici.</div>`,
  },
  {
    label: "Boîte succès",
    icon: "🟢",
    html: `<div style="background:#F0FDF4;border-left:4px solid #22C55E;padding:14px 18px;border-radius:0 6px 6px 0;font-family:Arial,sans-serif;color:#14532D"><strong>✅ Succès</strong><br/>Opération réussie.</div>`,
  },
  {
    label: "Carte avec bordure",
    icon: "⬜",
    html: `<div style="border:1px solid #E2E8F0;border-radius:8px;padding:20px 24px;font-family:Arial,sans-serif;background:#fff"><strong style="font-size:16px;color:#0F172A">Titre de la carte</strong><p style="color:#64748B;margin-top:8px">Contenu de la carte. Modifiez ce texte selon vos besoins.</p></div>`,
  },
  {
    label: "En-tête email",
    icon: "📧",
    html: `<div style="background:#0F172A;padding:24px;text-align:center;border-radius:6px 6px 0 0"><img src="" alt="Logo" style="height:40px" /><p style="color:#FF7900;font-family:Arial,sans-serif;font-weight:700;font-size:18px;margin:8px 0 0">Orange Digital Center</p></div>`,
  },
  {
    label: "Signature",
    icon: "✍️",
    html: `<div style="border-top:2px solid #FF7900;padding-top:14px;margin-top:24px;font-family:Arial,sans-serif;color:#64748B;font-size:13px"><strong style="color:#0F172A">L'équipe Inside ODC</strong><br/>Orange Digital Center<br/><a href="#" style="color:#FF7900">inside-odc.vercel.app</a></div>`,
  },
];

const FONTS = [
  { label: "Défaut", value: "" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Impact", value: "Impact, sans-serif" },
];

const FONT_SIZES = ["10px","11px","12px","13px","14px","16px","18px","20px","24px","28px","32px","36px","48px","64px"];

/* ── Composants barre d'outils ──────────────────────────────── */
function TBtn({ active, onClick, title, disabled, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); if (!disabled) onClick(); }}
      title={title}
      disabled={disabled}
      className={`p-1.5 rounded transition-colors disabled:opacity-30 ${
        active ? "bg-orange-100 text-orange-600" : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-5 bg-slate-200 mx-0.5 self-center flex-shrink-0" />;
}

/* Dropdown "Blocs / Formes" */
function BlocsDropdown({ onInsert }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setOpen(v => !v); }}
        title="Insérer un bloc / forme"
        className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        Blocs
        <ChevronDown className="w-3 h-3 opacity-50" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 overflow-hidden">
          {BLOCS.map((b) => (
            <button
              key={b.label}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onInsert(b.html); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-orange-50 hover:text-orange-700 flex items-center gap-2 transition-colors"
            >
              <span>{b.icon}</span> {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── TemplatesTab ───────────────────────────────────────────── */
function TemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [subject, setSubject] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedSlug, setSavedSlug] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [dirty, setDirty] = useState(false);
  const imgInputRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      RichTextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: false, allowBase64: true }),
      Subscript,
      Superscript,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: "",
    onUpdate: () => { setDirty(true); setSavedSlug(null); },
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
      setTemplates(prev => prev.map(t => t.slug === selected.slug ? { ...t, subject, body_html } : t));
      setSelected(t => ({ ...t, subject, body_html }));
    } catch { alert("Erreur lors de la sauvegarde."); }
    setSaving(false);
  }

  async function reset() {
    if (!selected) return;
    if (!window.confirm("Remettre ce template aux valeurs par défaut ?")) return;
    try {
      const res = await api.delete(`/email-templates/${selected.slug}/reset`);
      const def = res.data.template;
      setTemplates(prev => prev.map(t => t.slug === selected.slug ? { ...t, ...def } : t));
      setSubject(def.subject);
      editor?.commands.setContent(def.body_html || "");
      setSelected(t => ({ ...t, ...def }));
      setDirty(false);
      setSavedSlug(null);
    } catch { alert("Erreur lors de la réinitialisation."); }
  }

  /* ── Actions éditeur ── */
  function insertVariable(v) { editor?.chain().focus().insertContent(v).run(); }

  function setLink() {
    const prev = editor?.getAttributes("link").href || "";
    const url = window.prompt("URL du lien :", prev || "https://");
    if (url === null) return;
    if (!url) { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => editor?.chain().focus().setImage({ src: reader.result }).run();
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function insertBlock(html) {
    editor?.chain().focus().insertContent(html).run();
  }

  function setFontFamily(val) {
    if (!val) { editor?.chain().focus().setMark("textStyle", { fontFamily: null }).run(); return; }
    editor?.chain().focus().setMark("textStyle", { fontFamily: val }).run();
  }

  function setFontSize(val) {
    if (!val) { editor?.chain().focus().setMark("textStyle", { fontSize: null }).run(); return; }
    editor?.chain().focus().setMark("textStyle", { fontSize: val }).run();
  }

  const inTable = editor?.isActive("table");
  const curFont = editor?.getAttributes("textStyle")?.fontFamily || "";
  const curSize = editor?.getAttributes("textStyle")?.fontSize || "";
  const canSave = dirty || subject !== (selected?.subject || "");

  return (
    <div className="flex gap-4 h-[calc(100vh-200px)] min-h-[560px]">
      {/* ── sidebar ── */}
      <div className="w-56 flex-shrink-0 space-y-1">
        {templates.map((tpl) => (
          <button key={tpl.slug} onClick={() => loadTemplate(tpl)}
            className={`w-full text-left rounded-xl px-4 py-3 transition-colors flex items-center justify-between gap-2 ${
              selected?.slug === tpl.slug
                ? "bg-orange-50 border border-orange-200 text-orange-700"
                : "border border-transparent hover:bg-slate-50 text-slate-700"
            }`}>
            <p className="text-sm font-medium leading-tight">{tpl.label}</p>
            {selected?.slug === tpl.slug && <ChevronRight className="w-4 h-4 flex-shrink-0" />}
          </button>
        ))}
      </div>

      {/* ── panneau éditeur ── */}
      {selected && (
        <div className="flex-1 card p-0 overflow-hidden flex flex-col">
          {/* header */}
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-800">{selected.label}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{selected.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPreviewMode(v => !v)}
                className={`btn-ghost border text-sm px-3 ${previewMode ? "bg-slate-100" : ""}`}>
                {previewMode ? "Éditeur" : "Aperçu"}
              </button>
              <button onClick={reset} className="btn-ghost border text-sm px-3" title="Réinitialiser">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={save} disabled={saving || !canSave} className="btn-primary text-sm px-4 disabled:opacity-50">
                {saving ? "Sauvegarde..." : savedSlug === selected.slug && !canSave
                  ? <span className="flex items-center gap-1"><Check className="w-4 h-4" /> Sauvegardé</span>
                  : <span className="flex items-center gap-1"><Save className="w-4 h-4" /> Sauvegarder</span>}
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {previewMode ? (
              <div className="flex-1 flex flex-col">
                <div className="bg-slate-50 px-5 py-2 text-xs text-slate-500 border-b border-slate-100">
                  Objet : <strong>{subject}</strong>
                </div>
                <iframe srcDoc={editor?.getHTML() || ""} sandbox="allow-same-origin"
                  title="Aperçu email" className="flex-1 w-full" style={{ border: "none", display: "block" }} />
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Objet */}
                <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-3">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Objet</label>
                  <input className="input flex-1 text-sm" value={subject}
                    onChange={e => { setSubject(e.target.value); setDirty(true); }} />
                </div>

                {/* ═══ BARRE D'OUTILS ═══ */}
                <div className="bg-slate-50 border-b border-slate-100 divide-y divide-slate-100">

                  {/* Ligne 1 : Annuler/Refaire | Police | Taille | Texte | Couleurs */}
                  <div className="px-2 py-1.5 flex items-center gap-0.5 flex-wrap">
                    <TBtn onClick={() => editor?.chain().focus().undo().run()} title="Annuler (Ctrl+Z)"><Undo2 className="w-4 h-4" /></TBtn>
                    <TBtn onClick={() => editor?.chain().focus().redo().run()} title="Rétablir (Ctrl+Y)"><Redo2 className="w-4 h-4" /></TBtn>
                    <Sep />

                    {/* Famille de police */}
                    <select className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 max-w-[130px]"
                      value={curFont} onChange={e => setFontFamily(e.target.value)}>
                      {FONTS.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
                    </select>

                    {/* Style paragraphe */}
                    <select className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 ml-1"
                      value={
                        editor?.isActive("heading", { level: 1 }) ? "h1" :
                        editor?.isActive("heading", { level: 2 }) ? "h2" :
                        editor?.isActive("heading", { level: 3 }) ? "h3" :
                        editor?.isActive("blockquote") ? "bq" : "p"
                      }
                      onChange={e => {
                        const v = e.target.value;
                        if (v === "p") editor?.chain().focus().setParagraph().run();
                        else if (v === "bq") editor?.chain().focus().toggleBlockquote().run();
                        else editor?.chain().focus().setHeading({ level: parseInt(v.slice(1)) }).run();
                      }}>
                      <option value="p">Paragraphe</option>
                      <option value="h1">Titre 1</option>
                      <option value="h2">Titre 2</option>
                      <option value="h3">Titre 3</option>
                      <option value="bq">Citation</option>
                    </select>

                    {/* Taille */}
                    <select className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 ml-1"
                      value={curSize} onChange={e => setFontSize(e.target.value || null)}>
                      <option value="">Taille</option>
                      {FONT_SIZES.map(s => <option key={s} value={s}>{s.replace("px","pt")}</option>)}
                    </select>
                    <Sep />

                    {/* Mise en forme */}
                    <TBtn active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()} title="Gras (Ctrl+B)"><Bold className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italique (Ctrl+I)"><Italic className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Souligné"><UnderlineIcon className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive("strike")} onClick={() => editor?.chain().focus().toggleStrike().run()} title="Barré"><Strikethrough className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive("subscript")} onClick={() => editor?.chain().focus().toggleSubscript().run()} title="Indice"><SubscriptIcon className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive("superscript")} onClick={() => editor?.chain().focus().toggleSuperscript().run()} title="Exposant"><SuperscriptIcon className="w-4 h-4" /></TBtn>
                    <Sep />

                    {/* Couleur texte */}
                    <label className="relative p-1.5 rounded hover:bg-slate-100 cursor-pointer" title="Couleur du texte">
                      <div className="flex flex-col items-center gap-0.5">
                        <Palette className="w-4 h-4 text-slate-600" />
                        <div className="w-4 h-1 rounded-sm" style={{ background: editor?.getAttributes("textStyle")?.color || "#000" }} />
                      </div>
                      <input type="color" className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        onInput={e => editor?.chain().focus().setColor(e.target.value).run()} />
                    </label>

                    {/* Surlignage */}
                    <label className="relative p-1.5 rounded hover:bg-slate-100 cursor-pointer" title="Surligner le texte">
                      <div className="flex flex-col items-center gap-0.5">
                        <Highlighter className="w-4 h-4 text-slate-600" />
                        <div className="w-4 h-1 rounded-sm" style={{ background: editor?.getAttributes("highlight")?.color || "#FFFF00" }} />
                      </div>
                      <input type="color" defaultValue="#FFFF00" className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        onInput={e => editor?.chain().focus().setHighlight({ color: e.target.value }).run()} />
                    </label>

                    <TBtn onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()} title="Effacer la mise en forme"><RemoveFormatting className="w-4 h-4" /></TBtn>
                  </div>

                  {/* Ligne 2 : Alignement | Listes | Insérer | Variables */}
                  <div className="px-2 py-1.5 flex items-center gap-0.5 flex-wrap">
                    {/* Alignement */}
                    <TBtn active={editor?.isActive({ textAlign: "left" })} onClick={() => editor?.chain().focus().setTextAlign("left").run()} title="Gauche"><AlignLeft className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive({ textAlign: "center" })} onClick={() => editor?.chain().focus().setTextAlign("center").run()} title="Centrer"><AlignCenter className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive({ textAlign: "right" })} onClick={() => editor?.chain().focus().setTextAlign("right").run()} title="Droite"><AlignRight className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive({ textAlign: "justify" })} onClick={() => editor?.chain().focus().setTextAlign("justify").run()} title="Justifier"><AlignJustify className="w-4 h-4" /></TBtn>
                    <Sep />

                    {/* Listes / Citation / HR */}
                    <TBtn active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Liste à puces"><List className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Liste numérotée"><ListOrdered className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()} title="Citation"><Quote className="w-4 h-4" /></TBtn>
                    <TBtn onClick={() => editor?.chain().focus().setHorizontalRule().run()} title="Ligne de séparation"><Minus className="w-4 h-4" /></TBtn>
                    <Sep />

                    {/* Lien */}
                    <TBtn active={editor?.isActive("link")} onClick={setLink} title="Insérer / modifier un lien"><LinkIcon className="w-4 h-4" /></TBtn>

                    {/* Image upload */}
                    <label className="p-1.5 rounded text-slate-600 hover:bg-slate-100 hover:text-slate-800 cursor-pointer transition-colors" title="Insérer une image (depuis votre ordinateur)">
                      <Upload className="w-4 h-4" />
                      <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>

                    {/* Image URL */}
                    <TBtn onClick={() => {
                      const url = window.prompt("URL de l'image :");
                      if (url) editor?.chain().focus().setImage({ src: url }).run();
                    }} title="Insérer une image (URL)">
                      <ImageIcon className="w-4 h-4" />
                    </TBtn>

                    {/* Tableau */}
                    <TBtn onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insérer un tableau">
                      <TableIcon className="w-4 h-4" />
                    </TBtn>

                    {/* Blocs / Formes */}
                    <BlocsDropdown onInsert={insertBlock} />

                    {/* Contrôles tableau (contextuel) */}
                    {inTable && (
                      <>
                        <Sep />
                        <TBtn onClick={() => editor?.chain().focus().addColumnAfter().run()} title="Ajouter une colonne"><Columns2 className="w-4 h-4" /></TBtn>
                        <TBtn onClick={() => editor?.chain().focus().addRowAfter().run()} title="Ajouter une ligne"><Rows3 className="w-4 h-4" /></TBtn>
                        <TBtn onClick={() => editor?.chain().focus().deleteTable().run()} title="Supprimer le tableau"><Trash2 className="w-4 h-4 text-red-400" /></TBtn>
                      </>
                    )}

                    {/* Variables */}
                    {(selected.variables || []).length > 0 && (
                      <>
                        <Sep />
                        <span className="text-xs text-slate-400 whitespace-nowrap px-1">Insérer :</span>
                        {(selected.variables || []).map(v => (
                          <button key={v} type="button"
                            onMouseDown={e => { e.preventDefault(); insertVariable(v); }}
                            className="font-mono text-xs bg-orange-50 border border-orange-200 text-orange-600 rounded px-2 py-0.5 hover:bg-orange-100 transition-colors mx-0.5">
                            {v}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {/* Zone d'édition */}
                <div className="flex-1 overflow-y-auto rich-editor bg-white">
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
  const [form, setForm] = useState({ name: "", type: "email", message: "" });

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="card p-8 text-center max-w-md">
          <ShieldAlert className="mx-auto mb-4 text-orange-500" size={40} />
          <h2 className="text-xl font-semibold mb-2">Accès restreint</h2>
          <p className="text-slate-500">Cette page est réservée aux administrateurs.</p>
        </div>
      </div>
    );
  }

  const fetchCampagnes = async () => {
    try { const res = await api.get("/campagnes"); setCampagnes(res.data); }
    catch (err) { console.error("Erreur chargement campagnes", err); }
  };

  useEffect(() => { fetchCampagnes(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/campagnes", form);
      fetchCampagnes();
      setForm({ name: "", type: "email", message: "" });
      setIsOpen(false);
    } catch (err) { console.error("Erreur création campagne", err); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Campagnes</h1>
          <p className="page-subtitle">Campagnes de communication et templates d'emails automatiques</p>
        </div>
        {tab === "campagnes" && (
          <button onClick={() => setIsOpen(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Nouvelle campagne
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: "campagnes", icon: <Mail className="w-4 h-4" />, label: "Campagnes" },
          { key: "templates", icon: <Zap className="w-4 h-4" />, label: "Templates automatiques" },
        ].map(({ key, icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? "border-orange-500 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            <span className="flex items-center gap-2">{icon}{label}</span>
          </button>
        ))}
      </div>

      {tab === "templates" ? <TemplatesTab /> : (
        <>
          {isOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
              <div className="card-solid w-full max-w-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Nouvelle campagne</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Nom de la campagne</label>
                    <input required className="input mt-1" value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Type de campagne</label>
                    <select className="select mt-1" value={form.type}
                      onChange={e => setForm({ ...form, type: e.target.value })}>
                      <option value="email">Email</option>
                      <option value="sms">SMS</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Message</label>
                    <textarea required rows="4" className="input mt-1" value={form.message}
                      onChange={e => setForm({ ...form, message: e.target.value })} />
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={() => setIsOpen(false)} className="btn-ghost border">Annuler</button>
                    <button type="submit" className="btn-primary">Créer</button>
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
                {campagnes.map(c => (
                  <tr key={c.id} className="table-row">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3">
                      {c.type === "email"
                        ? <span className="flex items-center gap-1 text-blue-600"><Mail className="w-4 h-4" /> Email</span>
                        : <span className="flex items-center gap-1 text-green-600"><MessageSquare className="w-4 h-4" /> SMS</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 truncate max-w-xs">{c.message}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{c.created_at || c.date}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${c.status === "envoyee" ? "bg-green-100 text-green-700" : c.status === "programmee" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"}`}>
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
