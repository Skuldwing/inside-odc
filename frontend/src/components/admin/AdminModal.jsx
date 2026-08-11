export default function AdminModal({ title, onClose, children, maxWidth = "max-w-lg" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto px-4 py-6 sm:py-8">
      <div className={`card-solid w-full ${maxWidth} mx-auto flex flex-col`} style={{ maxHeight: "calc(100dvh - 3rem)" }}>
        {/* Header fixe */}
        <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4 rounded-t-2xl">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost border">
            Fermer
          </button>
        </div>
        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
