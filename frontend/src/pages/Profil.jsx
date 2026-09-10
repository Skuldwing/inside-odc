import { useEffect, useRef, useState } from "react";
import { Camera, KeyRound, Trash2, UserCircle } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth/useAuth";
import {
  Avatar,
  Button,
  PageHeader,
  SkeletonText,
  useConfirm,
  useToast,
} from "../components/ui";

/* Taille de la photo une fois redimensionnee. Un cliche de telephone pese
   plusieurs mega-octets pour un rendu de 40 pixels a l'ecran : on le reduit
   dans le navigateur avant l'envoi, ce qui epargne la connexion de la
   personne autant que la base. */
const TAILLE_AVATAR = 256;

function redimensionner(fichier) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error("Image illisible"));
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image illisible"));
      img.onload = () => {
        /* Recadrage centre : on garde le plus grand carre possible, pour que
           les visages ne soient pas etires. */
        const cote = Math.min(img.width, img.height);
        const dx = (img.width - cote) / 2;
        const dy = (img.height - cote) / 2;

        const canvas = document.createElement("canvas");
        canvas.width = TAILLE_AVATAR;
        canvas.height = TAILLE_AVATAR;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, dx, dy, cote, cote, 0, 0, TAILLE_AVATAR, TAILLE_AVATAR);

        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Conversion impossible"))),
          "image/jpeg",
          0.85
        );
      };
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  });
}

const LIBELLE_ROLE = {
  admin: "Administrateur",
  partner: "Partenaire",
  coach: "Coach / Formateur",
  viewer: "Lecteur",
};

