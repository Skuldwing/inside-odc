export default function PageLoader({ label = "Chargement..." }) {
  return (
    <div className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-4">
      <div className="relative h-12 w-12">
        <div className="absolute inset-0 rounded-full border-4 border-orange-100" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-orange-500" />
      </div>
      <p className="anim-fade-in-up text-sm font-medium text-slate-400">{label}</p>
    </div>
  );
}
