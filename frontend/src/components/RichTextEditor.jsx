import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";

/* ── Palette de couleurs ── */
const COLORS = [
  { label: "Défaut",    value: null       },
  { label: "Noir",      value: "#111827"  },
  { label: "Gris",      value: "#6B7280"  },
  { label: "Orange",    value: "#F97316"  },
  { label: "Rouge",     value: "#EF4444"  },
  { label: "Vert",      value: "#22C55E"  },
  { label: "Bleu",      value: "#3B82F6"  },
  { label: "Violet",    value: "#8B5CF6"  },
  { label: "Rose",      value: "#EC4899"  },
];

const HIGHLIGHTS = [
  { label: "Aucun",    value: null       },
  { label: "Jaune",    value: "#FEF08A"  },
  { label: "Orange",   value: "#FED7AA"  },
  { label: "Vert",     value: "#BBF7D0"  },
  { label: "Bleu",     value: "#BFDBFE"  },
  { label: "Rose",     value: "#FBCFE8"  },
];

/* ── Bouton toolbar ── */
function ToolBtn({ active, onClick, title, children, disabled }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-colors flex-shrink-0
        ${active ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-100"}
        ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}

/* ── Séparateur ── */
function Sep() {
  return <div className="w-px h-5 bg-slate-200 mx-0.5 flex-shrink-0" />;
}

/* ── Picker couleur ── */
function ColorPicker({ editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const current = editor.getAttributes("textStyle").color;
  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        title="Couleur du texte"
        onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }}
        className="w-7 h-7 flex flex-col items-center justify-center rounded hover:bg-slate-100 transition-colors cursor-pointer gap-0.5"
      >
        <span className="text-xs font-bold text-slate-700 leading-none">A</span>
        <span className="w-5 h-1 rounded-full" style={{ background: current || "#111827" }} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 flex flex-wrap gap-1.5 p-2 rounded-xl border border-slate-200 bg-white shadow-lg w-44">
          {COLORS.map(c => (
            <button
              key={c.label}
              type="button"
              title={c.label}
              onMouseDown={e => {
                e.preventDefault();
                if (c.value) editor.chain().focus().setColor(c.value).run();
                else editor.chain().focus().unsetColor().run();
                setOpen(false);
              }}
              className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0"
              style={{
                background: c.value || "#ffffff",
                borderColor: current === c.value ? "#f97316" : "#e2e8f0",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Picker surlignage ── */
function HighlightPicker({ editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        title="Surlignage"
        onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }}
        className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-colors cursor-pointer
          ${editor.isActive("highlight") ? "bg-yellow-200 text-yellow-900" : "text-slate-600 hover:bg-slate-100"}`}
      >
        <span className="font-bold text-xs">ab</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 flex flex-wrap gap-1.5 p-2 rounded-xl border border-slate-200 bg-white shadow-lg w-36">
          {HIGHLIGHTS.map(c => (
            <button
              key={c.label}
              type="button"
              title={c.label}
              onMouseDown={e => {
                e.preventDefault();
                if (c.value) editor.chain().focus().setHighlight({ color: c.value }).run();
                else editor.chain().focus().unsetHighlight().run();
                setOpen(false);
              }}
              className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0"
              style={{
                background: c.value || "#ffffff",
                borderColor: "#e2e8f0",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════
   RichTextEditor
═══════════════════════════════════ */
export default function RichTextEditor({ value, onChange, placeholder = "Écrivez ici…", minHeight = 80 }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "outline-none prose prose-sm max-w-none text-slate-800",
        style: `min-height: ${minHeight}px; padding: 10px 12px;`,
      },
    },
  });

  /* Sync if value changes externally (e.g. form load) */
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current && (value || "") !== (current === "<p></p>" ? "" : current)) {
      editor.commands.setContent(value || "");
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:border-orange-300 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 bg-slate-50/80">
        {/* Formatage de base */}
        <ToolBtn active={editor.isActive("bold")}      onClick={() => editor.chain().focus().toggleBold().run()}      title="Gras (Ctrl+B)"><strong>B</strong></ToolBtn>
        <ToolBtn active={editor.isActive("italic")}    onClick={() => editor.chain().focus().toggleItalic().run()}    title="Italique (Ctrl+I)"><em>I</em></ToolBtn>
        <ToolBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Souligné (Ctrl+U)"><u>U</u></ToolBtn>
        <ToolBtn active={editor.isActive("strike")}    onClick={() => editor.chain().focus().toggleStrike().run()}    title="Barré"><s>S</s></ToolBtn>

        <Sep />

        {/* Couleur et surlignage */}
        <ColorPicker editor={editor} />
        <HighlightPicker editor={editor} />

        <Sep />

        {/* Titres */}
        <ToolBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Titre 1">H1</ToolBtn>
        <ToolBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Titre 2">H2</ToolBtn>
        <ToolBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Titre 3">H3</ToolBtn>

        <Sep />

        {/* Alignement */}
        <ToolBtn active={editor.isActive({ textAlign: "left" })}    onClick={() => editor.chain().focus().setTextAlign("left").run()}    title="Aligner à gauche">⬅</ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: "center" })}  onClick={() => editor.chain().focus().setTextAlign("center").run()}  title="Centrer">⬛</ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: "right" })}   onClick={() => editor.chain().focus().setTextAlign("right").run()}   title="Aligner à droite">➡</ToolBtn>

        <Sep />

        {/* Listes */}
        <ToolBtn active={editor.isActive("bulletList")}  onClick={() => editor.chain().focus().toggleBulletList().run()}  title="Liste à puces">☰</ToolBtn>
        <ToolBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Liste numérotée">≡</ToolBtn>

        <Sep />

        {/* Effacer la mise en forme */}
        <ToolBtn active={false} onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Effacer la mise en forme">✕</ToolBtn>
      </div>

      {/* Zone d'édition */}
      <EditorContent editor={editor} placeholder={placeholder} />

      {/* Style du placeholder */}
      <style>{`
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: #94a3b8;
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
