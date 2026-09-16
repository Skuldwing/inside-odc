import { useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  Plus,
  Star,
  Trash2,
  Upload,
  X,
  Eye,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import api from "../api";
import AdminPinGate from "../components/AdminPinGate";
import AdminPageHeader from "../components/admin/AdminPageHeader";
import { useToast, useConfirm, EmptyState } from "../components/ui";

/**
 * Modeles d'attestation.
 *
 * L'attestation etait figee dans le code. La Tech Academy est menee avec le
 * COJOJ dans le cadre des JOJ Dakar 2026 : son logo et sa mention devaient y
 * figurer, ce qui demandait de modifier le code a chaque partenariat.
 *
 * Un modele rassemble ce qui change d'un dispositif a l'autre. Ce qui ne
 * change pas — le fond, le cadre, la mise en page, la signature de la
 * direction — reste le meme pour toutes les attestations.
 *
 * L'apercu prend les valeurs en cours de saisie, pas celles enregistrees :
 * regler un modele a l'aveugle et ne le decouvrir qu'a l'envoi serait un pari.
 */

const VIDE = {
  nom: "",
  bandeau_avant: "",
  bandeau_apres: "",
  programme: "",
  organisation: "Orange Digital Center",
  mention: "",
  signataire_nom: "NAFISSATOU CHÉRIF NIANG",
  signataire_fonction: "Directrice de Orange Digital Center",
};

const CHAMPS_TEXTE = Object.keys(VIDE);

export default function ModelesAttestation() {
  const toast = useToast();
  const confirm = useConfirm();

  const [modeles, setModeles] = useState([]);
  const [dispositifs, setDispositifs] = useState([]);
  const [chargement, setChargement] = useState(true);

  /* `selection` vaut l'identifiant d'un modele enregistre, ou "nouveau". */
  const [selection, setSelection] = useState(null);
  const [form, setForm] = useState(VIDE);
  const [rattaches, setRattaches] = useState([]);
  const [enregistrement, setEnregistrement] = useState(false);

  const [apercu, setApercu] = useState(null);
  const [apercuEnCours, setApercuEnCours] = useState(false);
  const fichier = useRef(null);
  /* Le logo est servi par une route : on force son rechargement apres un
     televersement, sinon le navigateur reaffiche l'image precedente. */
  const [versionLogo, setVersionLogo] = useState(0);

  const courant = useMemo(
    () => modeles.find((m) => m.id === selection) || null,
    [modeles, selection]
  );

  const charger = async (idAGarder) => {
    try {
      const [m, d] = await Promise.all([
        api.get("/modeles-attestation"),
        api.get("/devices"),
      ]);
      setModeles(m.data);
      setDispositifs(d.data);
      const cible = idAGarder ?? selection;
      if (cible && cible !== "nouveau" && !m.data.some((x) => x.id === cible)) {
        setSelection(null);
      }
      return m.data;
    } catch (err) {
      console.error("Erreur chargement modèles", err);
      toast.error("Impossible de charger les modèles d'attestation.");
      return [];
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Changer de modele remet le formulaire et jette l'apercu : laisser
     l'apercu du precedent a l'ecran ferait croire qu'il est celui-ci. */
  const ouvrir = (modele) => {
    setSelection(modele ? modele.id : "nouveau");
    setRattaches(modele ? modele.dispositifs.map((d) => d.id) : []);
    const base = { ...VIDE };
    if (modele) for (const c of CHAMPS_TEXTE) base[c] = modele[c] ?? "";
    setForm(base);
    setApercu((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  };

  const modifier = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  const enregistrer = async (e) => {
    e.preventDefault();
    if (!form.nom.trim()) return toast.error("Donnez un nom au modèle.");
    setEnregistrement(true);
    try {
      const enregistre =
        selection === "nouveau"
          ? (await api.post("/modeles-attestation", form)).data
          : (await api.patch(`/modeles-attestation/${selection}`, form)).data;

      await api.put(`/modeles-attestation/${enregistre.id}/dispositifs`, {
        dispositifs: rattaches,
      });

      const liste = await charger(enregistre.id);
      setSelection(enregistre.id);
      const frais = liste.find((m) => m.id === enregistre.id);
      if (frais) setRattaches(frais.dispositifs.map((d) => d.id));
      toast.success("Modèle enregistré.");
    } catch (err) {
      toast.error(err.response?.data?.error || "Enregistrement impossible.");
    } finally {
      setEnregistrement(false);
    }
  };

  const supprimer = async () => {
    if (!courant) return;
    const ok = await confirm({
      title: "Supprimer ce modèle ?",
      body: courant.dispositifs.length
        ? `${courant.dispositifs.length} dispositif(s) utilisent ce modèle. Leurs attestations reprendront le modèle par défaut.`
        : "Les attestations déjà envoyées ne changent pas.",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/modeles-attestation/${courant.id}`);
      setSelection(null);
      await charger(null);
      toast.success("Modèle supprimé.");
    } catch (err) {
      toast.error(err.response?.data?.error || "Suppression impossible.");
    }
  };

  const definirParDefaut = async () => {
    if (!courant) return;
    try {
      await api.post(`/modeles-attestation/${courant.id}/par-defaut`);
      await charger(courant.id);
      toast.success("Modèle par défaut mis à jour.");
    } catch (err) {
      toast.error(err.response?.data?.error || "Opération impossible.");
    }
  };

  const envoyerLogo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !courant) return;
    if (f.size > 2 * 1024 * 1024) return toast.error("Logo trop lourd (2 Mo maximum).");
    const fd = new FormData();
    fd.append("logo", f, f.name);
    try {
      await api.post(`/modeles-attestation/${courant.id}/logo`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setVersionLogo((v) => v + 1);
      await charger(courant.id);
      toast.success("Logo enregistré.");
    } catch (err) {
      toast.error(err.response?.data?.error || "Logo refusé (PNG ou JPEG, 2 Mo maximum).");
    }
  };

  const retirerLogo = async () => {
    if (!courant) return;
    try {
      await api.delete(`/modeles-attestation/${courant.id}/logo`);
      setVersionLogo((v) => v + 1);
      await charger(courant.id);
    } catch {
      toast.error("Suppression du logo impossible.");
    }
  };

  const voirApercu = async () => {
    setApercuEnCours(true);
    try {
      const res = await api.post(
        "/modeles-attestation/apercu",
        { ...form, modele_id: selection === "nouveau" ? null : selection },
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      setApercu((ancien) => {
        if (ancien) URL.revokeObjectURL(ancien);
        return url;
      });
    } catch {
      toast.error("Aperçu indisponible.");
    } finally {
      setApercuEnCours(false);
    }
  };

  /* Ne pas laisser fuir l'URL du dernier apercu en quittant la page. */
  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu); }, [apercu]);

  const basculerDispositif = (id) =>
    setRattaches((liste) =>
      liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id]
    );

  return (
    <AdminPinGate>
      <div className="space-y-6">
        <AdminPageHeader
          title="Modèles d'attestation"
          subtitle="Le logo et les mentions qui changent d'un dispositif à l'autre"
          buttonLabel="Nouveau modèle"
          buttonIcon={Plus}
          onAdd={() => ouvrir(null)}
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* ===== La liste ===== */}
          <div className="space-y-3">
            {chargement && <div className="card p-6 text-sm text-gray-500">Chargement…</div>}

            {!chargement && modeles.length === 0 && (
              <EmptyState
                icon={Award}
                title="Aucun modèle"
                description="Créez-en un pour porter le logo et la mention d'un partenaire."
                actionLabel="Nouveau modèle"
                actionIcon={Plus}
                onAction={() => ouvrir(null)}
                compact
              />
            )}

            {modeles.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => ouvrir(m)}
                className={`card w-full p-4 text-left transition ${
                  selection === m.id ? "ring-2 ring-orange-500" : "hover:border-orange-300"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{m.nom}</span>
                  {m.par_defaut && (
                    <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                      Par défaut
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  {m.a_logo && (
                    <span className="inline-flex items-center gap-1">
                      <ImageIcon className="h-3 w-3" /> logo
                    </span>
                  )}
                  <span>
                    {m.dispositifs.length
                      ? m.dispositifs.map((d) => d.name).join(", ")
                      : "aucun dispositif rattaché"}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* ===== Le modèle ouvert ===== */}
          <div className="lg:col-span-2">
            {!selection ? (
              <EmptyState
                icon={Award}
                title="Choisissez un modèle"
                description="Ou créez-en un nouveau pour un dispositif mené avec un partenaire."
              />
            ) : (
              <form onSubmit={enregistrer} className="card space-y-5 p-6">
                <div>
                  <label className="text-sm font-medium">Nom du modèle *</label>
                  <input
                    required
                    className="input mt-1"
                    placeholder="Tech Academy — COJOJ"
                    value={form.nom}
                    onChange={modifier("nom")}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Ce nom sert uniquement à le reconnaître ici ; il n'apparaît pas sur
                    l'attestation.
                  </p>
                </div>

                {/* Le bandeau du coin supérieur droit, en deux morceaux. */}
                <div>
                  <label className="text-sm font-medium">Bandeau en haut à droite</label>
                  <div className="mt-1 grid grid-cols-2 gap-3">
                    <input
                      className="input"
                      placeholder="TECH-"
                      value={form.bandeau_avant}
                      onChange={modifier("bandeau_avant")}
                    />
                    <input
                      className="input"
                      placeholder="KI"
                      value={form.bandeau_apres}
                      onChange={modifier("bandeau_apres")}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Les deux morceaux s'écrivent à la suite ; le second en orange. Pensez à
                    l'espace si les mots sont séparés. Un logo de partenaire prend leur place.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">Programme</label>
                    <input
                      className="input mt-1"
                      placeholder="Tech Academy"
                      value={form.programme}
                      onChange={modifier("programme")}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Organisation</label>
                    <input
                      className="input mt-1"
                      value={form.organisation}
                      onChange={modifier("organisation")}
                    />
                  </div>
                </div>
                <p className="-mt-3 text-xs text-gray-500">
                  « organisée dans le cadre du programme <b>{form.programme || "…"}</b> de{" "}
                  <b>{form.organisation || "…"}</b>. »
                </p>

                <div>
                  <label className="text-sm font-medium">Mention</label>
                  <input
                    className="input mt-1"
                    placeholder="En collaboration avec le COJOJ, dans le cadre des JOJ Dakar 2026"
                    value={form.mention}
                    onChange={modifier("mention")}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Une ligne libre sous la phrase : le partenariat, le cadre. Laissez vide
                    pour ne rien afficher.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">Signataire</label>
                    <input
                      className="input mt-1"
                      value={form.signataire_nom}
                      onChange={modifier("signataire_nom")}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Fonction</label>
                    <input
                      className="input mt-1"
                      value={form.signataire_fonction}
                      onChange={modifier("signataire_fonction")}
                    />
                  </div>
                </div>

                {/* ===== Logo du partenaire ===== */}
                <div className="rounded-lg border border-dashed p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Logo du partenaire</p>
                      <p className="text-xs text-gray-500">
                        PNG ou JPEG, 2 Mo maximum. Il remplace le bandeau, en haut à droite.
                      </p>
                    </div>
                    {courant?.a_logo && (
                      <img
                        src={`${api.defaults.baseURL}/modeles-attestation/${courant.id}/logo?v=${versionLogo}`}
                        alt="Logo du partenaire"
                        className="h-12 w-auto max-w-[8rem] object-contain"
                      />
                    )}
                  </div>

                  {selection === "nouveau" ? (
                    <p className="mt-3 text-xs text-gray-500">
                      Enregistrez le modèle d'abord : le logo s'ajoute ensuite.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <input
                        ref={fichier}
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        onChange={envoyerLogo}
                      />
                      <button
                        type="button"
                        className="btn-ghost border"
                        onClick={() => fichier.current?.click()}
                      >
                        <Upload className="h-4 w-4" />
                        {courant?.a_logo ? "Remplacer" : "Ajouter un logo"}
                      </button>
                      {courant?.a_logo && (
                        <button type="button" className="btn-ghost border" onClick={retirerLogo}>
                          <X className="h-4 w-4" /> Retirer
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* ===== Dispositifs rattachés ===== */}
                <div>
                  <label className="text-sm font-medium">Dispositifs qui utilisent ce modèle</label>
                  <p className="mb-2 text-xs text-gray-500">
                    Les attestations de leurs activités prendront ce modèle. Les autres
                    gardent le modèle par défaut.
                  </p>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
                    {dispositifs.length === 0 && (
                      <p className="p-2 text-sm text-gray-500">Aucun dispositif enregistré.</p>
                    )}
                    {dispositifs.map((d) => (
                      <label
                        key={d.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-white/5"
                      >
                        <input
                          type="checkbox"
                          checked={rattaches.includes(d.id)}
                          onChange={() => basculerDispositif(d.id)}
                        />
                        <span>{d.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className="btn-primary" disabled={enregistrement}>
                      {enregistrement ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Enregistrer
                    </button>
                    <button
                      type="button"
                      className="btn-ghost border"
                      onClick={voirApercu}
                      disabled={apercuEnCours}
                    >
                      {apercuEnCours ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      Aperçu
                    </button>
                  </div>

                  {courant && (
                    <div className="flex flex-wrap gap-2">
                      {!courant.par_defaut && (
                        <>
                          <button
                            type="button"
                            className="btn-ghost border"
                            onClick={definirParDefaut}
                          >
                            <Star className="h-4 w-4" /> Par défaut
                          </button>
                          <button
                            type="button"
                            className="btn-ghost border text-red-600"
                            onClick={supprimer}
                          >
                            <Trash2 className="h-4 w-4" /> Supprimer
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {apercu && (
                  <div>
                    <p className="mb-2 text-xs text-gray-500">
                      Aperçu des valeurs à l'écran, avec un nom d'exemple.
                    </p>
                    <iframe
                      title="Aperçu de l'attestation"
                      src={apercu}
                      className="h-[32rem] w-full rounded-lg border"
                    />
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </AdminPinGate>
  );
}
