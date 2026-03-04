export default function AdminModal({ title, onClose, children, maxWidth = "max-w-lg" }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 px-4 py-6 sm:py-8">
      <div className={`card-solid mx-auto w-full ${maxWidth} max-h-[calc(100vh-3rem)] overflow-y-auto p-6`}>
        <div className="sticky top-0 z-10 -mx-6 mb-4 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
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
