import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

function apiBase() {
  return import.meta.env.VITE_API_URL || "http://localhost:3000";
}

function defaultSettings() {
  return {
    primary_color: "#0f766e",
    logo_url: "",
    submit_label: "Envoyer",
    success_message: "Merci, votre reponse a ete enregistree.",
  };
}

function isMultiChoiceField(field) {
  return field?.type === "checkbox" && Array.isArray(field?.options) && field.options.length > 0;
}

function normalizeComparable(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function isConditionMatch(condition, values) {
  if (!condition || typeof condition !== "object" || !condition.key) return true;
  const source = values[condition.key];
  const target = normalizeComparable(condition.value);

  if (Array.isArray(source)) {
    const sourceValues = source.map((item) => normalizeComparable(item));
    if (condition.operator === "eq") return sourceValues.includes(target);
    if (condition.operator === "neq") return !sourceValues.includes(target);
    if (condition.operator === "contains") {
      const targetText = String(target).toLowerCase();
      return sourceValues.some((item) =>
        String(item).toLowerCase().includes(targetText)
      );
    }
    return true;
  }

  const sourceValue = normalizeComparable(source);
  if (condition.operator === "eq") return sourceValue === target;
  if (condition.operator === "neq") return sourceValue !== target;
  if (condition.operator === "contains") {
    return String(sourceValue).toLowerCase().includes(String(target).toLowerCase());
  }
  return true;
}

function isFieldVisible(field, values) {
  return isConditionMatch(field?.show_if, values);
}

function isRequiredMissing(field, value) {
  if (!field?.required) return false;
  if (isMultiChoiceField(field)) return !Array.isArray(value) || value.length === 0;
  if (field?.type === "checkbox") return value !== true;
  return value === "" || value === null || value === undefined;
}

export default function PublicForm() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState(null);
  const [values, setValues] = useState({});
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSuccess(false);

    fetch(`${apiBase()}/forms/public/${slug}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Formulaire indisponible");
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setForm(data);
        const initial = {};
        for (const field of data.fields || []) {
          if (isMultiChoiceField(field)) initial[field.key] = [];
          else if (field.type === "checkbox") initial[field.key] = false;
          else initial[field.key] = "";
        }
        setValues(initial);

        const pages = Array.from(
          new Set(
            (data.fields || [])
              .map((f) => (Number(f.page) > 0 ? Number(f.page) : 1))
              .sort((a, b) => a - b)
          )
        );
        setCurrentPage(pages[0] || 1);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Erreur chargement formulaire");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const settings = useMemo(
    () => ({ ...defaultSettings(), ...(form?.settings || {}) }),
    [form]
  );

  const orderedFields = useMemo(() => {
    const fields = Array.isArray(form?.fields) ? form.fields : [];
    return [...fields].sort((a, b) => {
      const pa = Number(a?.page) > 0 ? Number(a.page) : 1;
      const pb = Number(b?.page) > 0 ? Number(b.page) : 1;
      return pa - pb;
    });
  }, [form]);

  const pages = useMemo(() => {
    const valuesList = orderedFields.map((f) => (Number(f.page) > 0 ? Number(f.page) : 1));
    const unique = Array.from(new Set(valuesList)).sort((a, b) => a - b);
    return unique.length ? unique : [1];
  }, [orderedFields]);

  const visibleFields = useMemo(
    () => orderedFields.filter((field) => isFieldVisible(field, values)),
    [orderedFields, values]
  );

  const pageFields = useMemo(
    () =>
      visibleFields.filter((field) => {
        const page = Number(field?.page) > 0 ? Number(field.page) : 1;
        return page === currentPage;
      }),
    [visibleFields, currentPage]
  );

  const currentPageIndex = pages.indexOf(currentPage);
  const isLastPage = currentPageIndex === pages.length - 1;

  const missingCurrentPage = useMemo(
    () => pageFields.filter((field) => isRequiredMissing(field, values[field.key])),
    [pageFields, values]
  );

  const missingAllVisible = useMemo(
    () => visibleFields.filter((field) => isRequiredMissing(field, values[field.key])),
    [visibleFields, values]
  );

  const updateValue = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleArrayValue = (key, option) => {
    setValues((prev) => {
      const current = Array.isArray(prev[key]) ? prev[key] : [];
      const exists = current.includes(option);
      return {
        ...prev,
        [key]: exists ? current.filter((v) => v !== option) : [...current, option],
      };
    });
  };

  const handleNext = () => {
    setError("");
    if (missingCurrentPage.length > 0) {
      setError("Merci de remplir les champs obligatoires de cette page.");
      return;
    }
    if (currentPageIndex >= 0 && currentPageIndex < pages.length - 1) {
      setCurrentPage(pages[currentPageIndex + 1]);
    }
  };

  const handlePrev = () => {
    setError("");
    if (currentPageIndex > 0) {
      setCurrentPage(pages[currentPageIndex - 1]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (missingAllVisible.length > 0) {
      setError("Merci de remplir tous les champs obligatoires.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase()}/forms/public/${slug}/submissions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Erreur soumission formulaire");
      }
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Erreur soumission formulaire");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Chargement du formulaire...
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-xl p-6 text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen py-10 px-4"
      style={{
        background:
          "radial-gradient(circle at top right, rgba(15,118,110,0.08), transparent 40%), #f8fafc",
      }}
    >
      <div className="mx-auto max-w-3xl card p-6 lg:p-8">
        {settings.logo_url ? (
          <img
            src={settings.logo_url}
            alt="Logo"
            className="h-10 w-auto object-contain mb-4"
          />
        ) : null}

        <h1 className="text-2xl font-semibold text-slate-900">
          {form?.title || "Formulaire"}
        </h1>
        {form?.description && (
          <p className="mt-2 text-slate-600">{form.description}</p>
        )}

        <div className="mt-4 text-sm text-slate-500">
          Page {Math.max(1, currentPageIndex + 1)} / {pages.length}
        </div>

        {success ? (
          <div
            className="mt-6 rounded-xl border p-4"
            style={{
              borderColor: `${settings.primary_color}33`,
              backgroundColor: `${settings.primary_color}14`,
              color: settings.primary_color,
            }}
          >
            {settings.success_message}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {pageFields.map((field) => {
              const requiredMark = field.required ? " *" : "";

              if (field.type === "textarea") {
                return (
                  <div key={field.key}>
                    <label className="text-sm font-medium">
                      {field.label}
                      {requiredMark}
                    </label>
                    <textarea
                      className="input mt-1 min-h-28"
                      value={values[field.key] || ""}
                      onChange={(e) => updateValue(field.key, e.target.value)}
                      placeholder={field.placeholder || ""}
                    />
                  </div>
                );
              }

              if (field.type === "select") {
                return (
                  <div key={field.key}>
                    <label className="text-sm font-medium">
                      {field.label}
                      {requiredMark}
                    </label>
                    <select
                      className="select mt-1"
                      value={values[field.key] || ""}
                      onChange={(e) => updateValue(field.key, e.target.value)}
                    >
                      <option value="">Selectionner</option>
                      {(field.options || []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              if (isMultiChoiceField(field)) {
                const current = Array.isArray(values[field.key]) ? values[field.key] : [];
                return (
                  <div key={field.key}>
                    <label className="text-sm font-medium">
                      {field.label}
                      {requiredMark}
                    </label>
                    <div className="mt-2 space-y-2">
                      {(field.options || []).map((opt) => (
                        <label key={opt} className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={current.includes(opt)}
                            onChange={() => toggleArrayValue(field.key, opt)}
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              }

              if (field.type === "checkbox") {
                return (
                  <label key={field.key} className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(values[field.key])}
                      onChange={(e) => updateValue(field.key, e.target.checked)}
                    />
                    {field.label}
                    {requiredMark}
                  </label>
                );
              }

              const inputType =
                field.type === "email" || field.type === "date" || field.type === "number"
                  ? field.type
                  : "text";

              return (
                <div key={field.key}>
                  <label className="text-sm font-medium">
                    {field.label}
                    {requiredMark}
                  </label>
                  <input
                    type={inputType}
                    className="input mt-1"
                    value={values[field.key] ?? ""}
                    onChange={(e) => updateValue(field.key, e.target.value)}
                    placeholder={field.placeholder || ""}
                  />
                </div>
              );
            })}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">
                {error}
              </div>
            )}

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                className="btn-ghost border"
                onClick={handlePrev}
                disabled={currentPageIndex <= 0}
              >
                Precedent
              </button>

              {isLastPage ? (
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                  style={{
                    backgroundColor: settings.primary_color,
                    borderColor: settings.primary_color,
                  }}
                >
                  {submitting ? "Envoi..." : settings.submit_label}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleNext}
                  style={{
                    backgroundColor: settings.primary_color,
                    borderColor: settings.primary_color,
                  }}
                >
                  Suivant
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
