import { useCallback, useEffect, useRef, useState } from "react";
import {
  Wallet, Settings2, Loader2, Info, MapPin, Globe, Building2,
  AlertTriangle, ShieldCheck, Archive, Download,
} from "lucide-react";
import api from "../api";
import { useToast } from "../components/ui";

/* Ce que coûtent les séances.
 *
 * Réservé aux Admin +. Le menu ne montre pas l'entrée aux autres, mais ce n'est
 * qu'un confort : c'est le serveur qui refuse, et il répond « introuvable »
 * plutôt que « interdit » — pour qui n'est pas Admin +, la page n'existe pas.
 *
 * Deux règles portent sur de l'argent et sont dites à l'écran plutôt que cachées
 * dans le code. Le réalisé est retenu aux objectifs des partenaires, et le
 * surplus n'est pas facturé tant qu'il n'est pas activé. Et comme le plafond est
 * par partenaire alors que les zones le traversent, le retenu est réparti au
 * prorata du réalisé de chaque zone.
 */

const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const ICONE_ZONE = {
  dakar: Building2,
  region: MapPin,
  ligne: Globe,
  non_renseigne: AlertTriangle,
};

function montant(valeur, devise) {
  if (valeur == null) return "—";
  return `${Number(valeur).toLocaleString("fr-FR")} ${devise}`;
}

