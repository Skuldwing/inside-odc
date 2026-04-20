import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  FileText,
  Pencil,
  Trash2,
  Link2,
  Sparkles,
  Layers,
  Workflow,
} from "lucide-react";
import api from "../api";
import AdminPinGate from "../components/AdminPinGate";
import AdminModal from "../components/admin/AdminModal";
import AdminPageHeader from "../components/admin/AdminPageHeader";
import AdminSearchCard from "../components/admin/AdminSearchCard";
import FieldEditor from "./formulaires/FieldEditor";
import FormBrandingPanel from "./formulaires/FormBrandingPanel";
import FormSubmissionsPanel from "./formulaires/FormSubmissionsPanel";
import {
  FORM_EDITOR_DRAFT_KEY,
} from "./formulaires/constants";
import {
  defaultSettings,
  isoToLocalDateTime,
  localDateTimeToIso,
  createField,
  createEditor,
} from "./formulaires/helpers";

export default function Formulaires() {
  const [searchParams] = useSearchParams();
  const queryAction = searchParams.get("action");
  const querySearch = searchParams.get("q") || "";

  const [forms, setForms] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [exportingFormat, setExportingFormat] = useState("");
  const [editorNotice, setEditorNotice] = useState("");
  const [validationErrors, setValidationErrors] = useState([]);
  const [collapsedFields, setCollapsedFields] = useState({});
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState("");
  const [draggedFieldIndex, setDraggedFieldIndex] = useState(null);
  const [editor, setEditor] = useState(createEditor());

  const fetchForms = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/forms");
      setForms(res.data || []);
    } catch (err) {
      console.error(err);
      setError("Erreur chargement formulaires");
      setForms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchForms(); }, []);
  useEffect(() => { setSearch(querySearch); }, [querySearch]);
  useEffect(() => { if (queryAction === "new") openCreate(); }, [queryAction]);

  const filteredForms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forms.filter((f) => {
      if (!q) return true;
      return (
        String(f.title || "").toLowerCase().includes(q) ||
        String(f.slug || "").toLowerCase().includes(q)
      );
    });
  }, [forms, search]);

  const openCreate = () => {
    let nextEditor = createEditor();
    let restored = false;
    let restoredSavedAt = "";
    try {
      const rawDraft = localStorage.getItem(FORM_EDITOR_DRAFT_KEY);
      if (rawDraft) {
        const parsed = JSON.parse(rawDraft);
        if (parsed?.editor && Array.isArray(parsed.editor.fields)) {
          nextEditor = {
            ...createEditor(),
            ...parsed.editor,
            id: null,
            slug: "",
            submissions_count: 0,
            settings: { ...defaultSettings(), ...(parsed.editor.settings || {}) },
            fields: parsed.editor.fields.length
              ? parsed.editor.fields.map((f, idx) => ({
                  ...createField("text", idx + 1),
                  ...f,
                  page: Number(f?.page) > 0 ? Number(f.page) : 1,
                }))
              : [createField("text", 1)],
          };
          restored = true;
          restoredSavedAt = String(parsed?.savedAt || "");
        }
      }
    } catch (err) {
      console.warn("Draft restore failed", err);
    }
    setEditor(nextEditor);
    setSubmissions([]);
    setShowSubmissions(false);
    setValidationErrors([]);
    setCollapsedFields({});
    setEditorNotice(restored ? "Brouillon local restaure." : "");
    setLastDraftSavedAt(restoredSavedAt);
    setEditorOpen(true);
  };

  const openEdit = async (id) => {
    try {
      const res = await api.get(`/forms/${id}`);
      const form = res.data;
      setEditor({
        id: form.id,
        title: form.title || "",
        description: form.description || "",
        status: form.status || "draft",
        slug: form.slug || "",
        fields:
          Array.isArray(form.fields) && form.fields.length
            ? form.fields.map((f, idx) => ({
                ...createField("text", idx + 1),
                ...f,
                page: Number(f?.page) > 0 ? Number(f.page) : 1,
                show_if:
                  f?.show_if &&
                  typeof f.show_if === "object" &&
                  f.show_if.key &&
                  f.show_if.operator
                    ? {
                        key: String(f.show_if.key),
                        operator: String(f.show_if.operator),
                        value: String(f.show_if.value ?? ""),
                      }
                    : null,
              }))
            : [createField("text", 1)],
        settings: {
          ...defaultSettings(),
          ...(form.settings || {}),
          open_at: isoToLocalDateTime(form?.settings?.open_at),
          close_at: isoToLocalDateTime(form?.settings?.close_at),
        },
        submissions_count: Number(form.submissions_count || 0),
      });
      setSubmissions([]);
      setShowSubmissions(false);
      setValidationErrors([]);
      setCollapsedFields({});
      setEditorNotice("");
      setLastDraftSavedAt("");
      setEditorOpen(true);
    } catch (err) {
      console.error(err);
      alert("Erreur chargement formulaire");
    }
  };

  const loadSubmissions = async () => {
    if (!editor.id) return;
    setSubmissionsLoading(true);
    try {
      const res = await api.get(`/forms/${editor.id}/submissions`);
      setSubmissions(res.data || []);
    } catch (err) {
      console.error(err);
      alert("Erreur chargement reponses");
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const handleToggleSubmissions = async () => {
    if (!showSubmissions && submissions.length === 0) await loadSubmissions();
    setShowSubmissions((prev) => !prev);
  };

  const handleExport = async (format) => {
    if (!editor.id) return;
    setExportingFormat(format);
    try {
      const res = await api.get(`/forms/${editor.id}/submissions/export.${format}`, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], {
        type:
          format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "text/csv;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${editor.slug || `form-${editor.id}`}-reponses.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Erreur export");
    } finally {
      setExportingFormat("");
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const errors = [];

    if (!editor.title.trim()) errors.push({ message: "Le titre du formulaire est requis." });
    if (!editor.fields.length) errors.push({ message: "Ajoutez au moins un champ." });

    const seenKeys = new Set();
    editor.fields.forEach((field, idx) => {
      const label = String(field?.label || "").trim();
      const key = String(field?.key || "").trim();
      if (!label) errors.push({ message: `Champ ${idx + 1}: libelle requis.`, fieldIndex: idx });
      if (!key) {
        errors.push({ message: `Champ ${idx + 1}: cle requise.`, fieldIndex: idx });
      } else if (seenKeys.has(key)) {
        errors.push({ message: `Champ ${idx + 1}: cle '${key}' en doublon.`, fieldIndex: idx });
      } else {
        seenKeys.add(key);
      }
      const isChoiceField = field?.type === "select" || field?.type === "checkbox";
      const options = Array.isArray(field?.options) ? field.options.filter(Boolean) : [];
      if (isChoiceField && options.length === 0) {
        errors.push({ message: `Champ ${idx + 1}: ajoutez au moins une option.`, fieldIndex: idx });
      }
      if (field?.show_if && !String(field.show_if.key || "").trim()) {
        errors.push({
          message: `Champ ${idx + 1}: selectionnez un champ pour la condition.`,
          fieldIndex: idx,
        });
      }
    });

    const openAtIso = localDateTimeToIso(editor.settings?.open_at);
    const closeAtIso = localDateTimeToIso(editor.settings?.close_at);
    if (openAtIso && closeAtIso && Date.parse(openAtIso) >= Date.parse(closeAtIso)) {
      errors.push({ message: "La date/heure de fermeture doit etre apres l'ouverture." });
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      setEditorNotice("Corrigez les erreurs avant de sauvegarder.");
      setCollapsedFields((prev) => {
        const next = { ...prev };
        errors.forEach((err) => {
          if (Number.isInteger(err.fieldIndex)) next[err.fieldIndex] = false;
        });
        return next;
      });
      return;
    }

    setValidationErrors([]);
    setEditorNotice("");
    setSaving(true);
    try {
      const payload = {
        title: editor.title,
        description: editor.description,
        status: editor.status,
        settings: {
          ...defaultSettings(),
          ...(editor.settings || {}),
          open_at: localDateTimeToIso(editor.settings?.open_at),
          close_at: localDateTimeToIso(editor.settings?.close_at),
        },
        fields: editor.fields.map((f) => ({
          ...f,
          page: Number(f.page) > 0 ? Number(f.page) : 1,
          options: Array.isArray(f.options) ? f.options.filter(Boolean) : [],
          show_if:
            f.show_if && f.show_if.key
              ? { key: f.show_if.key, operator: f.show_if.operator || "eq", value: String(f.show_if.value ?? "") }
              : null,
        })),
      };
      if (editor.id) {
        await api.put(`/forms/${editor.id}`, payload);
      } else {
        await api.post("/forms", payload);
      }
      await fetchForms();
      if (!editor.id) localStorage.removeItem(FORM_EDITOR_DRAFT_KEY);
      setEditorOpen(false);
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.error || "Erreur sauvegarde formulaire");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Supprimer ce formulaire ?")) return;
    try {
      await api.delete(`/forms/${id}`);
      await fetchForms();
      if (editor.id === id) setEditorOpen(false);
    } catch (err) {
      console.error(err);
      alert("Erreur suppression formulaire");
    }
  };

  const handleCopyPublicLink = async (slug) => {
    const link = `${window.location.origin}/f/${slug}`;
    try {
      await navigator.clipboard.writeText(link);
      alert("Lien copie.");
    } catch (err) {
      console.error(err);
      alert(link);
    }
  };

  /* ── Field manipulation ── */
  const addField = () => {
    setEditor((prev) => ({
      ...prev,
      fields: [...prev.fields, createField("text", prev.fields.length + 1)],
    }));
    setCollapsedFields((prev) => ({ ...prev, [editor.fields.length]: false }));
  };

  const removeField = (index) => {
    setEditor((prev) => ({ ...prev, fields: prev.fields.filter((_, idx) => idx !== index) }));
  };

  const updateField = (index, patch) => {
    setEditor((prev) => ({
      ...prev,
      fields: prev.fields.map((field, idx) => (idx === index ? { ...field, ...patch } : field)),
    }));
  };

  const toggleFieldCondition = (index, enabled) => {
    setEditor((prev) => {
      const fallbackKey =
        prev.fields.find((_, idx) => idx !== index && prev.fields[idx]?.key)?.key || "";
      return {
        ...prev,
        fields: prev.fields.map((field, idx) => {
          if (idx !== index) return field;
          if (!enabled) return { ...field, show_if: null };
          return { ...field, show_if: { key: fallbackKey, operator: "eq", value: "" } };
        }),
      };
    });
  };

  const toggleFieldCollapsed = (index) => {
    setCollapsedFields((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const collapseAllFields = () => {
    const next = {};
    editor.fields.forEach((_, idx) => { next[idx] = true; });
    setCollapsedFields(next);
  };

  const expandAllFields = () => setCollapsedFields({});

  const moveField = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    setEditor((prev) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.fields.length || toIndex >= prev.fields.length) return prev;
      const nextFields = [...prev.fields];
      const [moved] = nextFields.splice(fromIndex, 1);
      nextFields.splice(toIndex, 0, moved);
      return { ...prev, fields: nextFields };
    });
    setCollapsedFields((prev) => {
      const entries = editor.fields.map((_, idx) => Boolean(prev[idx]));
      const [moved] = entries.splice(fromIndex, 1);
      entries.splice(toIndex, 0, moved);
      const next = {};
      entries.forEach((value, idx) => { if (value) next[idx] = true; });
      return next;
    });
  };

  /* ── Draft autosave ── */
  useEffect(() => {
    if (!editorOpen || editor.id) return;
    const timer = setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        localStorage.setItem(FORM_EDITOR_DRAFT_KEY, JSON.stringify({ editor, savedAt }));
        setLastDraftSavedAt(savedAt);
      } catch (err) {
        console.warn("Draft autosave failed", err);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [editor, editorOpen]);

  return (
    <AdminPinGate>
      <div className="space-y-6">
        <AdminPageHeader
          title="Formulaires"
          subtitle="Editeur de formulaires (inscriptions, activites, etc.)"
          buttonLabel="Nouveau formulaire"
          buttonIcon={Plus}
          onAdd={openCreate}
        />

        <AdminSearchCard
          placeholder="Rechercher un formulaire..."
          value={search}
          onChange={setSearch}
        />

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="card p-6 text-center text-slate-500">Chargement...</div>
        ) : filteredForms.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">Aucun formulaire trouve.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredForms.map((form) => (
              <div key={form.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{form.title}</p>
                    <p className="text-xs text-slate-500">/{form.slug}</p>
                  </div>
                  <span
                    className={`badge ${
                      form.status === "active"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {form.status === "active" ? "Actif" : "Brouillon"}
                  </span>
                </div>
                <p className="text-sm text-slate-500">{form.description || "Aucune description"}</p>
                <div className="text-xs text-slate-500">
                  Reponses: {Number(form.submissions_count || 0)}
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-ghost border" onClick={() => openEdit(form.id)}>
                    <Pencil className="w-4 h-4" />
                    Modifier
                  </button>
                  <button className="btn-ghost border" onClick={() => handleCopyPublicLink(form.slug)}>
                    <Link2 className="w-4 h-4" />
                    Lien
                  </button>
                  <button
                    className="btn-ghost border text-red-600"
                    onClick={() => handleDelete(form.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {editorOpen && (
          <AdminModal
            title={editor.id ? "Modifier formulaire" : "Nouveau formulaire"}
            onClose={() => setEditorOpen(false)}
            maxWidth="max-w-6xl"
          >
            <form onSubmit={handleSave} className="space-y-5">
              {editorNotice && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                  {editorNotice}
                </div>
              )}

              {validationErrors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <p className="font-medium">Veuillez corriger les points suivants :</p>
                  <ul className="mt-1 list-disc pl-5">
                    {validationErrors.map((err, idx) => (
                      <li key={`${err.message}-${idx}`}>{err.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1">
                    <Sparkles className="w-3 h-3" />
                    Builder V2
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1">
                    <Layers className="w-3 h-3" />
                    {editor.fields.length} champs
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1">
                    <Workflow className="w-3 h-3" />
                    {new Set(editor.fields.map((f) => Number(f.page || 1))).size} pages
                  </span>
                </div>
              </section>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <div className="xl:col-span-2 space-y-5">
                  {/* Informations */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
                    <p className="font-medium text-slate-900">Informations</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">Titre *</label>
                        <input
                          className="input mt-1"
                          required
                          value={editor.title}
                          onChange={(e) =>
                            setEditor((prev) => ({ ...prev, title: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Statut</label>
                        <select
                          className="select mt-1"
                          value={editor.status}
                          onChange={(e) =>
                            setEditor((prev) => ({ ...prev, status: e.target.value }))
                          }
                        >
                          <option value="draft">Brouillon</option>
                          <option value="active">Actif (public)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <textarea
                        className="input mt-1 min-h-20"
                        value={editor.description}
                        onChange={(e) =>
                          setEditor((prev) => ({ ...prev, description: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  {/* Champs */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-900">Champs du formulaire</p>
                      <div className="flex items-center gap-2">
                        <button type="button" className="btn-ghost border" onClick={expandAllFields}>
                          Tout ouvrir
                        </button>
                        <button type="button" className="btn-ghost border" onClick={collapseAllFields}>
                          Tout reduire
                        </button>
                        <button type="button" className="btn-primary" onClick={addField}>
                          <Plus className="w-4 h-4" />
                          Ajouter champ
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      Astuce: glissez-deposez un champ pour changer l&apos;ordre.
                    </p>

                    {editor.fields.map((field, idx) => (
                      <FieldEditor
                        key={`${field.key}-${idx}`}
                        field={field}
                        idx={idx}
                        otherFields={editor.fields.filter((_, i) => i !== idx)}
                        isCollapsed={Boolean(collapsedFields[idx])}
                        isDragging={draggedFieldIndex === idx}
                        canRemove={editor.fields.length > 1}
                        onUpdate={(patch) => updateField(idx, patch)}
                        onRemove={() => removeField(idx)}
                        onToggleCollapsed={() => toggleFieldCollapsed(idx)}
                        onToggleCondition={(enabled) => toggleFieldCondition(idx, enabled)}
                        onDragStart={() => setDraggedFieldIndex(idx)}
                        onDrop={() => {
                          if (draggedFieldIndex !== null) moveField(draggedFieldIndex, idx);
                          setDraggedFieldIndex(null);
                        }}
                        onDragEnd={() => setDraggedFieldIndex(null)}
                      />
                    ))}
                  </div>
                </div>

                {/* Panneau droit */}
                <FormBrandingPanel
                  settings={editor.settings}
                  title={editor.title}
                  description={editor.description}
                  onChange={(settings) => setEditor((prev) => ({ ...prev, settings }))}
                />
              </div>

              {editor.slug && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                  Lien public:{" "}
                  <span className="font-medium">{`${window.location.origin}/f/${editor.slug}`}</span>
                </div>
              )}

              {editor.id && (
                <FormSubmissionsPanel
                  submissionsCount={editor.submissions_count}
                  submissions={submissions}
                  submissionsLoading={submissionsLoading}
                  showSubmissions={showSubmissions}
                  exportingFormat={exportingFormat}
                  onToggleSubmissions={handleToggleSubmissions}
                  onExport={handleExport}
                />
              )}

              <div className="sticky bottom-0 z-10 -mx-6 mt-2 flex justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
                {!editor.id && lastDraftSavedAt && (
                  <p className="mr-auto self-center text-xs text-slate-500">
                    Brouillon auto-sauvegarde a{" "}
                    {new Date(lastDraftSavedAt).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="btn-ghost border"
                >
                  Annuler
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  <FileText className="w-4 h-4" />
                  {saving ? "Sauvegarde..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </AdminModal>
        )}
      </div>
    </AdminPinGate>
  );
}
