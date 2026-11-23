import { useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  Plus, User, Mail, Shield, Building2, Link2, Pencil, Trash2,
  Search, UsersRound, Copy, Check, X, AlertCircle, Loader2, Target, Wifi,
  KanbanSquare, Layers, UserCheck, UserX, Sparkles,
} from "lucide-react";

/* Un utilisateur est "en ligne" si last_seen_at < ONLINE_THRESHOLD ms */
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

/* La présence, sur une seule ligne.
 *
 * Elle en prenait trois : « Hors », « ligne » et « il y a 42 min » se
 * répartissaient sur la hauteur de la cellule, faute de place, et chaque ligne
 * du tableau prenait une hauteur différente. Le point porte déjà l'état ; le
 * texte dit depuis quand, ce qui est la seule chose qu'on vient y chercher.
 *
 * « Jamais connecté » n'est pas « hors ligne ». C'est une invitation qui n'a
 * pas abouti, et elle appelle un geste précis — renvoyer le lien — alors qu'un
 * collègue parti en congé n'appelle rien. Les confondre, c'était perdre la
 * seule ligne de cette page sur laquelle il y a quelque chose à faire. */
function Presence({ lastSeenAt }) {
  const enLigne = isOnline(lastSeenAt);
  const jamais = !lastSeenAt;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs">
      <span
        aria-hidden="true"
        className={`h-2 w-2 flex-shrink-0 rounded-full ${
          enLigne
            ? "bg-emerald-500 ring-2 ring-emerald-200"
            : jamais
              ? "bg-amber-400"
              : "bg-slate-300"
        }`}
      />
      <span
        className={
          enLigne
            ? "font-medium text-emerald-700"
            : jamais
              ? "text-amber-700"
              : "text-slate-500"
        }
      >
        {enLigne ? "En ligne" : jamais ? "Jamais connecté" : formatLastSeen(lastSeenAt)}
      </span>
    </span>
  );
}
import api from "../api";
import AdminPinGate from "../components/AdminPinGate";
import AdminModal from "../components/admin/AdminModal";
import { useToast, useConfirm, EmptyState, StatTile } from "../components/ui";

const ROLES = [
  { value: "admin",   label: "Administrateur",  cls: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "partner", label: "Partenaire",       cls: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "coach",   label: "Coach/Formateur",  cls: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "viewer",  label: "Lecteur",          cls: "bg-slate-100 text-slate-600 border-slate-200" },
];

const JOB_TITLES = [
  "Directeur / Directrice",
  "Directeur adjoint / Directrice adjointe",
  "Assistant / Assistante",
  "Responsable de programme",
  "Chef / Cheffe de projet",
  "Coordinateur / Coordinatrice",
  "Chargé / Chargée de communication",
  "Comptable",
  "Secrétaire",
  "Autre fonction",
];

/* « is_goto27 » coché par défaut : un compte partenaire voyait GOTO27 avant que
   la case existe, et c'est le cas le plus courant. On décoche pour fermer. */
const EMPTY_FORM = { full_name: "", email: "", role: "viewer", job_title: "", partner_id: "", status: "active", objective_beneficiaries: "", is_team_odc: false, is_goto27: true, device_ids: [] };