export default function Profil() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const fichierRef = useRef(null);

  const [profil, setProfil] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState("");
  const [form, setForm] = useState({ full_name: "", job_title: "", phone: "", bio: "" });
  const [enregistrement, setEnregistrement] = useState(false);
  const [photoEnCours, setPhotoEnCours] = useState(false);

  const [mdp, setMdp] = useState({ current_password: "", new_password: "", confirmation: "" });
  const [mdpEnCours, setMdpEnCours] = useState(false);
  const [mdpErreur, setMdpErreur] = useState("");

  useEffect(() => {
    let vivant = true;
    api
      .get("/profile")
      .then((res) => {
        if (!vivant) return;
        setProfil(res.data);
        setForm({
          full_name: res.data.full_name || "",
          job_title: res.data.job_title || "",
          phone: res.data.phone || "",
          bio: res.data.bio || "",
        });
      })
      .catch((err) => {
        if (!vivant) return;
        /* « Impossible de charger le profil » ne dit rien de ce qu'il faut
           faire. Le statut, lui, distingue trois situations tres differentes :
           serveur pas encore a jour, panne serveur, ou simple coupure. */
        const statut = err?.response?.status;
        if (!err?.response) {
          setErreurChargement(
            "Le serveur n'a pas répondu. Vérifiez votre connexion, puis réessayez."
          );
        } else if (statut === 404) {
          setErreurChargement(
            "Cette page n'est pas encore disponible sur le serveur : le déploiement de l'API n'est probablement pas terminé. Réessayez dans quelques minutes."
          );
        } else {
          setErreurChargement(
            err.response?.data?.error
              ? `Le serveur a refusé la demande : ${err.response.data.error} (code ${statut}).`
              : `Le serveur a renvoyé une erreur (code ${statut}).`
          );
        }
      })
      .finally(() => vivant && setChargement(false));
    return () => {
      vivant = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enregistrer = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      toast.error("Le nom complet est obligatoire.");
      return;
    }
    setEnregistrement(true);
    try {
      const res = await api.put("/profile", form);
      setProfil(res.data);
      refreshUser?.();
      toast.success("Profil mis à jour.");
    } catch (err) {
      toast.error(err?.response?.data?.error || "L'enregistrement n'a pas abouti.");
    } finally {
      setEnregistrement(false);
    }
  };

  const choisirPhoto = async (e) => {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;

    setPhotoEnCours(true);
    try {
      const reduite = await redimensionner(fichier);
      const fd = new FormData();
      fd.append("avatar", reduite, "avatar.jpg");
      const res = await api.post("/profile/avatar", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setProfil((p) => ({ ...p, avatar_updated_at: res.data.avatar_updated_at }));
      refreshUser?.();
      toast.success("Photo mise à jour.");
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || "L'envoi de la photo a échoué.");
    } finally {
      setPhotoEnCours(false);
    }
  };

  const supprimerPhoto = async () => {
    const ok = await confirm({
      title: "Retirer la photo ?",
      body: "Vos initiales seront affichées à la place.",
      destructive: true,
    });
    if (!ok) return;
    setPhotoEnCours(true);
    try {
      await api.delete("/profile/avatar");
      setProfil((p) => ({ ...p, avatar_updated_at: null }));
      refreshUser?.();
      toast.success("Photo retirée.");
    } catch {
      toast.error("La suppression n'a pas abouti.");
    } finally {
      setPhotoEnCours(false);
    }
  };

  const changerMdp = async (e) => {
    e.preventDefault();
    setMdpErreur("");
    if (mdp.new_password.length < 8) {
      setMdpErreur("Le nouveau mot de passe doit faire au moins 8 caractères.");
      return;
    }
    if (mdp.new_password !== mdp.confirmation) {
      setMdpErreur("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }
    setMdpEnCours(true);
    try {
      await api.post("/profile/password", {
        current_password: mdp.current_password,
        new_password: mdp.new_password,
      });
      setMdp({ current_password: "", new_password: "", confirmation: "" });
      toast.success("Mot de passe modifié.");
    } catch (err) {
      setMdpErreur(err?.response?.data?.error || "La modification n'a pas abouti.");
    } finally {
      setMdpEnCours(false);
    }
  };

  if (chargement) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Mon compte" title="Profil" icon={UserCircle} />
        <div className="card-solid p-6">
          <SkeletonText lines={6} />
        </div>
      </div>
    );
  }

  if (!profil) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Mon compte" title="Profil" icon={UserCircle} />
        <div className="card-solid p-6">
          <p className="text-sm text-slate-700">
            {erreurChargement || "Profil indisponible."}
          </p>
          <div className="mt-4">
            <Button variant="ghost" onClick={() => window.location.reload()}>
              Réessayer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const champ = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100";
  const label = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mon compte"
        title="Profil"
        subtitle="Vos informations, votre photo et votre mot de passe."
        icon={UserCircle}
      />

      {/* Identite */}
      <section className="card-solid p-6">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar
            userId={profil.id}
            name={profil.full_name}
            email={profil.email}
            updatedAt={profil.avatar_updated_at}
            className="h-24 w-24 rounded-2xl"
            textClassName="text-2xl"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-slate-900">
              {profil.full_name || profil.email}
            </p>
            <p className="truncate text-sm text-slate-500">{profil.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="badge bg-orange-50 border-orange-200 text-orange-700">
                {LIBELLE_ROLE[profil.role] || profil.role}
              </span>
              {profil.partner_name && (
                <span className="badge bg-slate-50 border-slate-200 text-slate-600">
                  {profil.partner_name}
                </span>
              )}
              {profil.is_team_odc && (
                <span className="badge bg-emerald-50 border-emerald-200 text-emerald-700">
                  Équipe ODC
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fichierRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={choisirPhoto}
              className="hidden"
            />
            <Button
              variant="ghost"
              size="sm"
              icon={Camera}
              loading={photoEnCours}
              loadingLabel="Envoi..."
              onClick={() => fichierRef.current?.click()}
            >
              {profil.avatar_updated_at ? "Changer la photo" : "Ajouter une photo"}
            </Button>
            {profil.avatar_updated_at && (
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                disabled={photoEnCours}
                onClick={supprimerPhoto}
                className="text-red-600 hover:bg-red-50"
              >
                Retirer
              </Button>
            )}
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          L&apos;image est recadrée en carré et réduite à {TAILLE_AVATAR}&nbsp;px dans votre
          navigateur avant l&apos;envoi : inutile de la préparer vous-même.
        </p>
      </section>

      {/* Informations */}
      <section className="card-solid p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Informations</h2>
        <form onSubmit={enregistrer} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="profil-nom">Nom complet</label>
              <input
                id="profil-nom"
                className={champ}
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Awa Ndiaye"
              />
            </div>
            <div>
              <label className={label} htmlFor="profil-poste">Fonction</label>
              <input
                id="profil-poste"
                className={champ}
                value={form.job_title}
                onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
                placeholder="Coordinatrice pédagogique"
              />
            </div>
            <div>
              <label className={label} htmlFor="profil-tel">Téléphone</label>
              <input
                id="profil-tel"
                className={champ}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+221 ..."
              />
            </div>
            <div>
              <label className={label} htmlFor="profil-email">Email</label>
              <input
                id="profil-email"
                className={`${champ} bg-slate-50 text-slate-500`}
                value={profil.email}
                readOnly
                title="L'email identifie le compte : seul un administrateur peut le changer."
              />
            </div>
          </div>
          <div>
            <label className={label} htmlFor="profil-bio">Présentation</label>
            <textarea
              id="profil-bio"
              rows={3}
              maxLength={500}
              className={champ}
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder="Quelques mots sur votre rôle au sein du centre."
            />
            <p className="mt-1 text-right text-xs text-slate-400">{form.bio.length}/500</p>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={enregistrement} loadingLabel="Enregistrement...">
              Enregistrer
            </Button>
          </div>
        </form>
      </section>

      {/* Mot de passe */}
      <section className="card-solid p-6">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <KeyRound className="h-4 w-4 text-slate-500" aria-hidden="true" />
          Mot de passe
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          Au moins 8 caractères. Vous resterez connecté après la modification.
        </p>
        <form onSubmit={changerMdp} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={label} htmlFor="mdp-actuel">Mot de passe actuel</label>
              <input
                id="mdp-actuel"
                type="password"
                autoComplete="current-password"
                className={champ}
                value={mdp.current_password}
                onChange={(e) => setMdp((m) => ({ ...m, current_password: e.target.value }))}
              />
            </div>
            <div>
              <label className={label} htmlFor="mdp-nouveau">Nouveau mot de passe</label>
              <input
                id="mdp-nouveau"
                type="password"
                autoComplete="new-password"
                className={champ}
                value={mdp.new_password}
                onChange={(e) => setMdp((m) => ({ ...m, new_password: e.target.value }))}
              />
            </div>
            <div>
              <label className={label} htmlFor="mdp-confirmation">Confirmation</label>
              <input
                id="mdp-confirmation"
                type="password"
                autoComplete="new-password"
                className={champ}
                value={mdp.confirmation}
                onChange={(e) => setMdp((m) => ({ ...m, confirmation: e.target.value }))}
              />
            </div>
          </div>
          {mdpErreur && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {mdpErreur}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="dark"
              loading={mdpEnCours}
              loadingLabel="Modification..."
              disabled={!mdp.current_password || !mdp.new_password || !mdp.confirmation}
            >
              Modifier le mot de passe
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
