import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { TextAlign } from "@tiptap/extension-text-align";
import { Highlight } from "@tiptap/extension-highlight";
import { Link } from "@tiptap/extension-link";

const COLORS = [
  { label: "Défaut",  value: null      },
  { label: "Noir",    value: "#111827" },
  { label: "Gris",    value: "#6B7280" },
  { label: "Orange",  value: "#F97316" },
  { label: "Rouge",   value: "#EF4444" },
  { label: "Vert",    value: "#22C55E" },
  { label: "Bleu",    value: "#3B82F6" },
  { label: "Violet",  value: "#8B5CF6" },
  { label: "Rose",    value: "#EC4899" },
];

const HIGHLIGHTS = [
  { label: "Aucun",  value: null      },
  { label: "Jaune",  value: "#FEF08A" },
  { label: "Orange", value: "#FED7AA" },
  { label: "Vert",   value: "#BBF7D0" },
  { label: "Bleu",   value: "#BFDBFE" },
  { label: "Rose",   value: "#FBCFE8" },
];

function ToolBtn({ active, onClick, title, children, disabled }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      className={`w-7 h-7 flex items-center justify-center rounded text-sm font-medium transition-colors flex-shrink-0
        ${active ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-200"}
        ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-5 bg-slate-200 mx-0.5 flex-shrink-0" />;
}

function ColorPicker({ editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const current = editor.getAttributes("textStyle").color;
  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        title="Couleur du texte"
        onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }}
        className="w-7 h-7 flex flex-col items-center justify-center rounded hover:bg-slate-200 cursor-pointer gap-0.5 transition-colors"
      >
        <span className="text-xs font-bold text-slate-700 leading-none">A</span>
        <span className="w-5 h-1 rounded-full" style={{ background: current || "#111827" }} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 flex flex-wrap gap-1.5 p-2 rounded-xl border border-slate-200 bg-white shadow-lg w-44">
          {COLORS.map(c => (
            <button key={c.label} type="button" title={c.label}
              onMouseDown={e => {
                e.preventDefault();
                if (c.value) editor.chain().focus().setColor(c.value).run();
                else editor.chain().focus().unsetColor().run();
                setOpen(false);
              }}
              className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0"
              style={{ background: c.value || "#ffffff", borderColor: current === c.value ? "#f97316" : "#e2e8f0" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HighlightPicker({ editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        title="Surlignage"
        onMouseDown={e => { e.preventDefault(); setOpen(v => !v); }}
        className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold transition-colors cursor-pointer
          ${editor.isActive("highlight") ? "bg-yellow-200 text-yellow-900" : "text-slate-600 hover:bg-slate-200"}`}
      >
        ab
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 flex flex-wrap gap-1.5 p-2 rounded-xl border border-slate-200 bg-white shadow-lg w-36">
          {HIGHLIGHTS.map(c => (
            <button key={c.label} type="button" title={c.label}
              onMouseDown={e => {
                e.preventDefault();
                if (c.value) editor.chain().focus().setHighlight({ color: c.value }).run();
                else editor.chain().focus().unsetHighlight().run();
                setOpen(false);
              }}
              className="w-6 h-6 rounded-full border-2 border-slate-200 transition-transform hover:scale-110 flex-shrink-0"
              style={{ background: c.value || "#ffffff" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
        class: "outline-none prose prose-sm max-w-none text-slate-800 px-3 py-2.5",
        style: `min-height: ${minHeight}px`,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const html = editor.getHTML();
    const empty = html === "<p></p>" || html === "";
    const incoming = value || "";
    if (incoming !== html && !(empty && !incoming)) {
      editor.commands.setContent(incoming);
    }
  }, [value]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition-all">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 bg-slate-50">

        <ToolBtn active={editor.isActive("bold")}      title="Gras (Ctrl+B)"      onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></ToolBtn>
        <ToolBtn active={editor.isActive("italic")}    title="Italique (Ctrl+I)"  onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolBtn>
        <ToolBtn active={editor.isActive("underline")} title="Souligné (Ctrl+U)"  onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolBtn>
        <ToolBtn active={editor.isActive("strike")}    title="Barré"              onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></ToolBtn>

        <Sep />

        <ColorPicker editor={editor} />
        <HighlightPicker editor={editor} />

        <Sep />

        <ToolBtn active={editor.isActive("heading", { level: 1 })} title="Titre 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolBtn>
        <ToolBtn active={editor.isActive("heading", { level: 2 })} title="Titre 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolBtn>
        <ToolBtn active={editor.isActive("heading", { level: 3 })} title="Titre 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolBtn>

        <Sep />

        <ToolBtn active={editor.isActive({ textAlign: "left" })}   title="Aligner à gauche" onClick={() => editor.chain().focus().setTextAlign("left").run()}>←</ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: "center" })} title="Centrer"           onClick={() => editor.chain().focus().setTextAlign("center").run()}>↔</ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: "right" })}  title="Aligner à droite"  onClick={() => editor.chain().focus().setTextAlign("right").run()}>→</ToolBtn>

        <Sep />

        <ToolBtn active={editor.isActive("bulletList")}  title="Liste à puces"    onClick={() => editor.chain().focus().toggleBulletList().run()}>•—</ToolBtn>
        <ToolBtn active={editor.isActive("orderedList")} title="Liste numérotée"  onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</ToolBtn>

        <Sep />

        <ToolBtn active={false} title="Effacer mise en forme" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>✕</ToolBtn>
      </div>

      {/* Zone éditable */}
      <EditorContent editor={editor} />
    </div>
  );
}
