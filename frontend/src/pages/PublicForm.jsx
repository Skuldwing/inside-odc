import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import DOMPurify from "dompurify";

function apiBase() {
  return import.meta.env.VITE_API_URL || "http://localhost:3000";
}

function defaultSettings() {
  return {
    primary_color: "#0f766e",
    logo_url: "",
    header_image_url: "",
    open_at: null,
    close_at: null,
    submit_label: "Envoyer",
    success_message: "Merci, votre réponse a été enregistrée.",
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

/* ── Condition evaluation (supporte ancien + nouveau format) ── */
function matchSingleRule(rule, values) {
  if (!rule?.key) return true;
  const raw = values[rule.key];
  const op  = rule.operator || "eq";
  const target = String(rule.value ?? "").trim();

  if (op === "is_empty")     return Array.isArray(raw) ? raw.length === 0 : (raw === "" || raw === null || raw === undefined);
  if (op === "is_not_empty") return Array.isArray(raw) ? raw.length > 0 : (raw !== "" && raw !== null && raw !== undefined);

  if (Array.isArray(raw)) {
    const strs = raw.map(s => String(s ?? "").trim());
    if (op === "eq")           return strs.includes(target);
    if (op === "neq")          return !strs.includes(target);
    if (op === "contains")     return strs.some(s => s.toLowerCase().includes(target.toLowerCase()));
    return true;
  }

  const src    = String(raw ?? "").trim();
  const srcNum = parseFloat(src);
  const tgtNum = parseFloat(target);

  switch (op) {
    case "eq":          return src === target;
    case "neq":         return src !== target;
    case "contains":    return src.toLowerCase().includes(target.toLowerCase());
    case "starts_with": return src.toLowerCase().startsWith(target.toLowerCase());
    case "ends_with":   return src.toLowerCase().endsWith(target.toLowerCase());
    case "gt":          return !isNaN(srcNum) && !isNaN(tgtNum) && srcNum > tgtNum;
    case "lt":          return !isNaN(srcNum) && !isNaN(tgtNum) && srcNum < tgtNum;
    case "gte":         return !isNaN(srcNum) && !isNaN(tgtNum) && srcNum >= tgtNum;
    case "lte":         return !isNaN(srcNum) && !isNaN(tgtNum) && srcNum <= tgtNum;
    default:            return true;
  }
}

function isFieldVisible(field, values) {
  const si = field?.show_if;
  if (!si || typeof si !== "object") return true;

  // Nouveau format: { logic, rules }
  if (Array.isArray(si.rules)) {
    if (!si.rules.length) return true;
    return si.logic === "OR"
      ? si.rules.some(r => matchSingleRule(r, values))
      : si.rules.every(r => matchSingleRule(r, values));
  }

  // Ancien format: { key, operator, value }
  if (si.key) return matchSingleRule(si, values);
  return true;
}

function isMultiCheckbox(field) {
  return field?.type === "checkbox" && Array.isArray(field?.options) && field.options.length > 0;
}

function isRequiredMissing(field, value) {
  if (!field?.required) return false;
  if (isMultiCheckbox(field)) return !Array.isArray(value) || value.length === 0;
  if (field?.type === "checkbox") return value !== true;
  return value === "" || value === null || value === undefined;
}

/* ── Star rating ── */
function StarRating({ value, onChange, primaryColor }) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || Number(value) || 0;
  return (
    <div className="flex gap-1 mt-3">
      {[1,2,3,4,5].map(n => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n)}
          className="text-3xl transition-transform hover:scale-110 leading-none"
          style={{ color: n <= display ? primaryColor : "#e2e8f0" }}
        >
          ★
        </button>
      ))}
      {value ? <span className="ml-2 text-sm text-slate-500 self-center">{value}/5</span> : null}
    </div>
  );
}

/* ── Scale slider ── */
function ScaleInput({ value, onChange, min, max, primaryColor }) {
  const lo = Number(min) || 1;
  const hi = Number(max) || 10;
  const current = Number(value) || lo;
  return (
    <div className="mt-3 space-y-1">
      <input
        type="range" min={lo} max={hi} step={1} value={current}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full" style={{ accentColor: primaryColor }}
      />
      <div className="flex justify-between text-xs text-slate-400">
        <span>{lo}</span>
        <span className="font-semibold text-base" style={{ color: primaryColor }}>{current}</span>
        <span>{hi}</span>
      </div>
    </div>
  );
}

