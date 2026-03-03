export default function AdminSearchCard({ placeholder, value, onChange }) {
  return (
    <div className="card p-4">
      <div className="relative max-w-xl">
        <input
          type="text"
          className="input pl-10"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </span>
      </div>
    </div>
  );
}
