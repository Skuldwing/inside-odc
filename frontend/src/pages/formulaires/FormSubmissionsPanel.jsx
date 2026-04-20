import { Eye, EyeOff, Download } from "lucide-react";

export default function FormSubmissionsPanel({
  submissionsCount,
  submissions,
  submissionsLoading,
  showSubmissions,
  exportingFormat,
  onToggleSubmissions,
  onExport,
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost border" onClick={onToggleSubmissions}>
          {showSubmissions ? (
            <>
              <EyeOff className="w-4 h-4" />
              Masquer reponses
            </>
          ) : (
            <>
              <Eye className="w-4 h-4" />
              Voir reponses ({submissionsCount})
            </>
          )}
        </button>

        <button
          type="button"
          className="btn-ghost border"
          disabled={exportingFormat === "csv"}
          onClick={() => onExport("csv")}
        >
          <Download className="w-4 h-4" />
          {exportingFormat === "csv" ? "Export..." : "Export CSV"}
        </button>

        <button
          type="button"
          className="btn-ghost border"
          disabled={exportingFormat === "xlsx"}
          onClick={() => onExport("xlsx")}
        >
          <Download className="w-4 h-4" />
          {exportingFormat === "xlsx" ? "Export..." : "Export XLSX"}
        </button>
      </div>

      {showSubmissions && (
        <div className="mt-3 space-y-2 max-h-64 overflow-auto">
          {submissionsLoading ? (
            <p className="text-sm text-slate-500">Chargement...</p>
          ) : submissions.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune reponse.</p>
          ) : (
            submissions.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-slate-200 bg-white p-2 text-xs"
              >
                <p className="text-slate-500 mb-1">{s.submitted_at}</p>
                <pre className="whitespace-pre-wrap text-slate-700">
                  {JSON.stringify(s.values, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
