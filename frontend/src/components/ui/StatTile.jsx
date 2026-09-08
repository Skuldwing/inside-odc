/**
 * Tuile de statistique. L'audit en a compte 27 ecrites a la main, avec autant
 * de variantes d'espacement et de taille de chiffre.
 */
export default function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  className = "",
}) {
  const TONES = {
    neutral: "text-slate-900",
    brand: "text-orange-600",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  };

  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center gap-2 text-slate-500">
        {Icon && <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
        <p className="text-xs">{label}</p>
      </div>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${TONES[tone] || TONES.neutral}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