export default function PublicForm() {
  const { slug } = useParams();
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState(false);
  const [form, setForm]           = useState(null);
  const [values, setValues]       = useState({});
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
          if (isMultiCheckbox(field))       initial[field.key] = [];
          else if (field.type === "checkbox") initial[field.key] = false;
          else if (field.type === "scale")    initial[field.key] = Number(field.min) || 1;
          else if (field.type === "rating")   initial[field.key] = "";
          else                                initial[field.key] = field.default_value ?? "";
        }
        setValues(initial);
        const pages = Array.from(
          new Set((data.fields || []).map(f => (Number(f.page) > 0 ? Number(f.page) : 1)).sort((a, b) => a - b))
        );
        setCurrentPage(pages[0] || 1);
      })
      .catch((err) => { if (!cancelled) setError(err.message || "Erreur chargement formulaire"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
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
    const vals = orderedFields.map(f => (Number(f.page) > 0 ? Number(f.page) : 1));
    const unique = Array.from(new Set(vals)).sort((a, b) => a - b);
    return unique.length ? unique : [1];
  }, [orderedFields]);

  const visibleFields = useMemo(
    () => orderedFields.filter(f => isFieldVisible(f, values)),
    [orderedFields, values]
  );

  const pageFields = useMemo(
    () => visibleFields.filter(f => (Number(f?.page) > 0 ? Number(f.page) : 1) === currentPage),
    [visibleFields, currentPage]
  );

  const currentPageIndex = pages.indexOf(currentPage);
  const isLastPage       = currentPageIndex === pages.length - 1;
  const progressPercent  = Math.round(((Math.max(0, currentPageIndex) + 1) / Math.max(1, pages.length)) * 100);

  const missingCurrentPage = useMemo(
    () => pageFields.filter(f => f.type !== "separator" && isRequiredMissing(f, values[f.key])),
    [pageFields, values]
  );

  const missingAllVisible = useMemo(
    () => visibleFields.filter(f => f.type !== "separator" && isRequiredMissing(f, values[f.key])),
    [visibleFields, values]
  );

  const updateValue     = (key, value) => setValues(prev => ({ ...prev, [key]: value }));
  const toggleArrayValue = (key, option) =>
    setValues(prev => {
      const cur = Array.isArray(prev[key]) ? prev[key] : [];
      return { ...prev, [key]: cur.includes(option) ? cur.filter(v => v !== option) : [...cur, option] };
    });

  /* ── Navigation avec sauts de page ── */
  const handleNext = () => {
    setError("");
    if (missingCurrentPage.length > 0) {
      setError("Merci de remplir les champs obligatoires de cette page.");
      return;
    }

    // Vérifie les jump_rules des champs de la page courante
    let jumpPage = null;
    for (const field of pageFields) {
      if (!field.jump_rules?.length) continue;
      const val    = values[field.key];
      const valStr = Array.isArray(val) ? val[0] : String(val ?? "");
      const match  = field.jump_rules.find(r => String(r.value ?? "") === valStr);
      if (match?.page) { jumpPage = Number(match.page); break; }
    }

    if (jumpPage && pages.includes(jumpPage)) {
      setCurrentPage(jumpPage);
    } else if (jumpPage && jumpPage > pages[pages.length - 1]) {
      setCurrentPage(pages[pages.length - 1]);
    } else if (currentPageIndex < pages.length - 1) {
      setCurrentPage(pages[currentPageIndex + 1]);
    }
  };

  const handlePrev = () => {
    setError("");
    if (currentPageIndex > 0) setCurrentPage(pages[currentPageIndex - 1]);
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
      if (!res.ok) throw new Error(data?.error || "Erreur soumission formulaire");
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Erreur soumission formulaire");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Render a single field ── */
  const renderField = (field) => {
    const val          = values[field.key];
    const requiredMark = field.required ? " *" : "";
    const pc           = primaryColor;

    const borderStyle = {
      borderColor: hexToRgba(pc, 0.22),
      boxShadow: `inset 4px 0 0 ${hexToRgba(pc, 0.9)}`,
    };

    return (
      <section
        key={field.key}
        className="rounded-2xl border bg-white px-5 py-4 shadow-sm transition hover:shadow-md"
        style={field.type !== "separator" ? borderStyle : undefined}
      >
        {field.type === "separator" ? (
          <div className="border-b border-slate-200 pb-2">
            <h3 className="text-base font-bold text-slate-800">{field.label}</h3>
          </div>
        ) : (
          <>
            <label className="text-base font-semibold text-slate-900">
              {field.label}
              <span style={{ color: pc }}>{requiredMark}</span>
            </label>
            {field.help_text && (
              <p className="mt-1 text-xs text-slate-500">{field.help_text}</p>
            )}
            {!field.help_text && field.placeholder && (field.type === "text" || field.type === "email" || field.type === "phone" || field.type === "url" || field.type === "number" || field.type === "date" || field.type === "time") && (
              <p className="mt-1 text-xs text-slate-400">{field.placeholder}</p>
            )}

            {/* ── textarea ── */}
            {field.type === "textarea" && (
              <textarea
                className="input mt-3 min-h-28"
                value={val || ""}
                onChange={e => updateValue(field.key, e.target.value)}
                placeholder={field.placeholder || ""}
                minLength={field.min_length || undefined}
                maxLength={field.max_length || undefined}
              />
            )}

            {/* ── select ── */}
            {field.type === "select" && (
              <select
                className="select mt-3"
                value={val || ""}
                onChange={e => updateValue(field.key, e.target.value)}
              >
                <option value="">— Sélectionner —</option>
                {(field.options || []).map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}

            {/* ── radio ── */}
            {field.type === "radio" && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(field.options || []).map(opt => {
                  const selected = val === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => updateValue(field.key, opt)}
                      className="rounded-xl border px-4 py-2.5 text-left text-sm transition-all flex items-center gap-2.5"
                      style={{
                        borderColor: selected ? hexToRgba(pc, 0.7) : "#cbd5e1",
                        backgroundColor: selected ? hexToRgba(pc, 0.1) : "#fff",
                        color: selected ? pc : "#334155",
                      }}
                    >
                      <span
                        className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                        style={{ borderColor: selected ? pc : "#94a3b8", backgroundColor: selected ? pc : "#fff" }}
                      >
                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── checkbox multiple ── */}
            {isMultiCheckbox(field) && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(field.options || []).map(opt => {
                  const selected = Array.isArray(val) && val.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleArrayValue(field.key, opt)}
                      className="rounded-xl border px-4 py-2.5 text-left text-sm transition-all flex items-center gap-2.5"
                      style={{
                        borderColor: selected ? hexToRgba(pc, 0.7) : "#cbd5e1",
                        backgroundColor: selected ? hexToRgba(pc, 0.1) : "#fff",
                        color: selected ? pc : "#334155",
                      }}
                    >
                      <span
                        className="w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                        style={{ borderColor: selected ? pc : "#94a3b8", backgroundColor: selected ? pc : "#fff", color: "#fff" }}
                      >
                        {selected && "✓"}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── checkbox simple (sans options) ── */}
            {field.type === "checkbox" && !isMultiCheckbox(field) && (
              <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(val)}
                  onChange={e => updateValue(field.key, e.target.checked)}
                  style={{ accentColor: pc }}
                />
                {field.placeholder || "Je confirme"}
              </label>
            )}

            {/* ── yes_no ── */}
            {field.type === "yes_no" && (
              <div className="mt-3 flex gap-3">
                {["Oui", "Non"].map(opt => {
                  const selected = val === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => updateValue(field.key, opt)}
                      className="flex-1 rounded-xl border py-3 text-sm font-semibold transition-all"
                      style={{
                        borderColor: selected ? hexToRgba(pc, 0.7) : "#cbd5e1",
                        backgroundColor: selected ? hexToRgba(pc, 0.12) : "#fff",
                        color: selected ? pc : "#64748b",
                      }}
                    >
                      {opt === "Oui" ? "✓ Oui" : "✗ Non"}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── rating ── */}
            {field.type === "rating" && (
              <StarRating value={val} onChange={v => updateValue(field.key, v)} primaryColor={pc} />
            )}

            {/* ── scale ── */}
            {field.type === "scale" && (
              <ScaleInput
                value={val}
                onChange={v => updateValue(field.key, v)}
                min={field.min}
                max={field.max}
                primaryColor={pc}
              />
            )}

            {/* ── text / email / phone / url / number / date / time ── */}
            {["text", "email", "phone", "url", "number", "date", "time"].includes(field.type) && (
              <input
                type={["email", "number", "date", "time"].includes(field.type) ? field.type : "text"}
                inputMode={field.type === "phone" ? "tel" : field.type === "number" ? "decimal" : undefined}
                className="input mt-3"
                value={val ?? ""}
                onChange={e => updateValue(field.key, e.target.value)}
                placeholder={field.placeholder || ""}
                min={field.min || undefined}
                max={field.max || undefined}
                minLength={field.min_length || undefined}
                maxLength={field.max_length || undefined}
              />
            )}
          </>
        )}
      </section>
    );
  };

  /* ── Loading / Error ── */
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

  /* ── Group half-width fields side by side ── */
  const groupPageFields = (fields) => {
    const groups = [];
    let i = 0;
    while (i < fields.length) {
      const f = fields[i];
      if (f.col_span === "half" && i + 1 < fields.length && fields[i + 1].col_span === "half") {
        groups.push({ type: "pair", fields: [f, fields[i + 1]] });
        i += 2;
      } else {
        groups.push({ type: "single", fields: [f] });
        i++;
      }
    }
    return groups;
  };

  /* ── Main render ── */
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
        {/* Header */}
        <section className="overflow-hidden rounded-3xl border border-white/80 bg-white shadow-xl shadow-slate-300/30">
          <div
            className="h-2 w-full"
            style={{ background: `linear-gradient(90deg, ${primaryColor}, ${hexToRgba(primaryColor, 0.65)})` }}
          />
          <div className="p-6 sm:p-8">
            {settings.header_image_url && (
              <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200">
                <img src={settings.header_image_url} alt="Entête" className="h-36 w-full object-cover" />
              </div>
            )}
            {settings.logo_url && (
              <img src={settings.logo_url} alt="Logo" className="mb-4 h-11 w-auto object-contain" />
            )}
            <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{form?.title || "Formulaire"}</h1>
            {form?.description && (
              <div
                className="mt-2 max-w-2xl text-slate-600 prose prose-sm"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(form.description) }}
              />
            )}
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Progression</span>
                <span>Étape {Math.max(1, currentPageIndex + 1)} / {pages.length}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%`, backgroundColor: primaryColor }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Success */}
        {success ? (
          <section
            className="rounded-3xl border bg-white p-6 sm:p-8"
            style={{
              borderColor: hexToRgba(primaryColor, 0.28),
              background: `linear-gradient(180deg, #ffffff 0%, ${hexToRgba(primaryColor, 0.06)} 100%)`,
            }}
          >
            <h2 className="text-xl font-semibold" style={{ color: primaryColor }}>Réponse envoyée ✓</h2>
            <div
              className="mt-2 text-slate-700 prose prose-sm"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(settings.success_message) }}
            />
          </section>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {pageFields.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
                Aucun champ sur cette page pour vos sélections actuelles.
              </div>
            )}

            {/* Render fields — pairing half-width ones side by side */}
            {groupPageFields(pageFields).map((group, gi) =>
              group.type === "pair" ? (
                <div key={`pair-${gi}`} className="grid grid-cols-2 gap-4">
                  {group.fields.map(f => renderField(f))}
                </div>
              ) : (
                renderField(group.fields[0])
              )
            )}

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>
            )}

            {/* Navigation */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="btn-ghost border border-slate-200 bg-white"
                  onClick={handlePrev}
                  disabled={currentPageIndex <= 0}
                >
                  ← Précédent
                </button>

                {isLastPage ? (
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submitting}
                    style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                  >
                    {submitting ? "Envoi…" : settings.submit_label}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleNext}
                    style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                  >
                    Continuer →
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
