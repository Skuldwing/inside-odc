export default function AdminModal({ title, onClose, children, maxWidth = "max-w-lg" }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className={`card-solid w-full ${maxWidth} p-6`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost border">
            Fermer
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
