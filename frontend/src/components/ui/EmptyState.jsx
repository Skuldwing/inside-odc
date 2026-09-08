import { Inbox } from "lucide-react";
import Button from "./Button";

/**
 * Etat vide avec une porte de sortie.
 *
 * L'audit a releve 60 etats vides dans la plateforme, dont aucun ne proposait
 * l'action qui l'aurait resolu : « Aucun partenaire enregistre » sans bouton
 * pour en creer un. Le vide est pourtant le moment ou l'utilisateur a le plus
 * besoin d'etre guide.
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
  secondaryLabel,
  onSecondary,
  compact = false,
  /* `bare` retire la carte : indispensable dans une cellule de tableau, ou
     imbriquer une carte dans une autre creerait un cadre dans un cadre. */
  bare = false,
  className = "",
}) {
  const shell = bare ? "py-8" : `card ${compact ? "p-6" : "p-10"}`;

  return (
    <div className={`${shell} text-center ${className}`}>
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>

      <p className="font-medium text-slate-800">{title}</p>

      {description && (
        <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">{description}</p>
      )}

      {(actionLabel || secondaryLabel) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {actionLabel && onAction && (
            <Button onClick={onAction} icon={actionIcon}>
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && onSecondary && (
            <Button variant="ghost" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