export default function Budget() {
  const toast = useToast();
  const annee = new Date().getFullYear();

  const [periode, setPeriode] = useState({ year: annee, month: "", partenaire: "" });
  const [synthese, setSynthese] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [refuse, setRefuse] = useState(false);
  const impression = useRef(null);
  const [pdf, setPdf] = useState(false);

  /* Le nom du partenaire choisi, s'il y en a un. Il sert à deux endroits : le
     bandeau qui signale que les chiffres sont filtrés, et le nom du fichier
     PDF — un document téléchargé doit dire de quoi il parle sans qu'on
     l'ouvre. */
  const nomDuFiltre = (() => {
    const id = synthese?.filtre;
    if (!id) return null;
    return synthese?.roster?.find((r) => r.id === id)?.nom || null;
  })();

  const [form, setForm] = useState(null);
  const [enregistre, setEnregistre] = useState(false);
  const [pinRequis, setPinRequis] = useState(false);
  const [pin, setPin] = useState("");

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const q = new URLSearchParams({ year: String(periode.year) });
      if (periode.month) q.set("month", String(periode.month));
      if (periode.partenaire) q.set("partenaire", periode.partenaire);
      const { data } = await api.get(`/budget/synthese?${q}`);
      setSynthese(data);
      setForm((f) => f || { ...data.parametres });
      setRefuse(false);
    } catch (err) {
      if (err?.response?.status === 404 || err?.response?.status === 403) setRefuse(true);
      else toast?.error?.("Impossible de charger le budget.");
    } finally {
      setChargement(false);
    }
  }, [periode, toast]);

  useEffect(() => { charger(); }, [charger]);

  const envoyerParametres = async () => {
    setEnregistre(true);
    try {
      const { data } = await api.put("/budget/parametres", {
        mode_paiement: form.mode_paiement,
        tarif_dakar: Number(form.tarif_dakar || 0),
        tarif_region: Number(form.tarif_region || 0),
        tarif_ligne: Number(form.tarif_ligne || 0),
        devise: form.devise || "FCFA",
      });
      setForm({ ...data });
      setPinRequis(false);
      setPin("");
      toast?.success?.("Paramètres enregistrés.");
      charger();
    } catch (err) {
      if (err?.response?.status === 403) {
        setPinRequis(true);
        if (pin) toast?.error?.("PIN incorrect.");
      } else {
        toast?.error?.(err?.response?.data?.error || "Enregistrement impossible.");
      }
    } finally {
      setEnregistre(false);
    }
  };

  /* Le PDF, par capture de la zone imprimable — même procédé que le rapport
     mensuel, et les deux bibliothèques ne sont chargées qu'au clic.
   *
   * Le thème est basculé en clair le temps du rendu, puis remis. Le mode sombre
   * passe par « :root[data-theme] », qui redéfinit le fond des cartes : capturer
   * sur un fond blanc forcé donnerait un document au texte clair sur page
   * blanche, c'est-à-dire vide. */
  const telecharger = async () => {
    if (!impression.current) return;
    setPdf(true);
    const racine = document.documentElement;
    const themeAvant = racine.getAttribute("data-theme");
    try {
      racine.setAttribute("data-theme", "light");
      /* Un tour de boucle pour que le navigateur ait repeint avant la capture. */
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      /* Facteur 1,5 et non 2 : le document reste net à l'impression, et on ne
         paie pas quatre fois la surface en pixels pour des tableaux de texte. */
      const canvas = await html2canvas(impression.current, {
        scale: 1.5, backgroundColor: "#ffffff", useCORS: true, logging: false,
      });

      /* Paysage : le tableau par partenaire porte jusqu'à huit colonnes, et en
         portrait elles se tasseraient au point d'être illisibles. */
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const largeur = doc.internal.pageSize.getWidth();
      const hauteur = doc.internal.pageSize.getHeight();
      const pxParMm = canvas.width / largeur;
      const hauteurPage = Math.floor(hauteur * pxParMm);

      const tranche = document.createElement("canvas");
      tranche.width = canvas.width;
      tranche.height = hauteurPage;
      const ctx = tranche.getContext("2d");

      let y = 0;
      while (y < canvas.height) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, tranche.width, tranche.height);
        ctx.drawImage(canvas, 0, -y);
        if (y > 0) doc.addPage();
        /* JPEG plutôt que PNG. En PNG, une page de tableaux capturée au double
           de la résolution produisait un fichier de trente mégaoctets —
           intransmissible par courriel, c'est-à-dire inutilisable pour ce à quoi
           sert un export de budget. La compression ne se voit pas sur du texte
           noir sur blanc à cette qualité, et le fichier tient en quelques
           centaines de kilooctets. */
        doc.addImage(tranche.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, largeur, hauteur);
        y += hauteurPage;
      }

      const quand = periode.month
        ? `${periode.year}-${String(periode.month).padStart(2, "0")}`
        : String(periode.year);
      const qui = nomDuFiltre ? `-${nomDuFiltre.replace(/[^\w-]+/g, "_")}` : "";
      doc.save(`budget-odc-${quand}${qui}.pdf`);
    } catch (err) {
      console.error("Erreur PDF:", err);
      toast?.error?.("La génération du PDF a échoué.");
    } finally {
      if (themeAvant) racine.setAttribute("data-theme", themeAvant);
      else racine.removeAttribute("data-theme");
      setPdf(false);
    }
  };

  const soumettre = (e) => {
    e.preventDefault();
    const existant = sessionStorage.getItem("admin_pin");
    if (!existant) { setPinRequis(true); return; }
    envoyerParametres();
  };

  const validerPin = (e) => {
    e.preventDefault();
    if (!pin) return;
    sessionStorage.setItem("admin_pin", pin);
    sessionStorage.setItem("admin_pin_time", String(Date.now()));
    envoyerParametres();
  };

  if (refuse) {
    return (
      <div className="card p-8 text-center text-slate-500">
        Page introuvable.
      </div>
    );
  }

  if (chargement && !synthese) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-500">Chargement…</div>;
  }

  const devise = synthese?.devise || "FCFA";
  const parHeure = synthese?.mode_paiement === "heure";
  const unite = parHeure ? "heure" : "bénéficiaire";

  /* Les colonnes de zone du tableau par partenaire. Les trois zones tarifées
     sont toujours là, même vides, pour que les colonnes restent alignées d'une
     ligne à l'autre. « Lieu non renseigné » ne s'ajoute que s'il existe : sinon
     c'est une colonne de tirets, mais quand il existe il doit se voir, sans
     quoi la somme des colonnes ne tomberait pas sur le total. */
  const colonnesZones = (synthese?.zones || []).filter(
    (z) => z.zone !== "non_renseigne" || z.beneficiaires_reels > 0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Direction</p>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-orange-500" />
            Budget
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Ce que représentent les séances réalisées, par zone et au tarif en vigueur.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-slate-500">Année</label>
            <input
              type="number"
              className="input mt-1 w-28"
              value={periode.year}
              onChange={(e) => setPeriode((p) => ({ ...p, year: Number(e.target.value) || annee }))}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Mois</label>
            <select
              className="select mt-1"
              value={periode.month}
              onChange={(e) => setPeriode((p) => ({ ...p, month: e.target.value }))}
            >
              <option value="">Toute l'année</option>
              {MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          {/* Le choix du partenaire recalcule toute la page, pas seulement le
              second tableau : masquer des lignes sans recalculer laisserait un
              total qui ne correspond plus à ce qu'on voit. La liste vient du
              serveur et reste complète même quand un filtre est posé — sinon on
              ne pourrait plus en sortir. */}
          <div>
            <label className="text-xs text-slate-500">Partenaire</label>
            <select
              className="select mt-1 max-w-[16rem]"
              value={periode.partenaire}
              onChange={(e) => setPeriode((p) => ({ ...p, partenaire: e.target.value }))}
            >
              <option value="">Tous les partenaires</option>
              {(synthese?.roster || []).map((r) => (
                <option key={r.id} value={r.id}>{r.nom}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-ghost border text-sm inline-flex items-center gap-1.5"
            onClick={telecharger}
            disabled={pdf || !synthese}
          >
            {pdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            PDF
          </button>
        </div>
      </div>

      {/* Qui peut voir cette page. Dit une fois, en haut : un écran qui chiffre
          ce qu'on doit aux partenaires doit porter sa propre confidentialité. */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
        <p>
          Cette page n'est visible que des comptes <strong>Admin +</strong>. Les
          autres administrateurs ne la voient pas et ne peuvent pas y accéder.
        </p>
      </div>

      {/* ── Les paramètres ───────────────────────────────────────────────── */}
      <form onSubmit={soumettre} className="card-solid p-5 space-y-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-orange-500" />
          Tarifs et mode de paiement
        </h2>

        {form && (
          <>
            <div>
              <label className="text-sm font-medium text-slate-700">Les partenaires sont payés</label>
              <div className="flex gap-2 mt-2">
                {[
                  { cle: "beneficiaire", libelle: "Par bénéficiaire" },
                  { cle: "heure", libelle: "Par heure de formation" },
                ].map((o) => (
                  <button
                    key={o.cle}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, mode_paiement: o.cle }))}
                    className={`rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                      form.mode_paiement === o.cle
                        ? "bg-orange-500 border-orange-500 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {o.libelle}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {[
                { champ: "tarif_dakar", libelle: "Tarif Dakar" },
                { champ: "tarif_region", libelle: "Tarif régions" },
                { champ: "tarif_ligne", libelle: "Tarif en ligne" },
              ].map((t) => (
                <div key={t.champ}>
                  <label className="text-xs text-slate-500">{t.libelle}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input mt-1"
                    value={form[t.champ] ?? 0}
                    onChange={(e) => setForm((f) => ({ ...f, [t.champ]: e.target.value }))}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">par {unite}</p>
                </div>
              ))}
              <div>
                <label className="text-xs text-slate-500">Devise</label>
                <input
                  className="input mt-1"
                  value={form.devise ?? "FCFA"}
                  onChange={(e) => setForm((f) => ({ ...f, devise: e.target.value }))}
                />
              </div>
            </div>

            {pinRequis && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <p className="text-sm text-amber-900">
                  PIN admin requis : ces tarifs décident de ce qui sera payé.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    className="input text-sm flex-1"
                    placeholder="PIN"
                    value={pin}
                    autoFocus
                    onChange={(e) => setPin(e.target.value)}
                  />
                  <button type="button" onClick={validerPin}
                    className="btn-primary text-sm shrink-0" disabled={enregistre || !pin}>
                    {enregistre ? <Loader2 className="w-4 h-4 animate-spin" /> : "Valider"}
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                {form.modifie_le
                  ? `Modifié le ${new Date(form.modifie_le).toLocaleDateString("fr-FR")}${form.modifie_par_nom ? ` par ${form.modifie_par_nom}` : ""}.`
                  : "Jamais modifié."}
              </p>
              <button type="submit" className="btn-primary text-sm" disabled={enregistre}>
                {enregistre ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enregistrer"}
              </button>
            </div>
          </>
        )}
      </form>

      {/* ── La synthèse ──────────────────────────────────────────────────── */}
      {synthese && (
        /* La zone capturée pour le PDF. Elle porte son propre en-tête : un
           document téléchargé est lu loin de l'écran qui l'a produit, et des
           chiffres sans période, sans filtre ni tarifs ne veulent rien dire. */
        <div ref={impression} className="space-y-6 bg-white">
          <div className="border-b border-slate-200 pb-3">
            <p className="text-sm font-semibold text-slate-900">
              Budget — Orange Digital Center Sénégal
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {periode.month
                ? `${MOIS[Number(periode.month) - 1]} ${periode.year}`
                : `Année ${periode.year}`}
              {nomDuFiltre ? ` · ${nomDuFiltre}` : " · tous les partenaires"}
              {" · "}
              {parHeure ? "paiement à l'heure" : "paiement au bénéficiaire"}
              {" · "}
              Dakar {montant(synthese.parametres?.tarif_dakar, devise)} ·
              {" "}régions {montant(synthese.parametres?.tarif_region, devise)} ·
              {" "}en ligne {montant(synthese.parametres?.tarif_ligne, devise)}
            </p>
          </div>

          {nomDuFiltre && (
            <div className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-600" aria-hidden="true" />
              <p>
                Tous les chiffres de cette page ne portent que sur
                {" "}<strong>{nomDuFiltre}</strong>. Choisissez « Tous les
                partenaires » pour revenir au budget complet.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card-solid p-5">
              <p className="text-sm text-slate-500">Budget de la période</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">
                {montant(synthese.total, devise)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {parHeure
                  ? `${synthese.heures} heures facturées`
                  : `${synthese.beneficiaires} bénéficiaires comptés`}
              </p>
            </div>
            <div className="card-solid p-5">
              <p className="text-sm text-slate-500">Réalisé entier</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">
                {synthese.beneficiaires_reels}
              </p>
              <p className="text-xs text-slate-400 mt-1">bénéficiaires, réserve comprise</p>
            </div>
            <div className={`card-solid p-5 ${synthese.en_reserve > 0 ? "ring-1 ring-sky-200" : ""}`}>
              <p className="text-sm text-slate-500 flex items-center gap-1.5">
                <Archive className="w-3.5 h-3.5 text-sky-600" />
                En réserve, non facturé
              </p>
              <p className={`mt-1 text-3xl font-semibold ${synthese.en_reserve > 0 ? "text-sky-700" : "text-slate-300"}`}>
                {synthese.en_reserve}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {parHeure
                  ? "sans effet sur un paiement à l'heure"
                  : `coûterait ${montant(synthese.total_en_reserve, devise)} si activé`}
              </p>
            </div>
          </div>

          <div className="card-solid p-5">
            <h2 className="font-semibold text-slate-900 mb-1">Détail par zone</h2>
            <p className="text-xs text-slate-500 mb-4">
              {parHeure
                ? "Les heures sont facturées telles qu'elles ont été réalisées : le plafond des partenaires s'exprime en bénéficiaires et ne se traduit pas en heures."
                : "Le réalisé est retenu à l'objectif de chaque partenaire. Comme un même partenaire intervient dans plusieurs zones, ce retenu est réparti au prorata du réalisé de chaque zone."}
            </p>

            <div className="overflow-x-auto">
              <table className="table border-separate border-spacing-y-2 w-full">
                <thead className="table-head">
                  <tr>
                    <th className="text-left p-4">Zone</th>
                    <th className="text-right p-4">Bénéficiaires</th>
                    {!parHeure && <th className="text-right p-4">En réserve</th>}
                    {/* Les heures ne s'affichent qu'au tarif horaire. Au
                        bénéficiaire, elles ne servent à rien dans ce tableau et
                        se lisent à tort comme une part du calcul : deux colonnes
                        chiffrées à côté d'un tarif unitaire, on cherche
                        forcément laquelle est multipliée. */}
                    {parHeure && <th className="text-right p-4">Heures</th>}
                    <th className="text-right p-4">Tarif unitaire</th>
                    <th className="text-right p-4">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {synthese.zones.map((z) => {
                    const Icone = ICONE_ZONE[z.zone] || MapPin;
                    const vide = z.beneficiaires_reels === 0;
                    if (vide && z.zone === "non_renseigne") return null;
                    return (
                      <tr key={z.zone} className="table-row">
                        <td className="p-4 font-medium">
                          <span className="flex items-center gap-2">
                            <Icone className={`w-4 h-4 ${z.facturable ? "text-orange-500" : "text-amber-500"}`} />
                            {z.libelle}
                          </span>
                          {!z.facturable && (
                            <span className="mt-1 block text-xs text-amber-700">
                              Pas de tarif : renseignez le lieu de ces séances pour les
                              faire entrer dans le budget.
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          {z.beneficiaires}
                          {z.beneficiaires !== z.beneficiaires_reels && (
                            <span className="block text-xs text-slate-400">
                              sur {z.beneficiaires_reels} réalisés
                            </span>
                          )}
                        </td>
                        {!parHeure && (
                          <td className="p-4 text-right">
                            {z.en_reserve > 0
                              ? <span className="text-sky-700">{z.en_reserve}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                        )}
                        {parHeure && (
                          <td className="p-4 text-right text-slate-600">{z.heures}</td>
                        )}
                        <td className="p-4 text-right">
                          {z.facturable ? montant(z.tarif, devise) : "—"}
                        </td>
                        <td className="p-4 text-right font-semibold">
                          {z.facturable ? montant(z.montant, devise) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="table-row bg-slate-50">
                    <td className="p-4 font-semibold">Total</td>
                    <td className="p-4 text-right font-semibold">{synthese.beneficiaires}</td>
                    {!parHeure && (
                      <td className="p-4 text-right font-semibold text-sky-700">
                        {synthese.en_reserve || "—"}
                      </td>
                    )}
                    {parHeure && (
                      <td className="p-4 text-right font-semibold">{synthese.heures}</td>
                    )}
                    <td className="p-4" />
                    <td className="p-4 text-right text-lg font-semibold text-slate-900">
                      {montant(synthese.total, devise)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {synthese.sans_lieu > 0 && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" aria-hidden="true" />
                <p>
                  <strong>{synthese.sans_lieu}</strong> bénéficiaires relèvent de
                  séances en présentiel dont le lieu n'est pas renseigné. Aucun tarif
                  ne peut leur être appliqué : ils sont hors du total. Renseignez la
                  région de ces activités pour qu'ils y entrent.
                </p>
              </div>
            )}

            <div className="mt-4 flex items-start gap-2 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" aria-hidden="true" />
              <p>
                Seules les séances dont la liste nominative a été importée sont
                comptées. Un effectif saisi à la main n'est pas facturé : on ne sait
                pas qui il recouvre.
              </p>
            </div>
          </div>

          {/* ── Par partenaire ───────────────────────────────────────────── */}
          <div className="card-solid p-5">
            <h2 className="font-semibold text-slate-900 mb-1">Détail par partenaire</h2>
            <p className="text-xs text-slate-500 mb-4">
              Ce que représente chaque partenaire sur la période. Un partenaire
              qui intervient dans plusieurs zones est facturé zone par zone, à
              leurs tarifs respectifs — son montant n'est donc pas un simple
              nombre de bénéficiaires multiplié par un tarif unique.
            </p>

            {synthese.partenaires.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aucune séance avec liste nominative sur cette période.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table border-separate border-spacing-y-2 w-full">
                  <thead className="table-head">
                    <tr>
                      <th className="text-left p-4">Partenaire</th>
                      <th className="text-right p-4">Objectif</th>
                      {/* Le détail qui permet de lire le montant : un partenaire
                          présent dans deux zones est facturé à deux tarifs, et
                          sans ces colonnes son total paraît arbitraire. */}
                      {colonnesZones.map((z) => (
                        <th key={z.zone} className="text-right p-4">{z.libelle}</th>
                      ))}
                      <th className="text-right p-4">
                        {parHeure ? "Heures" : "Total bénéf."}
                      </th>
                      {!parHeure && <th className="text-right p-4">En réserve</th>}
                      <th className="text-right p-4">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {synthese.partenaires.map((p) => (
                      <tr key={p.partner_id ?? "sans"} className="table-row">
                        <td className="p-4 font-medium break-words">
                          <span className="flex items-center gap-2">
                            <Building2
                              className={`w-4 h-4 ${p.partner_id == null ? "text-slate-300" : "text-orange-500"}`}
                            />
                            {p.nom}
                          </span>
                        </td>
                        <td className="p-4 text-right text-slate-600">
                          {p.objectif > 0 ? p.objectif : <span className="text-slate-300">—</span>}
                        </td>
                        {colonnesZones.map((z) => {
                          const seau = p.zones?.[z.zone];
                          const v = parHeure ? seau?.heures : seau?.beneficiaires;
                          return (
                            <td key={z.zone} className="p-4 text-right text-slate-600">
                              {v ? v : <span className="text-slate-300">—</span>}
                            </td>
                          );
                        })}
                        <td className="p-4 text-right">
                          {parHeure ? p.heures : p.beneficiaires}
                          {!parHeure && p.plafonne && (
                            <span className="block text-xs text-slate-400">
                              sur {p.beneficiaires_reels} réalisés
                            </span>
                          )}
                        </td>
                        {!parHeure && (
                          <td className="p-4 text-right">
                            {p.en_reserve > 0
                              ? <span className="text-sky-700">{p.en_reserve}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                        )}
                        <td className="p-4 text-right font-semibold">
                          {montant(Math.round(p.montant), devise)}
                        </td>
                      </tr>
                    ))}
                    <tr className="table-row bg-slate-50">
                      <td className="p-4 font-semibold">Total</td>
                      <td className="p-4" />
                      {colonnesZones.map((z) => (
                        <td key={z.zone} className="p-4 text-right font-semibold">
                          {parHeure ? z.heures : z.beneficiaires}
                        </td>
                      ))}
                      <td className="p-4 text-right font-semibold">
                        {parHeure ? synthese.heures : synthese.beneficiaires}
                      </td>
                      {!parHeure && (
                        <td className="p-4 text-right font-semibold text-sky-700">
                          {synthese.en_reserve || "—"}
                        </td>
                      )}
                      {/* Le même total que le tableau par zone, et ce n'est pas
                          une coïncidence : les deux découpent le même ensemble
                          de couples partenaire-zone. C'est pour cela que les
                          montants ne sont arrondis qu'ici, à l'affichage. */}
                      <td className="p-4 text-right text-lg font-semibold text-slate-900">
                        {montant(synthese.total, devise)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
