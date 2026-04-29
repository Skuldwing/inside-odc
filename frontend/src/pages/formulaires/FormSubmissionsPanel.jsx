import { Download, Trash2, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { useState } from "react";
import { formatDate } from "./helpers";

const PAGE_SIZE = 10;

function formatValue(value) {
  if (value === null || value === undefined || value === "") return <span className="text-slate-300">—</span>;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") {
    // Afficher les étoiles pour les notes
    if (Number.isInteger(value) && value >= 1 && value <= 5) {
      return <span title={`${value}/5`}>{"★".repeat(value)}{"☆".repeat(5 - value)}</span>;
    }
    return String(value);
  }
  return String(value);
}

export default function FormSubmissionsPanel({
  formFields = [],
  submissions,
  submissionsLoading,
  exportingFormat,
  onExport,
  onDeleteSubmission,
}) {
  const [page, setPage] = useState(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Colonnes : champs non-separator triés par page
  const columns = formFields
    .filter((f) => f?.type !== "separator")
    .sort((a, b) => (a.page || 1) - (b.page || 1));

  const totalPages = Math.ceil(submissions.length / PAGE_SIZE);
  const paginated = submissions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = async (id) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setConfirmDeleteId(null);
    await onDeleteSubmission(id);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{submissions.length}</span> reponse{submissions.length !== 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost border text-sm" disabled={exportingFormat === "csv"}
            onClick={() => onExport("csv")}>
            <Download className="w-4 h-4" />
            {exportingFormat === "csv" ? "Export..." : "CSV"}
          </button>
          <button type="button" className="btn-ghost border text-sm" disabled={exportingFormat === "xlsx"}
            onClick={() => onExport("xlsx")}>
            <Download className="w-4 h-4" />
            {exportingFormat === "xlsx" ? "Export..." : "XLSX"}
          </button>
        </div>
      </div>

      {/* Tableau */}
      {submissionsLoading ? (
        <div className="text-center py-8 text-slate-400 text-sm">Chargement...</div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">Aucune reponse pour l&apos;instant.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left p-3 text-xs font-semibold text-slate-500 whitespace-nowrap">Date</th>
                  {columns.map((f) => (
                    <th key={f.key} className="text-left p-3 text-xs font-semibold text-slate-500 whitespace-nowrap max-w-[140px]">
                      {f.label}
                    </th>
                  ))}
                  <th className="p-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((s) => (
                  <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${confirmDeleteId === s.id ? "bg-red-50" : ""}`}>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(s.submitted_at)}</td>
                    {columns.map((f) => (
                      <td key={f.key} className="p-3 text-xs text-slate-700 max-w-[140px] truncate" title={String(s.values?.[f.key] ?? "")}>
                        {formatValue(s.values?.[f.key])}
                      </td>
                    ))}
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        title={confirmDeleteId === s.id ? "Cliquer encore pour confirmer" : "Supprimer"}
                        className={`p-1 rounded transition-colors ${confirmDeleteId === s.id ? "text-red-600 bg-red-100" : "text-slate-300 hover:text-red-400 hover:bg-red-50"}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>Page {page} / {totalPages}</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-30">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-30">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
