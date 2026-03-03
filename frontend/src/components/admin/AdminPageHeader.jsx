export default function AdminPageHeader({
  title,
  subtitle,
  buttonLabel,
  buttonIcon: ButtonIcon,
  onAdd,
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>

      <button onClick={onAdd} className="btn-primary">
        {ButtonIcon ? <ButtonIcon className="w-4 h-4" /> : null}
        {buttonLabel}
      </button>
    </div>
  );
}
