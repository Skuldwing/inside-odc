import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Copy,
  Users,
  FileCheck,
  ListChecks,
  AlertTriangle,
  OctagonAlert,
  Info,
  Table,
  RotateCcw,
  Mail,
  MapPin,
  QrCode,
  Camera,
  ExternalLink,
} from "lucide-react";
import api from "../api";
import PageHeader from "../components/ui/PageHeader";
import { Modal, useToast } from "../components/ui";
import StatutValidation from "../components/StatutValidation";
import ContreVerification from "../components/fiabilite/ContreVerification";
import VisitesInopinees from "../components/fiabilite/VisitesInopinees";

/* Le partenaire déclare, un administrateur ODC valide. Cette page est celle
   de l'administrateur : la file des déclarations, avec pour chacune les
   contrôles automatiques — qu'un partenaire ne voit jamais — puis la
   contre-vérification auprès des bénéficiaires et les visites inopinées. */

const SECTIONS = [
  { key: "validation", label: "Validation des activités", Icone: ShieldCheck },
  { key: "beneficiaires", label: "Vérification auprès des bénéficiaires", Icone: Mail },
  { key: "visites", label: "Visites inopinées", Icone: MapPin },
];

const TABS = [
  { key: "a_verifier", label: "À vérifier" },
  { key: "validee", label: "Validées" },
  { key: "rejetee", label: "Rejetées" },
  { key: "historique", label: "Anciennes validations automatiques" },
  { key: "all", label: "Toutes" },
];

const PAGE = 50;

const CRITERIA_META = {
  participants: { label: "Liste participants", icon: Users },
  proof: { label: "Preuve justificative", icon: FileCheck },
  metadata: { label: "Métadonnées", icon: ListChecks },
  duplicates: { label: "Absence de doublons", icon: Copy },
};
const CRITERIA_ORDER = ["participants", "proof", "metadata", "duplicates"];

const NIVEAUX = {
  alerte: { Icone: OctagonAlert, cls: "text-red-700", fond: "border-red-200 bg-red-50/70", libelle: "alerte" },
  attention: { Icone: AlertTriangle, cls: "text-amber-700", fond: "border-amber-200 bg-amber-50/60", libelle: "à regarder" },
  info: { Icone: Info, cls: "text-slate-500", fond: "border-slate-200 bg-slate-50/60", libelle: "info" },
};

const dateFr = (d) => {
  if (!d) return "—";
  try {
    return format(typeof d === "string" ? parseISO(d) : d, "dd/MM/yyyy", { locale: fr });
  } catch {
    return "—";
  }
};

