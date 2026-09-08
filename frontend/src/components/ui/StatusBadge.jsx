/**
 * Pastille de statut. 24 variantes ecrites a la main dans les pages, avec des
 * paires fond/texte parfois sous le seuil de contraste. Les tons sont ici
 * definis une fois, tous au-dessus de 4,5:1 sur leur propre fond.
 */
const TONES = {
  neutral: "bg-slate-100 border-slate-200 text-slate-700",
  brand:   "bg-orange-50 border-orange-200 text-orange-700",
  success: "bg-emerald-50 border-emerald-200 text-emerald-700",
  warning: "bg-amber-50 border-amber-200 text-amber-700",
  danger:  "bg-red-50 border-red-200 text-red-700",
  info:    "bg-blue-50 border-blue-200 text-blue-700",
  violet:  "bg-violet-50 border-violet-200 text-violet-700",
};

const DOTS = {
  neutral: "bg-slate-400",
  brand:   "bg-orange-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger:  "bg-red-500",
  info:    "bg-blue-500",
  violet:  "bg-violet-500",
};

export default function StatusBadge({
  tone = "neutral",
  dot = false,
  icon: Icon,
  children,
  className = "",
  ...rest
}) {
  return (
    <span className={`badge ${TONES[tone] || TONES.neutral} ${className}`} {...rest}>
      {dot && (
        <span
          className={`mr-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${DOTS[tone] || DOTS.neutral}`}
          aria-hidden="true"
        />
      )}
      {Icon && <Icon className="mr-1.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}
