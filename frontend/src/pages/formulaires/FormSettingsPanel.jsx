import { Settings, Mail, Users, Link, ToggleLeft, ToggleRight } from "lucide-react";

export default function FormSettingsPanel({ settings, onChange }) {
  const set = (patch) => onChange({ ...settings, ...patch });

  return (
    <div className="space-y-5">

      {/* Limite de réponses */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <p className="font-medium text-slate-900 inline-flex items-center gap-2">
          <Users className="w-4 h-4 text-orange-500" />
          Controle des reponses
        </p>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Nombre maximum de reponses
          </label>
          <p className="text-xs text-slate-400 mt-0.5">
            Mettre 0 pour illimite. Le formulaire se ferme automatiquement.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="number"
              min={0}
              className="input w-32 text-sm"
              value={settings?.max_submissions ?? 0}
              onChange={(e) => set({ max_submissions: Math.max(0, Number(e.target.value) || 0) })}
            />
            <span className="text-sm text-slate-500">
              {(settings?.max_submissions ?? 0) === 0 ? "Illimite" : `reponses max`}
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Une seule reponse par email
              </label>
              <p className="text-xs text-slate-400 mt-0.5">
                Bloque les doublons si le formulaire a un champ Email.
              </p>
            </div>
            <button
              type="button"
              onClick={() => set({ one_per_email: !settings?.one_per_email })}
              className="flex-shrink-0"
            >
              {settings?.one_per_email ? (
                <ToggleRight className="w-8 h-8 text-orange-500" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-slate-300" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <p className="font-medium text-slate-900 inline-flex items-center gap-2">
          <Mail className="w-4 h-4 text-orange-500" />
          Notifications
        </p>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Email de notification
          </label>
          <p className="text-xs text-slate-400 mt-0.5">
            Recevez un email a chaque nouvelle reponse. Laisser vide pour desactiver.
          </p>
          <input
            type="email"
            className="input mt-2 text-sm"
            value={settings?.notification_email || ""}
            placeholder="admin@example.com"
            onChange={(e) => set({ notification_email: e.target.value })}
          />
        </div>
      </div>

      {/* Après soumission */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <p className="font-medium text-slate-900 inline-flex items-center gap-2">
          <Link className="w-4 h-4 text-orange-500" />
          Apres la soumission
        </p>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Redirection (URL)
          </label>
          <p className="text-xs text-slate-400 mt-0.5">
            Si renseigne, redirige vers cette URL apres envoi. Sinon affiche le message de succes.
          </p>
          <input
            type="url"
            className="input mt-2 text-sm"
            value={settings?.redirect_url || ""}
            placeholder="https://example.com/merci"
            onChange={(e) => set({ redirect_url: e.target.value })}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">
            Message de succes
          </label>
          <p className="text-xs text-slate-400 mt-0.5">
            Affiche si aucune URL de redirection n&apos;est definie.
          </p>
          <textarea
            className="input mt-2 min-h-[80px] text-sm"
            value={settings?.success_message || ""}
            placeholder="Merci, votre reponse a bien ete enregistree."
            onChange={(e) => set({ success_message: e.target.value })}
          />
        </div>
      </div>

      {/* Ouverture planifiée */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <p className="font-medium text-slate-900 inline-flex items-center gap-2">
          <Settings className="w-4 h-4 text-orange-500" />
          Disponibilite planifiee
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500">Ouverture</label>
            <input
              type="datetime-local"
              className="input mt-1 text-sm"
              value={settings?.open_at || ""}
              onChange={(e) => set({ open_at: e.target.value || null })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Fermeture</label>
            <input
              type="datetime-local"
              className="input mt-1 text-sm"
              value={settings?.close_at || ""}
              onChange={(e) => set({ close_at: e.target.value || null })}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Laisser vide = toujours ouvert (tant que le statut est Actif).
        </p>
      </div>
    </div>
  );
}