function scoreColor(score) {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function ScoreBreakdown({ details }) {
  const criteria = details?.criteria || {};
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-slate-500">
        Le score mesure si le dossier est complet (contacts, rapport, lieu, durée), pas s&apos;il est vrai :
        c&apos;est une aide, pas une validation.
      </p>
      {CRITERIA_ORDER.map((key) => {
        const c = criteria[key];
        if (!c) return null;
        const meta = CRITERIA_META[key];
        const Icon = meta.icon;
        return (
          <div key={key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-600">
                <Icon className="h-3.5 w-3.5 text-slate-500" />
                {meta.label}
                <span className="text-slate-500">({Math.round(c.weight * 100)}%)</span>
              </span>
              <span className="font-semibold text-slate-700">{c.score}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${scoreColor(c.score)}`} style={{ width: `${c.score}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ParticipantsList({ activityId }) {
  const [participants, setParticipants] = useState(null);
  useEffect(() => {
    let mounted = true;
    api
      .get(`/reliability/${activityId}/participants`)
      .then((res) => { if (mounted) setParticipants(res.data); })
      .catch(() => { if (mounted) setParticipants([]); });
    return () => { mounted = false; };
  }, [activityId]);

  if (!participants) return <p className="py-2 text-xs text-slate-500">Chargement de la liste…</p>;
  if (participants.length === 0) {
    return <p className="py-2 text-xs text-slate-500">Aucune liste nominative pour cette activité.</p>;
  }
  return (
    <div className="max-h-72 overflow-auto">
      <table className="table text-xs">
        <thead className="table-head sticky top-0">
          <tr>
            <th className="px-2 py-1.5">Nom</th>
            <th className="px-2 py-1.5">Téléphone</th>
            <th className="px-2 py-1.5">Email</th>
            <th className="px-2 py-1.5">Structure</th>
          </tr>
        </thead>
        <tbody>
          {participants.map((p) => (
            <tr key={p.id} className="table-row">
              <td className="px-2 py-1.5 text-slate-700">{p.prenom} {p.nom}</td>
              <td className="px-2 py-1.5 text-slate-600">{p.telephone || <span className="italic text-slate-400">—</span>}</td>
              <td className="px-2 py-1.5 text-slate-600">{p.email || <span className="italic text-slate-400">—</span>}</td>
              <td className="px-2 py-1.5 text-slate-500">{p.structure || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* D'où vient la décision, ou pourquoi l'activité est revenue dans la file. */
function Origine({ a }) {
  const effectif = a.participants_count;
  if (a.validation_origine === "reouverte") {
    return (
      <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <strong>Liste allongée après validation</strong> : {a.validation_effectif} participant{a.validation_effectif > 1 ? "s" : ""} à la
          validation, {effectif} aujourd&apos;hui. À revalider.
        </span>
      </p>
    );
  }
  if (a.validation_origine === "resoumise") {
    return (
      <p className="flex items-start gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs text-sky-800">
        <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <strong>Corrigée et renvoyée par le partenaire</strong>
          {a.validation_motif ? <> — motif du rejet précédent : « {a.validation_motif} »</> : null}
        </span>
      </p>
    );
  }
  if (a.reliability_status === "a_verifier") return null;
  const qui = a.validation_par_nom ? ` par ${a.validation_par_nom}` : "";
  const quand = a.validation_le ? ` le ${dateFr(a.validation_le)}` : "";
  let texte = null;
  if (a.validation_origine === "historique") texte = "Validée automatiquement par l'ancien système, avant la validation par un administrateur.";
  else if (a.validation_origine === "odc") texte = "Déclarée par un administrateur ODC : validée d'office.";
  else if (a.reliability_status === "validee") texte = `Validée${qui}${quand}${a.validation_effectif != null ? `, sur ${a.validation_effectif} participant${a.validation_effectif > 1 ? "s" : ""}` : ""}.`;
  else if (a.reliability_status === "rejetee") texte = `Rejetée${qui}${quand}${a.validation_motif ? ` — « ${a.validation_motif} »` : ""}.`;
  return texte ? <p className="text-xs text-slate-500">{texte}</p> : null;
}

function Controles({ controles }) {
  const alertes = controles?.alertes || [];
  const preuve = controles?.preuve;
  return (
    <div className="space-y-2">
      {alertes.length === 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Aucun signal particulier dans les contrôles automatiques.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {alertes.map((x, i) => {
            const n = NIVEAUX[x.niveau] || NIVEAUX.info;
            const { Icone } = n;
            return (
              <li key={`${x.code}-${i}`} className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 ${n.fond}`}>
                <Icone className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${n.cls}`} aria-label={n.libelle} />
                <span className="min-w-0 text-xs text-slate-700">
                  <strong className={n.cls}>{x.titre}</strong>
                  {x.detail ? <span className="block text-slate-600">{x.detail}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {preuve && preuve.effectif > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="font-medium text-slate-600">Preuves :</span>
          <span className="inline-flex items-center gap-1">
            <QrCode className="h-3 w-3" /> {preuve.emargements_qr}/{preuve.effectif} ont émargé eux-mêmes par QR
          </span>
          <span className="inline-flex items-center gap-1">
            <FileCheck className="h-3 w-3" /> {preuve.rapport ? "rapport joint" : "pas de rapport"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Camera className="h-3 w-3" /> {preuve.photos} photo{preuve.photos > 1 ? "s" : ""}
          </span>
        </p>
      )}
    </div>
  );
}

function ActivityRow({ a, onValider, onRejeter, onAnnuler, busy }) {
  const [detail, setDetail] = useState(false);
  const [liste, setListe] = useState(false);
  const alertes = a.controles?.alertes || [];
  const nbAlertes = alertes.filter((x) => x.niveau === "alerte").length;
  const nbAttention = alertes.filter((x) => x.niveau === "attention").length;
  const decidee = a.reliability_status !== "a_verifier";

  return (
    <article className="card-solid space-y-3 p-4" aria-label={a.title}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/activities/${a.id}`} className="font-semibold text-slate-900 hover:text-orange-700 hover:underline">
              {a.title}
            </Link>
            <StatutValidation statut={a.reliability_status} score={a.reliability_score} admin />
            {nbAlertes > 0 && (
              <span className="badge border-red-200 bg-red-50 text-xs text-red-700">
                {nbAlertes} alerte{nbAlertes > 1 ? "s" : ""}
              </span>
            )}
            {nbAttention > 0 && (
              <span className="badge border-amber-200 bg-amber-50 text-xs text-amber-700">
                {nbAttention} à regarder
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {a.partner_name || a.coach_name || "Sans partenaire"} · {dateFr(a.activity_date)} · {a.participants_count} participant
            {a.participants_count !== 1 ? "s" : ""}
            {a.declare_par_nom ? ` · déclarée par ${a.declare_par_nom}` : ""}
          </p>
          <Origine a={a} />
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {!decidee ? (
            <>
              <button
                type="button"
                onClick={() => onValider(a)}
                disabled={busy}
                className="btn bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                Valider
              </button>
              <button
                type="button"
                onClick={() => onRejeter(a)}
                disabled={busy}
                className="btn border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                Rejeter
              </button>
            </>
          ) : (
            a.validation_origine !== "odc" && (
              <button
                type="button"
                onClick={() => onAnnuler(a)}
                disabled={busy}
                className="btn btn-ghost border disabled:opacity-50"
                title="L'activité repasse « à vérifier »"
              >
                <RotateCcw className="h-4 w-4" />
                Annuler la décision
              </button>
            )
          )}
        </div>
      </div>

      <Controles controles={a.controles} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setDetail((x) => !x)} className="text-xs font-medium text-orange-600 hover:text-orange-700">
          {detail ? "Masquer le score" : "Voir le score de complétude"}
        </button>
        <button
          type="button"
          onClick={() => setListe((x) => !x)}
          className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700"
        >
          <Table className="h-3 w-3" />
          {liste ? "Masquer la liste" : "Voir la liste des participants"}
        </button>
        <Link to={`/activities/${a.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
          <ExternalLink className="h-3 w-3" /> Ouvrir l&apos;activité
        </Link>
      </div>
      {detail && (
        <div className="max-w-md rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <ScoreBreakdown details={a.reliability_details} />
        </div>
      )}
      {liste && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <ParticipantsList activityId={a.id} />
        </div>
      )}
    </article>
  );
}

function Validation() {
  const toast = useToast();
  const [onglet, setOnglet] = useState("a_verifier");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [rejet, setRejet] = useState(null); /* activité en cours de rejet */
  const [motif, setMotif] = useState("");

  const charger = useCallback(async (decalage = 0) => {
    setLoading(true);
    try {
      const res = await api.get("/reliability/queue", { params: { status: onglet, limit: PAGE, offset: decalage } });
      setTotal(res.data.total);
      setItems((avant) => (decalage ? [...avant, ...res.data.activites] : res.data.activites));
    } catch (err) {
      toast.error(err?.response?.data?.error || "Impossible de charger la file.");
    } finally {
      setLoading(false);
    }
  }, [onglet, toast]);

  useEffect(() => { charger(0); }, [charger]);

  const agir = async (a, chemin, corps, message) => {
    setBusyId(a.id);
    try {
      await api.patch(`/reliability/${a.id}/${chemin}`, corps);
      toast.success(message);
      await charger(0);
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.error || "L'action n'a pas abouti.");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const confirmerRejet = async () => {
    if (!motif.trim() || !rejet) return;
    const ok = await agir(rejet, "reject", { motif: motif.trim() }, `« ${rejet.title} » rejetée.`);
    if (ok) { setRejet(null); setMotif(""); }
  };

  return (
    <div className="space-y-4">
      <div className="card-solid flex items-start gap-3 p-4 text-sm text-slate-600">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
        <p>
          Chaque activité déclarée par un partenaire attend la validation d&apos;un administrateur ODC — le score ne valide
          plus rien tout seul. Les contrôles automatiques signalent ce qui mérite un regard ; ils ne sont visibles que des
          administrateurs. Une activité validée dont la liste s&apos;allonge revient ici d&apos;elle-même.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={onglet === t.key}
            onClick={() => setOnglet(t.key)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              onglet === t.key ? "border-orange-500 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {loading && !items.length ? "Chargement…" : `${total} activité${total !== 1 ? "s" : ""}`}
        </p>
        <button type="button" onClick={() => charger(0)} className="btn-ghost border border-slate-200 bg-white text-sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Rafraîchir
        </button>
      </div>

      <div className="space-y-3">
        {!loading && items.length === 0 && (
          <div className="card-solid p-12 text-center text-sm text-slate-500">
            {onglet === "a_verifier" ? "Rien à valider pour le moment." : "Aucune activité dans cette catégorie."}
          </div>
        )}
        {items.map((a) => (
          <ActivityRow
            key={a.id}
            a={a}
            busy={busyId === a.id}
            onValider={(x) => agir(x, "validate", {}, `« ${x.title} » validée.`)}
            onRejeter={(x) => { setRejet(x); setMotif(""); }}
            onAnnuler={(x) => agir(x, "reset", {}, "Décision annulée.")}
          />
        ))}
        {items.length < total && (
          <button
            type="button"
            onClick={() => charger(items.length)}
            disabled={loading}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 text-sm font-medium text-orange-700 hover:bg-orange-50"
          >
            {loading ? "Chargement…" : `Afficher ${Math.min(PAGE, total - items.length)} de plus (${total - items.length} restantes)`}
          </button>
        )}
      </div>

      <Modal
        open={Boolean(rejet)}
        onClose={() => setRejet(null)}
        title="Rejeter la déclaration"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost border" onClick={() => setRejet(null)}>Annuler</button>
            <button
              type="button"
              className="btn bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              disabled={!motif.trim() || busyId === rejet?.id}
              onClick={confirmerRejet}
            >
              Rejeter
            </button>
          </div>
        }
      >
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            « {rejet?.title} » — le partenaire verra ce motif sur son activité, et pourra la renvoyer une fois corrigée.
          </p>
          <label htmlFor="motif-rejet" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Ce qui ne va pas
          </label>
          <textarea
            id="motif-rejet"
            className="input min-h-[96px]"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Ex. : feuille d'émargement signée manquante ; plusieurs fiches partagent le même numéro."
            maxLength={1000}
          />
        </div>
      </Modal>
    </div>
  );
}

export default function Fiabilite() {
  const [section, setSection] = useState("validation");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contrôle interne"
        title="Fiabilité des déclarations"
        subtitle="Le partenaire déclare, un administrateur ODC valide — puis on vérifie auprès des bénéficiaires et sur le terrain."
        icon={ShieldAlert}
      />

      <nav className="flex flex-wrap gap-2" aria-label="Sections">
        {SECTIONS.map(({ key, label, Icone }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            aria-pressed={section === key}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
              section === key
                ? "bg-orange-500 text-white shadow-sm shadow-orange-200"
                : "border border-orange-200 bg-white text-orange-800 hover:bg-orange-50"
            }`}
          >
            <Icone className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {section === "validation" && <Validation />}
      {section === "beneficiaires" && <ContreVerification />}
      {section === "visites" && <VisitesInopinees />}
    </div>
  );
}
