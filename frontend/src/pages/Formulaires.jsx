import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  FileText,
  Pencil,
  Trash2,
  Link2,
  Eye,
  EyeOff,
  Download,
  Sparkles,
  Palette,
  Layers,
  Workflow,
} from "lucide-react";
import api from "../api";
import AdminPinGate from "../components/AdminPinGate";
import AdminModal from "../components/admin/AdminModal";
import AdminPageHeader from "../components/admin/AdminPageHeader";
import AdminSearchCard from "../components/admin/AdminSearchCard";

const FIELD_TYPES = [
  { value: "text", label: "Texte court" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Telephone" },
  { value: "textarea", label: "Texte long" },
  { value: "number", label: "Nombre" },
  { value: "date", label: "Date" },
  { value: "select", label: "Liste deroulante" },
  { value: "checkbox", label: "Cases a cocher" },
];

const CONDITION_OPERATORS = [
  { value: "eq", label: "egal a" },
  { value: "neq", label: "different de" },
  { value: "contains", label: "contient" },
];

function defaultSettings() {
  return {
    primary_color: "#0f766e",
    logo_url: "",
    submit_label: "Envoyer",
    success_message: "Merci, votre reponse a ete enregistree.",
  };
}

function createField(type = "text", idx = 1) {
  return {
    key: `champ_${idx}`,
    label: `Champ ${idx}`,
    type,
    required: false,
    placeholder: "",
    options: [],
    page: 1,
    show_if: null,
  };
}

function createEditor() {
  return {
    id: null,
    title: "",
    description: "",
    status: "draft",
    slug: "",
    fields: [createField("text", 1)],
    settings: defaultSettings(),
    submissions_count: 0,
  };
}

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

  useEffect(() => {
    fetchForms();
  }, []);

  useEffect(() => {
    setSearch(querySearch);
  }, [querySearch]);

  useEffect(() => {
    if (queryAction === "new") {
      openCreate();
    }
  }, [queryAction]);

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
    setEditor(createEditor());
    setSubmissions([]);
    setShowSubmissions(false);
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
        fields: Array.isArray(form.fields) && form.fields.length
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
        },
        submissions_count: Number(form.submissions_count || 0),
      });
      setSubmissions([]);
      setShowSubmissions(false);
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
    if (!showSubmissions && submissions.length === 0) {
      await loadSubmissions();
    }
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
      const base = editor.slug || `form-${editor.id}`;
      a.href = url;
      a.download = `${base}-reponses.${format}`;
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
    if (!editor.title.trim()) {
      alert("Titre requis");
      return;
    }
    if (!editor.fields.length) {
      alert("Ajoutez au moins un champ");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: editor.title,
        description: editor.description,
        status: editor.status,
        settings: {
          ...defaultSettings(),
          ...(editor.settings || {}),
        },
        fields: editor.fields.map((f) => ({
          ...f,
          page: Number(f.page) > 0 ? Number(f.page) : 1,
          options: Array.isArray(f.options) ? f.options.filter(Boolean) : [],
          show_if:
            f.show_if && f.show_if.key
              ? {
                  key: f.show_if.key,
                  operator: f.show_if.operator || "eq",
                  value: String(f.show_if.value ?? ""),
                }
              : null,
        })),
      };

      if (editor.id) {
        await api.put(`/forms/${editor.id}`, payload);
      } else {
        await api.post("/forms", payload);
      }

      await fetchForms();
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

  const addField = () => {
    setEditor((prev) => ({
      ...prev,
      fields: [...prev.fields, createField("text", prev.fields.length + 1)],
    }));
  };

  const removeField = (index) => {
    setEditor((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, idx) => idx !== index),
    }));
  };

  const updateField = (index, patch) => {
    setEditor((prev) => ({
      ...prev,
      fields: prev.fields.map((field, idx) =>
        idx === index ? { ...field, ...patch } : field
      ),
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
          return {
            ...field,
            show_if: {
              key: fallbackKey,
              operator: "eq",
              value: "",
            },
          };
        }),
      };
    });
  };

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
          <div className="card p-8 text-center text-slate-500">
            Aucun formulaire trouve.
          </div>
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

                <p className="text-sm text-slate-500">
                  {form.description || "Aucune description"}
                </p>

                <div className="text-xs text-slate-500">
                  Reponses: {Number(form.submissions_count || 0)}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="btn-ghost border"
                    onClick={() => openEdit(form.id)}
                  >
                    <Pencil className="w-4 h-4" />
                    Modifier
                  </button>
                  <button
                    className="btn-ghost border"
                    onClick={() => handleCopyPublicLink(form.slug)}
                  >
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

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-900">Champs du formulaire</p>
                      <button type="button" className="btn-primary" onClick={addField}>
                        <Plus className="w-4 h-4" />
                        Ajouter champ
                      </button>
                    </div>

                    {editor.fields.map((field, idx) => {
                      const otherFields = editor.fields.filter((_, i) => i !== idx);
                      const showIf = field.show_if;

                      return (
                        <div
                          key={`${field.key}-${idx}`}
                          className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-800">
                              Champ {idx + 1}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
                              <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">
                                {field.type}
                              </span>
                              <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">
                                page {field.page || 1}
                              </span>
                              {showIf ? (
                                <span className="rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-orange-700">
                                  conditionnel
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div>
                              <label className="text-xs text-slate-500">Libelle *</label>
                              <input
                                className="input mt-1"
                                value={field.label}
                                onChange={(e) => updateField(idx, { label: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500">Cle</label>
                              <input
                                className="input mt-1"
                                value={field.key}
                                onChange={(e) => updateField(idx, { key: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500">Type</label>
                              <select
                                className="select mt-1"
                                value={field.type}
                                onChange={(e) => updateField(idx, { type: e.target.value })}
                              >
                                {FIELD_TYPES.map((t) => (
                                  <option key={t.value} value={t.value}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-slate-500">Page</label>
                              <input
                                type="number"
                                min={1}
                                className="input mt-1"
                                value={field.page || 1}
                                onChange={(e) =>
                                  updateField(idx, {
                                    page: Math.max(1, Number(e.target.value) || 1),
                                  })
                                }
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-slate-500">Placeholder</label>
                              <input
                                className="input mt-1"
                                value={field.placeholder || ""}
                                onChange={(e) =>
                                  updateField(idx, { placeholder: e.target.value })
                                }
                              />
                            </div>
                            <label className="inline-flex items-center gap-2 text-sm text-slate-700 mt-6">
                              <input
                                type="checkbox"
                                checked={Boolean(field.required)}
                                onChange={(e) =>
                                  updateField(idx, { required: e.target.checked })
                                }
                              />
                              Champ obligatoire
                            </label>
                          </div>

                          {(field.type === "select" || field.type === "checkbox") && (
                            <div>
                              <label className="text-xs text-slate-500">
                                Options (une par ligne)
                              </label>
                              <textarea
                                className="input mt-1 min-h-20"
                                value={(field.options || []).join("\n")}
                                onChange={(e) =>
                                  updateField(idx, {
                                    options: e.target.value
                                      .split("\n")
                                      .map((o) => o.trim())
                                      .filter(Boolean),
                                  })
                                }
                              />
                            </div>
                          )}

                          <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                              <input
                                type="checkbox"
                                checked={Boolean(showIf)}
                                onChange={(e) => toggleFieldCondition(idx, e.target.checked)}
                                disabled={otherFields.length === 0}
                              />
                              Affichage conditionnel
                            </label>

                            {showIf && (
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <div>
                                  <label className="text-xs text-slate-500">Si champ</label>
                                  <select
                                    className="select mt-1"
                                    value={showIf.key}
                                    onChange={(e) =>
                                      updateField(idx, {
                                        show_if: { ...showIf, key: e.target.value },
                                      })
                                    }
                                  >
                                    <option value="">Selectionner</option>
                                    {otherFields.map((f, fIdx) => (
                                      <option key={`${f.key}-${fIdx}`} value={f.key}>
                                        {f.label} ({f.key})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Operateur</label>
                                  <select
                                    className="select mt-1"
                                    value={showIf.operator}
                                    onChange={(e) =>
                                      updateField(idx, {
                                        show_if: { ...showIf, operator: e.target.value },
                                      })
                                    }
                                  >
                                    {CONDITION_OPERATORS.map((op) => (
                                      <option key={op.value} value={op.value}>
                                        {op.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-slate-500">Valeur</label>
                                  <input
                                    className="input mt-1"
                                    value={showIf.value ?? ""}
                                    onChange={(e) =>
                                      updateField(idx, {
                                        show_if: { ...showIf, value: e.target.value },
                                      })
                                    }
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="button"
                              className="btn-ghost border text-red-600"
                              onClick={() => removeField(idx)}
                              disabled={editor.fields.length <= 1}
                            >
                              <Trash2 className="w-4 h-4" />
                              Supprimer champ
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                    <p className="font-medium text-slate-900 inline-flex items-center gap-2">
                      <Palette className="w-4 h-4 text-orange-500" />
                      Branding / Theme
                    </p>
                    <div>
                      <label className="text-xs text-slate-500">Couleur principale</label>
                      <input
                        type="color"
                        className="input mt-1 h-10 p-1"
                        value={editor.settings?.primary_color || "#0f766e"}
                        onChange={(e) =>
                          setEditor((prev) => ({
                            ...prev,
                            settings: { ...prev.settings, primary_color: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Logo URL</label>
                      <input
                        className="input mt-1"
                        value={editor.settings?.logo_url || ""}
                        onChange={(e) =>
                          setEditor((prev) => ({
                            ...prev,
                            settings: { ...prev.settings, logo_url: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Texte bouton envoi</label>
                      <input
                        className="input mt-1"
                        value={editor.settings?.submit_label || ""}
                        onChange={(e) =>
                          setEditor((prev) => ({
                            ...prev,
                            settings: { ...prev.settings, submit_label: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Message succes</label>
                      <textarea
                        className="input mt-1 min-h-20"
                        value={editor.settings?.success_message || ""}
                        onChange={(e) =>
                          setEditor((prev) => ({
                            ...prev,
                            settings: {
                              ...prev.settings,
                              success_message: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="font-medium text-slate-900 mb-3">Apercu rapide</p>
                    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {editor.title || "Titre du formulaire"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {editor.description || "Description du formulaire"}
                      </p>
                      <button
                        type="button"
                        className="btn-primary w-full"
                        style={{
                          backgroundColor: editor.settings?.primary_color || "#0f766e",
                          borderColor: editor.settings?.primary_color || "#0f766e",
                        }}
                      >
                        {editor.settings?.submit_label || "Envoyer"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {editor.slug && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                  Lien public:{" "}
                  <span className="font-medium">{`${window.location.origin}/f/${editor.slug}`}</span>
                </div>
              )}

              {editor.id ? (
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-ghost border"
                      onClick={handleToggleSubmissions}
                    >
                      {showSubmissions ? (
                        <>
                          <EyeOff className="w-4 h-4" />
                          Masquer reponses
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4" />
                          Voir reponses ({editor.submissions_count})
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost border"
                      disabled={exportingFormat === "csv"}
                      onClick={() => handleExport("csv")}
                    >
                      <Download className="w-4 h-4" />
                      {exportingFormat === "csv" ? "Export..." : "Export CSV"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost border"
                      disabled={exportingFormat === "xlsx"}
                      onClick={() => handleExport("xlsx")}
                    >
                      <Download className="w-4 h-4" />
                      {exportingFormat === "xlsx" ? "Export..." : "Export XLSX"}
                    </button>
                  </div>

                  {showSubmissions && (
                    <div className="mt-3 space-y-2 max-h-64 overflow-auto">
                      {submissionsLoading ? (
                        <p className="text-sm text-slate-500">Chargement...</p>
                      ) : submissions.length === 0 ? (
                        <p className="text-sm text-slate-500">Aucune reponse.</p>
                      ) : (
                        submissions.map((s) => (
                          <div
                            key={s.id}
                            className="rounded-lg border border-slate-200 bg-white p-2 text-xs"
                          >
                            <p className="text-slate-500 mb-1">{s.submitted_at}</p>
                            <pre className="whitespace-pre-wrap text-slate-700">
                              {JSON.stringify(s.values, null, 2)}
                            </pre>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="flex justify-end gap-3">
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
