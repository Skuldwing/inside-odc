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

function hexToRgba(hex, alpha) {
  const value = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return `rgba(15, 118, 110, ${alpha})`;
  const intValue = Number.parseInt(value, 16);
  const r = (intValue >> 16) & 255;
  const g = (intValue >> 8) & 255;
  const b = intValue & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  const primaryColor = /^#[0-9a-f]{6}$/i.test(settings.primary_color)
    ? settings.primary_color
    : "#0f766e";

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
  const progressPercent = Math.round(
    ((Math.max(0, currentPageIndex) + 1) / Math.max(1, pages.length)) * 100
  );

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
      className="min-h-screen py-10 px-4 sm:px-6"
      style={{
        background:
          `radial-gradient(1100px 500px at -5% -10%, ${hexToRgba(primaryColor, 0.14)}, transparent 55%),
           radial-gradient(800px 400px at 100% 0%, ${hexToRgba(primaryColor, 0.1)}, transparent 60%),
           linear-gradient(180deg, #f8fbff 0%, #f1f5f9 100%)`,
      }}
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="overflow-hidden rounded-3xl border border-white/80 bg-white shadow-xl shadow-slate-300/30">
          <div
            className="h-2 w-full"
            style={{
              background: `linear-gradient(90deg, ${primaryColor}, ${hexToRgba(
                primaryColor,
                0.65
              )})`,
            }}
          />
          <div className="p-6 sm:p-8">
            {settings.logo_url ? (
              <img
                src={settings.logo_url}
                alt="Logo"
                className="mb-4 h-11 w-auto object-contain"
              />
            ) : null}
            <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
              {form?.title || "Formulaire"}
            </h1>
            {form?.description ? (
              <p className="mt-2 max-w-2xl text-slate-600">{form.description}</p>
            ) : null}

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Progression</span>
                <span>
                  Etape {Math.max(1, currentPageIndex + 1)} / {pages.length}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%`, backgroundColor: primaryColor }}
                />
              </div>
            </div>
          </div>
        </section>

        {success ? (
          <section
            className="rounded-3xl border bg-white p-6 sm:p-8"
            style={{
              borderColor: hexToRgba(primaryColor, 0.28),
              background: `linear-gradient(180deg, #ffffff 0%, ${hexToRgba(
                primaryColor,
                0.06
              )} 100%)`,
            }}
          >
            <h2 className="text-xl font-semibold" style={{ color: primaryColor }}>
              Reponse envoyee
            </h2>
            <p className="mt-2 text-slate-700">{settings.success_message}</p>
          </section>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {pageFields.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
                Aucun champ sur cette page pour vos selections actuelles.
              </div>
            ) : null}

            {pageFields.map((field) => {
              const requiredMark = field.required ? " *" : "";

              return (
                <section
                  key={field.key}
                  className="rounded-2xl border bg-white px-5 py-4 shadow-sm transition hover:shadow-md"
                  style={{
                    borderColor: hexToRgba(primaryColor, 0.22),
                    boxShadow: `inset 4px 0 0 ${hexToRgba(primaryColor, 0.9)}`,
                  }}
                >
                  <label className="text-base font-semibold text-slate-900">
                    {field.label}
                    <span style={{ color: primaryColor }}>{requiredMark}</span>
                  </label>
                  {field.placeholder ? (
                    <p className="mt-1 text-xs text-slate-500">{field.placeholder}</p>
                  ) : null}

                  {field.type === "textarea" ? (
                    <textarea
                      className="input mt-3 min-h-28"
                      value={values[field.key] || ""}
                      onChange={(e) => updateValue(field.key, e.target.value)}
                      placeholder={field.placeholder || ""}
                    />
                  ) : null}

                  {field.type === "select" ? (
                    <select
                      className="select mt-3"
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
                  ) : null}

                  {isMultiChoiceField(field) ? (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {(field.options || []).map((opt) => {
                        const selected = Array.isArray(values[field.key])
                          ? values[field.key].includes(opt)
                          : false;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => toggleArrayValue(field.key, opt)}
                            className="rounded-xl border px-3 py-2 text-left text-sm transition"
                            style={{
                              borderColor: selected
                                ? hexToRgba(primaryColor, 0.7)
                                : "#cbd5e1",
                              backgroundColor: selected
                                ? hexToRgba(primaryColor, 0.12)
                                : "#ffffff",
                              color: selected ? primaryColor : "#334155",
                            }}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {field.type === "checkbox" && !isMultiChoiceField(field) ? (
                    <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(values[field.key])}
                        onChange={(e) => updateValue(field.key, e.target.checked)}
                      />
                      {field.placeholder || "Je confirme"}
                    </label>
                  ) : null}

                  {field.type !== "textarea" &&
                  field.type !== "select" &&
                  !isMultiChoiceField(field) &&
                  field.type !== "checkbox" ? (
                    <input
                      type={
                        field.type === "email" ||
                        field.type === "date" ||
                        field.type === "number"
                          ? field.type
                          : "text"
                      }
                      className="input mt-3"
                      value={values[field.key] ?? ""}
                      onChange={(e) => updateValue(field.key, e.target.value)}
                      placeholder={field.placeholder || ""}
                    />
                  ) : null}
                </section>
              );
            })}

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-red-700">
                {error}
              </div>
            ) : null}

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="btn-ghost border border-slate-200 bg-white"
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
                      backgroundColor: primaryColor,
                      borderColor: primaryColor,
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
                      backgroundColor: primaryColor,
                      borderColor: primaryColor,
                    }}
                  >
                    Continuer
                  </button>
                )}
              </div>
            </section>
          </form>
        )}
      </div>
    </div>
  );
}
