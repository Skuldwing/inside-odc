import { ChevronDown, ChevronUp, Trash2, Copy, ArrowUp, ArrowDown, GripVertical, Minus } from "lucide-react";
import { FIELD_TYPES, CONDITION_OPERATORS } from "./constants";

function TypeBadge({ type }) {
  const colors = {
    text: "bg-blue-50 text-blue-700 border-blue-200",
    textarea: "bg-blue-50 text-blue-700 border-blue-200",
    email: "bg-violet-50 text-violet-700 border-violet-200",
    phone: "bg-violet-50 text-violet-700 border-violet-200",
    number: "bg-amber-50 text-amber-700 border-amber-200",
    date: "bg-amber-50 text-amber-700 border-amber-200",
    select: "bg-emerald-50 text-emerald-700 border-emerald-200",
    checkbox: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rating: "bg-orange-50 text-orange-700 border-orange-200",
    separator: "bg-slate-100 text-slate-500 border-slate-200",
  };
  const ft = FIELD_TYPES.find((t) => t.value === type);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${colors[type] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
      <span>{ft?.icon}</span>
      {ft?.label || type}
    </span>
  );
}

export default function FieldEditor({
  field,
  idx,
  total,
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
  onToggleCondition,
  onDragStart,
  onDrop,
  onDragEnd,
}) {
  const showIf = field.show_if;
  const isSeparator = field.type === "separator";

  if (isSeparator) {
    return (
      <div
        className={`rounded-xl border-2 border-dashed p-3 flex items-center gap-3 ${isDragging ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-slate-50/50"}`}
        draggable
        onDragStart={onDragStart}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
      >
        <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0 cursor-grab" />
        <Minus className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <input
          className="input flex-1 text-sm font-medium"
          value={field.label}
          placeholder="Titre de section..."
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
        <select
          className="select text-xs w-20 flex-shrink-0"
          value={field.page || 1}
          onChange={(e) => onUpdate({ page: Number(e.target.value) })}
        >
          {[1,2,3,4,5].map((n) => <option key={n} value={n}>P.{n}</option>)}
        </select>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button" onClick={onMoveUp} disabled={idx === 0} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30">
            <ArrowUp className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button type="button" onClick={onMoveDown} disabled={idx === total - 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30">
            <ArrowDown className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button type="button" onClick={onDuplicate} className="p-1 rounded hover:bg-slate-100">
            <Copy className="w-3.5 h-3.5 text-slate-500" />
          </button>
          <button type="button" onClick={onRemove} disabled={!canRemove} className="p-1 rounded hover:bg-red-50 disabled:opacity-30">
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border bg-white transition-shadow ${isDragging ? "border-orange-300 ring-2 ring-orange-100 shadow-lg" : "border-slate-200 hover:border-slate-300"}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0 cursor-grab active:cursor-grabbing" />
        <span className="flex-shrink-0 text-xs font-mono text-slate-400 w-5 text-center">{idx + 1}</span>
        <TypeBadge type={field.type} />
        {isCollapsed && (
          <span className="text-xs text-slate-500 ml-1 truncate max-w-[200px]">
            {field.label}{field.required ? " *" : ""}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
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

      {/* Contenu */}
      {!isCollapsed && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-3 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2 md:col-span-1">
              <label className="text-xs font-medium text-slate-500">Libelle *</label>
              <input className="input mt-1 text-sm" value={field.label} placeholder="Ex: Nom complet"
                onChange={(e) => onUpdate({ label: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Cle unique</label>
              <input className="input mt-1 text-sm font-mono" value={field.key} placeholder="nom_complet"
                onChange={(e) => onUpdate({ key: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Type</label>
              <select className="select mt-1 text-sm" value={field.type}
                onChange={(e) => onUpdate({ type: e.target.value, options: [] })}>
                {FIELD_TYPES.filter((t) => t.value !== "separator").map((t) => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Page</label>
              <input type="number" min={1} className="input mt-1 text-sm" value={field.page || 1}
                onChange={(e) => onUpdate({ page: Math.max(1, Number(e.target.value) || 1) })} />
            </div>
          </div>

          {field.type !== "rating" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
              <div>
                <label className="text-xs font-medium text-slate-500">Placeholder</label>
                <input className="input mt-1 text-sm" value={field.placeholder || ""} placeholder="Texte indicatif..."
                  onChange={(e) => onUpdate({ placeholder: e.target.value })} />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 pb-1 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={Boolean(field.required)}
                  onChange={(e) => onUpdate({ required: e.target.checked })} />
                Champ obligatoire
              </label>
            </div>
          )}

          {(field.type === "select" || field.type === "checkbox") && (
            <div>
              <label className="text-xs font-medium text-slate-500">
                Options <span className="text-slate-400 font-normal">(une par ligne)</span>
              </label>
              <textarea className="input mt-1 min-h-[80px] text-sm font-mono"
                value={(field.options || []).join("\n")} placeholder={"Option 1\nOption 2\nOption 3"}
                onChange={(e) => onUpdate({ options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) })} />
            </div>
          )}

          {field.type === "rating" && (
            <div className="flex items-center gap-3">
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map((n) => <span key={n} className="text-2xl text-amber-400 leading-none">★</span>)}
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={Boolean(field.required)}
                  onChange={(e) => onUpdate({ required: e.target.checked })} />
                Obligatoire
              </label>
            </div>
          )}

          {otherFields.filter((f) => f.type !== "separator").length > 0 && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-2">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={Boolean(showIf)}
                  onChange={(e) => onToggleCondition(e.target.checked)}
                  disabled={otherFields.filter((f) => f.type !== "separator").length === 0} />
                Affichage conditionnel
                {showIf && <span className="text-xs text-orange-600 font-normal">(actif)</span>}
              </label>

              {showIf && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
                  <div>
                    <label className="text-xs text-slate-400">Si le champ</label>
                    <select className="select mt-1 text-sm" value={showIf.key}
                      onChange={(e) => onUpdate({ show_if: { ...showIf, key: e.target.value } })}>
                      <option value="">Selectionner...</option>
                      {otherFields.filter((f) => f.type !== "separator").map((f, fIdx) => (
                        <option key={`${f.key}-${fIdx}`} value={f.key}>{f.label} ({f.key})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Operateur</label>
                    <select className="select mt-1 text-sm" value={showIf.operator}
                      onChange={(e) => onUpdate({ show_if: { ...showIf, operator: e.target.value } })}>
                      {CONDITION_OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Valeur</label>
                    <input className="input mt-1 text-sm" value={showIf.value ?? ""}
                      onChange={(e) => onUpdate({ show_if: { ...showIf, value: e.target.value } })} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
