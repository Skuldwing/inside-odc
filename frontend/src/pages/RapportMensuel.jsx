import { useRef, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { X, FileDown, Loader2 } from "lucide-react";

/* ── Utilitaires ── */
function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function progressBar(pct, color = "#f97316") {
  const w = Math.min(100, Math.max(0, pct));
  return (
    <div style={{ height: 8, borderRadius: 4, background: "#e2e8f0", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${w}%`, background: color, borderRadius: 4 }} />
    </div>
  );
}

/* ── Contenu du rapport (rendu A4) ── */
function RapportContent({ summary, filters, partners, devices }) {
  const now = new Date();
  const monthLabel = filters.month
    ? format(new Date(filters.year, Number(filters.month) - 1, 1), "MMMM yyyy", { locale: fr })
    : `Annee ${filters.year}`;
  const periodLabel = filters.month
    ? format(new Date(filters.year, Number(filters.month) - 1, 1), "MMMM yyyy", { locale: fr })
    : `Janvier – Decembre ${filters.year}`;

  const totals = summary?.totals || {};
  const gender = summary?.gender || [];
  const byPartner = summary?.beneficiariesByPartner || [];
  const byDevice = summary?.beneficiariesByDevice || [];
  const recentActs = summary?.recentActivities || [];
  const alerts = summary?.alerts || {};
  const dq = summary?.dataQuality || {};

  const totalParticipants = totals.participants ?? 0;
  const femmes = gender.find((g) => g.name === "Femmes")?.value || 0;
  const hommes = gender.find((g) => g.name === "Hommes")?.value || 0;
  const pctF = percent(femmes, totalParticipants);
  const pctH = percent(hommes, totalParticipants);

  const filterName = (list, id, key = "name") =>
    id ? (list.find((x) => String(x.id) === String(id))?.[key] || "") : "";

  const partnerName = filterName(partners, filters.partner_id);
  const deviceName = filterName(devices, filters.device_id);

  return (
    <div
      id="rapport-content"
      style={{
        width: 794,
        background: "#fff",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        fontSize: 13,
        color: "#1e293b",
        padding: 0,
      }}
    >
      {/* ── Couverture ── */}
      <div style={{ background: "linear-gradient(135deg,#f97316 0%,#ea580c 100%)", padding: "48px 48px 36px", color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", opacity: 0.85 }}>
              Orange Digital Center · Senegal
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, lineHeight: 1.2 }}>
              Rapport d&apos;activites
            </div>
            <div style={{ fontSize: 18, fontWeight: 500, marginTop: 4, opacity: 0.9, textTransform: "capitalize" }}>
              {monthLabel}
            </div>
          </div>
          <div style={{ textAlign: "right", opacity: 0.85, fontSize: 11 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Inside ODC</div>
            <div>Genere le {format(now, "dd MMMM yyyy", { locale: fr })}</div>
            <div>Periode : {periodLabel}</div>
            {partnerName && <div>Partenaire : {partnerName}</div>}
            {deviceName && <div>Dispositif : {deviceName}</div>}
          </div>
        </div>
      </div>

      <div style={{ padding: "32px 48px" }}>

        {/* ── KPIs ── */}
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Indicateurs cles</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <KpiBox label="Activites" value={totals.activities ?? 0} color="#f97316" />
            <KpiBox label="Participants" value={totals.participants ?? 0} color="#10b981" />
            <KpiBox label="Heures formation" value={`${totals.hours ?? 0}h`} color="#6366f1" />
            <KpiBox label="Partenaires actifs" value={totals.partners_active ?? 0} color="#0ea5e9" />
          </div>
        </div>

        {/* ── Genre ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
          <div>
            <SectionTitle>Repartition par genre</SectionTitle>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: 16 }}>
              <GenderBar pctF={pctF} pctH={pctH} femmes={femmes} hommes={hommes} total={totalParticipants} />
            </div>
          </div>

          {/* ── Top dispositifs ── */}
          <div>
            <SectionTitle>Participants par dispositif</SectionTitle>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: 16 }}>
              {byDevice.length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: 12 }}>Aucune donnee</div>
              ) : (
                byDevice.slice(0, 5).map((d) => (
                  <div key={d.name} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
                      <span style={{ fontWeight: 500 }}>{d.name}</span>
                      <span style={{ color: "#64748b" }}>{d.value}</span>
                    </div>
                    {progressBar(percent(d.value, Math.max(...byDevice.map((x) => x.value))), d.color || "#f97316")}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Partenaires et objectifs ── */}
        {byPartner.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <SectionTitle>Objectifs par partenaire</SectionTitle>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  {["Partenaire", "Realise", "Objectif", "Progression"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#475569", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byPartner.map((row, idx) => {
                  const pct = row.objective > 0 ? Math.min(100, Math.round((row.value / row.objective) * 100)) : 0;
                  return (
                    <tr key={row.name} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 500 }}>{row.name}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>{row.value}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center", color: "#64748b" }}>{row.objective || "—"}</td>
                      <td style={{ padding: "8px 12px", width: 120 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            {progressBar(pct, pct >= 100 ? "#10b981" : pct >= 50 ? "#f97316" : "#ef4444")}
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: pct >= 100 ? "#059669" : pct >= 50 ? "#ea580c" : "#dc2626", minWidth: 32 }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Activites recentes ── */}
        {recentActs.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <SectionTitle>Activites recentes</SectionTitle>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  {["Activite", "Partenaire", "Date", "Participants"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#475569", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentActs.slice(0, 8).map((a, idx) => (
                  <tr key={a.id} style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 500 }}>{a.title}</td>
                    <td style={{ padding: "8px 12px", color: "#64748b" }}>{a.partner_name || a.partner || "—"}</td>
                    <td style={{ padding: "8px 12px", color: "#64748b" }}>
                      {a.activity_date ? format(new Date(a.activity_date), "dd/MM/yyyy") : "—"}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>{a.participants_count ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Qualité données & alertes ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
          <div>
            <SectionTitle>Qualite des donnees</SectionTitle>
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: 16 }}>
              {[
                { label: "Contacts manquants", value: dq.missing_contact_pct || 0 },
                { label: "Genre manquant", value: dq.missing_gender_pct || 0 },
                { label: "Activites sans dispositif", value: dq.activities_missing_device_pct || 0 },
                { label: "Activites sans partenaire", value: dq.activities_missing_partner_pct || 0 },
              ].map((r) => (
                <div key={r.label} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span>{r.label}</span>
                    <span style={{ fontWeight: 600, color: r.value > 30 ? "#dc2626" : r.value > 10 ? "#ea580c" : "#059669" }}>{r.value}%</span>
                  </div>
                  {progressBar(r.value, r.value > 30 ? "#ef4444" : r.value > 10 ? "#f97316" : "#10b981")}
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionTitle>Alertes</SectionTitle>
            <div style={{ background: "#fff7ed", borderRadius: 10, padding: 16, border: "1px solid #fed7aa" }}>
              {(alerts.partners || []).length === 0 && (alerts.devices || []).length === 0 ? (
                <div style={{ color: "#059669", fontSize: 12 }}>✓ Aucune alerte active</div>
              ) : (
                <>
                  {(alerts.partners || []).map((p) => (
                    <div key={p.name} style={{ fontSize: 12, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                      <span>⚠ {p.name}</span>
                      <span style={{ color: "#ea580c", fontWeight: 600 }}>{p.percent}% objectif</span>
                    </div>
                  ))}
                  {(alerts.devices || []).map((d) => (
                    <div key={d.name} style={{ fontSize: 12, marginBottom: 6 }}>
                      <span>⚠ {d.name} — aucune activite recente</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Pied de page ── */}
        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16, marginTop: 8, display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: 11 }}>
          <span>Orange Digital Center Senegal — Inside ODC</span>
          <span>Rapport genere le {format(now, "dd/MM/yyyy 'a' HH:mm", { locale: fr })}</span>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid #fed7aa" }}>
      {children}
    </div>
  );
}

function KpiBox({ label, value, color }) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: 10, padding: "16px 14px", borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#0f172a" }}>{value}</div>
    </div>
  );
}

function GenderBar({ pctF, pctH, femmes, hommes, total }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 0, height: 20, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ width: `${pctF}%`, background: "#ec4899" }} title={`Femmes ${pctF}%`} />
        <div style={{ width: `${pctH}%`, background: "#3b82f6" }} title={`Hommes ${pctH}%`} />
        <div style={{ flex: 1, background: "#e2e8f0" }} />
      </div>
      <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ec4899" }} />
          <span>Femmes : <strong>{femmes}</strong> ({pctF}%)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6" }} />
          <span>Hommes : <strong>{hommes}</strong> ({pctH}%)</span>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>Total : {total} participants</div>
    </div>
  );
}

/* ── Modal principal ── */
export default function RapportMensuelModal({ summary, filters, partners, devices, onClose }) {
  const contentRef = useRef(null);
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    if (!contentRef.current) return;
    setGenerating(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let y = 0;

      while (y < imgH) {
        if (y > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, -y, imgW, imgH);
        y += pageH;
      }

      const monthLabel = filters.month
        ? format(new Date(filters.year, Number(filters.month) - 1, 1), "yyyy-MM", { locale: fr })
        : String(filters.year);
      pdf.save(`rapport-odc-${monthLabel}.pdf`);
    } catch (err) {
      console.error("Erreur PDF:", err);
      alert("Erreur lors de la generation du PDF.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-6 px-4">
      <div className="w-full max-w-4xl">
        {/* Toolbar */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-white font-medium text-sm">Apercu du rapport — verifiez avant de telecharger</p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={generating}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-60 transition-colors"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              {generating ? "Generation..." : "Telecharger PDF"}
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4" />
              Fermer
            </button>
          </div>
        </div>

        {/* Rapport preview */}
        <div className="rounded-xl overflow-hidden shadow-2xl">
          <div ref={contentRef}>
            <RapportContent
              summary={summary}
              filters={filters}
              partners={partners}
              devices={devices}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
