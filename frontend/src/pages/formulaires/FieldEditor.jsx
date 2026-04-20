import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { FIELD_TYPES, CONDITION_OPERATORS } from "./constants";

export default function FieldEditor({
  field,
  idx,
  otherFields,
  isCollapsed,
  isDragging,
  canRemove,
  onUpdate,
  onRemove,
  onToggleCollapsed,
  onToggleCondition,
  onDragStart,
  onDrop,
  onDragEnd,
}) {
  const showIf = field.show_if;

  return (
    <div
      className={`rounded-xl border bg-slate-50/50 p-3 space-y-3 ${
        isDragging
          ? "border-orange-300 ring-2 ring-orange-200"
          : "border-slate-200"
      }`}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800">Champ {idx + 1}</p>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
            <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">
              {field.type}
            </span>
            <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">
              page {field.page || 1}
            </span>
            {showIf && (
              <span className="rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-orange-700">
                conditionnel
              </span>
            )}
          </div>
        </div>
        <button type="button" className="btn-ghost border" onClick={onToggleCollapsed}>
          {isCollapsed ? (
            <>
              <ChevronDown className="w-4 h-4" />
              Ouvrir
            </>
          ) : (
            <>
              <ChevronUp className="w-4 h-4" />
              Reduire
            </>
          )}
        </button>
      </div>

      {!isCollapsed && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-500">Libelle *</label>
              <input
                className="input mt-1"
                value={field.label}
                onChange={(e) => onUpdate({ label: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Cle</label>
              <input
                className="input mt-1"
                value={field.key}
                onChange={(e) => onUpdate({ key: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Type</label>
              <select
                className="select mt-1"
                value={field.type}
                onChange={(e) => onUpdate({ type: e.target.value })}
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
                  onUpdate({ page: Math.max(1, Number(e.target.value) || 1) })
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
                onChange={(e) => onUpdate({ placeholder: e.target.value })}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 mt-6">
              <input
                type="checkbox"
                checked={Boolean(field.required)}
                onChange={(e) => onUpdate({ required: e.target.checked })}
              />
              Champ obligatoire
            </label>
          </div>

          {(field.type === "select" || field.type === "checkbox") && (
            <div>
              <label className="text-xs text-slate-500">Options (une par ligne)</label>
              <textarea
                className="input mt-1 min-h-20"
                value={(field.options || []).join("\n")}
                onChange={(e) =>
                  onUpdate({
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
                onChange={(e) => onToggleCondition(e.target.checked)}
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
                      onUpdate({ show_if: { ...showIf, key: e.target.value } })
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
                      onUpdate({ show_if: { ...showIf, operator: e.target.value } })
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
                      onUpdate({ show_if: { ...showIf, value: e.target.value } })
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
              onClick={onRemove}
              disabled={!canRemove}
            >
              <Trash2 className="w-4 h-4" />
              Supprimer champ
            </button>
          </div>
        </>
      )}
    </div>
  );
}