export default function Utilisateurs() {
  const toast = useToast();
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();
  const [users, setUsers]       = useState([]);
  const [partners, setPartners] = useState([]);
  const [devices, setDevices]   = useState([]);
  const [search, setSearch]     = useState(searchParams.get("q") || "");
  const [roleFilter, setRoleFilter]     = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [onlineFilter, setOnlineFilter] = useState(false);

  /* modal création / édition */
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState(null); // user id or null
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState("");

  /* étape 2 : lien d'invitation après création */
  const [inviteData, setInviteData] = useState(null); // { link, full_name }
  const [linkCopied, setLinkCopied] = useState(false);

  /* mini-modale lien pour utilisateur existant */
  const [linkModal, setLinkModal]   = useState(null); // { link, full_name, email }
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkCopied2, setLinkCopied2] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data || []);
    } catch { setUsers([]); }
  }, []);

  useEffect(() => {
    fetchUsers();
    api.get("/partners").then(r => setPartners(r.data || [])).catch(() => {});
    api.get("/devices").then(r => setDevices(r.data || [])).catch(() => {});
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter && u.status !== statusFilter) return false;
      if (onlineFilter && !isOnline(u.last_seen_at)) return false;
      if (!q) return true;
      return (u.full_name || "").toLowerCase().includes(q)
          || (u.email || "").toLowerCase().includes(q)
          || (u.job_title || "").toLowerCase().includes(q)
          || (u.partner || "").toLowerCase().includes(q);
    });
  }, [users, search, roleFilter, statusFilter, onlineFilter]);

  /* ── ouvrir modal ── */
  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setFormError("");
    setInviteData(null);
    setLinkCopied(false);
    setModalOpen(true);
  };

  const openEdit = (u) => {
    setForm({ full_name: u.full_name || "", email: u.email, role: u.role, job_title: u.job_title || "", partner_id: u.partner_id || "", status: u.status, objective_beneficiaries: u.objective_beneficiaries ?? "", is_team_odc: !!u.is_team_odc, is_goto27: u.is_goto27 !== false, device_ids: u.device_ids || [] });
    setEditing(u.id);
    setFormError("");
    setInviteData(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setInviteData(null);
    setLinkCopied(false);
    fetchUsers();
  };

  /* ── soumettre ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) { setFormError("Le nom complet est requis."); return; }
    if (!form.email.trim())     { setFormError("L'email est requis."); return; }
    setSaving(true);
    setFormError("");
    try {
      if (editing) {
        await api.put(`/users/${editing}`, form);
        closeModal();
      } else {
        const res = await api.post("/users", form);
        setInviteData({ link: res.data.invite_link, full_name: res.data.full_name || form.full_name });
        fetchUsers();
      }
    } catch (err) {
      setFormError(err?.response?.data?.error || "Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  /* ── copier lien ── */
  const copyLink = async (link, setCopied) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  /* ── générer lien pour user existant ── */
  const openLinkModal = async (u) => {
    setLinkLoading(true);
    setLinkModal(null);
    setLinkCopied2(false);
    setEmailSent(false);
    setEmailError(null);
    try {
      const res = await api.post(`/users/${u.id}/reset-link`);
      setLinkModal({ link: res.data.link, full_name: res.data.full_name || u.full_name, email: res.data.email || u.email, userId: u.id });
    } catch {
      toast.error("La génération du lien a échoué.");
    } finally {
      setLinkLoading(false);
    }
  };

  /* Envoyer cree un nouveau jeton, qui condamne celui deja affiche. La reponse
     rapporte donc le lien reellement parti, en reussite comme en echec : sans
     lui, un envoi rate laissait la personne sans mail ET avec un lien mort a
     l'ecran — les deux portes fermees d'un coup. */
  const sendResetEmail = async () => {
    if (!linkModal?.userId) return;
    setEmailError(null);
    try {
      const res = await api.post(`/users/${linkModal.userId}/reset-password`);
      if (res.data?.link) setLinkModal((m) => ({ ...m, link: res.data.link }));
      setLinkCopied2(false);
      setEmailSent(true);
    } catch (err) {
      const d = err.response?.data || {};
      if (d.link) setLinkModal((m) => ({ ...m, link: d.link }));
      setLinkCopied2(false);
      setEmailError({
        cause: d.cause || d.error || "L'envoi de l'email a échoué.",
        remede: d.remede || null,
      });
    }
  };

  /* ── supprimer ── */
  const handleDelete = async (id) => {
    const ok = await confirm({
      title: "Supprimer cet utilisateur ?",
      body: "Son compte sera désactivé et il perdra l'accès à la plateforme.",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/users/${id}/hard-delete`);
      fetchUsers();
    } catch { toast.error("La suppression a échoué."); }
  };

  /* Les quatre tuiles décrivent l'équipe, pas le résultat des filtres.
     Elles mélangeaient les deux : « total », « actifs » et « inactifs »
     comptaient les lignes filtrées pendant que « en ligne » comptait tout le
     monde. Quatre nombres côte à côte qu'on lit comme un tout, et dont trois
     changeaient en tapant dans la recherche. Ce que les filtres donnent se lit
     maintenant au-dessus du tableau, là où on le cherche. */
  const stats = useMemo(() => ({
    total:    users.length,
    active:   users.filter(u => u.status === "active").length,
    inactive: users.filter(u => u.status !== "active").length,
    online:   users.filter(u => isOnline(u.last_seen_at)).length,
  }), [users]);

  const filtresActifs = Boolean(search.trim() || roleFilter || statusFilter || onlineFilter);
  const reinitialiserFiltres = () => {
    setSearch("");
    setRoleFilter("");
    setStatusFilter("");
    setOnlineFilter(false);
  };

  return (
    <AdminPinGate>
      <div className="space-y-6">

        {/* Header */}
        <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-lg shadow-slate-900/10 lg:p-6">
          <div className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-300">Administration</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white lg:text-3xl">Utilisateurs</h1>
              <p className="mt-1 text-sm text-slate-300">Gérez les accès, fonctions et invitations de l’équipe.</p>
            </div>
            <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-950/20 transition hover:bg-orange-400">
              <Plus className="w-4 h-4" /> Nouvel utilisateur
            </button>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {/* La tuile de la maison, plutôt qu'une cinquième écrite à la main.
              Les anciennes étaient peintes en dur — « from-orange-50 to-white »
              — et restaient blanches en thème sombre : quatre rectangles
              éclatants sur une page noire. Le vert ne sert plus qu'à la
              présence, pour qu'il veuille dire une seule chose sur cette
              page. */}
          <StatTile label="Comptes" value={stats.total} icon={UsersRound} tone="brand" />
          <StatTile label="Actifs" value={stats.active} icon={UserCheck} />
          <StatTile label="Inactifs" value={stats.inactive} icon={UserX} />
          <StatTile label="En ligne" value={stats.online} icon={Wifi} tone="success" />
        </section>

        {/* Filtres */}
        <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm lg:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher nom, email…" className="input pl-10" />
            </div>
            <select className="select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="">Tous les rôles</option>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <div className="flex gap-2">
              <select className="select flex-1" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">Tous les statuts</option>
                <option value="active">Actif</option>
                <option value="inactive">Inactif</option>
              </select>
              <button
                onClick={() => setOnlineFilter(f => !f)}
                title="Afficher uniquement les utilisateurs en ligne"
                className={`flex items-center gap-1.5 px-3 rounded-lg border text-sm font-medium transition-colors flex-shrink-0 ${
                  onlineFilter
                    ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Wifi className="w-4 h-4" />
                En ligne
              </button>
            </div>
          </div>
        </section>

        {/* Modal création / édition */}
        {modalOpen && (
          <AdminModal
            title={inviteData ? "Invitation créée" : editing ? "Modifier l'utilisateur" : "Nouvel utilisateur"}
            onClose={closeModal}
            /* Les boutons sortent du défilement et restent sous les yeux.
               Le formulaire d'un coach fait deux écrans et demi : « Créer »
               se trouvait tout en bas, hors de vue, et il fallait deviner
               qu'il fallait faire défiler la modale pour valider. Le bouton
               d'envoi reste rattaché au formulaire par son attribut « form »,
               bien qu'il n'y soit plus imbriqué. */
            footer={
              inviteData ? (
                <button onClick={closeModal} className="btn-primary">Fermer</button>
              ) : (
                <>
                  <button type="button" onClick={closeModal} className="btn-ghost border">
                    Annuler
                  </button>
                  <button
                    type="submit"
                    form="formulaire-utilisateur"
                    disabled={saving}
                    className="btn-primary flex items-center gap-2 disabled:opacity-60"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editing ? "Enregistrer" : "Créer et obtenir le lien"}
                  </button>
                </>
              )
            }
          >
            {inviteData ? (
              /* ── Étape 2 : lien d'invitation ── */
              <div className="space-y-4">
                <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-green-800 text-sm">Compte créé avec succès</p>
                    <p className="text-xs text-green-700 mt-0.5">
                      Partagez ce lien avec <strong>{inviteData.full_name}</strong> pour qu'il/elle définisse son mot de passe.
                    </p>
                  </div>
                </div>

                {inviteData.link ? (
                  <>
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Lien d'invitation (valable 24h)</label>
                      <div className="mt-2 flex items-stretch gap-2">
                        <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 font-mono break-all select-all">
                          {inviteData.link}
                        </div>
                        <button
                          onClick={() => copyLink(inviteData.link, setLinkCopied)}
                          className={`flex-shrink-0 rounded-xl px-4 border text-sm font-medium transition-colors flex items-center gap-2 ${linkCopied ? "bg-green-50 border-green-200 text-green-700" : "border-slate-200 hover:bg-slate-100 text-slate-700"}`}
                        >
                          {linkCopied ? <><Check className="w-4 h-4" /> Copié</> : <><Copy className="w-4 h-4" /> Copier</>}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      Un email a également été envoyé si votre configuration email est active.
                    </p>
                  </>
                ) : (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                    Le lien n'a pas pu être généré. Utilisez le bouton <Link2 className="w-3.5 h-3.5 inline" /> sur la ligne de l'utilisateur pour en créer un.
                  </div>
                )}

              </div>
            ) : (
              /* ── Étape 1 : formulaire ──
                 Plus de carte dans la carte : le formulaire était enfermé
                 dans un cadre orange à l'intérieur du panneau blanc de la
                 modale, deux bordures pour une seule chose. */
              <form id="formulaire-utilisateur" onSubmit={handleSubmit} className="space-y-4">
                {formError && (
                  <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {formError}
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium">Nom complet *</label>
                  <input required className="input mt-1" placeholder="Prénom Nom" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
                </div>

                <div>
                  <label className="text-sm font-medium">Email *</label>
                  <input required type="email" className="input mt-1" placeholder="email@exemple.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Accès à la plateforme</label>
                  <select className="select mt-1" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Fonction dans l’équipe</label>
                  <input list="user-job-titles" className="input mt-1" placeholder="Ex. Directrice, Assistant…" value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} />
                  <datalist id="user-job-titles">
                    {JOB_TITLES.map(title => <option key={title} value={title} />)}
                  </datalist>
                </div>
                </div>

                {(form.role === "partner" || form.role === "coach") && (
                  <div>
                    <label className="text-sm font-medium">
                      {form.role === "coach" ? "Partenaire affilié" : "Partenaire (optionnel)"}
                    </label>
                    <select className="select mt-1" value={form.partner_id} onChange={e => setForm(f => ({ ...f, partner_id: e.target.value }))}>
                      <option value="">— Aucun partenaire —</option>
                      {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Dispositifs confies au coach. Sans eux, ses activites
                    partaient sans dispositif et n'apparaissaient dans aucune
                    repartition. */}
                {form.role === "coach" && (
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-orange-500" />
                      Dispositifs confiés
                    </label>
                    <p className="mt-1 text-xs text-slate-500">
                      Ce coach ne pourra rattacher ses activités qu&apos;aux dispositifs cochés ici.
                    </p>
                    {devices.length === 0 ? (
                      <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        Aucun dispositif enregistré. Créez-en depuis la page Dispositifs.
                      </p>
                    ) : (
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        {devices.map((d) => {
                          const coche = (form.device_ids || []).some((id) => String(id) === String(d.id));
                          return (
                            <label
                              key={d.id}
                              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                                coche
                                  ? "border-orange-300 bg-orange-50 text-orange-900"
                                  : "border-slate-200 hover:bg-slate-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-orange-500"
                                checked={coche}
                                onChange={(e) =>
                                  setForm((f) => {
                                    const actuels = (f.device_ids || []).map(Number);
                                    return {
                                      ...f,
                                      device_ids: e.target.checked
                                        ? [...new Set([...actuels, Number(d.id)])]
                                        : actuels.filter((id) => id !== Number(d.id)),
                                    };
                                  })
                                }
                              />
                              <span className="truncate">{d.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {form.role === "coach" && form.partner_id && (() => {
                  const partner = partners.find(p => String(p.id) === String(form.partner_id));
                  const partnerObjective = Number(partner?.objective_beneficiaries || 0);
                  const alreadyAllocated = users
                    .filter(u => u.role === "coach" && String(u.partner_id) === String(form.partner_id) && u.id !== editing)
                    .reduce((s, u) => s + Number(u.objective_beneficiaries || 0), 0);
                  const thisCoach = Number(form.objective_beneficiaries || 0);
                  const totalAllocated = alreadyAllocated + thisCoach;
                  const remaining = partnerObjective - alreadyAllocated;
                  const pct = partnerObjective > 0 ? Math.min(100, Math.round((totalAllocated / partnerObjective) * 100)) : 0;

                  return (
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium flex items-center gap-1.5">
                          <Target className="w-4 h-4 text-orange-500" />
                          Objectif assigné à ce coach (bénéficiaires)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={remaining + thisCoach}
                          className="input mt-1"
                          placeholder="0"
                          value={form.objective_beneficiaries}
                          onChange={e => setForm(f => ({ ...f, objective_beneficiaries: e.target.value }))}
                        />
                      </div>

                      {partnerObjective > 0 && (
                        <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3 space-y-2">
                          <p className="text-xs font-medium text-orange-800 flex items-center gap-1">
                            <Target className="w-3.5 h-3.5" />
                            Répartition de l'objectif partenaire — {partner?.name}
                          </p>
                          <div className="w-full h-2.5 bg-white rounded-full border border-orange-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${totalAllocated > partnerObjective ? "bg-red-400" : "bg-orange-400"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-xs text-center">
                            <div className="rounded-lg bg-white border border-orange-100 px-2 py-1.5">
                              <p className="text-orange-600 font-semibold">{partnerObjective}</p>
                              <p className="text-slate-500">Total</p>
                            </div>
                            <div className="rounded-lg bg-white border border-orange-100 px-2 py-1.5">
                              <p className={`font-semibold ${totalAllocated > partnerObjective ? "text-red-500" : "text-slate-700"}`}>{totalAllocated}</p>
                              <p className="text-slate-500">Alloués</p>
                            </div>
                            <div className="rounded-lg bg-white border border-orange-100 px-2 py-1.5">
                              <p className={`font-semibold ${remaining - thisCoach < 0 ? "text-red-500" : "text-emerald-600"}`}>{Math.max(0, remaining - thisCoach)}</p>
                              <p className="text-slate-500">Restant</p>
                            </div>
                          </div>
                          {totalAllocated > partnerObjective && (
                            <p className="text-xs text-red-600 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Le total alloué dépasse l'objectif du partenaire.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div>
                  <label className="text-sm font-medium">Statut</label>
                  <select className="select mt-1" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                  </select>
                </div>

                {/* Mbootay : reserve aux profils internes, les admins l'ont d'office */}
                {form.role !== "partner" && (
                  <div className="rounded-xl border border-slate-200 px-4 py-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-orange-500 mt-0.5"
                        checked={form.role === "admin" ? true : !!form.is_team_odc}
                        disabled={form.role === "admin"}
                        onChange={e => setForm(f => ({ ...f, is_team_odc: e.target.checked }))}
                      />
                      <span>
                        <span className="text-sm font-medium flex items-center gap-1.5">
                          <KanbanSquare className="w-4 h-4 text-orange-500" />
                          Accès Mbootay
                        </span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {form.role === "admin"
                            ? "Les administrateurs accèdent à Mbootay d'office."
                            : "Donne accès à l'espace de projets internes de l'équipe ODC."}
                        </span>
                      </span>
                    </label>
                  </div>
                )}

                {/* GOTO27 : l'espace de documents partagés avec les
                    partenaires. Les admins l'ont d'office ; pour un partenaire,
                    c'est ici qu'on l'ouvre ou qu'on le ferme. Les coachs et
                    lecteurs n'y ont pas accès : la case ne leur est pas
                    proposée. */}
                {(form.role === "partner" || form.role === "admin") && (
                  <div className="rounded-xl border border-slate-200 px-4 py-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-orange-500 mt-0.5"
                        checked={form.role === "admin" ? true : form.is_goto27 !== false}
                        disabled={form.role === "admin"}
                        onChange={e => setForm(f => ({ ...f, is_goto27: e.target.checked }))}
                      />
                      <span>
                        <span className="text-sm font-medium flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-orange-500" />
                          Accès GOTO27
                        </span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {form.role === "admin"
                            ? "Les administrateurs accèdent à GOTO27 d'office."
                            : "Ce partenaire voit son espace GOTO27 et peut y déposer ses documents. Décocher le lui ferme aussitôt."}
                        </span>
                      </span>
                    </label>
                  </div>
                )}

                {!editing && (
                  <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700">
                    Après création, un lien d'invitation sera généré pour que l'utilisateur définisse son mot de passe.
                  </div>
                )}

              </form>
            )}
          </AdminModal>
        )}

        {/* Mini-modale lien existant */}
        {(linkModal || linkLoading) && createPortal(
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Lien d'invitation</h3>
                <button onClick={() => { setLinkModal(null); setLinkCopied2(false); }} className="text-slate-500 hover:text-slate-700 rounded-lg p-1"><X className="w-5 h-5" /></button>
              </div>

              {linkLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-orange-400" /></div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Partagez ce lien avec <strong>{linkModal.full_name || linkModal.email}</strong> pour qu'il/elle définisse son mot de passe.
                  </p>
                  <div className="flex items-stretch gap-2">
                    <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 font-mono break-all select-all">
                      {linkModal.link}
                    </div>
                    <button
                      onClick={() => copyLink(linkModal.link, setLinkCopied2)}
                      className={`flex-shrink-0 rounded-xl px-4 border text-sm font-medium transition-colors flex items-center gap-2 ${linkCopied2 ? "bg-green-50 border-green-200 text-green-700" : "border-slate-200 hover:bg-slate-100 text-slate-700"}`}
                    >
                      {linkCopied2 ? <><Check className="w-4 h-4" /> Copié</> : <><Copy className="w-4 h-4" /> Copier</>}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Ce lien est valable 24h. Un nouveau lien invalide le précédent — le lien
                    affiché ici est toujours le dernier, même après un envoi par email.
                  </p>

                  {/* Quand l'envoi échoue, dire pourquoi. « L'envoi a échoué »
                      laissait croire à une panne de la plateforme et ne disait
                      pas que le lien ci-dessus, lui, fonctionne. */}
                  {emailError && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
                      <p className="text-sm font-medium text-amber-900 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        {emailError.cause}
                      </p>
                      {emailError.remede && (
                        <p className="text-xs text-amber-800 pl-6">{emailError.remede}</p>
                      )}
                      <p className="text-xs text-amber-800 pl-6">
                        Le lien ci-dessus reste valable : copiez-le et transmettez-le
                        directement à la personne.
                      </p>
                    </div>
                  )}

                  {linkModal.email && (
                    <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${emailSent ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"}`}>
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {emailSent ? "Email envoyé !" : "Envoyer par email"}
                        </p>
                        <p className="text-xs text-slate-500">{linkModal.email}</p>
                      </div>
                      {emailSent ? (
                        <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                      ) : (
                        <button onClick={sendResetEmail} className="btn-primary text-sm flex-shrink-0">
                          <Mail className="w-4 h-4" /> Envoyer
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button onClick={() => { setLinkModal(null); setLinkCopied2(false); setEmailSent(false); setEmailError(null); }} className="btn-ghost border">Fermer</button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

        {/* Ce que les filtres donnent, dit là où on le cherche : juste
            au-dessus de la liste qu'ils ont réduite. */}
        {filteredUsers.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-xs text-slate-500">
              {filtresActifs
                ? `${filteredUsers.length} compte${filteredUsers.length > 1 ? "s" : ""} affiché${filteredUsers.length > 1 ? "s" : ""} sur ${users.length}`
                : `${users.length} compte${users.length > 1 ? "s" : ""}`}
            </p>
            {filtresActifs && (
              <button
                onClick={reinitialiserFiltres}
                className="text-xs font-medium text-orange-600 underline underline-offset-2 transition hover:text-orange-700"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        )}

        {filteredUsers.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <EmptyState
              bare
              icon={UsersRound}
              title={users.length === 0 ? "Aucun utilisateur" : "Aucun utilisateur ne correspond aux filtres"}
              description={
                users.length === 0
                  ? "Invitez un collègue : il recevra un lien pour définir son mot de passe."
                  : "Modifiez la recherche, le rôle ou le statut pour élargir les résultats."
              }
              actionLabel={users.length === 0 ? "Nouvel utilisateur" : "Tout réinitialiser"}
              actionIcon={users.length === 0 ? Plus : undefined}
              onAction={users.length === 0 ? openCreate : reinitialiserFiltres}
            />
          </section>
        ) : (
        <>

        {/* Téléphone : une fiche par personne.
            Les sept colonnes réclamaient 900 px de large. Sur un écran de
            390 px, il fallait donc pousser le tableau horizontalement — dans
            une zone qui n'annonce nulle part qu'elle défile — et les trois
            actions, qui sont la raison d'être de cette page, étaient hors
            d'atteinte. Elles portent ici leur nom en toutes lettres : il y a
            la place, et un libellé vaut mieux qu'une icône de seize pixels au
            bout d'un doigt. */}
        <section className="space-y-3 md:hidden">
          {filteredUsers.map((u) => (
            <CarteUtilisateur
              key={u.id}
              u={u}
              onEdit={() => openEdit(u)}
              onLink={() => openLinkModal(u)}
              onDelete={() => handleDelete(u.id)}
            />
          ))}
        </section>

        {/* Écran large */}
        <section className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
          <table className="table min-w-[820px]">
            {/* L'en-tête de la maison, clair, plutôt qu'un second bandeau
                noir sous celui du titre : deux blocs sombres à quelques
                pixels l'un de l'autre se disputaient le regard, et aucun
                autre tableau de la plateforme n'en portait. Il suit en prime
                le thème sombre, ce que « bg-slate-950 » ne faisait pas. */}
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3 font-semibold">Utilisateur</th>
                <th className="px-4 py-3 font-semibold">Accès</th>
                <th className="px-4 py-3 font-semibold">Fonction</th>
                <th className="px-4 py-3 font-semibold">Partenaire</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold">Présence</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => {
                return (
                  <tr key={u.id} className="table-row border-slate-100 align-middle">
                    <td className="max-w-[220px] px-4 py-3">
                      <div className="flex items-center gap-2 font-medium">
                        <User className="w-4 h-4 text-orange-500 flex-shrink-0" />
                        <span className="truncate">
                          {u.full_name || <span className="italic text-slate-500">Sans nom</span>}
                        </span>
                      </div>
                      {/* L'adresse sur une ligne, coupée au besoin.
                          « abdoulmouhamed.fall@orange-sonatel.com » passait à
                          la ligne au milieu du domaine et faisait grandir la
                          rangée d'un cran. L'adresse entière reste lisible au
                          survol, et l'on vient de toute façon chercher ici un
                          nom, pas une adresse. */}
                      <div
                        className="mt-1 flex items-center gap-1 text-xs text-slate-500"
                        title={u.email}
                      >
                        <Mail className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{u.email}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <BadgeRole role={u.role} />
                        {(u.role === "admin" || u.is_team_odc) && <ChipMbootay />}
                        {u.role === "partner" && u.is_goto27 !== false && <ChipGoto27 />}
                      </div>
                    </td>

                    {/* La fonction n'est pas un état : c'est du texte.
                        En pastille orange, elle pesait autant que le rôle —
                        qui, lui, décide de ce que la personne peut faire — et
                        un intitulé un peu long passait à la ligne à
                        l'intérieur de la pastille, ce qui ne ressemble à
                        rien. */}
                    <td className="max-w-[150px] px-4 py-3">
                      {u.job_title ? (
                        <span className="block truncate text-sm text-slate-700" title={u.job_title}>
                          {u.job_title}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>

                    <td className="max-w-[220px] px-4 py-3 text-sm">
                      <InfosPartenaire u={u} />
                    </td>

                    <td className="px-4 py-3">
                      <BadgeStatut status={u.status} />
                    </td>

                    <td className="px-4 py-3">
                      <Presence lastSeenAt={u.last_seen_at} />
                    </td>

                    {/* Les trois actions, à la taille de la maison.
                        Elles faisaient seize pixels, sans cadre et en gris
                        clair : on les cherchait, et sur un écran un peu
                        étroit la colonne les repliait sur deux rangées. Le
                        bouton-icône commun fait trente-six pixels et porte
                        son nom pour les lecteurs d'écran, que « title » seul
                        n'atteint pas de façon fiable. */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEdit(u)}
                          className="icon-btn"
                          title="Modifier"
                          aria-label={`Modifier ${u.full_name || u.email}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openLinkModal(u)}
                          className="icon-btn"
                          title="Lien d'invitation"
                          aria-label={`Lien d'invitation pour ${u.full_name || u.email}`}
                        >
                          <Link2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(u.id)}
                          className="icon-btn icon-btn-danger"
                          title="Supprimer"
                          aria-label={`Supprimer ${u.full_name || u.email}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        </>
        )}
      </div>
    </AdminPinGate>
  );
}

function formatLastSeen(lastSeenAt) {
  if (!lastSeenAt) return "";
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `il y a ${days} j`;
}

/* ===== LES MORCEAUX COMMUNS AU TABLEAU ET AUX FICHES =====
   Écrits une fois : sans cela, la fiche du téléphone et la ligne de l'écran
   large auraient divergé dès la première retouche. */

function BadgeRole({ role }) {
  const meta = ROLES.find((r) => r.value === role);
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${
        meta?.cls || "bg-slate-100 text-slate-600 border-slate-200"
      }`}
    >
      <Shield className="w-3 h-3 flex-shrink-0" />
      {meta?.label || role}
    </span>
  );
}

/* Mbootay est une précision sur l'accès, pas un accès : discret, à côté du
   rôle, et sans la graisse qui le ferait lire comme son égal. */
function ChipMbootay() {
  return (
    <span
      title="Accès à l'espace de projets internes"
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600"
    >
      <KanbanSquare className="w-3 h-3 flex-shrink-0 text-orange-500" />
      Mbootay
    </span>
  );
}

/* GOTO27, même facture que Mbootay. Affiché pour les partenaires seulement :
   chez un admin il irait de soi, et le répéter sur chaque ligne d'admin
   noierait le seul cas qui compte — un partenaire ouvert ou fermé. */
function ChipGoto27() {
  return (
    <span
      title="Accès à l'espace de documents GOTO27"
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600"
    >
      <Sparkles className="w-3 h-3 flex-shrink-0 text-orange-500" />
      GOTO27
    </span>
  );
}

function BadgeStatut({ status }) {
  const actif = status === "active";
  return (
    <span
      className={`badge whitespace-nowrap ${
        actif
          ? "border-green-200 bg-green-100 text-green-700"
          : "border-slate-200 bg-slate-100 text-slate-600"
      }`}
    >
      {actif ? "Actif" : "Inactif"}
    </span>
  );
}

/* Le partenaire, et pour un coach ce qui lui est confié. Sans cette ligne il
   fallait ouvrir chaque fiche pour savoir quels dispositifs un coach peut
   renseigner. */
function InfosPartenaire({ u }) {
  const dispositifs = u.role === "coach" ? u.device_names || [] : [];
  if (!u.partner && dispositifs.length === 0) {
    return <span className="text-sm text-slate-400">—</span>;
  }
  return (
    <div className="min-w-0">
      {u.partner && (
        <span className="flex items-center gap-1" title={u.partner}>
          <Building2 className="w-4 h-4 flex-shrink-0 text-slate-500" />
          <span className="truncate">{u.partner}</span>
        </span>
      )}
      {u.role === "coach" && u.objective_beneficiaries != null && (
        <span className="mt-0.5 flex items-center gap-1 text-xs text-orange-600">
          <Target className="w-3 h-3 flex-shrink-0" />
          Objectif : {u.objective_beneficiaries} bénéf.
        </span>
      )}
      {dispositifs.length > 0 && (
        <span
          className="mt-0.5 flex items-start gap-1 text-xs text-slate-500"
          title={dispositifs.join(", ")}
        >
          <Layers className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span className="line-clamp-2">{dispositifs.join(", ")}</span>
        </span>
      )}
    </div>
  );
}

/* La fiche du téléphone. Même matière que la ligne du tableau, rangée
   autrement : l'identité en haut, ce qui la qualifie au milieu, et les trois
   actions en bas, libellées. */
function CarteUtilisateur({ u, onEdit, onLink, onDelete }) {
  const nom = u.full_name || u.email;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {u.full_name || <span className="italic text-slate-500">Sans nom</span>}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500" title={u.email}>
            {u.email}
          </p>
        </div>
        <BadgeStatut status={u.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <BadgeRole role={u.role} />
        {(u.role === "admin" || u.is_team_odc) && <ChipMbootay />}
                        {u.role === "partner" && u.is_goto27 !== false && <ChipGoto27 />}
      </div>

      {u.job_title && (
        <p className="mt-2.5 truncate text-sm text-slate-700" title={u.job_title}>
          {u.job_title}
        </p>
      )}

      {/* Dans un tableau, une colonne vide se signale par un tiret — la
          colonne existe quand même. Dans une fiche, il n'y a pas de colonne :
          un tiret seul n'y désigne rien et se lit comme une faute. */}
      {(u.partner || (u.role === "coach" && (u.device_names || []).length > 0)) && (
        <div className="mt-2 text-sm">
          <InfosPartenaire u={u} />
        </div>
      )}

      <div className="mt-3 border-t border-slate-100 pt-3">
        <Presence lastSeenAt={u.last_seen_at} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button onClick={onEdit} className="btn-ghost justify-center border text-xs">
          <Pencil className="w-4 h-4" /> Modifier
        </button>
        <button onClick={onLink} className="btn-ghost justify-center border text-xs">
          <Link2 className="w-4 h-4" /> Lien
        </button>
        <button
          onClick={onDelete}
          aria-label={`Supprimer ${nom}`}
          className="btn-ghost justify-center border text-xs text-red-600 hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4" /> Supprimer
        </button>
      </div>
    </article>
  );
}
