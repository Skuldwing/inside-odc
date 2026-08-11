import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronDown, ChevronUp, Trash2, Copy, ArrowUp, ArrowDown,
  GripVertical, Plus, X, Minus, GitBranch, Filter,
} from "lucide-react";
import { FIELD_TYPES, CONDITION_OPERATORS } from "./constants";

/* ── Type color map ── */
const TYPE_COLORS = {
  text:      "bg-blue-50 text-blue-700",
  textarea:  "bg-blue-50 text-blue-700",
  email:     "bg-violet-50 text-violet-700",
  phone:     "bg-violet-50 text-violet-700",
  url:       "bg-violet-50 text-violet-700",
  number:    "bg-amber-50 text-amber-700",
  scale:     "bg-amber-50 text-amber-700",
  date:      "bg-cyan-50 text-cyan-700",
  time:      "bg-cyan-50 text-cyan-700",
  select:    "bg-emerald-50 text-emerald-700",
  radio:     "bg-emerald-50 text-emerald-700",
  checkbox:  "bg-emerald-50 text-emerald-700",
  yes_no:    "bg-emerald-50 text-emerald-700",
  rating:    "bg-orange-50 text-orange-700",
  separator: "bg-slate-100 text-slate-500",
};

function TypeBadge({ type }) {
  const ft = FIELD_TYPES.find(t => t.value === type);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold flex-shrink-0 ${TYPE_COLORS[type] || "bg-slate-50 text-slate-600"}`}>
      <span>{ft?.icon}</span>
      <span className="hidden sm:inline">{ft?.label || type}</span>
    </span>
  );
}

/* ── Type picker popup ── */
function TypePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = FIELD_TYPES.find(t => t.value === value);
  const groups = {};
  for (const ft of FIELD_TYPES) {
    if (!groups[ft.group]) groups[ft.group] = [];
    groups[ft.group].push(ft);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="input mt-1 text-sm flex items-center gap-2 cursor-pointer select-none"
        onClick={() => setOpen(v => !v)}
      >
        <span className="text-base leading-none">{current?.icon}</span>
        <span className="flex-1 text-left truncate">{current?.label || value}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 w-68 rounded-xl border border-slate-200 bg-white shadow-xl overflow-y-auto max-h-80" style={{ width: "17rem" }}>
          {Object.entries(groups).map(([group, types]) => (
            <div key={group}>
              <p className="px-3 pt-2.5 pb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                {group}
              </p>
              <div className="px-1.5 pb-1.5">
                {types.map(ft => (
                  <button
                    key={ft.value}
                    type="button"
                    onClick={() => { onChange(ft.value); setOpen(false); }}
                    className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-left transition-colors ${
                      value === ft.value
                        ? "bg-orange-50 text-orange-700 font-semibold"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-base leading-none w-5 flex-shrink-0">{ft.icon}</span>
                    {ft.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Multi-rule conditions editor ── */
function ConditionsEditor({ conditions, otherFields, onUpdate, onRemove }) {
  const rules = conditions?.rules || [];
  const logic = conditions?.logic || "AND";
  const eligible = otherFields.filter(f => f.type !== "separator" && f.key);

  const addRule = () => {
    onUpdate({ logic, rules: [...rules, { key: eligible[0]?.key || "", operator: "eq", value: "" }] });
  };

  const updateRule = (idx, patch) => {
    onUpdate({ logic, rules: rules.map((r, i) => i === idx ? { ...r, ...patch } : r) });
  };

  const removeRule = (idx) => {
    const next = rules.filter((_, i) => i !== idx);
    if (!next.length) { onRemove(); return; }
    onUpdate({ logic, rules: next });
  };

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-700">
          <span className="font-medium">Afficher si</span>
          <select
            className="rounded-lg border border-orange-200 bg-white px-2 py-0.5 text-xs font-semibold text-orange-700 focus:outline-none"
            value={logic}
            onChange={e => onUpdate({ logic: e.target.value, rules })}
          >
            <option value="AND">TOUTES les conditions</option>
            <option value="OR">AU MOINS UNE condition</option>
          </select>
          <span className="text-slate-500">sont remplies</span>
        </div>
        <button type="button" onClick={onRemove} className="p-1 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {rules.map((rule, idx) => {
        const noValue = rule.operator === "is_empty" || rule.operator === "is_not_empty";
        return (
          <div key={idx} className="space-y-1">
            {idx > 0 && (
              <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wide">{logic === "AND" ? "— ET —" : "— OU —"}</p>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              <select
                className="select text-xs flex-1 min-w-0"
                value={rule.key}
                onChange={e => updateRule(idx, { key: e.target.value })}
              >
                <option value="">Champ…</option>
                {eligible.map(f => (
                  <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                ))}
              </select>
              <select
                className="select text-xs w-36 flex-shrink-0"
                value={rule.operator}
                onChange={e => updateRule(idx, { operator: e.target.value })}
              >
                {CONDITION_OPERATORS.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
              {!noValue && (
                <input
                  className="input text-xs w-28 flex-shrink-0"
                  value={rule.value ?? ""}
                  placeholder="Valeur…"
                  onChange={e => updateRule(idx, { value: e.target.value })}
                />
              )}
              <button type="button" onClick={() => removeRule(idx)} className="p-1 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 flex-shrink-0 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRule}
        className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 font-semibold transition-colors"
      >
        <Plus className="w-3 h-3" /> Ajouter une condition
      </button>
    </div>
  );
}

/* ── Jump rules editor ── */
function JumpRulesEditor({ jumpRules, totalPages, field, onUpdate }) {
  const rules = jumpRules || [];
  const yesNoOptions = ["Oui", "Non"];
  const options = field.type === "yes_no" ? yesNoOptions : (field.options || []);

  const addRule = () => {
    onUpdate([...rules, { value: options[0] || "", page: 2 }]);
  };

  const updateRule = (idx, patch) => {
    onUpdate(rules.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const removeRule = (idx) => {
    onUpdate(rules.filter((_, i) => i !== idx));
  };

  const maxPage = Math.max(totalPages, 2);
  const pageOptions = Array.from({ length: maxPage }, (_, i) => i + 1);

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 space-y-2">
      {rules.length === 0 && (
        <p className="text-xs text-slate-400">Aucun saut défini — comportement séquentiel par défaut.</p>
      )}
      {rules.map((rule, idx) => (
        <div key={idx} className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-500 flex-shrink-0">Si réponse =</span>
          {options.length > 0 ? (
            <select
              className="select text-xs flex-1 min-w-0"
              value={rule.value}
              onChange={e => updateRule(idx, { value: e.target.value })}
            >
              <option value="">— Sélectionner —</option>
              {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              className="input text-xs flex-1 min-w-0"
              value={rule.value || ""}
              placeholder="Valeur…"
              onChange={e => updateRule(idx, { value: e.target.value })}
            />
          )}
          <span className="text-xs text-slate-500 flex-shrink-0">→ page</span>
          <select
            className="select text-xs w-16 flex-shrink-0"
            value={rule.page}
            onChange={e => updateRule(idx, { page: Number(e.target.value) })}
          >
            {pageOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button type="button" onClick={() => removeRule(idx)} className="p-1 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 flex-shrink-0 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRule}
        className="flex items-center gap-1 text-xs text-purple-700 hover:text-purple-900 font-semibold transition-colors"
      >
        <Plus className="w-3 h-3" /> Ajouter un saut
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Main FieldEditor
══════════════════════════════════════════════════ */
export default function FieldEditor({
  field,
  idx,
  total,
  totalPages,
  otherFields,
  isCollapsed,
  isDragging,
  canRemove,
  onUpdate,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onToggleCollapsed,
  onDragStart,
  onDrop,
  onDragEnd,
}) {
  const [localKey, setLocalKey] = useState(field.key);
  useEffect(() => { setLocalKey(field.key); }, [field.key]);

  const isSeparator  = field.type === "separator";
  const isChoiceField = field.type === "select" || field.type === "radio" || field.type === "checkbox";
  const canJump       = field.type === "select" || field.type === "radio" || field.type === "yes_no";
  const hasValidBounds = field.type === "number" || field.type === "scale" || field.type === "date" || field.type === "time";
  const hasLenBounds   = field.type === "text" || field.type === "textarea" || field.type === "email" || field.type === "url" || field.type === "phone";

  const conditions    = field.show_if;
  const hasConditions = conditions && Array.isArray(conditions.rules) && conditions.rules.length > 0;
  const jumpRules     = field.jump_rules || [];
  const hasJumpRules  = jumpRules.length > 0;
  const eligibleForCondition = otherFields.filter(f => f.type !== "separator" && f.key).length > 0;

  const toggleConditions = () => {
    if (hasConditions) {
      onUpdate({ show_if: null });
    } else {
      const firstKey = otherFields.find(f => f.type !== "separator" && f.key)?.key || "";
      onUpdate({ show_if: { logic: "AND", rules: [{ key: firstKey, operator: "eq", value: "" }] } });
    }
  };

  const toggleJumpRules = () => {
    if (hasJumpRules) {
      onUpdate({ jump_rules: [] });
    } else {
      const defaultVal = field.type === "yes_no" ? "Oui" : (field.options?.[0] || "");
      onUpdate({ jump_rules: [{ value: defaultVal, page: 2 }] });
    }
  };

  /* ── Separator: compact inline ── */
  if (isSeparator) {
    return (
      <div
        className={`rounded-xl border-2 border-dashed p-3 flex items-center gap-3 ${isDragging ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-slate-50/50"}`}
        draggable
        onDragStart={onDragStart}
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      >
        <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0 cursor-grab" />
        <Minus className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <input
          className="input flex-1 text-sm font-semibold"
          value={field.label}
          placeholder="Titre de section…"
          onChange={e => onUpdate({ label: e.target.value })}
        />
        <select
          className="select text-xs w-20 flex-shrink-0"
          value={field.page || 1}
          onChange={e => onUpdate({ page: Number(e.target.value) })}
        >
          {[1,2,3,4,5].map(n => <option key={n} value={n}>P.{n}</option>)}
        </select>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button type="button" onClick={onMoveUp} disabled={idx === 0} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5 text-slate-500" /></button>
          <button type="button" onClick={onMoveDown} disabled={idx === total - 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5 text-slate-500" /></button>
          <button type="button" onClick={onDuplicate} className="p-1 rounded hover:bg-slate-100"><Copy className="w-3.5 h-3.5 text-slate-500" /></button>
          <button type="button" onClick={onRemove} disabled={!canRemove} className="p-1 rounded hover:bg-red-50 disabled:opacity-30"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
        </div>
      </div>
    );
  }

  /* ── Regular field ── */
  return (
    <div
      className={`rounded-xl border bg-white transition-shadow ${isDragging ? "border-orange-300 ring-2 ring-orange-100 shadow-lg" : "border-slate-200 hover:border-slate-300"}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* ── Header bar ── */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0 cursor-grab active:cursor-grabbing" />
        <span className="text-xs font-mono text-slate-400 w-5 text-center flex-shrink-0">{idx + 1}</span>
        <TypeBadge type={field.type} />
        {isCollapsed && (
          <span className="text-xs text-slate-600 ml-1 truncate flex-1">
            {field.label}{field.required ? " *" : ""}
            {hasConditions && <span className="ml-1.5 text-[10px] text-orange-500 font-semibold">si…</span>}
            {hasJumpRules && <span className="ml-1.5 text-[10px] text-purple-500 font-semibold">↪</span>}
          </span>
        )}
        {!isCollapsed && <div className="flex-1" />}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button type="button" onClick={onMoveUp} disabled={idx === 0} title="Monter" className="p-1 rounded hover:bg-slate-100 disabled:opacity-30">
            <ArrowUp className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button type="button" onClick={onMoveDown} disabled={idx === total - 1} title="Descendre" className="p-1 rounded hover:bg-slate-100 disabled:opacity-30">
            <ArrowDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button type="button" onClick={onDuplicate} title="Dupliquer" className="p-1 rounded hover:bg-slate-100">
            <Copy className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button type="button" onClick={onRemove} disabled={!canRemove} title="Supprimer" className="p-1 rounded hover:bg-red-50 disabled:opacity-30">
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
          <button type="button" onClick={onToggleCollapsed} className="p-1 rounded hover:bg-slate-100 ml-1">
            {isCollapsed ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronUp className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {!isCollapsed && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-4">

          {/* Row 1: Libellé / Clé / Page */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Libellé *</label>
              <input className="input mt-1 text-sm" value={field.label} placeholder="Ex: Nom complet"
                onChange={e => onUpdate({ label: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Clé unique</label>
              <input
                className="input mt-1 text-sm font-mono"
                value={localKey}
                placeholder="nom_complet"
                onChange={e => setLocalKey(e.target.value)}
                onBlur={e => onUpdate({ key: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Page</label>
              <input type="number" min={1} className="input mt-1 text-sm" value={field.page || 1}
                onChange={e => onUpdate({ page: Math.max(1, Number(e.target.value) || 1) })} />
            </div>
          </div>

          {/* Row 2: Type / Largeur / Obligatoire */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Type</label>
              <TypePicker
                value={field.type}
                onChange={type => onUpdate({ type, options: [], jump_rules: [], show_if: null })}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Largeur colonne</label>
              <div className="flex gap-1.5 mt-1">
                {[
                  { val: "full", label: "Pleine largeur" },
                  { val: "half", label: "Moitié (½)" },
                ].map(({ val, label }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => onUpdate({ col_span: val })}
                    className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                      (field.col_span || "full") === val
                        ? "bg-orange-500 text-white border-orange-500 shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:border-orange-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end pb-1">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <input type="checkbox" className="w-4 h-4 accent-orange-500 rounded"
                  checked={Boolean(field.required)}
                  onChange={e => onUpdate({ required: e.target.checked })} />
                Champ obligatoire
              </label>
            </div>
          </div>

          {/* Row 3: Placeholder / Texte d'aide */}
          {field.type !== "rating" && field.type !== "yes_no" && field.type !== "separator" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Placeholder</label>
                <input className="input mt-1 text-sm" value={field.placeholder || ""}
                  placeholder="Texte indicatif dans le champ…"
                  onChange={e => onUpdate({ placeholder: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Texte d&apos;aide</label>
                <input className="input mt-1 text-sm" value={field.help_text || ""}
                  placeholder="Explication visible sous le champ…"
                  onChange={e => onUpdate({ help_text: e.target.value })} />
              </div>
            </div>
          )}

          {/* Valeur par défaut (non visible pour les choix multiples et les champs spéciaux) */}
          {!isChoiceField && field.type !== "separator" && field.type !== "rating" && field.type !== "yes_no" && field.type !== "checkbox" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Valeur par défaut</label>
                <input className="input mt-1 text-sm" value={field.default_value || ""}
                  placeholder="(laisser vide)"
                  onChange={e => onUpdate({ default_value: e.target.value })} />
              </div>
            </div>
          )}

          {/* Options pour select / radio / checkbox */}
          {isChoiceField && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Options <span className="text-slate-300 font-normal normal-case">(une par ligne)</span>
              </label>
              <textarea
                className="input mt-1 min-h-[90px] text-sm font-mono"
                value={(field.options || []).join("\n")}
                placeholder={"Option A\nOption B\nOption C"}
                onChange={e => onUpdate({ options: e.target.value.split("\n").map(o => o.trim()).filter(Boolean) })}
              />
            </div>
          )}

          {/* Rating preview */}
          {field.type === "rating" && (
            <div className="flex items-center gap-3">
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(n => <span key={n} className="text-2xl text-amber-400 leading-none">★</span>)}
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={Boolean(field.required)}
                  onChange={e => onUpdate({ required: e.target.checked })} />
                Obligatoire
              </label>
            </div>
          )}

          {/* Validation min/max pour number, scale, date, time */}
          {hasValidBounds && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {field.type === "number" || field.type === "scale" ? "Valeur min" : "Min (date/heure)"}
                </label>
                <input
                  className="input mt-1 text-sm"
                  type={field.type === "number" || field.type === "scale" ? "number" : field.type}
                  value={field.min || ""}
                  onChange={e => onUpdate({ min: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {field.type === "number" || field.type === "scale" ? "Valeur max" : "Max (date/heure)"}
                </label>
                <input
                  className="input mt-1 text-sm"
                  type={field.type === "number" || field.type === "scale" ? "number" : field.type}
                  value={field.max || ""}
                  onChange={e => onUpdate({ max: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Longueur min/max pour text, textarea, email, url, phone */}
          {hasLenBounds && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Longueur min</label>
                <input type="number" min={0} className="input mt-1 text-sm" value={field.min_length || ""}
                  onChange={e => onUpdate({ min_length: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Longueur max</label>
                <input type="number" min={0} className="input mt-1 text-sm" value={field.max_length || ""}
                  onChange={e => onUpdate({ max_length: e.target.value })} />
              </div>
            </div>
          )}

          {/* ── Séparateur visuel ── */}
          <div className="border-t border-slate-100 pt-3 space-y-3">

            {/* Conditions d'affichage */}
            {eligibleForCondition && (
              <div>
                <button
                  type="button"
                  onClick={toggleConditions}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5 transition-colors mb-2 ${
                    hasConditions
                      ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  {hasConditions
                    ? `Conditions actives (${conditions.rules.length} règle${conditions.rules.length > 1 ? "s" : ""})`
                    : "Ajouter des conditions d'affichage"}
                </button>
                {hasConditions && (
                  <ConditionsEditor
                    conditions={conditions}
                    otherFields={otherFields}
                    onUpdate={updated => onUpdate({ show_if: updated })}
                    onRemove={() => onUpdate({ show_if: null })}
                  />
                )}
              </div>
            )}

            {/* Sauts de page */}
            {canJump && (
              <div>
                <button
                  type="button"
                  onClick={toggleJumpRules}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-1.5 transition-colors mb-2 ${
                    hasJumpRules
                      ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  {hasJumpRules
                    ? `Sauts actifs (${jumpRules.length} règle${jumpRules.length > 1 ? "s" : ""})`
                    : "Ajouter des sauts de page"}
                </button>
                {hasJumpRules && (
                  <JumpRulesEditor
                    jumpRules={jumpRules}
                    totalPages={totalPages}
                    field={field}
                    onUpdate={rules => onUpdate({ jump_rules: rules })}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
