/**
 * En-tete de page. Six pages le composaient a la main, trois seulement
 * passaient par AdminPageHeader — d'ou des titres et sous-titres qui ne
 * s'alignaient pas d'une page a l'autre.
 */
export default function PageHeader({ eyebrow, title, subtitle, icon: Icon, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{eyebrow}</p>
        )}
        <h1 className="page-title flex items-center gap-2">
          {Icon && <Icon className="h-6 w-6 flex-shrink-0 text-orange-500" aria-hidden="true" />}
          {title}
        </h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
