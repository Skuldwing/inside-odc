import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  FileText,
  Pencil,
  Trash2,
  Link2,
  ExternalLink,
  Copy,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  Layers,
  Workflow,
  Users,
  CheckSquare,
  ListChecks,
} from "lucide-react";
import api from "../api";
import AdminPinGate from "../components/AdminPinGate";
import AdminModal from "../components/admin/AdminModal";
import AdminPageHeader from "../components/admin/AdminPageHeader";
import AdminSearchCard from "../components/admin/AdminSearchCard";
import FieldEditor from "./formulaires/FieldEditor";
import FormBrandingPanel from "./formulaires/FormBrandingPanel";
import FormSettingsPanel from "./formulaires/FormSettingsPanel";
import FormSubmissionsPanel from "./formulaires/FormSubmissionsPanel";
import { FORM_EDITOR_DRAFT_KEY, FIELD_TYPES, EDITOR_TABS } from "./formulaires/constants";
import {
  defaultSettings,
  isoToLocalDateTime,
  localDateTimeToIso,
  createField,
  createEditor,
} from "./formulaires/helpers";

/* ── TabBar ── */
function TabBar({ tabs, active, onChange, submissionsCount }) {
  return (
    <div className="flex border-b border-slate-200 bg-slate-50 rounded-t-2xl overflow-hidden">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
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

/* ── FormCard ── */
function FormCard({ form, onEdit, onDelete, onCopyLink, onToggleStatus, onDuplicate }) {
  const isActive = form.status === "active";

  return (
    <div className="card p-4 space-y-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 truncate">{form.title}</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">/{form.slug}</p>
        </div>
        <button
          type="button"
          onClick={() => onToggleStatus(form)}
          title={isActive ? "Desactiver" : "Activer"}
          className="flex-shrink-0"
        >
          {isActive ? (
            <ToggleRight className="w-8 h-8 text-orange-500" />
          ) : (
            <ToggleLeft className="w-8 h-8 text-slate-300" />
          )}
        </button>
      </div>

      {form.description && (
        <p className="text-sm text-slate-500 line-clamp-2">{form.description}</p>
      )}

      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Users className="w-3.5 h-3.5" />
          {Number(form.submissions_count || 0)} reponse{Number(form.submissions_count || 0) !== 1 ? "s" : ""}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            isActive
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {isActive ? "Actif" : "Brouillon"}
        </span>
      </div>

      <div className="flex items-center gap-1.5 pt-0.5">
        <button
          type="button"
          className="btn-ghost border flex-1 text-sm"
          onClick={() => onEdit(form.id)}
        >
          <Pencil className="w-3.5 h-3.5" />
          Modifier
        </button>
        <button
          type="button"
          className="btn-ghost border p-2"
          onClick={() => onCopyLink(form.slug)}
          title="Copier le lien public"
        >
          <Link2 className="w-4 h-4" />
        </button>
        {isActive && (
          <a
            href={`${window.location.origin}/f/${form.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost border p-2"
            title="Ouvrir le formulaire"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
        <button
          type="button"
          className="btn-ghost border p-2"
          onClick={() => onDuplicate(form.id)}
          title="Dupliquer"
        >
          <Copy className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="btn-ghost border p-2 text-red-500 hover:bg-red-50"
          onClick={() => onDelete(form.id)}
          title="Supprimer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
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
      <button
        type="button"
        className="btn-primary flex items-center gap-1.5"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus className="w-4 h-4" />
        Ajouter
        <ChevronDown className="w-3.5 h-3.5 opacity-70" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
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

/* ══════════════════════════════════════════════════
   Main Formulaires component
══════════════════════════════════════════════════ */
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
  const [activeTab, setActiveTab] = useState("champs");
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [exportingFormat, setExportingFormat] = useState("");
  const [editorNotice, setEditorNotice] = useState("");
  const [validationErrors, setValidationErrors] = useState([]);
  const [collapsedFields, setCollapsedFields] = useState({});
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState("");
  const [draggedFieldIndex, setDraggedFieldIndex] = useState(null);
  const [editor, setEditor] = useState(createEditor());

  /* ── Fetch ── */
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

  /* ── Open editor ── */
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
    setActiveTab("champs");
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
      setActiveTab("champs");
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

  /* ── Tab change — auto-load submissions ── */
  const handleTabChange = async (tab) => {
    setActiveTab(tab);
    if (tab === "reponses" && editor.id && submissions.length === 0) {
      setSubmissionsLoading(true);
      try {
        const res = await api.get(`/forms/${editor.id}/submissions`);
        setSubmissions(res.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setSubmissionsLoading(false);
      }
    }
  };

  /* ── Submissions ── */
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

  const handleDeleteSubmission = async (submissionId) => {
    try {
      await api.delete(`/forms/${editor.id}/submissions/${submissionId}`);
      setSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
      setEditor((prev) => ({ ...prev, submissions_count: Math.max(0, (prev.submissions_count || 0) - 1) }));
    } catch (err) {
      console.error(err);
      alert("Erreur suppression reponse");
    }
  };

  /* ── Save ── */
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
      if (field.type === "separator") return;
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
        errors.push({ message: `Champ ${idx + 1}: selectionnez un champ pour la condition.`, fieldIndex: idx });
      }
    });

    const openAtIso = localDateTimeToIso(editor.settings?.open_at);
    const closeAtIso = localDateTimeToIso(editor.settings?.close_at);
    if (openAtIso && closeAtIso && Date.parse(openAtIso) >= Date.parse(closeAtIso)) {
      errors.push({ message: "La date de fermeture doit etre apres l'ouverture." });
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      setEditorNotice("Corrigez les erreurs avant de sauvegarder.");
      if (errors.some((e) => Number.isInteger(e.fieldIndex))) {
        setActiveTab("champs");
        setCollapsedFields((prev) => {
          const next = { ...prev };
          errors.forEach((err) => { if (Number.isInteger(err.fieldIndex)) next[err.fieldIndex] = false; });
          return next;
        });
      }
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

  /* ── Form card actions ── */
  const handleDelete = async (id) => {
    if (!confirm("Supprimer ce formulaire definititement ?")) return;
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
      alert("Lien copie !");
    } catch {
      alert(link);
    }
  };

  const handleToggleStatus = async (form) => {
    const newStatus = form.status === "active" ? "draft" : "active";
    try {
      await api.patch(`/forms/${form.id}/status`, { status: newStatus });
      setForms((prev) => prev.map((f) => f.id === form.id ? { ...f, status: newStatus } : f));
    } catch (err) {
      console.error(err);
      alert("Erreur changement statut");
    }
  };

  const handleDuplicate = async (id) => {
    try {
      await api.post(`/forms/${id}/duplicate`);
      await fetchForms();
    } catch (err) {
      console.error(err);
      alert("Erreur duplication formulaire");
    }
  };

  /* ── Field manipulation ── */
  const addField = (type = "text") => {
    const idx = editor.fields.length + 1;
    const newField = createField(type, idx);
    setEditor((prev) => ({ ...prev, fields: [...prev.fields, newField] }));
    setCollapsedFields((prev) => ({ ...prev, [editor.fields.length]: false }));
  };

  const removeField = (index) => {
    setEditor((prev) => ({ ...prev, fields: prev.fields.filter((_, idx) => idx !== index) }));
  };

  const duplicateField = (index) => {
    setEditor((prev) => {
      const field = prev.fields[index];
      const newField = {
        ...field,
        key: field.type === "separator" ? `sep_${prev.fields.length + 1}` : `${field.key}_copie`,
        label: `${field.label} (copie)`,
      };
      const next = [...prev.fields];
      next.splice(index + 1, 0, newField);
      return { ...prev, fields: next };
    });
  };

  const updateField = (index, patch) => {
    setEditor((prev) => ({
      ...prev,
      fields: prev.fields.map((field, idx) => (idx === index ? { ...field, ...patch } : field)),
    }));
  };

  const toggleFieldCondition = (index, enabled) => {
    setEditor((prev) => {
      const fallbackKey = prev.fields.find((_, idx) => idx !== index && prev.fields[idx]?.key)?.key || "";
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

  /* ── Stats ── */
  const totalPages = new Set(editor.fields.map((f) => Number(f.page || 1))).size;
  const realFieldsCount = editor.fields.filter((f) => f.type !== "separator").length;

  /* ══════════════════════════════════════════════════ */
  return (
    <AdminPinGate>
      <div className="space-y-6">
        <AdminPageHeader
          title="Formulaires"
          subtitle="Creez et gerez vos formulaires d'inscription et d'enquete"
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
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="card p-6 text-center text-slate-500 text-sm">Chargement...</div>
        ) : filteredForms.length === 0 ? (
          <div className="card p-8 text-center text-slate-400">
            <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm">Aucun formulaire trouve.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredForms.map((form) => (
              <FormCard
                key={form.id}
                form={form}
                onEdit={openEdit}
                onDelete={handleDelete}
                onCopyLink={handleCopyPublicLink}
                onToggleStatus={handleToggleStatus}
                onDuplicate={handleDuplicate}
              />
            ))}
          </div>
        )}

        {/* ── Editor modal ── */}
        {editorOpen && (
          <AdminModal
            title={editor.id ? "Modifier le formulaire" : "Nouveau formulaire"}
            onClose={() => setEditorOpen(false)}
            maxWidth="max-w-6xl"
          >
            <form onSubmit={handleSave} className="space-y-0">
              {/* Notices */}
              {(editorNotice || validationErrors.length > 0) && (
                <div className="mb-4 space-y-2">
                  {editorNotice && (
                    <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                      {editorNotice}
                    </div>
                  )}
                  {validationErrors.length > 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      <p className="font-medium mb-1">Corrigez les points suivants :</p>
                      <ul className="list-disc pl-5 space-y-0.5">
                        {validationErrors.map((err, idx) => (
                          <li key={`${err.message}-${idx}`}>{err.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Title + meta */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium text-slate-500">Titre *</label>
                    <input
                      className="input mt-1"
                      required
                      placeholder="Mon formulaire..."
                      value={editor.title}
                      onChange={(e) => setEditor((prev) => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500">Statut</label>
                    <select
                      className="select mt-1"
                      value={editor.status}
                      onChange={(e) => setEditor((prev) => ({ ...prev, status: e.target.value }))}
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
                    placeholder="Description du formulaire..."
                    value={editor.description}
                    onChange={(e) => setEditor((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                {/* Stats bar */}
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
                      {editor.submissions_count} reponse{editor.submissions_count !== 1 ? "s" : ""}
                    </span>
                  )}
                  {editor.slug && (
                    <span className="ml-auto text-xs text-slate-400 font-mono truncate max-w-[240px]">
                      /f/{editor.slug}
                    </span>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="rounded-2xl border border-slate-200 overflow-hidden mb-4">
                <TabBar
                  tabs={EDITOR_TABS}
                  active={activeTab}
                  onChange={handleTabChange}
                  submissionsCount={editor.submissions_count}
                />

                <div className="bg-white p-4">
                  {/* TAB: Champs */}
                  {activeTab === "champs" && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button type="button" className="btn-ghost border text-xs" onClick={expandAllFields}>
                            Tout ouvrir
                          </button>
                          <button type="button" className="btn-ghost border text-xs" onClick={collapseAllFields}>
                            Tout reduire
                          </button>
                        </div>
                        <AddFieldDropdown onAdd={addField} />
                      </div>

                      <p className="text-xs text-slate-400">
                        Glissez pour reordonner · Utilisez les fleches pour deplacer precisement
                      </p>

                      {editor.fields.map((field, idx) => (
                        <FieldEditor
                          key={`${field.key}-${idx}`}
                          field={field}
                          idx={idx}
                          total={editor.fields.length}
                          otherFields={editor.fields.filter((_, i) => i !== idx)}
                          isCollapsed={Boolean(collapsedFields[idx])}
                          isDragging={draggedFieldIndex === idx}
                          canRemove={editor.fields.length > 1}
                          onUpdate={(patch) => updateField(idx, patch)}
                          onRemove={() => removeField(idx)}
                          onDuplicate={() => duplicateField(idx)}
                          onMoveUp={() => moveField(idx, idx - 1)}
                          onMoveDown={() => moveField(idx, idx + 1)}
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

                  {/* TAB: Apparence */}
                  {activeTab === "apparence" && (
                    <FormBrandingPanel
                      settings={editor.settings}
                      title={editor.title}
                      description={editor.description}
                      onChange={(settings) => setEditor((prev) => ({ ...prev, settings }))}
                    />
                  )}

                  {/* TAB: Parametres */}
                  {activeTab === "settings" && (
                    <FormSettingsPanel
                      settings={editor.settings}
                      onChange={(settings) => setEditor((prev) => ({ ...prev, settings }))}
                    />
                  )}

                  {/* TAB: Reponses */}
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
                        <p className="text-sm">Sauvegardez d&apos;abord le formulaire pour voir les reponses.</p>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Sticky footer */}
              <div className="sticky bottom-0 z-10 -mx-6 flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
                {!editor.id && lastDraftSavedAt && (
                  <p className="mr-auto text-xs text-slate-400">
                    Brouillon sauvegarde a{" "}
                    {new Date(lastDraftSavedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
                <button type="button" onClick={() => setEditorOpen(false)} className="btn-ghost border">
                  Annuler
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  <FileText className="w-4 h-4" />
                  {saving ? "Sauvegarde..." : editor.id ? "Enregistrer les modifications" : "Creer le formulaire"}
                </button>
              </div>
            </form>
          </AdminModal>
        )}
      </div>
    </AdminPinGate>
  );
}
