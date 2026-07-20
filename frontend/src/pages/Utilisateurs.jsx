import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus, User, Mail, Shield, Building2, Link2, Pencil, Trash2,
  Search, UsersRound, Copy, Check, X, AlertCircle, Loader2,
} from "lucide-react";
import api from "../api";
import AdminPinGate from "../components/AdminPinGate";
import AdminModal from "../components/admin/AdminModal";

const ROLES = [
  { value: "admin",   label: "Administrateur", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "partner", label: "Partenaire",      cls: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "viewer",  label: "Lecteur",         cls: "bg-slate-100 text-slate-600 border-slate-200" },
];

const EMPTY_FORM = { full_name: "", email: "", role: "viewer", partner_id: "", status: "active" };

export default function Utilisateurs() {
  const [searchParams] = useSearchParams();
  const [users, setUsers]       = useState([]);
  const [partners, setPartners] = useState([]);
  const [search, setSearch]     = useState(searchParams.get("q") || "");
  const [roleFilter, setRoleFilter]     = useState("");
  const [statusFilter, setStatusFilter] = useState("");

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

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data || []);
    } catch { setUsers([]); }
  }, []);

  useEffect(() => {
    fetchUsers();
    api.get("/partners").then(r => setPartners(r.data || [])).catch(() => {});
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter && u.status !== statusFilter) return false;
      if (!q) return true;
      return (u.full_name || "").toLowerCase().includes(q)
          || (u.email || "").toLowerCase().includes(q)
          || (u.partner || "").toLowerCase().includes(q);
    });
  }, [users, search, roleFilter, statusFilter]);

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
    setForm({ full_name: u.full_name || "", email: u.email, role: u.role, partner_id: u.partner_id || "", status: u.status });
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
    try {
      const res = await api.post(`/users/${u.id}/reset-link`);
      setLinkModal({ link: res.data.link, full_name: res.data.full_name || u.full_name, email: res.data.email || u.email });
    } catch {
      alert("Erreur lors de la génération du lien.");
    } finally {
      setLinkLoading(false);
    }
  };

  /* ── supprimer ── */
  const handleDelete = async (id) => {
    if (!confirm("Supprimer définitivement cet utilisateur ?")) return;
    try {
      await api.delete(`/users/${id}/hard-delete`);
      fetchUsers();
    } catch { alert("Erreur lors de la suppression."); }
  };

  const stats = useMemo(() => ({
    total:    filteredUsers.length,
    active:   filteredUsers.filter(u => u.status === "active").length,
    inactive: filteredUsers.filter(u => u.status !== "active").length,
  }), [filteredUsers]);

  return (
    <AdminPinGate>
      <div className="space-y-6">

        {/* Header */}
        <section className="surface-glass p-5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Administration</p>
              <h1 className="mt-1 text-2xl lg:text-3xl font-semibold text-slate-900">Utilisateurs</h1>
              <p className="mt-1 text-sm text-slate-500">Gestion des accès, rôles et invitations.</p>
            </div>
            <button onClick={openCreate} className="btn-primary">
              <Plus className="w-4 h-4" /> Nouvel utilisateur
            </button>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MiniStat label="Total filtrés" value={stats.total} />
          <MiniStat label="Actifs" value={stats.active} />
          <MiniStat label="Inactifs" value={stats.inactive} />
        </section>

        {/* Filtres */}
        <section className="card p-4 lg:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher nom, email…" className="input pl-10" />
            </div>
            <select className="select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="">Tous les rôles</option>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <select className="select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">Tous les statuts</option>
              <option value="active">Actif</option>
              <option value="inactive">Inactif</option>
            </select>
          </div>
        </section>

        {/* Modal création / édition */}
        {modalOpen && (
          <AdminModal
            title={inviteData ? "Invitation créée" : editing ? "Modifier l'utilisateur" : "Nouvel utilisateur"}
            onClose={closeModal}
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
                    <p className="text-xs text-slate-400">
                      Un email a également été envoyé si votre configuration email est active.
                    </p>
                  </>
                ) : (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                    Le lien n'a pas pu être généré. Utilisez le bouton <Link2 className="w-3.5 h-3.5 inline" /> sur la ligne de l'utilisateur pour en créer un.
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button onClick={closeModal} className="btn-primary">Fermer</button>
                </div>
              </div>
            ) : (
              /* ── Étape 1 : formulaire ── */
              <form onSubmit={handleSubmit} className="space-y-4">
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

                <div>
                  <label className="text-sm font-medium">Rôle</label>
                  <select className="select mt-1" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Partenaire (optionnel)</label>
                  <select className="select mt-1" value={form.partner_id} onChange={e => setForm(f => ({ ...f, partner_id: e.target.value }))}>
                    <option value="">— Aucun partenaire —</option>
                    {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Statut</label>
                  <select className="select mt-1" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                  </select>
                </div>

                {!editing && (
                  <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700">
                    Après création, un lien d'invitation sera généré pour que l'utilisateur définisse son mot de passe.
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={closeModal} className="btn-ghost border">Annuler</button>
                  <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60 flex items-center gap-2">
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editing ? "Enregistrer" : "Créer et obtenir le lien"}
                  </button>
                </div>
              </form>
            )}
          </AdminModal>
        )}

        {/* Mini-modale lien existant */}
        {(linkModal || linkLoading) && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Lien d'invitation</h3>
                <button onClick={() => { setLinkModal(null); setLinkCopied2(false); }} className="text-slate-400 hover:text-slate-700 rounded-lg p-1"><X className="w-5 h-5" /></button>
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
                  <p className="text-xs text-slate-400">Ce lien est valable 24h. Un nouveau lien invalide le précédent.</p>
                  <div className="flex justify-end">
                    <button onClick={() => { setLinkModal(null); setLinkCopied2(false); }} className="btn-ghost border">Fermer</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Table */}
        <section className="card overflow-x-auto">
          <table className="table">
            <thead className="table-head">
              <tr>
                <th className="text-left px-4 py-3">Utilisateur</th>
                <th className="text-left px-4 py-3">Rôle</th>
                <th className="text-left px-4 py-3">Partenaire</th>
                <th className="text-left px-4 py-3">Statut</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Aucun utilisateur trouvé.
                  </td>
                </tr>
              ) : filteredUsers.map(u => {
                const roleMeta = ROLES.find(r => r.value === u.role);
                return (
                  <tr key={u.id} className="table-row">
                    <td className="px-4 py-3">
                      <div className="font-medium flex items-center gap-2">
                        <User className="w-4 h-4 text-orange-500 flex-shrink-0" />
                        {u.full_name || <span className="text-slate-400 italic">Sans nom</span>}
                      </div>
                      <div className="flex items-center gap-1 text-slate-500 text-xs mt-1">
                        <Mail className="w-3 h-3" /> {u.email}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${roleMeta?.cls || "bg-slate-100 text-slate-600"}`}>
                        <Shield className="w-3 h-3" />
                        {roleMeta?.label || u.role}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-sm">
                      {u.partner
                        ? <span className="flex items-center gap-1"><Building2 className="w-4 h-4 text-slate-400" />{u.partner}</span>
                        : <span className="text-slate-400">—</span>}
                    </td>

                    <td className="px-4 py-3">
                      <span className={`badge ${u.status === "active" ? "bg-green-100 border-green-200 text-green-700" : "bg-slate-100 border-slate-200 text-slate-600"}`}>
                        {u.status === "active" ? "Actif" : "Inactif"}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(u)} className="text-slate-400 hover:text-orange-500 mr-3 transition-colors" title="Modifier">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => openLinkModal(u)} className="text-slate-400 hover:text-indigo-500 mr-3 transition-colors" title="Générer un lien d'invitation">
                        <Link2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(u.id)} className="text-slate-400 hover:text-red-500 transition-colors" title="Supprimer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </AdminPinGate>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <UsersRound className="h-4 w-4 text-orange-500" />
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
