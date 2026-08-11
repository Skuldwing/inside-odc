import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Plus, FileText, ArrowLeft, Layers, Users, CheckSquare, ListChecks,
} from "lucide-react";
import api from "../api";
import FieldEditor from "./formulaires/FieldEditor";
import FormBrandingPanel from "./formulaires/FormBrandingPanel";
import FormSettingsPanel from "./formulaires/FormSettingsPanel";
import FormSubmissionsPanel from "./formulaires/FormSubmissionsPanel";
import { FORM_EDITOR_DRAFT_KEY, FIELD_TYPES, EDITOR_TABS } from "./formulaires/constants";
import {
  defaultSettings, isoToLocalDateTime, localDateTimeToIso,
  createField, createEditor, migrateField,
} from "./formulaires/helpers";

/* ── TabBar ── */
function TabBar({ tabs, active, onChange, submissionsCount }) {
  return (
    <div className="flex border-b border-slate-200 bg-slate-50 rounded-t-2xl overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`flex-shrink-0 flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            active === tab.id
              ? "border-orange-500 text-orange-600 bg-white"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          }`}
        >
          {tab.label}
          {tab.id === "reponses" && submissionsCount > 0 && (
            <span className="rounded-full bg-orange-100 text-orange-700 text-[10px] font-semibold px-1.5 py-0.5 leading-none">
              {submissionsCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── AddFieldDropdown ── */
function AddFieldDropdown({ onAdd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn-primary flex items-center gap-1.5" onClick={() => setOpen(v => !v)}>
        <Plus className="w-4 h-4" />
        Ajouter
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="p-1.5 grid grid-cols-2 gap-0.5">
            {FIELD_TYPES.map((ft) => (
              <button
                key={ft.value}
                type="button"
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-700 hover:bg-orange-50 hover:text-orange-700 transition-colors"
                onClick={() => { onAdd(ft.value); setOpen(false); }}
              >
                <span className="text-base leading-none">{ft.icon}</span>
                {ft.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   FormulaireEditor — page complète
══════════════════════════════════════════ */
export default function FormulaireEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const [loading, setLoading]       = useState(!isNew);
  const [saving, setSaving]         = useState(false);
  const [activeTab, setActiveTab]   = useState("champs");
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [exportingFormat, setExportingFormat] = useState("");
  const [notice, setNotice]         = useState("");
  const [validationErrors, setValidationErrors] = useState([]);
  const [collapsedFields, setCollapsedFields] = useState({});
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState("");
  const [draggedFieldIndex, setDraggedFieldIndex] = useState(null);
  const [editor, setEditor]         = useState(createEditor());

  /* ── Load existing form or restore draft ── */
  useEffect(() => {
    if (!isNew) {
      setLoading(true);
      api.get(`/forms/${id}`)
        .then(res => {
          const form = res.data;
          setEditor({
            id: form.id,
            title: form.title || "",
            description: form.description || "",
            status: form.status || "draft",
            slug: form.slug || "",
            fields: Array.isArray(form.fields) && form.fields.length
              ? form.fields.map((f, idx) => migrateField(f, idx))
              : [createField("text", 1)],
            settings: {
              ...defaultSettings(),
              ...(form.settings || {}),
              open_at: isoToLocalDateTime(form?.settings?.open_at),
              close_at: isoToLocalDateTime(form?.settings?.close_at),
            },
            submissions_count: Number(form.submissions_count || 0),
          });
        })
        .catch(() => { setNotice("Erreur chargement formulaire."); })
        .finally(() => setLoading(false));
      return;
    }

    // Nouveau formulaire : tenter de restaurer le brouillon
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
              ? parsed.editor.fields.map((f, idx) => ({ ...createField("text", idx + 1), ...f, page: Number(f?.page) > 0 ? Number(f.page) : 1 }))
              : [createField("text", 1)],
          };
          restored = true;
          savedAt = String(parsed?.savedAt || "");
        }
      }
    } catch { /* ignore */ }
    setEditor(nextEditor);
    setNotice(restored ? "Brouillon local restauré." : "");
    setLastDraftSavedAt(savedAt);
  }, [id, isNew]);

  /* ── Draft autosave ── */
  useEffect(() => {
    if (!isNew || editor.id) return;
    const timer = setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        localStorage.setItem(FORM_EDITOR_DRAFT_KEY, JSON.stringify({ editor, savedAt }));
        setLastDraftSavedAt(savedAt);
      } catch { /* ignore */ }
    }, 700);
    return () => clearTimeout(timer);
  }, [editor, isNew]);

  /* ── Tab switch : auto-charge les réponses ── */
  const handleTabChange = async (tab) => {
    setActiveTab(tab);
    if (tab === "reponses" && editor.id && submissions.length === 0) {
      setSubmissionsLoading(true);
      try {
        const res = await api.get(`/forms/${editor.id}/submissions`);
        setSubmissions(res.data || []);
      } catch { /* ignore */ } finally { setSubmissionsLoading(false); }
    }
  };

  /* ── Export réponses ── */
  const handleExport = async (format) => {
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
      const a = document.createElement("a");
      a.href = url;
      a.download = `${editor.slug || `form-${editor.id}`}-reponses.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { alert("Erreur export"); } finally { setExportingFormat(""); }
  };

  const handleDeleteSubmission = async (submissionId) => {
    try {
      await api.delete(`/forms/${editor.id}/submissions/${submissionId}`);
      setSubmissions(prev => prev.filter(s => s.id !== submissionId));
      setEditor(prev => ({ ...prev, submissions_count: Math.max(0, (prev.submissions_count || 0) - 1) }));
    } catch { alert("Erreur suppression réponse"); }
  };

  /* ── Sauvegarde ── */
  const handleSave = async (e) => {
    e.preventDefault();
    const errors = [];
    if (!editor.title.trim()) errors.push({ message: "Le titre du formulaire est requis." });
    if (!editor.fields.length) errors.push({ message: "Ajoutez au moins un champ." });
    const seenKeys = new Set();
    editor.fields.forEach((field, idx) => {
      const label = String(field?.label || "").trim();
      const key   = String(field?.key || "").trim();
      if (!label) errors.push({ message: `Champ ${idx + 1} : libellé requis.`, fieldIndex: idx });
      if (field.type === "separator") return;
      if (!key) errors.push({ message: `Champ ${idx + 1} : clé requise.`, fieldIndex: idx });
      else if (seenKeys.has(key)) errors.push({ message: `Champ ${idx + 1} : clé '${key}' en doublon.`, fieldIndex: idx });
      else seenKeys.add(key);
      const isChoice = field?.type === "select" || field?.type === "checkbox";
      if (isChoice && !(field?.options || []).filter(Boolean).length) {
        errors.push({ message: `Champ ${idx + 1} : ajoutez au moins une option.`, fieldIndex: idx });
      }
      if (field?.show_if?.rules) {
        for (const rule of field.show_if.rules) {
          if (!String(rule.key || "").trim()) {
            errors.push({ message: `Champ ${idx + 1} : sélectionnez un champ pour chaque condition.`, fieldIndex: idx });
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
      if (errors.some(e => Number.isInteger(e.fieldIndex))) {
        setActiveTab("champs");
        setCollapsedFields(prev => {
          const next = { ...prev };
          errors.forEach(err => { if (Number.isInteger(err.fieldIndex)) next[err.fieldIndex] = false; });
          return next;
        });
      }
      return;
    }

    setValidationErrors([]);
    setNotice("");
    setSaving(true);
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
      if (editor.id) {
        await api.put(`/forms/${editor.id}`, payload);
      } else {
        await api.post("/forms", payload);
        localStorage.removeItem(FORM_EDITOR_DRAFT_KEY);
      }
      navigate("/formulaires");
    } catch (err) {
      alert(err?.response?.data?.error || "Erreur sauvegarde formulaire");
    } finally {
      setSaving(false);
    }
  };

  /* ── Manipulation des champs ── */
  const addField = (type = "text") => {
    const idx = editor.fields.length + 1;
    setEditor(prev => ({ ...prev, fields: [...prev.fields, createField(type, idx)] }));
    setCollapsedFields(prev => ({ ...prev, [editor.fields.length]: false }));
  };

  const removeField = (index) =>
    setEditor(prev => ({ ...prev, fields: prev.fields.filter((_, i) => i !== index) }));

  const duplicateField = (index) =>
    setEditor(prev => {
      const field = prev.fields[index];
      const copy  = { ...field, key: field.type === "separator" ? `sep_${prev.fields.length + 1}` : `${field.key}_copie`, label: `${field.label} (copie)` };
      const next  = [...prev.fields];
      next.splice(index + 1, 0, copy);
      return { ...prev, fields: next };
    });

  const updateField = (index, patch) =>
    setEditor(prev => ({ ...prev, fields: prev.fields.map((f, i) => i === index ? { ...f, ...patch } : f) }));

  const moveField = (from, to) => {
    if (from === to) return;
    setEditor(prev => {
      if (from < 0 || to < 0 || from >= prev.fields.length || to >= prev.fields.length) return prev;
      const next = [...prev.fields];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...prev, fields: next };
    });
    setCollapsedFields(prev => {
      const arr = editor.fields.map((_, i) => Boolean(prev[i]));
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      const next = {};
      arr.forEach((v, i) => { if (v) next[i] = true; });
      return next;
    });
  };

  const toggleFieldCollapsed = (index) =>
    setCollapsedFields(prev => ({ ...prev, [index]: !prev[index] }));

  const totalPages       = new Set(editor.fields.map(f => Number(f.page || 1))).size;
  const realFieldsCount  = editor.fields.filter(f => f.type !== "separator").length;

  /* ── Render ── */
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-400">
        Chargement du formulaire…
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col min-h-[calc(100vh-64px)]">

      {/* ── Barre du haut ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-3 shadow-sm">
        <button
          type="button"
          onClick={() => navigate("/formulaires")}
          className="btn-ghost border p-2"
          title="Retour"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-slate-900 truncate text-base">
            {editor.title || (isNew ? "Nouveau formulaire" : "Formulaire sans titre")}
          </h1>
          {editor.slug && (
            <p className="text-xs text-slate-400 font-mono truncate">/f/{editor.slug}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!editor.id && lastDraftSavedAt && (
            <span className="text-xs text-slate-400 hidden sm:inline">
              Brouillon auto-sauvegardé à{" "}
              {new Date(lastDraftSavedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button type="button" onClick={() => navigate("/formulaires")} className="btn-ghost border hidden sm:inline-flex">
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            <FileText className="w-4 h-4" />
            {saving ? "Sauvegarde…" : editor.id ? "Enregistrer" : "Créer"}
          </button>
        </div>
      </div>

      {/* ── Corps ── */}
      <div className="flex-1 px-4 sm:px-6 py-6 space-y-4 max-w-5xl mx-auto w-full">

        {/* Notices */}
        {(notice || validationErrors.length > 0) && (
          <div className="space-y-2">
            {notice && (
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                {notice}
              </div>
            )}
            {validationErrors.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <p className="font-medium mb-1">Corrigez les points suivants :</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {validationErrors.map((err, i) => (
                    <li key={`${err.message}-${i}`}>{err.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Titre + meta */}
        <div className="card p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-slate-500">Titre *</label>
              <input
                className="input mt-1"
                required
                placeholder="Mon formulaire…"
                value={editor.title}
                onChange={e => setEditor(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Statut</label>
              <select
                className="select mt-1"
                value={editor.status}
                onChange={e => setEditor(prev => ({ ...prev, status: e.target.value }))}
              >
                <option value="draft">Brouillon</option>
                <option value="active">Actif (public)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Description</label>
            <textarea
              className="input mt-1 min-h-[60px] text-sm"
              placeholder="Description du formulaire…"
              value={editor.description}
              onChange={e => setEditor(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">
              <CheckSquare className="w-3.5 h-3.5" />
              {realFieldsCount} champ{realFieldsCount !== 1 ? "s" : ""}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">
              <Layers className="w-3.5 h-3.5" />
              {totalPages} page{totalPages !== 1 ? "s" : ""}
            </span>
            {editor.id && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">
                <Users className="w-3.5 h-3.5" />
                {editor.submissions_count} réponse{editor.submissions_count !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="card overflow-hidden">
          <TabBar
            tabs={EDITOR_TABS}
            active={activeTab}
            onChange={handleTabChange}
            submissionsCount={editor.submissions_count}
          />

          <div className="p-4 sm:p-5">

            {/* Champs */}
            {activeTab === "champs" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <button type="button" className="btn-ghost border text-xs" onClick={() => setCollapsedFields({})}>
                      Tout ouvrir
                    </button>
                    <button type="button" className="btn-ghost border text-xs" onClick={() => {
                      const next = {};
                      editor.fields.forEach((_, i) => { next[i] = true; });
                      setCollapsedFields(next);
                    }}>
                      Tout réduire
                    </button>
                  </div>
                  <AddFieldDropdown onAdd={addField} />
                </div>

                <p className="text-xs text-slate-400">
                  Glissez pour réordonner · Utilisez les flèches pour déplacer précisément
                </p>

                {editor.fields.map((field, idx) => (
                  <FieldEditor
                    key={`${field.key}-${idx}`}
                    field={field}
                    idx={idx}
                    total={editor.fields.length}
                    totalPages={totalPages}
                    otherFields={editor.fields.filter((_, i) => i !== idx)}
                    isCollapsed={Boolean(collapsedFields[idx])}
                    isDragging={draggedFieldIndex === idx}
                    canRemove={editor.fields.length > 1}
                    onUpdate={patch => updateField(idx, patch)}
                    onRemove={() => removeField(idx)}
                    onDuplicate={() => duplicateField(idx)}
                    onMoveUp={() => moveField(idx, idx - 1)}
                    onMoveDown={() => moveField(idx, idx + 1)}
                    onToggleCollapsed={() => toggleFieldCollapsed(idx)}
                    onDragStart={() => setDraggedFieldIndex(idx)}
                    onDrop={() => {
                      if (draggedFieldIndex !== null) moveField(draggedFieldIndex, idx);
                      setDraggedFieldIndex(null);
                    }}
                    onDragEnd={() => setDraggedFieldIndex(null)}
                  />
                ))}

                <button
                  type="button"
                  className="w-full rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm text-slate-400 hover:border-orange-300 hover:text-orange-500 transition-colors"
                  onClick={() => addField("text")}
                >
                  <Plus className="w-4 h-4 inline mr-1" />
                  Ajouter un champ texte
                </button>
              </div>
            )}

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
                  <ListChecks className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">Sauvegardez d&apos;abord le formulaire pour voir les réponses.</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
