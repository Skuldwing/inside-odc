import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarClock,
  Download,
  FileText,
  FolderLock,
  HardDrive,
  Mail,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import api from "../api";
import { useAuth } from "../auth/useAuth";
import AdminPinGate from "../components/AdminPinGate";
import { useConfirm, useToast } from "../components/ui";

const EMPTY_FORM = { title: "", description: "", partner_id: "", file: null };
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function AddPartnerContactForm({ partner, onClose, onCreated }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState("");

  const createAccount = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await api.post("/users", {
        full_name: fullName.trim(),
        email: email.trim(),
        role: "partner",
        partner_id: partner.id,
        status: "active",
      });
      setCreated(response.data);
      onCreated(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Impossible de créer ce compte.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h3 className="text-sm font-bold text-slate-900">Ajouter un accès partenaire</h3><p className="text-xs text-slate-600">{partner.name} · la personne recevra un lien pour définir son mot de passe.</p></div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-white" aria-label="Fermer"><X className="h-4 w-4" /></button>
      </div>
      {created ? (
        <div className="rounded-xl border border-emerald-200 bg-white p-3 text-sm">
          <p className="font-semibold text-emerald-800">Compte créé pour {created.email}.</p>
          {created.email_sent ? <p className="mt-1 text-xs text-slate-600">L’e-mail d’accès a été envoyé. La personne pourra définir son mot de passe avec le lien reçu.</p> : <><p className="mt-1 text-xs text-rose-700">Le compte est créé, mais l’e-mail n’a pas pu être envoyé. Transmettez ce lien à la personne pour qu’elle définisse son mot de passe :</p><div className="mt-2 flex gap-2"><input readOnly className="input min-w-0 flex-1 text-xs" value={created.invite_link || "Lien indisponible"} /><button type="button" className="btn-ghost border" disabled={!created.invite_link} onClick={() => navigator.clipboard.writeText(created.invite_link)}>Copier</button></div></>}
          <button type="button" onClick={onClose} className="btn-primary mt-3">Terminé</button>
        </div>
      ) : (
        <form onSubmit={createAccount} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label><span className="mb-1 block text-xs font-bold text-slate-600">Nom complet</span><input required className="input" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nom de la personne" /></label>
          <label><span className="mb-1 block text-xs font-bold text-slate-600">Adresse e-mail</span><input required type="email" className="input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nom@exemple.com" /></label>
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50"><Mail className="h-4 w-4" />{saving ? "Création…" : "Créer et inviter"}</button>
          {error && <p role="alert" className="text-xs font-semibold text-rose-700 sm:col-span-3">{error}</p>}
        </form>
      )}
    </section>
  );
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSize(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function StatCard({ icon: Icon, label, value, tone = "orange" }) {
  const tones = {
    orange: "border-orange-200 from-orange-50 to-white text-orange-700",
    blue: "border-sky-200 from-sky-50 to-white text-sky-700",
    green: "border-emerald-200 from-emerald-50 to-white text-emerald-700",
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-3.5 shadow-sm ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">
        <Icon className="h-4 w-4 text-current" />{label}
      </div>
      <p className="mt-1.5 text-2xl font-extrabold leading-tight text-slate-900">{value}</p>
    </div>
  );
}

export default function GOTO27() {
  const toast = useToast();
  const confirm = useConfirm();
  const { user, isAdmin, isPartner } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [partnerFilter, setPartnerFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [contactPartner, setContactPartner] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const requests = [api.get("/goto27/documents")];
      if (isAdmin) requests.push(api.get("/goto27/partners"));
      const [docsResponse, partnersResponse] = await Promise.all(requests);
      setDocuments(Array.isArray(docsResponse.data) ? docsResponse.data : []);
      if (isAdmin) setPartners(Array.isArray(partnersResponse.data) ? partnersResponse.data : []);
    } catch (error) {
      setDocuments([]);
      toast.error(error.response?.data?.error || "Impossible de charger les documents.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return documents.filter((document) => {
      if (isAdmin && partnerFilter !== "all" && String(document.partner_id) !== partnerFilter) return false;
      if (!query) return true;
      return [document.title, document.filename, document.description, document.partner_name, document.uploader_name]
        .some((value) => String(value || "").toLocaleLowerCase("fr").includes(query));
    });
  }, [documents, isAdmin, partnerFilter, search]);

  const groupedDocuments = useMemo(() => {
    if (!isAdmin) return [];
    const query = search.trim().toLocaleLowerCase("fr");
    const groups = new Map(
      partners
        .filter((partner) => partnerFilter === "all" || String(partner.id) === partnerFilter)
        .filter((partner) => !query || String(partner.name || "").toLocaleLowerCase("fr").includes(query))
        .map((partner) => [String(partner.id), { id: partner.id, name: partner.name, accounts: partner.accounts || [], documents: [] }])
    );
    filteredDocuments.forEach((document) => {
      const key = String(document.partner_id);
      if (!groups.has(key)) groups.set(key, { id: document.partner_id, name: document.partner_name, accounts: [], documents: [] });
      groups.get(key).documents.push(document);
    });
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [filteredDocuments, isAdmin, partners, partnerFilter, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, partner_id: isPartner ? String(user?.partner_id || "") : "" });
    setFormOpen(true);
  };

  const openCreateForPartner = (partnerId) => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, partner_id: String(partnerId) });
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openEdit = (document) => {
    setEditingId(document.id);
    setForm({ title: document.title || "", description: document.description || "", partner_id: String(document.partner_id), file: null });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const saveDocument = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return toast.error("Donnez un titre au document.");
    if (!editingId && !form.file) return toast.error("Choisissez un fichier à déposer.");
    if (form.file && form.file.size > MAX_FILE_BYTES) return toast.error("Le fichier dépasse la limite de 25 Mo.");
    if (isAdmin && !form.partner_id) return toast.error("Sélectionnez le partenaire concerné.");

    const payload = new FormData();
    payload.append("title", form.title.trim());
    payload.append("description", form.description.trim());
    if (isAdmin) payload.append("partner_id", form.partner_id);
    if (form.file) payload.append("file", form.file);

    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/goto27/documents/${editingId}`, payload);
        toast.success("Document modifié.");
      } else {
        await api.post("/goto27/documents", payload);
        toast.success("Document déposé.");
      }
      closeForm();
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || "Impossible d'enregistrer le document.");
    } finally {
      setSaving(false);
    }
  };

  const downloadDocument = async (document) => {
    try {
      const response = await api.get(`/goto27/documents/${document.id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.filename;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.response?.data?.error || "Le téléchargement a échoué.");
    }
  };

  const deleteDocument = async (document) => {
    const accepted = await confirm({
      title: `Supprimer « ${document.title} » ?`,
      body: "Le fichier sera définitivement retiré de GOTO27.",
      destructive: true,
    });
    if (!accepted) return;
    try {
      await api.delete(`/goto27/documents/${document.id}`);
      toast.success("Document supprimé.");
      await loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || "Impossible de supprimer ce document.");
    }
  };

  const documentCard = (document) => (
    <article key={document.id} className="group flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-orange-200 hover:shadow-md sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700 ring-1 ring-orange-100"><FileText className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-slate-900">{document.title}</h3>
          <p className="mt-0.5 truncate text-xs text-slate-500" title={document.filename}>{document.filename} · {formatSize(document.file_size)}</p>
          {document.description && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{document.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500">
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-orange-500" />Déposé le {formatDate(document.created_at)}</span>
            <span>{isAdmin ? `Déposé par ${document.uploader_name}` : "Mon document"}</span>
            {document.updated_at && new Date(document.updated_at).getTime() > new Date(document.created_at).getTime() + 1000 && <span>Modifié le {formatDate(document.updated_at)}</span>}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
        <button type="button" onClick={() => downloadDocument(document)} title="Télécharger" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"><Download className="h-4 w-4" /></button>
        <button type="button" onClick={() => openEdit(document)} title="Modifier le document" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"><Pencil className="h-4 w-4" /></button>
        <button type="button" onClick={() => deleteDocument(document)} title="Supprimer le document" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>
      </div>
    </article>
  );

  const statsPartnerCount = partners.length;

  return (
    <div className="space-y-5 pb-8">
      <header className="relative isolate w-full overflow-hidden rounded-[20px] bg-slate-950 px-4 py-4 text-white shadow-lg shadow-slate-900/10 sm:px-6">
        <div className="absolute -right-12 -top-20 -z-10 h-72 w-72 rounded-full bg-orange-500/30 blur-3xl" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-orange-200"><FolderLock className="h-5 w-5" /></span>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-300">Espace documentaire privé</p><h1 className="mt-0.5 text-2xl font-bold tracking-tight">GOTO27</h1><p className="mt-0.5 text-xs text-slate-300">Les documents utiles, accessibles aux bonnes personnes.</p></div>
          </div>
          <button type="button" onClick={formOpen ? closeForm : openCreate} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-950/20 transition hover:bg-orange-400">
            {formOpen ? <X className="h-4 w-4" /> : <Upload className="h-4 w-4" />}{formOpen ? "Fermer" : "Déposer un document"}
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={FileText} label="Documents" value={documents.length} tone="orange" />
        {isAdmin && <StatCard icon={Building2} label="Partenaires concernés" value={statsPartnerCount} tone="blue" />}
        <StatCard icon={ShieldCheck} label="Espace" value={isAdmin ? "Administrateur" : "Privé"} tone="green" />
      </section>

      {formOpen && (
        <form onSubmit={saveDocument} className="space-y-4 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50/70 to-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2 border-b border-orange-100 pb-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-700"><Upload className="h-4 w-4" /></span><div><h2 className="text-sm font-bold text-slate-900">{editingId ? "Modifier le document" : "Déposer un document"}</h2><p className="text-xs text-slate-600">PDF, Word, Excel, PowerPoint, CSV, TXT ou image · 25 Mo maximum</p></div></div>
          {isAdmin && (
            <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Partenaire concerné <span className="text-orange-600">*</span></span><select required className="select" value={form.partner_id} onChange={(event) => setForm({ ...form, partner_id: event.target.value })}><option value="">Choisir un partenaire</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Nom du document <span className="text-orange-600">*</span></span><input required className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex. Convention de partenariat" /></label>
            <label><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Fichier {editingId ? "(facultatif pour remplacer)" : <span className="text-orange-600">*</span>}</span><input required={!editingId} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg" className="block w-full rounded-xl border border-slate-200 bg-white text-sm text-slate-600 file:mr-3 file:border-0 file:bg-orange-100 file:px-3 file:py-2.5 file:text-xs file:font-bold file:text-orange-800 hover:file:bg-orange-200" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })} /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Description ou note</span><textarea rows={2} className="input" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Précisez le contenu ou la période concernée…" /></label>
          </div>
          {form.file && <p className="flex items-center gap-1.5 text-xs font-semibold text-orange-800"><HardDrive className="h-3.5 w-3.5" />{form.file.name} · {formatSize(form.file.size)}</p>}
          <div className="flex justify-end gap-2 border-t border-orange-100 pt-3"><button type="button" onClick={closeForm} className="btn-ghost border border-slate-200 bg-white">Annuler</button><button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "Enregistrement…" : editingId ? "Enregistrer" : "Déposer le document"}</button></div>
        </form>
      )}

      {contactPartner && isAdmin && <AdminPinGate><AddPartnerContactForm partner={contactPartner} onClose={() => setContactPartner(null)} onCreated={(account) => {
        if (account.email_sent) toast.success(`Compte créé et invitation envoyée à ${account.email}.`);
        else toast.error(`Compte créé, mais l’e-mail à ${account.email} n’a pas pu être envoyé. Le lien d’invitation est affiché ci-dessous.`);
        loadData();
      }} /></AdminPinGate>}

      <section className="flex flex-col gap-3 rounded-2xl border border-orange-100 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:p-4">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un document, un fichier…" className="input !pl-10" /></div>
        {isAdmin && <select aria-label="Filtrer par partenaire" className="select sm:max-w-xs" value={partnerFilter} onChange={(event) => setPartnerFilter(event.target.value)}><option value="all">Tous les partenaires</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select>}
        <span className="shrink-0 rounded-full bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-900">{filteredDocuments.length} fichier{filteredDocuments.length === 1 ? "" : "s"}</span>
      </section>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Chargement des documents…</div>
      ) : isAdmin && groupedDocuments.length > 0 ? (
        <div className="space-y-4">
          {groupedDocuments.map((group) => (
            <section key={group.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 shadow-sm">
              <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><Building2 className="h-4 w-4" /></span><div className="min-w-0"><h2 className="truncate text-sm font-extrabold text-slate-900">{group.name}</h2><p className="text-[11px] text-slate-500">Espace documentaire privé</p></div></div>
                <div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-extrabold text-sky-800">{group.documents.length}</span><button type="button" onClick={() => openCreateForPartner(group.id)} title={`Déposer un document pour ${group.name}`} aria-label={`Déposer un document pour ${group.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white transition hover:bg-orange-600"><Plus className="h-4 w-4" /></button><button type="button" onClick={() => setContactPartner(group)} title={`Ajouter un accès pour ${group.name}`} aria-label={`Ajouter un accès pour ${group.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 text-orange-700 transition hover:bg-orange-100"><Users className="h-4 w-4" /></button></div>
              </header>
              <div className="space-y-3 p-3">
                <div className="rounded-xl border border-sky-100 bg-white px-3 py-2.5">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-sky-800"><Users className="h-3.5 w-3.5" />Accès partenaires <span className="rounded-full bg-sky-100 px-1.5 py-0.5">{group.accounts.length}</span></div>
                  {group.accounts.length ? <div className="flex flex-wrap gap-2">{group.accounts.map((account) => <span key={account.id} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs text-slate-700"><span className="font-semibold">{account.full_name || account.email}</span>{account.full_name && <span className="text-slate-500">· {account.email}</span>}</span>)}</div> : <p className="text-xs text-slate-500">Aucun compte partenaire ajouté.</p>}
                </div>
                {group.documents.length ? group.documents.map(documentCard) : <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-3 py-5 text-center text-xs font-medium text-slate-500">Aucun document déposé pour ce partenaire.</p>}
              </div>
            </section>
          ))}
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/30 p-10 text-center"><FolderLock className="mx-auto h-9 w-9 text-orange-300" /><h2 className="mt-3 font-bold text-slate-900">{documents.length ? "Aucun document trouvé" : "Aucun document pour le moment"}</h2><p className="mt-1 text-sm text-slate-600">{documents.length ? "Essayez une autre recherche ou un autre partenaire." : "Déposez vos documents ici. Seules les personnes autorisées pourront les consulter."}</p>{!documents.length && <button type="button" onClick={openCreate} className="btn-primary mt-4"><Plus className="h-4 w-4" />Déposer un document</button>}</div>
      ) : (
        <div className="space-y-2">{filteredDocuments.map(documentCard)}</div>
      )}
    </div>
  );
}
