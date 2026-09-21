import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
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
  Send, Eye, X, Loader2, Pencil, Users,
  Square, Play, ListChecks, AlertTriangle, BellOff, Award,
} from "lucide-react";
import api from "../api";
import DeliverabilitePanel from "../components/DeliverabilitePanel";
import { useToast, useConfirm, EmptyState } from "../components/ui";
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
    html: `<div style="background:#0F172A;padding:24px;text-align:center;border-radius:6px 6px 0 0"><img src="" alt="Logo" style="height:40px" /><p style="color:#FF7900;font-family:Arial,sans-serif;font-weight:700;font-size:18px;margin:8px 0 0">Inside ODC</p></div>`,
  },
  {
    label: "Signature",
    icon: "✍️",
    /* Le lien portait « inside-odc.vercel.app » sur un href vide : l'adresse
       affichée n'était pas cliquable, et elle désigne désormais l'ancien
       domaine. Les deux pointent sur le domaine du centre. */
    html: `<div style="border-top:2px solid #FF7900;padding-top:14px;margin-top:24px;font-family:Arial,sans-serif;color:#64748B;font-size:13px"><strong style="color:#0F172A">L'équipe Inside ODC</strong><br/>Inside ODC Sénégal<br/><a href="https://inside-odc.com" style="color:#FF7900">inside-odc.com</a></div>`,
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

/* ── CampaignModal ──────────────────────────────────────────── */
const RECIPIENT_OPTIONS = [
  { value: "all_participants", label: "Tous les participants", desc: "Participants avec email enregistré" },
  { value: "all_partners",    label: "Tous les partenaires",  desc: "Partenaires avec email enregistré" },
  { value: "by_activity",     label: "Par activité",           desc: "Participants d'une activité spécifique" },
  { value: "custom",          label: "Emails personnalisés",   desc: "Saisir les adresses manuellement" },
];

/* Le mode « Cc » a été retiré : il exposait l'adresse de chaque destinataire à
   tous les autres — y compris celles d'enfants sur les activités Kids Tech. */
const SEND_MODE_OPTIONS = [
  {
    value: "publipostage",
    label: "Publipostage",
    desc: "Un email par personne. Permet {{nom}} et {{prenom}} dans l'objet et le message.",
  },
  {
    value: "bcc",
    label: "Cci — copie cachée",
    desc: "Un seul envoi, destinataires invisibles entre eux. Aucune personnalisation, et une seule adresse invalide fait échouer tout le lot.",
  },
];

function CampaignModal({ campaign, activities, onClose, onSaved }) {
  const [name,           setName]           = useState(campaign?.name || "");
  const [subject,        setSubject]        = useState(campaign?.subject || "");
  const [recipientsType, setRecipientsType] = useState(campaign?.recipients_type || "all_participants");
  const [activityId,     setActivityId]     = useState(campaign?.activity_id ? String(campaign.activity_id) : "");
  const [customEmails,   setCustomEmails]   = useState(() => {
    try { return JSON.parse(campaign?.custom_emails || "[]").join("\n"); } catch { return ""; }
  });
  const [sendMode,     setSendMode]     = useState(campaign?.send_mode || "publipostage");
  const [saving,       setSaving]       = useState(false);
  const [previewMode,  setPreviewMode]  = useState(false);
  const imgRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit, Underline, RichTextStyle, Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: false, allowBase64: true }),
      Subscript, Superscript,
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
    ],
    content: campaign?.html_body || "",
  });

  function setLink() {
    const prev = editor?.getAttributes("link").href || "";
    const url = window.prompt("URL du lien :", prev || "https://");
    if (url === null) return;
    if (!url) { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }
  function handleImageUpload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => editor?.chain().focus().setImage({ src: reader.result }).run();
    reader.readAsDataURL(file);
    e.target.value = "";
  }
  function insertBlock(html) { editor?.chain().focus().insertContent(html).run(); }
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

  const validEmails = customEmails.split(/[\n,;]+/).filter(e => e.trim().includes("@")).length;

  async function save(andSend = false) {
    if (!name.trim())    { toast.warning("Le nom de la campagne est requis."); return; }
    if (!subject.trim()) { toast.warning("L'objet de l'email est requis."); return; }
    setSaving(true);
    try {
      const customEmailsJSON = JSON.stringify(
        customEmails.split(/[\n,;]+/).map(e => e.trim()).filter(e => e.includes("@"))
      );
      const body = {
        name: name.trim(), type: "email", message: "",
        subject: subject.trim(),
        html_body: editor?.getHTML() || "",
        recipients_type: recipientsType,
        activity_id: recipientsType === "by_activity" ? (activityId || null) : null,
        custom_emails: customEmailsJSON,
        send_mode: sendMode,
        status: "brouillon",
      };
      let savedId;
      if (campaign?.id) {
        await api.put(`/campagnes/${campaign.id}`, body);
        savedId = campaign.id;
      } else {
        const res = await api.post("/campagnes", body);
        savedId = res.data.id;
      }
      onSaved(savedId, andSend, name.trim());
    } catch (err) {
      toast.error(err?.response?.data?.error || "L'enregistrement a échoué.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-6xl" style={{ height: "94vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-slate-900">
              {campaign?.id ? "Modifier la campagne" : "Nouvelle campagne email"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Envoi via Brevo · Emailing</p>
          </div>
          <button onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body : 2 panneaux */}
        <div className="flex-1 flex overflow-hidden">

          {/* ── Panneau gauche : paramètres ── */}
          <div className="w-72 border-r border-slate-100 flex flex-col flex-shrink-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-5">

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nom de la campagne</label>
                <input className="input mt-1.5 text-sm" placeholder="Ex: Newsletter Juillet 2025"
                  value={name} onChange={e => setName(e.target.value)} />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Objet de l'email</label>
                <input className="input mt-1.5 text-sm" placeholder="Ex: Nos actualités du mois"
                  value={subject} onChange={e => setSubject(e.target.value)} />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
                  Destinataires
                </label>
                <div className="space-y-1.5">
                  {RECIPIENT_OPTIONS.map(opt => (
                    <label key={opt.value} className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                      recipientsType === opt.value
                        ? "border-orange-300 bg-orange-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}>
                      <input type="radio" name="rtype" value={opt.value}
                        checked={recipientsType === opt.value}
                        onChange={() => setRecipientsType(opt.value)}
                        className="accent-orange-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-800">{opt.label}</p>
                        <p className="text-xs text-slate-500 leading-tight mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {recipientsType === "by_activity" && (
                  <select className="select mt-2 text-sm" value={activityId}
                    onChange={e => setActivityId(e.target.value)}>
                    <option value="">— Sélectionner une activité —</option>
                    {activities.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                )}

                {recipientsType === "custom" && (
                  <div className="mt-2">
                    <label className="text-xs text-slate-500">Un email par ligne (ou séparés par virgule)</label>
                    <textarea
                      className="input mt-1 text-xs font-mono resize-none"
                      rows="5"
                      placeholder={"email1@exemple.com\nemail2@exemple.com"}
                      value={customEmails}
                      onChange={e => setCustomEmails(e.target.value)}
                    />
                    <p className="text-xs text-emerald-600 mt-1 font-medium">
                      {validEmails} adresse{validEmails !== 1 ? "s" : ""} valide{validEmails !== 1 ? "s" : ""}
                    </p>
                  </div>
                )}
              </div>

              {/* Mode d'envoi */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
                  Mode d'envoi
                </label>
                <div className="space-y-1.5">
                  {SEND_MODE_OPTIONS.map(opt => (
                    <label key={opt.value} className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                      sendMode === opt.value
                        ? "border-orange-300 bg-orange-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}>
                      <input type="radio" name="smode" value={opt.value}
                        checked={sendMode === opt.value}
                        onChange={() => setSendMode(opt.value)}
                        className="accent-orange-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-800">{opt.label}</p>
                        <p className="text-xs text-slate-500 leading-tight mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* ── Panneau droit : éditeur ── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <p className="text-xs text-slate-500">Corps de l'email (HTML)</p>
              <button onClick={() => setPreviewMode(v => !v)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  previewMode ? "bg-slate-100 border-slate-200 text-slate-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}>
                <Eye className="w-3.5 h-3.5" /> {previewMode ? "Éditeur" : "Aperçu"}
              </button>
            </div>

            {previewMode ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="bg-slate-50 px-4 py-1.5 text-xs text-slate-500 border-b border-slate-100 flex-shrink-0">
                  Objet : <strong>{subject || "(vide)"}</strong>
                </div>
                <iframe srcDoc={editor?.getHTML() || ""} sandbox="allow-same-origin"
                  title="Aperçu" className="flex-1 w-full" style={{ border: "none" }} />
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Barre d'outils */}
                <div className="bg-slate-50 border-b border-slate-100 divide-y divide-slate-100 flex-shrink-0">
                  {/* Ligne 1 */}
                  <div className="px-2 py-1.5 flex items-center gap-0.5 flex-wrap">
                    <TBtn onClick={() => editor?.chain().focus().undo().run()} title="Annuler"><Undo2 className="w-4 h-4" /></TBtn>
                    <TBtn onClick={() => editor?.chain().focus().redo().run()} title="Rétablir"><Redo2 className="w-4 h-4" /></TBtn>
                    <Sep />
                    <select className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 max-w-[130px]"
                      value={curFont} onChange={e => setFontFamily(e.target.value)}>
                      {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <select className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 ml-1"
                      value={editor?.isActive("heading",{level:1})?"h1":editor?.isActive("heading",{level:2})?"h2":editor?.isActive("heading",{level:3})?"h3":"p"}
                      onChange={e => {
                        const v = e.target.value;
                        if (v==="p") editor?.chain().focus().setParagraph().run();
                        else editor?.chain().focus().setHeading({ level: parseInt(v.slice(1)) }).run();
                      }}>
                      <option value="p">Paragraphe</option>
                      <option value="h1">Titre 1</option>
                      <option value="h2">Titre 2</option>
                      <option value="h3">Titre 3</option>
                    </select>
                    <select className="text-xs border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 ml-1"
                      value={curSize} onChange={e => setFontSize(e.target.value||null)}>
                      <option value="">Taille</option>
                      {FONT_SIZES.map(s => <option key={s} value={s}>{s.replace("px","pt")}</option>)}
                    </select>
                    <Sep />
                    <TBtn active={editor?.isActive("bold")}      onClick={() => editor?.chain().focus().toggleBold().run()}      title="Gras"><Bold className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive("italic")}    onClick={() => editor?.chain().focus().toggleItalic().run()}    title="Italique"><Italic className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Souligné"><UnderlineIcon className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive("strike")}    onClick={() => editor?.chain().focus().toggleStrike().run()}    title="Barré"><Strikethrough className="w-4 h-4" /></TBtn>
                    <Sep />
                    <label className="relative p-1.5 rounded hover:bg-slate-100 cursor-pointer" title="Couleur texte">
                      <div className="flex flex-col items-center gap-0.5">
                        <Palette className="w-4 h-4 text-slate-600" />
                        <div className="w-4 h-1 rounded-sm" style={{ background: editor?.getAttributes("textStyle")?.color || "#000" }} />
                      </div>
                      <input type="color" className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        onInput={e => editor?.chain().focus().setColor(e.target.value).run()} />
                    </label>
                    <TBtn onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()} title="Effacer mise en forme"><RemoveFormatting className="w-4 h-4" /></TBtn>
                  </div>
                  {/* Ligne 2 */}
                  <div className="px-2 py-1.5 flex items-center gap-0.5 flex-wrap">
                    <TBtn active={editor?.isActive({textAlign:"left"})}    onClick={() => editor?.chain().focus().setTextAlign("left").run()}    title="Gauche"><AlignLeft className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive({textAlign:"center"})}  onClick={() => editor?.chain().focus().setTextAlign("center").run()}  title="Centrer"><AlignCenter className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive({textAlign:"right"})}   onClick={() => editor?.chain().focus().setTextAlign("right").run()}   title="Droite"><AlignRight className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive({textAlign:"justify"})} onClick={() => editor?.chain().focus().setTextAlign("justify").run()} title="Justifier"><AlignJustify className="w-4 h-4" /></TBtn>
                    <Sep />
                    <TBtn active={editor?.isActive("bulletList")}  onClick={() => editor?.chain().focus().toggleBulletList().run()}  title="Liste à puces"><List className="w-4 h-4" /></TBtn>
                    <TBtn active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Liste numérotée"><ListOrdered className="w-4 h-4" /></TBtn>
                    <TBtn onClick={() => editor?.chain().focus().setHorizontalRule().run()} title="Séparateur"><Minus className="w-4 h-4" /></TBtn>
                    <Sep />
                    <TBtn active={editor?.isActive("link")} onClick={setLink} title="Lien"><LinkIcon className="w-4 h-4" /></TBtn>
                    <label className="p-1.5 rounded text-slate-600 hover:bg-slate-100 cursor-pointer" title="Image (fichier)">
                      <Upload className="w-4 h-4" />
                      <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                    <TBtn onClick={() => { const u=window.prompt("URL image :"); if(u) editor?.chain().focus().setImage({src:u}).run(); }} title="Image (URL)"><ImageIcon className="w-4 h-4" /></TBtn>
                    <BlocsDropdown onInsert={insertBlock} />
                    {inTable && (
                      <>
                        <Sep />
                        <TBtn onClick={() => editor?.chain().focus().addColumnAfter().run()} title="Ajouter colonne"><Columns2 className="w-4 h-4" /></TBtn>
                        <TBtn onClick={() => editor?.chain().focus().addRowAfter().run()}    title="Ajouter ligne"><Rows3 className="w-4 h-4" /></TBtn>
                        <TBtn onClick={() => editor?.chain().focus().deleteTable().run()}    title="Supprimer tableau"><Trash2 className="w-4 h-4 text-red-400" /></TBtn>
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

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClose} className="btn-ghost border">Annuler</button>
          <div className="flex items-center gap-2">
            <button onClick={() => save(false)} disabled={saving}
              className="btn-ghost border flex items-center gap-2 disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving ? "Sauvegarde..." : "Sauvegarder brouillon"}
            </button>
            <button onClick={() => save(true)} disabled={saving}
              className="btn-primary flex items-center gap-2 disabled:opacity-50">
              <Send className="w-4 h-4" />
              Sauvegarder & Envoyer
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
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
    } catch { toast.error("L'enregistrement a échoué."); }
    setSaving(false);
  }

  async function reset() {
    if (!selected) return;
    const ok = await confirm({
      title: "Réinitialiser ce modèle ?",
      body: "Vos modifications seront remplacées par le contenu par défaut.",
      confirmLabel: "Réinitialiser",
    });
    if (!ok) return;
    try {
      const res = await api.delete(`/email-templates/${selected.slug}/reset`);
      const def = res.data.template;
      setTemplates(prev => prev.map(t => t.slug === selected.slug ? { ...t, ...def } : t));
      setSubject(def.subject);
      editor?.commands.setContent(def.body_html || "");
      setSelected(t => ({ ...t, ...def }));
      setDirty(false);
      setSavedSlug(null);
    } catch { toast.error("La réinitialisation a échoué."); }
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
              <p className="text-xs text-slate-500 mt-0.5">{selected.description}</p>
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
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Objet</label>
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
                        <span className="text-xs text-slate-500 whitespace-nowrap px-1">Insérer :</span>
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

/* ── Suivi d'un envoi ─────────────────────────────────────────
   L'envoi ne tient plus dans la requête : il continue côté serveur, cadencé.
   Cette fenêtre est la seule façon de savoir où il en est — et, quand un
   message n'arrive pas, de savoir lequel et pourquoi. */
function SuiviEnvoi({ campagneId, onFerme, onChange }) {
  const [data, setData]   = useState(null);
  const [erreur, setErreur] = useState("");
  const [action, setAction] = useState(false);
  const [toutVoir, setToutVoir] = useState(false);

  const charger = useCallback(async () => {
    try {
      const res = await api.get(`/campagnes/${campagneId}/envois`);
      setData(res.data);
      return res.data;
    } catch (err) {
      /* « Route introuvable » est la réponse du serveur quand il ne connaît
         pas l'adresse appelée : le code déployé est antérieur à celui du
         site. Le dire, plutôt que de répéter le message brut. */
      setErreur(
        err?.response?.status === 404
          ? "Le serveur exécute une version antérieure, qui ne connaît pas encore le journal d'envoi. Attendez la fin du déploiement de l'API."
          : err?.response?.data?.error || "Suivi indisponible."
      );
      return null;
    }
  }, [campagneId]);

  useEffect(() => {
    let vivant = true;
    let minuteur;
    const boucle = async () => {
      const d = await charger();
      if (!vivant) return;
      /* On ne sonde que tant qu'il reste quelque chose à envoyer : une
         campagne terminée n'a plus rien à dire. */
      if (d && (d.en_cours || d.compte.en_attente > 0)) minuteur = setTimeout(boucle, 3000);
      else onChange?.();
    };
    boucle();
    return () => { vivant = false; clearTimeout(minuteur); };
  }, [charger, onChange]);

  const agir = async (chemin) => {
    setAction(true);
    try {
      await api.post(`/campagnes/${campagneId}/${chemin}`);
      await charger();
      onChange?.();
    } catch (err) {
      setErreur(err?.response?.data?.error || "Action impossible.");
    } finally {
      setAction(false);
    }
  };

  const c = data?.compte;
  const traites = c ? c.envoye + c.echec + c.desabonne + (c.injoignable || 0) : 0;
  const pourcent = c && c.total ? Math.round((traites / c.total) * 100) : 0;
  const enCours = Boolean(data?.en_cours || (c && c.en_attente > 0));
  /* Les adresses injoignables paraissent avec les échecs : elles demandent la
     même chose — une correction — et les cacher derrière « tout voir »
     reviendrait à les taire. */
  const echecs = (data?.envois || []).filter((e) => e.statut === "echec" || e.statut === "injoignable");
  const lignes = toutVoir ? data?.envois || [] : echecs;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-start gap-3 p-6 pb-4">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            {enCours ? <Loader2 className="w-5 h-5 text-orange-600 animate-spin" /> : <ListChecks className="w-5 h-5 text-orange-600" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900">
              {enCours ? "Envoi en cours" : "Journal d'envoi"}
            </h3>
            <p className="text-sm text-slate-500 truncate">{data?.campagne?.name || "…"}</p>
          </div>
          <button onClick={onFerme} className="text-slate-400 hover:text-slate-600" title="Fermer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {erreur && <p className="mx-6 mb-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{erreur}</p>}

        {c && (
          <div className="px-6 pb-4 space-y-4">
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>{traites} traités sur {c.total}</span>
                <span>{pourcent} %</span>
              </div>
              {/* Une barre d'une seule couleur dirait « 100 % » d'un envoi
                  entièrement raté. Chaque issue a la sienne. */}
              <div className="flex h-2 rounded-full bg-slate-100 overflow-hidden">
                {[
                  ["bg-green-500", c.envoye],
                  ["bg-red-500", c.echec],
                  ["bg-amber-400", c.desabonne],
                  ["bg-slate-400", c.injoignable],
                ].map(([couleur, n]) =>
                  n ? (
                    <div
                      key={couleur}
                      className={`h-full ${couleur} transition-all duration-500`}
                      style={{ width: `${c.total ? (n / c.total) * 100 : 0}%` }}
                    />
                  ) : null
                )}
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2 text-center">
              <div className="rounded-xl border border-green-200 bg-green-50 p-2.5">
                <p className="text-lg font-semibold text-green-700">{c.envoye}</p>
                <p className="text-[11px] text-green-600">Envoyés</p>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 p-2.5">
                <p className="text-lg font-semibold text-red-700">{c.echec}</p>
                <p className="text-[11px] text-red-600">Échecs</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-2.5">
                <p className="text-lg font-semibold text-slate-700">{c.en_attente}</p>
                <p className="text-[11px] text-slate-500">En attente</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                <p className="text-lg font-semibold text-amber-800">{c.desabonne}</p>
                <p className="text-[11px] text-amber-700">Désabonnés</p>
              </div>
              <div className="rounded-xl border border-slate-300 bg-slate-50 p-2.5">
                <p className="text-lg font-semibold text-slate-700">{c.injoignable || 0}</p>
                <p className="text-[11px] text-slate-600">Injoignables</p>
              </div>
            </div>

            {/* Ces adresses n'ont jamais été présentées au service d'envoi.
                C'est délibéré : un rebond compte contre le compte
                d'expédition, et c'est ce qui l'a fait suspendre deux fois. */}
            {c.injoignable > 0 && (
              <p className="flex items-start gap-2 text-xs text-slate-600">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-500" />
                <span>
                  {c.injoignable} adresse{c.injoignable > 1 ? "s" : ""} écartée{c.injoignable > 1 ? "s" : ""} avant
                  l&apos;envoi : domaine inexistant ou adresse mal formée. Elles n&apos;ont pas été
                  soumises au service d&apos;envoi — un rebond nuit à la réputation du compte.
                  Corrigez-les dans Participants.
                </span>
              </p>
            )}

            {c.desabonne > 0 && (
              <p className="flex items-start gap-2 text-xs text-slate-600">
                <BellOff className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
                <span>
                  {c.desabonne} personne{c.desabonne > 1 ? "s se sont désabonnées" : " s'est désabonnée"} et
                  n&apos;{c.desabonne > 1 ? "ont" : "a"} donc pas été sollicitée{c.desabonne > 1 ? "s" : ""}.
                </span>
              </p>
            )}

            {data?.campagne?.last_error && (
              <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>L&apos;envoi s&apos;est interrompu : {data.campagne.last_error}</span>
              </p>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto border-t border-slate-200 px-6 py-4">
          {!data ? (
            <p className="text-sm text-slate-400">Chargement…</p>
          ) : lignes.length === 0 ? (
            <p className="text-sm text-slate-500">
              {toutVoir ? "Aucun destinataire." : "Aucun échec à signaler."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lignes.map((e) => (
                <li key={e.email} className="py-2 flex items-start gap-3 text-sm">
                  <span
                    className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${
                      e.statut === "envoye" ? "bg-green-500"
                      : e.statut === "echec" ? "bg-red-500"
                      : e.statut === "desabonne" ? "bg-amber-500"
                      : e.statut === "injoignable" ? "bg-slate-400" : "bg-slate-300"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-slate-800">{e.nom || e.email}</p>
                    <p className="truncate text-xs text-slate-500">{e.email}</p>
                    {e.erreur && <p className="text-xs text-red-600 mt-0.5 break-words">{e.erreur}</p>}
                  </div>
                  <span className="text-[11px] text-slate-400 flex-shrink-0">
                    {e.traite_le ? new Date(e.traite_le).toLocaleTimeString("fr-FR") : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-4">
          <button onClick={() => setToutVoir((v) => !v)} className="btn-ghost border text-xs">
            {toutVoir ? "N'afficher que les échecs" : "Voir tous les destinataires"}
          </button>
          <div className="flex items-center gap-2">
            {enCours ? (
              <button onClick={() => agir("stop")} disabled={action} className="btn-ghost border text-xs">
                <Square className="w-3.5 h-3.5" /> Arrêter
              </button>
            ) : (c && (c.en_attente > 0 || c.echec > 0)) ? (
              <button onClick={() => agir("reprendre")} disabled={action} className="btn-ghost border text-xs">
                <Play className="w-3.5 h-3.5" /> Reprendre les {c.en_attente + c.echec} restants
              </button>
            ) : null}
            <button onClick={onFerme} className="btn-primary text-sm">Fermer</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── Attestations ─────────────────────────────────────────────
   Le document porte trois mentions manuscrites : le nom, le module et la
   date. Les deux premières viennent de la base, mais l'intitulé d'une
   activité est écrit pour l'équipe — « Atelier IA - session 3 (reporté) » —
   et n'a rien à faire sur un document remis à un bénéficiaire. Il se
   réécrit donc ici, avant l'envoi, et l'aperçu tient compte de la
   correction. */
/* Le nom de famille se retrouve parfois écrit deux fois — « Rockaya Samb » en
   prénom, « Samb » en nom — et l'attestation l'imprime tel quel. Cela vient des
   feuilles de présence où chacun écrit son nom entier dans la case « Prénom » :
   l'import, lui, a fidèlement recopié ce qu'il a lu.
   La répétition se trouve en fin de prénom comme en tête, selon que la personne
   a écrit « Rockaya Samb » ou « Niang Khadidiatou ». */
function normaliserNom(v) {
  return String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function prenomSansNomRepete(prenom, nom) {
  const n = normaliserNom(nom);
  const mots = String(prenom || "").trim().split(/\s+/).filter(Boolean);
  if (!n || mots.length < 2) return null;
  if (normaliserNom(mots[mots.length - 1]) === n) return mots.slice(0, -1).join(" ");
  if (normaliserNom(mots[0]) === n) return mots.slice(1).join(" ");
  return null;
}

/**
 * Ou en est l'envoi des attestations pour une activite.
 *
 * Le denominateur est le nombre de personnes joignables, pas le nombre
 * d'inscrits : une personne sans adresse ne recevra jamais son attestation par
 * mail, et la compter ferait afficher « 18 / 24 » pour un envoi pourtant
 * termine — on chercherait indefiniment six envois qui ne partiront pas. Les
 * personnes sans adresse sont dites a part, parce qu'elles demandent autre
 * chose : recuperer leur adresse, ou leur remettre le document en main.
 */
function etatAttestations(a) {
  const envoyees = a.attestations_envoyees ?? 0;
  const joignables = a.participants_joignables ?? 0;
  const sansAdresse = Math.max(0, (a.participants_count ?? 0) - joignables);

  if (joignables === 0) {
    return { ton: "muet", texte: "aucune adresse email", envoyees, joignables, sansAdresse };
  }
  if (envoyees === 0) {
    return { ton: "attente", texte: `0 / ${joignables} envoyée${joignables > 1 ? "s" : ""}`, envoyees, joignables, sansAdresse };
  }
  if (envoyees >= joignables) {
    return { ton: "fait", texte: `${envoyees} / ${joignables} envoyée${envoyees > 1 ? "s" : ""}`, envoyees, joignables, sansAdresse };
  }
  return { ton: "partiel", texte: `${envoyees} / ${joignables} envoyées`, envoyees, joignables, sansAdresse };
}

const TONS_ATTESTATION = {
  fait: "bg-green-50 text-green-700 border-green-200",
  partiel: "bg-orange-50 text-orange-700 border-orange-200",
  attente: "bg-slate-50 text-slate-500 border-slate-200",
  muet: "bg-slate-50 text-slate-400 border-slate-200",
};

/**
 * Attestations, personne par personne.
 *
 * L'envoi par activite a un defaut qu'on ne voit jamais depuis une activite,
 * parce qu'il ne s'y manifeste pas : quelqu'un qui suit deux fois la meme
 * formation — « Bureautique avancee » un vendredi, puis quinze jours plus tard
 * — recoit deux fois la meme attestation, a deux dates. Chaque activite, prise
 * seule, a raison ; c'est l'ensemble qui est faux.
 *
 * Ici ses modules tiennent sur un ecran : la repetition saute aux yeux, on
 * coche ce qu'elle recoit, et tout part dans un seul message.
 */
/**
 * Deux facons d'envoyer, et elles ne servent pas la meme chose.
 *
 * Par personne : on voit tout son parcours, on choisit ce qu'elle recoit, tout
 * part en un seul message. C'est la seule vue ou l'on s'apercoit qu'un module
 * a ete suivi deux fois — depuis une activite, la repetition est invisible.
 *
 * Par activite : la seance est finie, tout le monde recoit son document. Plus
 * rapide quand il n'y a rien a arbitrer, et c'est ce qui a servi jusqu'ici :
 * la retirer priverait d'un envoi en lot qui marche.
 */
function Attestations({ activities, onEnvoye }) {
  const [methode, setMethode] = useState("participant");
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {[
          ["participant", "Par participant", Users],
          ["activite", "Par activité", Calendar],
        ].map(([cle, libelle, Icone]) => (
          <button
            key={cle}
            type="button"
            onClick={() => setMethode(cle)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              methode === cle ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icone className="h-3.5 w-3.5" aria-hidden="true" />
            {libelle}
          </button>
        ))}
      </div>

      {methode === "participant"
        ? <ParParticipant />
        : <AttestationsTab activities={activities} onEnvoye={onEnvoye} />}
    </div>
  );
}

function ParParticipant() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [seulsARegler, setSeulsARegler] = useState(true);
  const [ouverte, setOuverte] = useState(null);
  const [choix, setChoix] = useState({});      // clé module → coché
  const [adresse, setAdresse] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const res = await api.get("/attestations-participant");
      setData(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Chargement impossible.");
      setData(null);
    } finally {
      setChargement(false);
    }
  }, [toast]);

  useEffect(() => { charger(); }, [charger]);

  const cle = (m) => `${m.id}:${m.fiche_id}`;

  /* Ouvrir une fiche applique la proposition du serveur : une attestation par
     intitulé, la plus récente, hors de celles déjà reçues. C'est ce réglage
     de départ qui évite le double envoi — le reste se corrige à la main. */
  const ouvrir = (p) => {
    if (ouverte === p.cle) { setOuverte(null); return; }
    setOuverte(p.cle);
    setChoix(Object.fromEntries(p.modules.map((m) => [cle(m), m.suggere])));
    setAdresse(p.adresses[0] || p.email || "");
  };

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (data?.liste || []).filter((p) => {
      if (seulsARegler && p.modules_a_envoyer === 0) return false;
      if (!q) return true;
      return (
        `${p.prenom} ${p.nom}`.toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q) ||
        p.modules.some((m) => (m.titre || "").toLowerCase().includes(q))
      );
    });
  }, [data, recherche, seulsARegler]);

  const envoyer = async (p, forcer = false) => {
    const modules = p.modules.filter((m) => choix[cle(m)]);
    if (!modules.length) return toast.error("Aucune attestation sélectionnée.");
    if (!adresse.trim()) return toast.error("Indiquez l'adresse du destinataire.");
    setEnvoi(true);
    try {
      const res = await api.post("/attestations-participant/envoyer", {
        email: adresse.trim(),
        modules: modules.map((m) => ({ activity_id: m.id, participant_id: m.fiche_id })),
        forcer,
      });
      toast.success(
        `${res.data.envoyees} attestation${res.data.envoyees > 1 ? "s" : ""} envoyée${res.data.envoyees > 1 ? "s" : ""} à ${res.data.destinataire}.`
      );
      setOuverte(null);
      await charger();
    } catch (err) {
      const d = err.response?.data || {};
      /* Le serveur refuse un renvoi non demandé plutôt que d'expédier un
         doublon sur un double clic. On demande, et on force si c'est voulu. */
      if (err.response?.status === 409) {
        const titres = (d.deja_envoyees || []).map((x) => x.module).join(", ");
        if (window.confirm(
          `Déjà envoyé : ${titres}.\n\nRenvoyer quand même à ${adresse.trim()} ?`
        )) return envoyer(p, true);
        setEnvoi(false);
        return;
      }
      toast.error(d.cause || d.error || "L'envoi a échoué.");
    } finally {
      setEnvoi(false);
    }
  };

  if (chargement) {
    return (
      <div className="card-solid flex items-center gap-2 p-6 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Rapprochement des fiches…
      </div>
    );
  }

  if (!data?.personnes) {
    return (
      <EmptyState
        icon={Award}
        title="Aucun bénéficiaire"
        description="Les attestations se construisent à partir des listes de présence. Importez-en une dans une activité."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Une personne, tous ses modules, un seul message. Les fiches d&apos;une même personne
        sont réunies par son adresse, son téléphone ou son nom.
      </p>

      {data.avec_repetition > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
          {data.avec_repetition} personne{data.avec_repetition > 1 ? "s ont" : " a"} suivi deux fois
          un même module. Une seule attestation est proposée par intitulé — la plus récente.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Nom, adresse ou module…"
          className="input min-w-0 flex-1 text-sm"
        />
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={seulsARegler}
            onChange={(e) => setSeulsARegler(e.target.checked)}
          />
          Seulement ceux qui attendent une attestation ({data.a_servir})
        </label>
      </div>

      {filtres.length === 0 ? (
        <EmptyState icon={Award} title="Personne à servir" compact
          description="Tout le monde a reçu ses attestations, ou aucun bénéficiaire ne correspond." />
      ) : filtres.map((p) => {
        const depliee = ouverte === p.cle;
        const coches = p.modules.filter((m) => choix[cle(m)]).length;
        return (
          <div key={p.cle} className="card-solid overflow-hidden border border-slate-200">
            <button
              type="button"
              onClick={() => ouvrir(p)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-slate-800">{p.prenom} {p.nom}</span>
                  {p.titres_repetes > 0 && (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      module suivi deux fois
                    </span>
                  )}
                  {p.homonymes && (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      homonyme
                    </span>
                  )}
                  {p.fiches.length > 1 && (
                    <span className="text-[11px] text-slate-400">{p.fiches.length} fiches réunies</span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {p.adresses[0] || <span className="text-amber-600">sans adresse email</span>}
                  {" · "}
                  {p.total_modules} module{p.total_modules > 1 ? "s" : ""} suivi{p.total_modules > 1 ? "s" : ""}
                </span>
              </span>
              <span
                className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  p.modules_a_envoyer > 0
                    ? "bg-orange-50 text-orange-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {p.modules_a_envoyer > 0
                  ? `${p.modules_a_envoyer} à envoyer`
                  : `${p.modules_recus} reçue${p.modules_recus > 1 ? "s" : ""}`}
              </span>
              <ChevronDown
                className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${depliee ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {depliee && (
              <div className="space-y-3 border-t border-slate-200 px-4 py-3">
                <ul className="divide-y divide-slate-100">
                  {p.modules.map((m) => (
                    <li key={cle(m)} className="py-2">
                      <label className="flex cursor-pointer items-start gap-2.5 text-xs">
                        <input
                          type="checkbox"
                          checked={!!choix[cle(m)]}
                          onChange={(e) => setChoix((c) => ({ ...c, [cle(m)]: e.target.checked }))}
                          className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-orange-500"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-medium text-slate-800">{m.titre}</span>
                            <span className="text-slate-500">
                              {m.date ? new Date(m.date).toLocaleDateString("fr-FR") : ""}
                            </span>
                            {m.dispositif && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                                {m.dispositif}
                              </span>
                            )}
                            {m.repete && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                déjà suivi à une autre date
                              </span>
                            )}
                            {m.deja_envoyee && (
                              <span
                                className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                                title={`Envoyée le ${new Date(m.envoyee_le).toLocaleDateString("fr-FR")}${m.envoyee_a ? ` à ${m.envoyee_a}` : ""}`}
                              >
                                reçue
                              </span>
                            )}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <input
                    type="email"
                    value={adresse}
                    onChange={(e) => setAdresse(e.target.value)}
                    placeholder="Adresse du destinataire"
                    className="input min-w-0 flex-1 text-sm sm:max-w-xs"
                  />
                  {/* Plusieurs fiches peuvent porter plusieurs adresses : on
                      laisse choisir plutôt que d'en retenir une en silence. */}
                  {p.adresses.length > 1 && (
                    <select
                      value={adresse}
                      onChange={(e) => setAdresse(e.target.value)}
                      className="select text-xs sm:w-56"
                    >
                      {p.adresses.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => envoyer(p)}
                    disabled={envoi || coches === 0 || !adresse.trim()}
                    className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-60"
                  >
                    {envoi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Envoyer {coches} attestation{coches > 1 ? "s" : ""} en un mail
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AttestationsTab({ activities, onEnvoye }) {
  const toast = useToast();
  const [ouverte, setOuverte] = useState(null);   // id de l'activité dépliée
  const [intitule, setIntitule] = useState("");
  const [confirme, setConfirme] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);
  /* La liste nominative : c'est elle qui alimente les attestations, et c'est
     donc là que se relisent les orthographes avant l'envoi. */
  const [participants, setParticipants] = useState(null);
  const [chargeListe, setChargeListe] = useState(false);
  const [edite, setEdite] = useState(null);        // { id, nom, prenom, email, dejaRecue, renvoyer }
  const [enregistre, setEnregistre] = useState(false);

  const chargerParticipants = useCallback(async (activityId) => {
    setChargeListe(true);
    setParticipants(null);
    try {
      const res = await api.get(`/activities/${activityId}/participants`);
      setParticipants(res.data || []);
    } catch {
      setParticipants([]);
      toast.error("Impossible de charger la liste des participants.");
    } finally {
      setChargeListe(false);
    }
  }, [toast]);

  /* Corriger cinquante lignes une par une découragerait n'importe qui : la
     correction en lot applique exactement ce que chaque ligne affiche déjà. */
  const [corrigeTout, setCorrigeTout] = useState(false);

  const aCorriger = (participants || [])
    .map((p) => ({ p, propose: prenomSansNomRepete(p.prenom, p.nom) }))
    .filter((x) => x.propose);

  /* Qui reste à servir. Une attestation déjà reçue ne repart pas : le même
     document envoyé deux fois passe pour du spam, et compte contre la
     réputation du compte d'expédition. Tant que la liste n'est pas chargée,
     on s'en tient au nombre d'inscrits annoncé par l'activité. */
  const dejaRecues = (participants || []).filter((p) => p.attestation_envoyee_le).length;
  const restants = participants
    ? participants.filter((p) => p.email && !p.attestation_envoyee_le).length
    : null;

  const corrigerTousLesDoublons = async () => {
    setCorrigeTout(true);
    let faits = 0;
    for (const { p, propose } of aCorriger) {
      try {
        const res = await api.patch(`/participants/${p.id}`, { nom: p.nom, prenom: propose });
        setParticipants((l) => l.map((x) => (x.id === res.data.id ? { ...x, ...res.data } : x)));
        faits += 1;
      } catch {
        /* On continue : une ligne récalcitrante ne doit pas bloquer les autres. */
      }
    }
    setCorrigeTout(false);
    if (faits) toast.success(`${faits} nom${faits > 1 ? "s" : ""} corrigé${faits > 1 ? "s" : ""}.`);
    if (faits < aCorriger.length) toast.error(`${aCorriger.length - faits} correction(s) ont échoué.`);
  };

  const enregistrerIdentite = async (activityId) => {
    if (!edite) return;
    const nom = edite.nom.trim();
    const prenom = edite.prenom.trim();
    const email = (edite.email || "").trim();
    if (!nom || !prenom) {
      toast.error("Le nom et le prénom sont tous deux requis.");
      return;
    }
    setEnregistre(true);
    try {
      const res = await api.patch(`/participants/${edite.id}`, { nom, prenom, email });
      let ligne = { ...res.data };

      /* L'attestation partie à l'ancienne adresse n'est jamais arrivée. Sans
         effacer la trace, la personne resterait « reçue » pour toujours et
         ne serait jamais resservie — le cas où il faut justement renvoyer. */
      if (edite.renvoyer && edite.dejaRecue) {
        await api.delete(`/activities/${activityId}/attestations-envoyees/${edite.id}`);
        ligne = { ...ligne, attestation_envoyee_le: null, attestation_module: null };
        toast.success("Adresse corrigée. L'attestation repartira au prochain envoi.");
      } else {
        toast.success("Correction enregistrée.");
      }

      setParticipants((l) => l.map((p) => (p.id === ligne.id ? { ...p, ...ligne } : p)));
      setEdite(null);
    } catch (err) {
      toast.error(err?.response?.data?.error || "La correction n'a pas été enregistrée.");
    } finally {
      setEnregistre(false);
    }
  };

  const avecParticipants = (activities || [])
    .filter((a) => (a.participants_count ?? 0) > 0)
    .sort((a, b) => String(b.activity_date || "").localeCompare(String(a.activity_date || "")));

  const ouvrir = (a) => {
    const ferme = a.id === ouverte;
    setOuverte(ferme ? null : a.id);
    setIntitule(a.title || "");
    setConfirme(false);
    setResultat(null);
    setEdite(null);
    setParticipants(null);
    if (!ferme) chargerParticipants(a.id);
  };

  const apercu = (a) => {
    const base = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");
    const m = intitule.trim() && intitule.trim() !== a.title ? `?module=${encodeURIComponent(intitule.trim())}` : "";
    window.open(`${base}/activities/${a.id}/attestation-apercu${m}`, "_blank");
  };

  const envoyer = async (a) => {
    setEnvoi(true);
    setResultat(null);
    try {
      const res = await api.post(`/activities/${a.id}/send-attestations`, { module: intitule.trim() });
      setResultat(res.data);
      /* La liste doit refléter les envois qui viennent d'avoir lieu, sinon le
         bouton proposerait de servir des gens déjà servis. */
      if (participants) await chargerParticipants(a.id);
      await onEnvoye?.();
    } catch (err) {
      toast.error(err?.response?.data?.error || "L'envoi a échoué.");
    } finally {
      setEnvoi(false);
      setConfirme(false);
    }
  };

  if (!avecParticipants.length) {
    return (
      <EmptyState
        icon={Award}
        title="Aucune activité avec des participants"
        description="Les attestations sont générées à partir des listes de présences. Importez d'abord une liste dans une activité."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Un document nominatif par participant, envoyé en pièce jointe. Les personnes sans adresse
        email sont ignorées.
      </p>

      {avecParticipants.map((a) => {
        const depliee = ouverte === a.id;
        const etat = etatAttestations(a);
        return (
          <div key={a.id} className="card-solid overflow-hidden border border-slate-200">
            <button
              type="button"
              onClick={() => ouvrir(a)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <Award className="h-4 w-4 flex-shrink-0 text-orange-500" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{a.title}</span>
                <span className="block text-xs text-slate-500">
                  {a.activity_date ? new Date(a.activity_date).toLocaleDateString("fr-FR") : "date inconnue"}
                  {" · "}
                  {a.participants_count} participant{a.participants_count > 1 ? "s" : ""}
                  {etat.sansAdresse > 0 && ` · ${etat.sansAdresse} sans email`}
                </span>
              </span>

              {/* L'etat de l'envoi se lit dans la liste : sans lui, il fallait
                  ouvrir chaque activite une par une pour savoir laquelle
                  restait a servir. */}
              <span
                className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${TONS_ATTESTATION[etat.ton]}`}
                title={
                  etat.ton === "muet"
                    ? "Aucun participant n'a d'adresse email : aucune attestation ne peut partir."
                    : `${etat.envoyees} attestation(s) envoyée(s) sur ${etat.joignables} participant(s) joignable(s)` +
                      (etat.sansAdresse ? `, ${etat.sansAdresse} sans adresse email` : "")
                }
              >
                {etat.ton === "fait" && <Check className="mr-1 inline h-3 w-3" aria-hidden="true" />}
                {etat.texte}
              </span>

              <ChevronDown
                className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${depliee ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {depliee && (
              <div className="space-y-3 border-t border-slate-200 px-4 py-4">
                <label className="block text-xs text-slate-600">
                  Intitulé du module, tel qu&apos;il sera écrit sur l&apos;attestation
                  <input
                    type="text"
                    value={intitule}
                    maxLength={120}
                    onChange={(e) => { setIntitule(e.target.value); setConfirme(false); }}
                    className="input mt-1 text-sm"
                  />
                </label>
                {intitule.trim() !== (a.title || "") && (
                  <p className="text-xs text-slate-500">
                    Le titre de l&apos;activité reste « {a.title} » : seule l&apos;attestation change.
                  </p>
                )}

                {/* La liste nominative, relue avant l'envoi. Une coquille dans
                    un tableau se corrige plus tard ; imprimée sur une
                    attestation remise à la personne, elle ne se rattrape pas. */}
                <div className="rounded-xl border border-slate-200 bg-white">
                  <p className="border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                    Participants
                    {participants && (
                      <span className="font-normal text-slate-500"> — {participants.length} inscrit{participants.length > 1 ? "s" : ""}</span>
                    )}
                  </p>

                  {aCorriger.length > 1 && (
                    <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-600" aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-xs text-amber-900">
                        {aCorriger.length} noms de famille sont écrits deux fois. Ils apparaîtraient
                        ainsi sur les attestations.
                      </span>
                      <button
                        type="button"
                        onClick={corrigerTousLesDoublons}
                        disabled={corrigeTout}
                        className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                      >
                        {corrigeTout && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                        {corrigeTout ? "Correction…" : `Tout corriger (${aCorriger.length})`}
                      </button>
                    </div>
                  )}

                  {chargeListe ? (
                    <p className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Chargement…
                    </p>
                  ) : !participants?.length ? (
                    <p className="px-3 py-3 text-xs text-slate-500">Aucun participant enregistré.</p>
                  ) : (
                    <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
                      {participants.map((p) => (
                        <li key={p.id} className="px-3 py-2 text-xs">
                          {edite?.id === p.id ? (
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  value={edite.prenom}
                                  onChange={(e) => setEdite({ ...edite, prenom: e.target.value })}
                                  placeholder="Prénom"
                                  className="input min-w-0 flex-1 text-xs"
                                />
                                <input
                                  value={edite.nom}
                                  onChange={(e) => setEdite({ ...edite, nom: e.target.value })}
                                  placeholder="Nom"
                                  className="input min-w-0 flex-1 text-xs"
                                />
                              </div>
                              {/* L'adresse se corrige ici aussi : une faute de
                                  saisie s'y voit au moment où l'on relit la
                                  liste, pas trois écrans plus loin. */}
                              <input
                                type="email"
                                value={edite.email}
                                onChange={(e) => setEdite({ ...edite, email: e.target.value })}
                                placeholder="Adresse email (vide si inconnue)"
                                className="input w-full text-xs"
                              />

                              {/* Une attestation partie à l'ancienne adresse
                                  n'est jamais arrivée. Sans ce choix, la
                                  personne resterait « reçue » pour toujours. */}
                              {edite.dejaRecue && edite.email.trim() !== (p.email || "") && (
                                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                                  <input
                                    type="checkbox"
                                    checked={!!edite.renvoyer}
                                    onChange={(e) => setEdite({ ...edite, renvoyer: e.target.checked })}
                                    className="mt-0.5 h-3 w-3 flex-shrink-0"
                                  />
                                  <span>
                                    Son attestation est partie à l&apos;ancienne adresse : elle n&apos;est
                                    donc pas arrivée. La remettre dans les restants pour qu&apos;elle
                                    reparte au prochain envoi.
                                  </span>
                                </label>
                              )}

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => enregistrerIdentite(a.id)}
                                  disabled={enregistre}
                                  className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-60"
                                >
                                  {enregistre ? "…" : "Enregistrer"}
                                </button>
                                <button type="button" onClick={() => setEdite(null)} className="text-xs text-slate-500 hover:text-slate-700">
                                  Annuler
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className={`space-y-1 ${p.attestation_envoyee_le ? "opacity-50" : ""}`}>
                              <div className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-slate-800">
                                  {p.prenom} {p.nom}
                                  {!p.email && (
                                    <span className="ml-2 text-amber-600">sans adresse email</span>
                                  )}
                                  {/* Déjà servie : la ligne est grisée et ne
                                      repartira pas. Le même document envoyé
                                      deux fois passe pour du spam. */}
                                  {p.attestation_envoyee_le && (
                                    <span
                                      className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                                      title={`Envoyée le ${new Date(p.attestation_envoyee_le).toLocaleDateString("fr-FR")}${p.attestation_module ? ` — « ${p.attestation_module} »` : ""}`}
                                    >
                                      reçue
                                    </span>
                                  )}
                                </span>
                                <span className="hidden min-w-0 flex-1 truncate text-slate-400 sm:block">{p.email || ""}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEdite({
                                      id: p.id, nom: p.nom, prenom: p.prenom,
                                      email: p.email || "",
                                      dejaRecue: Boolean(p.attestation_envoyee_le),
                                      renvoyer: false,
                                    })
                                  }
                                  className="flex-shrink-0 text-slate-400 hover:text-orange-600"
                                  title="Corriger le nom ou l'adresse"
                                >
                                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </div>

                              {/* Le nom de famille apparaît deux fois : on le
                                  signale et on propose le texte corrigé plutôt
                                  que de laisser deviner quoi retirer. */}
                              {prenomSansNomRepete(p.prenom, p.nom) && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEdite({
                                      id: p.id, nom: p.nom,
                                      prenom: prenomSansNomRepete(p.prenom, p.nom),
                                      email: p.email || "",
                                      dejaRecue: Boolean(p.attestation_envoyee_le),
                                      renvoyer: false,
                                    })
                                  }
                                  className="flex items-center gap-1.5 text-[11px] text-amber-700 hover:text-amber-900"
                                >
                                  <AlertTriangle className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                                  « {p.nom} » est écrit deux fois — corriger en «&nbsp;
                                  {prenomSansNomRepete(p.prenom, p.nom)} {p.nom}&nbsp;»
                                </button>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
                    Corriger un nom ou une adresse la rectifie partout : la fiche du
                    bénéficiaire est la même dans toutes ses activités.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => apercu(a)} className="btn-ghost border text-xs">
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    Voir un aperçu
                  </button>
                  {!confirme && (
                    <button
                      type="button"
                      onClick={() => { setConfirme(true); setResultat(null); }}
                      disabled={envoi || !intitule.trim() || restants === 0}
                      className="flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100 disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                      {restants === null
                        ? `Envoyer aux ${a.participants_count} participant${a.participants_count > 1 ? "s" : ""}`
                        : restants === 0
                          ? "Tout le monde a reçu son attestation"
                          : `Envoyer aux ${restants} participant${restants > 1 ? "s" : ""}`}
                    </button>
                  )}
                </div>

                {confirme && (
                  <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                    <p className="text-xs font-semibold text-orange-800">
                      Envoyer l&apos;attestation « {intitule.trim()} » à {restants ?? a.participants_count} participant
                      {(restants ?? a.participants_count) > 1 ? "s" : ""} ?
                    </p>
                    <p className="text-xs text-orange-700">
                      Regardez l&apos;aperçu d&apos;abord : un message envoyé ne se reprend pas.
                      {dejaRecues > 0 && ` ${dejaRecues} personne${dejaRecues > 1 ? "s l'ont" : " l'a"} déjà reçue et ne ${dejaRecues > 1 ? "seront" : "sera"} pas resollicitée${dejaRecues > 1 ? "s" : ""}.`}
                      {(restants ?? a.participants_count) > 30 && " L'envoi durera plusieurs minutes, ne fermez pas la page."}
                    </p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirme(false)} disabled={envoi} className="btn-ghost border text-xs">
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={() => envoyer(a)}
                        disabled={envoi}
                        className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-700 disabled:opacity-60"
                      >
                        {envoi ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        {envoi ? "Envoi en cours…" : "Confirmer l'envoi"}
                      </button>
                    </div>
                  </div>
                )}

                {resultat && (
                  <div className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {resultat.sent} attestation{resultat.sent > 1 ? "s" : ""} envoyée{resultat.sent > 1 ? "s" : ""}
                    </p>
                    {resultat.deja_envoyees > 0 && (
                      <p className="text-emerald-700">
                        {resultat.deja_envoyees} personne{resultat.deja_envoyees > 1 ? "s l'avaient" : " l'avait"} déjà
                        reçue et n&apos;{resultat.deja_envoyees > 1 ? "ont" : "a"} pas été resollicitée
                        {resultat.deja_envoyees > 1 ? "s" : ""}.
                      </p>
                    )}
                    {resultat.skipped > 0 && (
                      <p className="text-emerald-700">
                        {resultat.skipped} participant{resultat.skipped > 1 ? "s" : ""} sans adresse email,
                        donc ignoré{resultat.skipped > 1 ? "s" : ""}.
                      </p>
                    )}
                    {/* Écartées avant l'envoi, jamais soumises au service :
                        un rebond compte contre la réputation du compte. */}
                    {resultat.injoignables?.length > 0 && (
                      <div className="text-amber-800">
                        <p className="font-medium">
                          {resultat.injoignables.length} adresse{resultat.injoignables.length > 1 ? "s" : ""} injoignable
                          {resultat.injoignables.length > 1 ? "s" : ""}, écartée{resultat.injoignables.length > 1 ? "s" : ""} avant l&apos;envoi :
                        </p>
                        <ul className="mt-0.5">
                          {resultat.injoignables.map((a) => (
                            <li key={a.email}>{a.email} — {a.explication}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {resultat.errors?.length > 0 && (
                      <p className="text-red-600">Échec pour : {resultat.errors.join(", ")}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Page principale ─────────────────────────────────────────── */
const STATUS_STYLE = {
  brouillon:  "bg-slate-100 text-slate-600 border-slate-200",
  en_cours:   "bg-blue-100 text-blue-700 border-blue-200",
  envoyee:    "bg-green-100 text-green-700 border-green-200",
  programmee: "bg-orange-100 text-orange-700 border-orange-200",
  echouee:    "bg-red-100 text-red-700 border-red-200",
  arretee:    "bg-amber-100 text-amber-800 border-amber-200",
};
const STATUS_LABEL = {
  brouillon: "Brouillon", en_cours: "Envoi en cours",
  envoyee: "Envoyée", programmee: "Programmée",
  echouee: "Échouée", arretee: "Arrêtée",
};
const RECIPIENT_LABEL = {
  all_participants: "Tous participants",
  all_partners:     "Tous partenaires",
  by_activity:      "Par activité",
  custom:           "Personnalisé",
};
const SEND_MODE_LABEL = {
  publipostage: "Publipostage",
  bcc:          "Cci",
};
const SEND_MODE_STYLE = {
  publipostage: "bg-blue-50 text-blue-700 border-blue-200",
  bcc:          "bg-purple-50 text-purple-700 border-purple-200",
};

export default function Campagnes() {
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdmin } = useAuth();
  const [tab,             setTab]             = useState("campagnes");
  const [campagnes,       setCampagnes]       = useState([]);
  const [activities,      setActivities]      = useState([]);
  const [editingCampaign, setEditingCampaign] = useState(null); // null=fermé | {}=nouveau | {id,...}=édition
  const [sendingId,       setSendingId]       = useState(null);
  const [confirmSend,     setConfirmSend]     = useState(null); // { id, name }
  /* Contrôle des adresses, joué à l'ouverture de la confirmation. Une adresse
     fautive se corrige ici ; découverte après l'envoi, elle a déjà compté
     comme un rebond contre le compte d'expédition. */
  const [controle,        setControle]        = useState(null);
  const [controleEnCours, setControleEnCours] = useState(false);
  const [suiviId,         setSuiviId]         = useState(null); // campagne dont on regarde l'envoi

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

  const fetchCampagnes = useCallback(async () => {
    try { const res = await api.get("/campagnes"); setCampagnes(res.data); }
    catch (err) { console.error("Erreur chargement campagnes", err); }
  }, []);

  /* Le compteur d'attestations de chaque activite vient de cette liste : elle
     doit se relire apres un envoi, sinon le badge resterait a son ancienne
     valeur et on renverrait a des gens deja servis. */
  const fetchActivities = useCallback(async () => {
    try { const r = await api.get("/activities"); setActivities(r.data || []); }
    catch { /* la liste garde sa valeur precedente */ }
  }, []);

  useEffect(() => {
    fetchCampagnes();
    fetchActivities();
  }, [fetchCampagnes, fetchActivities]);

  const handleSaved = (savedId, andSend, savedName) => {
    fetchCampagnes();
    setEditingCampaign(null);
    if (andSend) setConfirmSend({ id: savedId, name: savedName || "la campagne" });
  };

  useEffect(() => {
    if (!confirmSend?.id) { setControle(null); return; }
    let vivant = true;
    setControle(null);
    setControleEnCours(true);
    api.get(`/campagnes/${confirmSend.id}/controle-adresses`)
      .then((res) => { if (vivant) setControle(res.data); })
      .catch(() => { if (vivant) setControle(null); })  /* le contrôle est un garde-fou, pas un préalable */
      .finally(() => { if (vivant) setControleEnCours(false); });
    return () => { vivant = false; };
  }, [confirmSend?.id]);

  /* La requête ne fait plus que lancer l'envoi : elle répond tout de suite,
     et le suivi prend le relais. */
  const handleSend = async (id) => {
    setSendingId(id);
    setConfirmSend(null);
    try {
      const res = await api.post(`/campagnes/${id}/send`);
      const minutes = Math.ceil((res.data?.duree_estimee_s || 0) / 60);
      toast.success(
        `Envoi lancé : ${res.data.a_envoyer} destinataire${res.data.a_envoyer > 1 ? "s" : ""}` +
          (minutes > 1 ? `, environ ${minutes} minutes.` : ".")
      );
      setSuiviId(id);
      fetchCampagnes();
    } catch (err) {
      toast.error(err?.response?.data?.error || "L'envoi a échoué.");
    } finally {
      setSendingId(null);
    }
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: "Supprimer cette campagne ?",
      body: "Son contenu et son historique d'envoi seront supprimés.",
      destructive: true,
    });
    if (!ok) return;
    try { await api.delete(`/campagnes/${id}`); fetchCampagnes(); }
    catch { toast.error("La suppression a échoué."); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Campagnes</h1>
          <p className="page-subtitle">Campagnes de communication et templates d'emails automatiques</p>
        </div>
        {tab === "campagnes" && (
          <button onClick={() => setEditingCampaign({})} className="btn-primary">
            <Plus className="w-4 h-4" /> Nouvelle campagne
          </button>
        )}
      </div>

      {/* Etat du domaine expediteur : sans authentification DNS, aucune
          campagne n'arrive, et rien ne le signalait dans la plateforme. */}
      <DeliverabilitePanel />

      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: "campagnes", icon: <Mail className="w-4 h-4" />, label: "Campagnes" },
          { key: "attestations", icon: <Award className="w-4 h-4" />, label: "Attestations" },
          { key: "templates", icon: <Zap className="w-4 h-4" />,  label: "Templates automatiques" },
        ].map(({ key, icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? "border-orange-500 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            <span className="flex items-center gap-2">{icon}{label}</span>
          </button>
        ))}
      </div>

      {tab === "templates" ? <TemplatesTab /> : tab === "attestations" ? (
        <Attestations activities={activities} onEnvoye={fetchActivities} />
      ) : (
        <>
          {/* Modal éditeur campagne */}
          {editingCampaign !== null && (
            <CampaignModal
              campaign={editingCampaign?.id ? editingCampaign : null}
              activities={activities}
              onClose={() => setEditingCampaign(null)}
              onSaved={handleSaved}
            />
          )}

          {/* Modal confirmation envoi */}
          {confirmSend && createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                    <Send className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Envoyer la campagne</h3>
                    <p className="text-sm text-slate-500">{confirmSend.name}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-600 mb-5">
                  L&apos;envoi part en arrière-plan et se poursuit même si vous quittez la page. Il est
                  cadencé pour rester sous les limites de la messagerie, donc une grande liste prend
                  plusieurs minutes. Les personnes désabonnées sont exclues, et chaque message porte un
                  lien de désabonnement. Vous pourrez suivre l&apos;avancement et arrêter à tout moment.
                </p>

                {/* Contrôle des adresses. Les injoignables ne partiront pas :
                    un rebond compte contre la réputation du compte
                    d'expédition, et c'est ce qui l'a fait suspendre. */}
                {controleEnCours && (
                  <p className="mb-5 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Vérification des adresses…
                  </p>
                )}
                {controle && (
                  <div className="mb-5 space-y-2">
                    <p className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-800">{controle.joignables}</span> adresse
                      {controle.joignables > 1 ? "s" : ""} joignable{controle.joignables > 1 ? "s" : ""}
                      {controle.desabonnes > 0 && ` · ${controle.desabonnes} désabonné${controle.desabonnes > 1 ? "s" : ""}`}
                      {controle.injoignables > 0 && ` · ${controle.injoignables} injoignable${controle.injoignables > 1 ? "s" : ""}`}
                    </p>
                    {controle.injoignables > 0 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <p className="font-semibold">
                          {controle.injoignables} adresse{controle.injoignables > 1 ? "s ne partiront pas" : " ne partira pas"}
                        </p>
                        <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                          {controle.adresses.map((a) => (
                            <li key={a.email}>
                              <span className="font-medium">{a.email}</span> — {a.explication}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1.5 text-amber-700">
                          Elles ne seront pas soumises au service d&apos;envoi : un message qui rebondit
                          compte contre la réputation du compte. Corrigez-les dans Participants, ou
                          poursuivez sans elles.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button onClick={() => setConfirmSend(null)} className="btn-ghost border">Annuler</button>
                  <button
                    onClick={() => handleSend(confirmSend.id)}
                    disabled={sendingId === confirmSend.id}
                    className="btn-primary flex items-center gap-2 disabled:opacity-60"
                  >
                    {sendingId === confirmSend.id
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours...</>
                      : <><Send className="w-4 h-4" /> Confirmer l'envoi</>}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Suivi de l'envoi, en direct */}
          {suiviId && (
            <SuiviEnvoi
              campagneId={suiviId}
              onFerme={() => { setSuiviId(null); fetchCampagnes(); }}
              onChange={fetchCampagnes}
            />
          )}

          {/* Liste des campagnes */}
          {campagnes.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="Aucune campagne"
              description="Une campagne vous permet d'écrire un email et de l'envoyer à un groupe de partenaires ou de participants."
              actionLabel="Créer une campagne"
              actionIcon={Plus}
              onAction={() => setEditingCampaign({})}
            />
          ) : (
            <div className="card overflow-x-auto">
              <table className="table">
                <thead className="table-head">
                  <tr>
                    <th className="text-left px-4 py-3">Campagne</th>
                    <th className="text-left px-4 py-3">Destinataires</th>
                    <th className="text-left px-4 py-3">Créée le</th>
                    <th className="text-left px-4 py-3">Statut</th>
                    <th className="text-left px-4 py-3">Résultats</th>
                    <th className="text-right px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campagnes.map(c => (
                    <tr key={c.id} className="table-row">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 flex items-center gap-2">
                          <Mail className="w-4 h-4 text-orange-500 flex-shrink-0" />
                          {c.name}
                        </div>
                        {c.subject && (
                          <p className="text-xs text-slate-500 mt-0.5 pl-6 truncate max-w-xs">
                            Objet : {c.subject}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <span className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-100 rounded-full px-2.5 py-1 w-fit">
                            <Users className="w-3 h-3" />
                            {RECIPIENT_LABEL[c.recipients_type] || "—"}
                          </span>
                          <span className={`inline-flex items-center text-xs rounded-full px-2.5 py-0.5 border w-fit font-medium ${SEND_MODE_STYLE[c.send_mode] || "bg-slate-50 text-slate-500 border-slate-200"}`}>
                            {SEND_MODE_LABEL[c.send_mode] || "Publipostage"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {c.created_at ? new Date(c.created_at).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${STATUS_STYLE[c.status] || "bg-slate-100 text-slate-600"}`}>
                          {STATUS_LABEL[c.status] || c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {(c.sent_count > 0 || c.failed_count > 0 || c.status === "en_cours") ? (
                          <button
                            onClick={() => setSuiviId(c.id)}
                            className="text-xs flex items-center gap-2 hover:underline"
                            title="Voir le journal d'envoi"
                          >
                            <span className="text-green-600 font-medium">
                              {c.sent_count}{c.total_count ? ` / ${c.total_count}` : ""} ✓
                            </span>
                            {c.failed_count > 0 && <span className="text-red-500">{c.failed_count} ✗</span>}
                          </button>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {c.status === "en_cours" ? (
                            <button
                              onClick={() => setSuiviId(c.id)}
                              className="inline-flex h-8 items-center gap-1.5 px-3 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-medium transition-colors"
                            >
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Suivre
                            </button>
                          ) : (c.status !== "envoyee" || c.failed_count > 0) && (
                            <button
                              onClick={() => setConfirmSend({ id: c.id, name: c.name })}
                              disabled={!!sendingId}
                              title="Envoyer"
                              className="inline-flex h-8 items-center gap-1.5 px-3 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50 text-xs font-medium transition-colors disabled:opacity-40"
                            >
                              {sendingId === c.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Send className="w-3.5 h-3.5" />}
                              Envoyer
                            </button>
                          )}
                          <button
                            onClick={() => setEditingCampaign(c)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                            title="Modifier"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
