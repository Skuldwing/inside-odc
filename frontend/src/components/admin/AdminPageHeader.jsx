import { Layers } from "lucide-react";

export default function AdminPageHeader({
  title,
  subtitle,
  buttonLabel,
  buttonIcon: ButtonIcon,
  onAdd,
  icon: HeaderIcon = Layers,
}) {
  return (
    <header className="relative isolate flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-[22px] border border-orange-200/80 bg-gradient-to-r from-white via-orange-50/80 to-amber-50/60 p-4 shadow-sm sm:p-5">
      <div className="absolute -right-10 -top-16 -z-10 h-48 w-48 rounded-full bg-orange-300/20 blur-3xl" />
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-md shadow-orange-200">
          <HeaderIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-orange-700">Espace de gestion</p>
          <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        </div>
      </div>
      {onAdd && buttonLabel && (
        <button type="button" onClick={onAdd} className="btn-primary shrink-0">
          {ButtonIcon ? <ButtonIcon className="h-4 w-4" aria-hidden="true" /> : null}
          {buttonLabel}
        </button>
      )}
    </header>
  );
}
