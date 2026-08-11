import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Plus, FileText, ArrowLeft, Layers, Users, CheckSquare,
  X, Copy, Trash2, GripVertical, Eye, Settings, Palette,
  BarChart3, ArrowUp, ArrowDown, ChevronDown,
} from "lucide-react";
import api from "../api";
import FieldEditor from "./formulaires/FieldEditor";
import FormBrandingPanel from "./formulaires/FormBrandingPanel";
import FormSettingsPanel from "./formulaires/FormSettingsPanel";
import FormSubmissionsPanel from "./formulaires/FormSubmissionsPanel";
import { FORM_EDITOR_DRAFT_KEY, FIELD_TYPES } from "./formulaires/constants";
import {
  defaultSettings, isoToLocalDateTime, localDateTimeToIso,
  createField, createEditor, migrateField,
} from "./formulaires/helpers";

/* ── Tabs ── */
const TABS = [
  { id: "champs",    label: "Champs",     Icon: CheckSquare },
  { id: "apparence", label: "Apparence",  Icon: Palette     },
  { id: "settings",  label: "Paramètres", Icon: Settings    },
  { id: "reponses",  label: "Réponses",   Icon: BarChart3   },
];

function TabBar({ active, onChange, submissionsCount }) {
  return (
    <div className="flex border-b border-slate-200 overflow-x-auto flex-shrink-0 bg-white">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === id
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
          {id === "reponses" && submissionsCount > 0 && (
            <span className="rounded-full bg-orange-100 text-orange-700 text-[10px] font-semibold px-1.5 py-0.5 leading-none">
              {submissionsCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── Compact field card (left sidebar) ── */
function FieldCard({ field, idx, total, isSelected, canRemove, isDragging,
  onSelect, onRemove, onDuplicate, onMoveUp, onMoveDown,
  onDragStart, onDrop, onDragEnd }) {
  const ft  = FIELD_TYPES.find(t => t.value === field.type);
  const sep = field.type === "separator";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => e.key === "Enter" && onSelect()}
      className={`group relative flex items-center gap-2 rounded-xl border px-2.5 py-2 cursor-pointer transition-all select-none ${
        isSelected
          ? "border-orange-400 bg-orange-50 shadow-sm ring-1 ring-orange-100"
          : sep
          ? "border-dashed border-slate-200 bg-slate-50/60 hover:bg-slate-100"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      } ${isDragging ? "opacity-40" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <GripVertical className="w-3.5 h-3.5 text-slate-300 cursor-grab active:cursor-grabbing flex-shrink-0" />
      <span className="text-sm leading-none w-4 text-center flex-shrink-0">{ft?.icon || "•"}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate leading-tight ${isSelected ? "text-orange-900" : "text-slate-700"}`}>
          {field.label || <em className="not-italic text-slate-400">Sans titre</em>}
          {field.required && <span className="text-red-400 ml-0.5 font-normal">*</span>}
        </p>
        <p className="text-[10px] text-slate-400 leading-tight">{ft?.label || field.type}</p>
      </div>
      <div className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        <button type="button" title="Monter" disabled={idx === 0}
          onClick={e => { e.stopPropagation(); onMoveUp(); }}
          className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-20 transition-colors">
          <ArrowUp className="w-2.5 h-2.5 text-slate-500" />
        </button>
        <button type="button" title="Descendre" disabled={idx === total - 1}
          onClick={e => { e.stopPropagation(); onMoveDown(); }}
          className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-20 transition-colors">
          <ArrowDown className="w-2.5 h-2.5 text-slate-500" />
        </button>
        <button type="button" title="Dupliquer"
          onClick={e => { e.stopPropagation(); onDuplicate(); }}
          className="p-0.5 rounded hover:bg-slate-200 text-slate-400 transition-colors">
          <Copy className="w-2.5 h-2.5" />
        </button>
        <button type="button" title="Supprimer" disabled={!canRemove}
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="p-0.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 disabled:opacity-20 transition-colors">
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
}

/* ── Field type picker (popover) ── */
function TypePickerPopover({ onAdd, onClose }) {
  const groups = {};
  for (const ft of FIELD_TYPES) {
    if (!groups[ft.group]) groups[ft.group] = [];
    groups[ft.group].push(ft);
  }
  return (
    <div className="absolute bottom-full left-0 mb-2 w-64 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-y-auto max-h-80 z-40 p-2">
      {Object.entries(groups).map(([group, types]) => (
        <div key={group} className="mb-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 px-2 py-1">{group}</p>
          {types.map(ft => (
            <button key={ft.value} type="button"
              onClick={() => { onAdd(ft.value); onClose(); }}
              className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 hover:bg-orange-50 hover:text-orange-700 transition-colors text-left">
              <span className="text-base leading-none w-5 flex-shrink-0">{ft.icon}</span>
              {ft.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════
   FormulaireEditor
══════════════════════════════════════════ */
export default function FormulaireEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  /* ── state ── */
  const [loading, setLoading]           = useState(!isNew);
  const [saving, setSaving]             = useState(false);
  const [activeTab, setActiveTab]       = useState("champs");
  const [submissions, setSubmissions]   = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [exportingFormat, setExportingFormat]       = useState("");
  const [notice, setNotice]             = useState("");
  const [validationErrors, setValidationErrors]     = useState([]);
  const [lastDraftSavedAt, setLastDraftSavedAt]     = useState("");
  const [draggedFieldIndex, setDraggedFieldIndex]   = useState(null);
  const [editor, setEditor]             = useState(createEditor());
  const [selectedFieldId, setSelectedFieldId]       = useState(null);
  const [activePage, setActivePage]     = useState(1);
  const [showTypePicker, setShowTypePicker]         = useState(false);
  const typePickerRef = useRef(null);

  /* ── derived ── */
  const pageNums = [...new Set(editor.fields.map(f => Number(f.page || 1)))].sort((a, b) => a - b);
  const effectiveActivePage = pageNums.includes(activePage) ? activePage : (pageNums[0] || 1);
  const selectedFieldIdx = editor.fields.findIndex(f => f._id === selectedFieldId);
  const selectedField    = selectedFieldIdx >= 0 ? editor.fields[selectedFieldIdx] : null;
  const activePageFields = editor.fields.filter(f => Number(f.page || 1) === effectiveActivePage);
  const totalPages       = pageNums.length;
  const realFieldsCount  = editor.fields.filter(f => f.type !== "separator").length;

  /* ── close type picker on outside click ── */
  useEffect(() => {
    const handler = e => {
      if (typePickerRef.current && !typePickerRef.current.contains(e.target)) setShowTypePicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── load form ── */
  useEffect(() => {
    if (!isNew) {
      setLoading(true);
      api.get(`/forms/${id}`)
        .then(res => {
          const form = res.data;
          const fields = Array.isArray(form.fields) && form.fields.length
            ? form.fields.map((f, i) => migrateField(f, i))
            : [createField("text", 1)];
          setEditor({
            id: form.id,
            title: form.title || "",
            description: form.description || "",
            status: form.status || "draft",
            slug: form.slug || "",
            fields,
            settings: {
              ...defaultSettings(),
              ...(form.settings || {}),
              open_at: isoToLocalDateTime(form?.settings?.open_at),
              close_at: isoToLocalDateTime(form?.settings?.close_at),
            },
            submissions_count: Number(form.submissions_count || 0),
          });
          if (fields.length) setSelectedFieldId(fields[0]._id);
        })
        .catch(() => setNotice("Erreur chargement formulaire."))
        .finally(() => setLoading(false));
      return;
    }

    let nextEditor = createEditor();
    let restored = false;
    let savedAt = "";
    try {
      const raw = localStorage.getItem(FORM_EDITOR_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.editor && Array.isArray(parsed.editor.fields)) {
          nextEditor = {
            ...createEditor(),
            ...parsed.editor,
            id: null, slug: "",
            submissions_count: 0,
            settings: { ...defaultSettings(), ...(parsed.editor.settings || {}) },
            fields: parsed.editor.fields.length
              ? parsed.editor.fields.map((f, i) => ({ ...createField("text", i + 1), ...f, page: Number(f?.page) > 0 ? Number(f.page) : 1 }))
              : [createField("text", 1)],
          };
          restored = true;
          savedAt = String(parsed?.savedAt || "");
        }
      }
    } catch {}
    setEditor(nextEditor);
    if (nextEditor.fields.length) setSelectedFieldId(nextEditor.fields[0]._id);
    setNotice(restored ? "Brouillon local restauré." : "");
    setLastDraftSavedAt(savedAt);
  }, [id, isNew]);

  /* ── draft autosave ── */
  useEffect(() => {
    if (!isNew || editor.id) return;
    const t = setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        localStorage.setItem(FORM_EDITOR_DRAFT_KEY, JSON.stringify({ editor, savedAt }));
        setLastDraftSavedAt(savedAt);
      } catch {}
    }, 700);
    return () => clearTimeout(t);
  }, [editor, isNew]);

  /* ── tab switch ── */
  const handleTabChange = async tab => {
    setActiveTab(tab);
    if (tab === "reponses" && editor.id && !submissions.length) {
      setSubmissionsLoading(true);
      try {
        const res = await api.get(`/forms/${editor.id}/submissions`);
        setSubmissions(res.data || []);
      } catch {} finally { setSubmissionsLoading(false); }
    }
  };

  /* ── export ── */
  const handleExport = async format => {
    if (!editor.id) return;
    setExportingFormat(format);
    try {
      const res = await api.get(`/forms/${editor.id}/submissions/export.${format}`, { responseType: "blob" });
      const blob = new Blob([res.data], {
        type: format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href = url; a.download = `${editor.slug || `form-${editor.id}`}-reponses.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { alert("Erreur export"); } finally { setExportingFormat(""); }
  };

  const handleDeleteSubmission = async sid => {
    try {
      await api.delete(`/forms/${editor.id}/submissions/${sid}`);
      setSubmissions(prev => prev.filter(s => s.id !== sid));
      setEditor(prev => ({ ...prev, submissions_count: Math.max(0, (prev.submissions_count || 0) - 1) }));
    } catch { alert("Erreur suppression réponse"); }
  };

  /* ── save ── */
  const handleSave = async e => {
    e.preventDefault();
    const errors = [];
    if (!editor.title.trim()) errors.push({ message: "Le titre du formulaire est requis." });
    if (!editor.fields.length) errors.push({ message: "Ajoutez au moins un champ." });
    const seenKeys = new Set();
    editor.fields.forEach((field, i) => {
      const label = String(field?.label || "").trim();
      const key   = String(field?.key   || "").trim();
      if (!label) errors.push({ message: `Champ ${i + 1} : libellé requis.`, fieldId: field._id });
      if (field.type === "separator") return;
      if (!key) errors.push({ message: `Champ ${i + 1} : clé requise.`, fieldId: field._id });
      else if (seenKeys.has(key)) errors.push({ message: `Clé '${key}' en doublon (champ ${i + 1}).`, fieldId: field._id });
      else seenKeys.add(key);
      if (["select","checkbox","radio"].includes(field.type) && !(field.options || []).filter(Boolean).length)
        errors.push({ message: `Champ ${i + 1} : ajoutez au moins une option.`, fieldId: field._id });
      if (field?.show_if?.rules) {
        for (const rule of field.show_if.rules) {
          if (!String(rule.key || "").trim()) {
            errors.push({ message: `Champ ${i + 1} : sélectionnez un champ dans les conditions.`, fieldId: field._id });
            break;
          }
        }
      }
    });
    const openAtIso  = localDateTimeToIso(editor.settings?.open_at);
    const closeAtIso = localDateTimeToIso(editor.settings?.close_at);
    if (openAtIso && closeAtIso && Date.parse(openAtIso) >= Date.parse(closeAtIso))
      errors.push({ message: "La date de fermeture doit être après l'ouverture." });

    if (errors.length) {
      setValidationErrors(errors);
      setNotice("Corrigez les erreurs avant de sauvegarder.");
      setActiveTab("champs");
      const first = errors.find(err => err.fieldId);
      if (first) {
        const field = editor.fields.find(f => f._id === first.fieldId);
        if (field) { setSelectedFieldId(field._id); setActivePage(Number(field.page || 1)); }
      }
      return;
    }

    setValidationErrors([]); setNotice(""); setSaving(true);
    try {
      const payload = {
        title: editor.title,
        description: editor.description,
        status: editor.status,
        settings: {
          ...defaultSettings(),
          ...(editor.settings || {}),
          open_at:  localDateTimeToIso(editor.settings?.open_at),
          close_at: localDateTimeToIso(editor.settings?.close_at),
        },
        fields: editor.fields.map(f => ({
          ...f,
          page:       Number(f.page) > 0 ? Number(f.page) : 1,
          options:    Array.isArray(f.options) ? f.options.filter(Boolean) : [],
          show_if:    f.show_if?.rules?.length ? f.show_if : null,
          jump_rules: Array.isArray(f.jump_rules) ? f.jump_rules : [],
        })),
      };
      if (editor.id) await api.put(`/forms/${editor.id}`, payload);
      else { await api.post("/forms", payload); localStorage.removeItem(FORM_EDITOR_DRAFT_KEY); }
      navigate("/formulaires");
    } catch (err) {
      alert(err?.response?.data?.error || "Erreur sauvegarde formulaire");
    } finally { setSaving(false); }
  };

  /* ── field operations ── */
  const addField = (type = "text", page = null) => {
    const idx        = editor.fields.length + 1;
    const targetPage = page ?? effectiveActivePage;
    const newField   = { ...createField(type, idx), page: targetPage };
    setEditor(prev => ({ ...prev, fields: [...prev.fields, newField] }));
    setSelectedFieldId(newField._id);
    if (targetPage !== effectiveActivePage) setActivePage(targetPage);
  };

  const removeField = idx => {
    const removedId  = editor.fields[idx]?._id;
    const remaining  = editor.fields.filter((_, i) => i !== idx);
    if (removedId === selectedFieldId) {
      const next = remaining[Math.min(idx, remaining.length - 1)];
      setSelectedFieldId(next?._id || null);
    }
    setEditor(prev => ({ ...prev, fields: remaining }));
  };

  const duplicateField = idx => {
    const field  = editor.fields[idx];
    const newId  = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const copy   = { ...field, _id: newId, key: field.type === "separator" ? `sep_${editor.fields.length + 1}` : `${field.key}_copie`, label: `${field.label} (copie)` };
    const next   = [...editor.fields];
    next.splice(idx + 1, 0, copy);
    setEditor(prev => ({ ...prev, fields: next }));
    setSelectedFieldId(copy._id);
  };

  const updateField = (idx, patch) =>
    setEditor(prev => ({ ...prev, fields: prev.fields.map((f, i) => i === idx ? { ...f, ...patch } : f) }));

  const moveField = (from, to) => {
    if (from === to) return;
    setEditor(prev => {
      if (from < 0 || to < 0 || from >= prev.fields.length || to >= prev.fields.length) return prev;
      const next = [...prev.fields];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...prev, fields: next };
    });
  };

  const addPage = () => {
    const newPage  = (pageNums.length ? Math.max(...pageNums) : 1) + 1;
    const newField = { ...createField("text", editor.fields.length + 1), page: newPage };
    setEditor(prev => ({ ...prev, fields: [...prev.fields, newField] }));
    setActivePage(newPage);
    setSelectedFieldId(newField._id);
  };

  const removePage = pageNum => {
    if (pageNum <= 1) return;
    if (!window.confirm(`Supprimer la page ${pageNum} ? Ses champs seront fusionnés avec la page ${pageNum - 1}.`)) return;
    setEditor(prev => ({
      ...prev,
      fields: prev.fields.map(f => {
        const p = Number(f.page || 1);
        if (p === pageNum) return { ...f, page: pageNum - 1 };
        if (p > pageNum)  return { ...f, page: p - 1 };
        return f;
      }),
    }));
    if (activePage === pageNum) setActivePage(pageNum - 1);
  };

  /* ── loading ── */
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-400">
        Chargement du formulaire…
      </div>
    );
  }

  /* ── render ── */
  return (
    <form onSubmit={handleSave} className="flex flex-col" style={{ minHeight: "calc(100vh - 64px)" }}>

      {/* ════════ TOP BAR ════════ */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-3 shadow-sm flex-shrink-0">
        <button type="button" onClick={() => navigate("/formulaires")} className="btn-ghost border p-2 flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Inline editable title */}
        <div className="flex-1 min-w-0">
          <input
            className="font-semibold text-slate-900 text-base bg-transparent border-0 outline-none w-full placeholder:text-slate-400 hover:bg-slate-50 focus:bg-white rounded px-1 py-0.5 focus:ring-1 focus:ring-orange-300 transition-all"
            placeholder="Titre du formulaire…"
            value={editor.title}
            onChange={e => setEditor(prev => ({ ...prev, title: e.target.value }))}
          />
          {editor.slug && <p className="text-[11px] text-slate-400 font-mono px-1">/f/{editor.slug}</p>}
        </div>

        {/* Status chip */}
        <button
          type="button"
          onClick={() => setEditor(prev => ({ ...prev, status: prev.status === "active" ? "draft" : "active" }))}
          className={`flex-shrink-0 hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full border transition-all ${
            editor.status === "active"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
              : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${editor.status === "active" ? "bg-emerald-500" : "bg-slate-400"}`} />
          {editor.status === "active" ? "Actif" : "Brouillon"}
        </button>

        {/* Preview */}
        {editor.slug && (
          <a href={`/f/${editor.slug}`} target="_blank" rel="noopener noreferrer"
            className="btn-ghost border p-2 flex-shrink-0" title="Prévisualiser">
            <Eye className="w-4 h-4" />
          </a>
        )}

        {/* Draft save indicator */}
        {!editor.id && lastDraftSavedAt && (
          <span className="text-[11px] text-slate-400 hidden lg:inline flex-shrink-0">
            Sauvegardé {new Date(lastDraftSavedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}

        <button type="button" onClick={() => navigate("/formulaires")} className="btn-ghost border hidden sm:inline-flex flex-shrink-0">
          Annuler
        </button>
        <button type="submit" className="btn-primary flex-shrink-0" disabled={saving}>
          <FileText className="w-4 h-4" />
          {saving ? "Sauvegarde…" : editor.id ? "Enregistrer" : "Créer"}
        </button>
      </div>

      {/* ════════ NOTICES ════════ */}
      {(notice || validationErrors.length > 0) && (
        <div className="px-4 sm:px-6 pt-3 space-y-2 flex-shrink-0">
          {notice && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-800 flex items-center justify-between gap-2">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice("")} className="flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          {validationErrors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <p className="font-medium mb-1">Corrigez les erreurs suivantes :</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {validationErrors.map((err, i) => <li key={i}>{err.message}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ════════ FORM META ════════ */}
      <div className="px-4 sm:px-6 pt-3 flex-shrink-0">
        <div className="card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Description */}
            <div className="sm:col-span-2 space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Description (introduction)</label>
                <textarea
                  className="input mt-1 min-h-[52px] text-sm resize-none"
                  placeholder="Texte d'introduction affiché en haut du formulaire…"
                  value={editor.description}
                  onChange={e => setEditor(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Texte du bouton d'envoi</label>
                  <input
                    className="input mt-1 text-sm"
                    placeholder="Envoyer"
                    value={editor.settings?.submit_label || ""}
                    onChange={e => setEditor(prev => ({ ...prev, settings: { ...prev.settings, submit_label: e.target.value } }))}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Texte de fin (après envoi)</label>
                  <textarea
                    className="input mt-1 min-h-[52px] text-sm resize-none"
                    placeholder="Merci, votre réponse a été enregistrée."
                    value={editor.settings?.success_message || ""}
                    onChange={e => setEditor(prev => ({ ...prev, settings: { ...prev.settings, success_message: e.target.value } }))}
                  />
                </div>
              </div>
            </div>
            {/* Stats */}
            <div className="flex flex-wrap sm:flex-col gap-2 text-xs text-slate-500 sm:justify-end">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
                <CheckSquare className="w-3.5 h-3.5" /> {realFieldsCount} champ{realFieldsCount !== 1 ? "s" : ""}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
                <Layers className="w-3.5 h-3.5" /> {totalPages} page{totalPages !== 1 ? "s" : ""}
              </span>
              {editor.id && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
                  <Users className="w-3.5 h-3.5" /> {editor.submissions_count} réponse{editor.submissions_count !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ════════ TABS + CONTENT ════════ */}
      <div className="flex-1 flex flex-col px-4 sm:px-6 pb-6 pt-3 min-h-0">
        <div className="card overflow-hidden flex flex-col flex-1 min-h-0">
          <TabBar active={activeTab} onChange={handleTabChange} submissionsCount={editor.submissions_count} />

          {/* ── CHAMPS TAB ── */}
          {activeTab === "champs" && (
            <div className="flex flex-1 min-h-0 overflow-hidden" style={{ minHeight: "62vh" }}>

              {/* ─── Left: field list ─── */}
              <div className={`flex flex-col border-r border-slate-100 bg-slate-50/40 flex-shrink-0 ${selectedField ? "hidden md:flex w-64 xl:w-72" : "flex w-full md:w-64 xl:w-72"}`}>

                {/* Page tabs */}
                <div className="flex items-center gap-1 px-2 py-2 border-b border-slate-100 overflow-x-auto flex-shrink-0 bg-white">
                  {pageNums.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setActivePage(p);
                        const first = editor.fields.find(f => Number(f.page || 1) === p);
                        if (first) setSelectedFieldId(first._id);
                      }}
                      className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        effectiveActivePage === p
                          ? "bg-orange-500 text-white shadow-sm"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      }`}
                    >
                      <Layers className="w-3 h-3" />
                      Page {p}
                      {effectiveActivePage === p && pageNums.length > 1 && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={e => { e.stopPropagation(); removePage(p); }}
                          onKeyDown={e => e.key === "Enter" && removePage(p)}
                          className="ml-0.5 rounded-full hover:bg-white/30 p-0.5 leading-none"
                          title="Supprimer cette page"
                        >
                          <X className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </button>
                  ))}
                  <button type="button" onClick={addPage} title="Nouvelle page"
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-orange-600 transition-colors ml-auto">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Fields */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
                  {activePageFields.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Layers className="w-7 h-7 text-slate-200 mb-2" />
                      <p className="text-xs text-slate-400">Aucun champ sur cette page</p>
                    </div>
                  ) : (
                    editor.fields
                      .map((field, idx) => ({ field, idx }))
                      .filter(({ field }) => Number(field.page || 1) === effectiveActivePage)
                      .map(({ field, idx }) => (
                        <FieldCard
                          key={field._id || idx}
                          field={field}
                          idx={idx}
                          total={editor.fields.length}
                          isSelected={selectedFieldId === field._id}
                          canRemove={editor.fields.length > 1}
                          isDragging={draggedFieldIndex === idx}
                          onSelect={() => setSelectedFieldId(field._id)}
                          onRemove={() => removeField(idx)}
                          onDuplicate={() => duplicateField(idx)}
                          onMoveUp={() => moveField(idx, idx - 1)}
                          onMoveDown={() => moveField(idx, idx + 1)}
                          onDragStart={() => setDraggedFieldIndex(idx)}
                          onDrop={() => {
                            if (draggedFieldIndex !== null) moveField(draggedFieldIndex, idx);
                            setDraggedFieldIndex(null);
                          }}
                          onDragEnd={() => setDraggedFieldIndex(null)}
                        />
                      ))
                  )}
                </div>

                {/* Add field */}
                <div className="flex-shrink-0 p-2 border-t border-slate-100 bg-white">
                  <div className="relative" ref={typePickerRef}>
                    {showTypePicker && (
                      <TypePickerPopover
                        onAdd={type => addField(type, effectiveActivePage)}
                        onClose={() => setShowTypePicker(false)}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setShowTypePicker(v => !v)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 py-2.5 text-xs font-medium text-slate-500 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50/50 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Ajouter un champ
                      <ChevronDown className="w-3 h-3 ml-auto text-slate-400" />
                    </button>
                  </div>
                </div>
              </div>

              {/* ─── Right: field editor ─── */}
              <div className={`flex-1 overflow-hidden flex flex-col min-h-0 ${selectedField ? "flex" : "hidden md:flex"}`}>
                {selectedField ? (
                  <>
                    {/* Mobile back button */}
                    <div className="md:hidden flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50">
                      <button type="button"
                        onClick={() => setSelectedFieldId(null)}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium">
                        <ArrowLeft className="w-3.5 h-3.5" /> Retour aux champs
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto min-h-0">
                      <FieldEditor
                        key={selectedField._id}
                        field={selectedField}
                        idx={selectedFieldIdx}
                        totalPages={totalPages}
                        otherFields={editor.fields.filter(f => f._id !== selectedField._id)}
                        onUpdate={patch => updateField(selectedFieldIdx, patch)}
                        onRemove={() => removeField(selectedFieldIdx)}
                        onDuplicate={() => duplicateField(selectedFieldIdx)}
                      />
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                      <CheckSquare className="w-7 h-7 text-slate-300" />
                    </div>
                    <p className="font-medium text-slate-500 mb-1">Aucun champ sélectionné</p>
                    <p className="text-sm max-w-xs">
                      Cliquez sur un champ à gauche pour le modifier,<br/>
                      ou ajoutez un nouveau champ.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── OTHER TABS ── */}
          {activeTab !== "champs" && (
            <div className="p-4 sm:p-5 overflow-y-auto flex-1">
              {activeTab === "apparence" && (
                <FormBrandingPanel
                  settings={editor.settings}
                  title={editor.title}
                  description={editor.description}
                  onChange={settings => setEditor(prev => ({ ...prev, settings }))}
                />
              )}
              {activeTab === "settings" && (
                <FormSettingsPanel
                  settings={editor.settings}
                  onChange={settings => setEditor(prev => ({ ...prev, settings }))}
                />
              )}
              {activeTab === "reponses" && (
                editor.id ? (
                  <FormSubmissionsPanel
                    formFields={editor.fields}
                    submissions={submissions}
                    submissionsLoading={submissionsLoading}
                    exportingFormat={exportingFormat}
                    onExport={handleExport}
                    onDeleteSubmission={handleDeleteSubmission}
                  />
                ) : (
                  <div className="text-center py-12 text-slate-400">
                    <BarChart3 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm">Sauvegardez d&apos;abord le formulaire pour voir les réponses.</p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
