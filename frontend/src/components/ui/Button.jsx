import { Loader2 } from "lucide-react";

const VARIANTS = {
  primary: "btn bg-orange-500 text-white shadow-sm shadow-orange-200 hover:bg-orange-600 active:bg-orange-700",
  dark: "btn bg-slate-900 text-white hover:bg-slate-800",
  ghost: "btn border border-slate-200 text-slate-700 hover:bg-slate-100",
  plain: "btn text-slate-600 hover:bg-slate-100",
  danger: "btn bg-red-600 text-white shadow-sm shadow-red-200 hover:bg-red-700 active:bg-red-800",
};

const SIZES = {
  sm: "px-3 py-2 text-xs",
  md: "",
  lg: "px-5 py-3 text-base",
};

/**
 * Bouton unique de la plateforme.
 *
 * L'etat d'attente est integre plutot que rebati a chaque appel : cinq pages
 * avaient un bouton d'enregistrement sans aucun retour visuel — on cliquait,
 * rien ne bougeait, on recliquait.
 */
export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel,
  icon: Icon,
  disabled,
  className = "",
  children,
  type = "button",
  ...rest
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || ""} disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon className="h-4 w-4" aria-hidden="true" />
      )}
      {loading ? loadingLabel || children : children}
    </button>
  );
}
