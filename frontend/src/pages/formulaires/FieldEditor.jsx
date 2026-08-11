import { useState, useEffect, useRef } from "react";
import { X, Plus, ChevronDown, Copy, Trash2, GripVertical, GitBranch } from "lucide-react";
import { FIELD_TYPES, CONDITION_OPERATORS } from "./constants";

/* ─────────────────────────────────────────
   TypePicker — dropdown groupé
───────────────────────────────────────── */
function TypePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = FIELD_TYPES.find(t => t.value === value);
  const groups = {};
  for (const ft of FIELD_TYPES) {
    if (!groups[ft.group]) groups[ft.group] = [];
    groups[ft.group].push(ft);
  }
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-200 transition-all"
      >
        <span className="flex items-center gap-2">
          <span className="text-base">{current?.icon}</span>
          <span className="font-medium text-slate-700">{current?.label || value}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-64 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-y-auto max-h-72 p-2">
          {Object.entries(groups).map(([group, types]) => (
            <div key={group} className="mb-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 px-2 py-1">{group}</p>
              {types.map(ft => (
                <button
                  key={ft.value}
                  type="button"
                  onClick={() => { onChange(ft.value); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs text-left transition-colors ${
                    ft.value === value
                      ? "bg-orange-50 text-orange-700 font-semibold"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-base leading-none w-5 flex-shrink-0">{ft.icon}</span>
                  {ft.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   OptionList — liste d'options avec état local
   (évite la fermeture du clavier mobile)
───────────────────────────────────────── */
function OptionList({ options, onChange }) {
  const [local, setLocal] = useState(options || []);
  useEffect(() => { setLocal(options || []); }, [options]);

  const update = (i, val) => {
    const next = [...local];
    next[i] = val;
    setLocal(next);
  };
  const commit = (i, val) => {
    const next = [...local];
    next[i] = val;
    onChange(next.filter(Boolean));
  };
  const add = () => {
    const next = [...local, ""];
    setLocal(next);
    setTimeout(() => {
      const inputs = document.querySelectorAll("[data-option-input]");
      if (inputs[inputs.length - 1]) inputs[inputs.length - 1].focus();
    }, 50);
  };
  const remove = i => {
    const next = local.filter((_, idx) => idx !== i);
    setLocal(next);
    onChange(next.filter(Boolean));
  };

  return (
    <div className="space-y-1.5">
      {local.map((opt, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <GripVertical className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
          <input
            data-option-input
            className="input flex-1 text-sm py-1.5"
            value={opt}
            placeholder={`Option ${i + 1}`}
            onChange={e => update(i, e.target.value)}
            onBlur={e => commit(i, e.target.value)}
          />
          <button type="button" onClick={() => remove(i)}
            className="flex-shrink-0 p-1 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={add}
        className="flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 font-medium py-1 transition-colors">
        <Plus className="w-3.5 h-3.5" /> Ajouter une option
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────
   ConditionsEditor — logique conditionnelle multi-règles
───────────────────────────────────────── */
function ConditionsEditor({ showIf, otherFields, totalPages, onChange }) {
  const logic = showIf?.logic || "AND";
  const rules  = showIf?.rules || [];
  const textFields = otherFields.filter(f => f.type !== "separator");

  const setLogic = v => onChange({ ...(showIf || {}), logic: v, rules });
  const addRule  = () => onChange({ logic, rules: [...rules, { key: "", operator: "eq", value: "" }] });
  const removeRule = i => {
    const next = rules.filter((_, idx) => idx !== i);
    if (!next.length) { onChange(null); return; }
    onChange({ logic, rules: next });
  };
  const updateRule = (i, patch) => {
    const next = rules.map((r, idx) => idx === i ? { ...r, ...patch } : r);
    onChange({ logic, rules: next });
  };

  if (!showIf || !rules.length) {
    return (
      <button type="button" onClick={() => onChange({ logic: "AND", rules: [{ key: "", operator: "eq", value: "" }] })}
        className="flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:text-orange-700 py-1 transition-colors">
        <Plus className="w-3.5 h-3.5" /> Ajouter une condition
      </button>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Afficher si</span>
        {rules.length > 1 && (
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            {["AND", "OR"].map(v => (
              <button key={v} type="button" onClick={() => setLogic(v)}
                className={`px-2.5 py-1 transition-colors ${logic === v ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                {v === "AND" ? "TOUTES" : "UNE"} les règles
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => onChange(null)}
          className="ml-auto text-slate-300 hover:text-red-400 transition-colors"><X className="w-3.5 h-3.5" /></button>
      </div>

      {rules.map((rule, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5 bg-slate-50 rounded-xl p-2">
          <select className="input text-xs py-1.5 flex-1 min-w-0"
            value={rule.key}
            onChange={e => updateRule(i, { key: e.target.value, value: "" })}>
            <option value="">-- Champ --</option>
            {textFields.map(f => <option key={f._id || f.key} value={f.key}>{f.label || f.key}</option>)}
          </select>
          <select className="input text-xs py-1.5 w-36 flex-shrink-0"
            value={rule.operator}
            onChange={e => updateRule(i, { operator: e.target.value })}>
            {CONDITION_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
          </select>
          {!["is_empty", "is_not_empty"].includes(rule.operator) && (
            <input className="input text-xs py-1.5 flex-1 min-w-0" placeholder="Valeur"
              value={rule.value}
              onChange={e => updateRule(i, { value: e.target.value })} />
          )}
          <button type="button" onClick={() => removeRule(i)}
            className="p-1 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <button type="button" onClick={addRule}
        className="flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:text-orange-700 transition-colors">
        <Plus className="w-3.5 h-3.5" /> Ajouter une règle
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────
   JumpRulesEditor — sauts de page conditionnels
───────────────────────────────────────── */
function JumpRulesEditor({ rules, totalPages, onChange }) {
  const addRule    = () => onChange([...rules, { value: "", page: 2 }]);
  const removeRule = i  => onChange(rules.filter((_, idx) => idx !== i));
  const updateRule = (i, patch) => onChange(rules.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  if (!rules.length) {
    return (
      <button type="button" onClick={addRule}
        className="flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:text-orange-700 py-1 transition-colors">
        <Plus className="w-3.5 h-3.5" /> Ajouter un saut de page
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {rules.map((rule, i) => (
        <div key={i} className="flex items-center gap-1.5 bg-slate-50 rounded-xl p-2 text-xs">
          <span className="text-slate-500 flex-shrink-0">Si valeur =</span>
          <input className="input py-1.5 flex-1 min-w-0 text-xs" placeholder="Valeur"
            value={rule.value}
            onChange={e => updateRule(i, { value: e.target.value })} />
          <span className="text-slate-500 flex-shrink-0">→ Page</span>
          <select className="input py-1.5 w-20 flex-shrink-0 text-xs"
            value={rule.page}
            onChange={e => updateRule(i, { page: Number(e.target.value) })}>
            {Array.from({ length: totalPages }, (_, p) => p + 1).map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button type="button" onClick={() => removeRule(i)}
            className="p-1 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button type="button" onClick={addRule}
        className="flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:text-orange-700 transition-colors">
        <Plus className="w-3.5 h-3.5" /> Ajouter une règle
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────
   Section wrapper
───────────────────────────────────────── */
function Section({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</h4>
      {children}
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div className="space-y-1">
      {label && <label className="text-xs font-semibold text-slate-600">{label}</label>}
      {children}
      {hint && <p className="text-[11px] text-slate-400 leading-snug">{hint}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════
   FieldEditor — panneau de configuration
═══════════════════════════════════════════ */
export default function FieldEditor({ field, idx, totalPages, otherFields, onUpdate, onRemove, onDuplicate }) {
  const [localKey, setLocalKey] = useState(field.key || "");
  useEffect(() => { setLocalKey(field.key || ""); }, [field.key]);

  const isSep = field.type === "separator";
  const hasOptions = ["select", "radio", "checkbox", "yes_no"].includes(field.type);
  const hasMinMax  = ["number", "scale", "rating"].includes(field.type);
  const hasLength  = ["text", "textarea", "email", "url"].includes(field.type);
  const hasJump    = ["select", "radio", "yes_no"].includes(field.type) && totalPages > 1;

  return (
    <div className="p-4 space-y-3 bg-slate-50 min-h-full">

      {/* ── Identité ── */}
      <Section title="Identité">
        <Field label="Libellé *">
          <input className="input text-sm font-semibold" placeholder="Question ou libellé du champ"
            value={field.label || ""}
            onChange={e => onUpdate({ label: e.target.value })} />
        </Field>

        {!isSep && (
          <Field label="Clé unique *" hint="Identifiant interne, sans espaces (ex: prenom, age_participant).">
            <input
              className="input text-sm font-mono"
              placeholder="cle_unique"
              value={localKey}
              onChange={e => setLocalKey(e.target.value)}
              onBlur={e => onUpdate({ key: e.target.value.trim().replace(/\s+/g, "_").toLowerCase() })}
            />
          </Field>
        )}

        <Field label="Page">
          <select className="input text-sm"
            value={Number(field.page) || 1}
            onChange={e => onUpdate({ page: Number(e.target.value) })}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <option key={p} value={p}>Page {p}</option>
            ))}
          </select>
        </Field>
      </Section>

      {/* ── Type de champ ── */}
      {!isSep && (
        <Section title="Type de champ">
          <TypePicker value={field.type} onChange={type => onUpdate({ type })} />
        </Section>
      )}

      {/* ── Options de réponse ── */}
      {hasOptions && (
        <Section title="Options de réponse">
          <OptionList
            options={field.options || []}
            onChange={opts => onUpdate({ options: opts })}
          />
        </Section>
      )}

      {/* ── Contenu ── */}
      {!isSep && (
        <Section title="Contenu">
          <Field label="Texte d'aide / placeholder">
            <input className="input text-sm" placeholder="Texte indicatif dans le champ"
              value={field.placeholder || ""}
              onChange={e => onUpdate({ placeholder: e.target.value })} />
          </Field>
          <Field label="Texte d'aide (sous le champ)">
            <input className="input text-sm" placeholder="Explication supplémentaire…"
              value={field.help_text || ""}
              onChange={e => onUpdate({ help_text: e.target.value })} />
          </Field>
          <Field label="Valeur par défaut">
            <input className="input text-sm" placeholder="Valeur pré-remplie"
              value={field.default_value || ""}
              onChange={e => onUpdate({ default_value: e.target.value })} />
          </Field>
        </Section>
      )}

      {/* ── Mise en page ── */}
      <Section title="Mise en page">
        {isSep && (
          <Field label="Libellé du séparateur">
            <input className="input text-sm" placeholder="Titre de la section"
              value={field.label || ""}
              onChange={e => onUpdate({ label: e.target.value })} />
          </Field>
        )}
        <Field label="Largeur de la colonne">
          <select className="input text-sm"
            value={field.col_span || "full"}
            onChange={e => onUpdate({ col_span: e.target.value })}>
            <option value="full">Pleine largeur</option>
            <option value="half">Demi-largeur (1/2)</option>
            <option value="third">Un tiers (1/3)</option>
            <option value="two-thirds">Deux tiers (2/3)</option>
          </select>
        </Field>
      </Section>

      {/* ── Validation ── */}
      {!isSep && (
        <Section title="Validation">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div
              role="checkbox"
              aria-checked={!!field.required}
              tabIndex={0}
              onClick={() => onUpdate({ required: !field.required })}
              onKeyDown={e => e.key === " " && onUpdate({ required: !field.required })}
              className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer ${field.required ? "bg-orange-500" : "bg-slate-200"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${field.required ? "translate-x-5" : ""}`} />
            </div>
            <span className="text-sm text-slate-700 font-medium">Champ obligatoire</span>
          </label>

          {hasMinMax && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Min">
                <input type="number" className="input text-sm" placeholder="—"
                  value={field.min ?? ""}
                  onChange={e => onUpdate({ min: e.target.value })} />
              </Field>
              <Field label="Max">
                <input type="number" className="input text-sm" placeholder="—"
                  value={field.max ?? ""}
                  onChange={e => onUpdate({ max: e.target.value })} />
              </Field>
            </div>
          )}

          {hasLength && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Longueur min">
                <input type="number" className="input text-sm" placeholder="—"
                  value={field.min_length ?? ""}
                  onChange={e => onUpdate({ min_length: e.target.value })} />
              </Field>
              <Field label="Longueur max">
                <input type="number" className="input text-sm" placeholder="—"
                  value={field.max_length ?? ""}
                  onChange={e => onUpdate({ max_length: e.target.value })} />
              </Field>
            </div>
          )}
        </Section>
      )}

      {/* ── Logique conditionnelle ── */}
      {!isSep && (
        <Section title="Logique conditionnelle">
          <div className="flex items-center gap-2 mb-1">
            <GitBranch className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-500">Ce champ s'affiche si :</span>
          </div>
          <ConditionsEditor
            showIf={field.show_if}
            otherFields={otherFields}
            totalPages={totalPages}
            onChange={show_if => onUpdate({ show_if })}
          />
        </Section>
      )}

      {/* ── Sauts de page ── */}
      {hasJump && (
        <Section title="Sauts de page">
          <div className="flex items-center gap-2 mb-1">
            <GitBranch className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-500">Selon la réponse, aller à :</span>
          </div>
          <JumpRulesEditor
            rules={field.jump_rules || []}
            totalPages={totalPages}
            onChange={jump_rules => onUpdate({ jump_rules })}
          />
        </Section>
      )}

      {/* ── Actions ── */}
      <Section title="Actions">
        <div className="flex gap-2">
          <button type="button" onClick={onDuplicate}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all">
            <Copy className="w-3.5 h-3.5" /> Dupliquer
          </button>
          <button type="button" onClick={onRemove}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-red-100 bg-red-50 py-2 text-xs font-medium text-red-500 hover:bg-red-100 hover:border-red-200 transition-all">
            <Trash2 className="w-3.5 h-3.5" /> Supprimer
          </button>
        </div>
      </Section>
    </div>
  );
}
