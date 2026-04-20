import { Palette } from "lucide-react";

export default function FormBrandingPanel({ settings, title, description, onChange }) {
  const set = (patch) => onChange({ ...settings, ...patch });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <p className="font-medium text-slate-900 inline-flex items-center gap-2">
          <Palette className="w-4 h-4 text-orange-500" />
          Branding / Theme
        </p>

        <div>
          <label className="text-xs text-slate-500">Couleur principale</label>
          <input
            type="color"
            className="input mt-1 h-10 p-1"
            value={settings?.primary_color || "#0f766e"}
            onChange={(e) => set({ primary_color: e.target.value })}
          />
        </div>

        <div>
          <label className="text-xs text-slate-500">Logo URL</label>
          <input
            className="input mt-1"
            value={settings?.logo_url || ""}
            onChange={(e) => set({ logo_url: e.target.value })}
          />
        </div>

        <div>
          <label className="text-xs text-slate-500">Image d&apos;entete (upload)</label>
          <input
            type="file"
            accept="image/*"
            className="input mt-1"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (!file.type.startsWith("image/")) {
                alert("Veuillez choisir une image.");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => set({ header_image_url: String(reader.result || "") });
              reader.readAsDataURL(file);
              e.target.value = "";
            }}
          />
        </div>

        <div>
          <label className="text-xs text-slate-500">Image d&apos;entete (URL)</label>
          <input
            className="input mt-1"
            value={settings?.header_image_url || ""}
            onChange={(e) => set({ header_image_url: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Ouverture (date/heure)</label>
            <input
              type="datetime-local"
              className="input mt-1"
              value={settings?.open_at || ""}
              onChange={(e) => set({ open_at: e.target.value || null })}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Fermeture (date/heure)</label>
            <input
              type="datetime-local"
              className="input mt-1"
              value={settings?.close_at || ""}
              onChange={(e) => set({ close_at: e.target.value || null })}
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500">Texte bouton envoi</label>
          <input
            className="input mt-1"
            value={settings?.submit_label || ""}
            onChange={(e) => set({ submit_label: e.target.value })}
          />
        </div>

        <div>
          <label className="text-xs text-slate-500">Message succes</label>
          <textarea
            className="input mt-1 min-h-20"
            value={settings?.success_message || ""}
            onChange={(e) => set({ success_message: e.target.value })}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="font-medium text-slate-900 mb-3">Apercu rapide</p>
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          {settings?.header_image_url ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <img
                src={settings.header_image_url}
                alt="Entete formulaire"
                className="h-24 w-full object-cover"
              />
            </div>
          ) : null}
          <p className="text-sm font-semibold text-slate-900">
            {title || "Titre du formulaire"}
          </p>
          <p className="text-xs text-slate-500">
            {description || "Description du formulaire"}
          </p>
          <button
            type="button"
            className="btn-primary w-full"
            style={{
              backgroundColor: settings?.primary_color || "#0f766e",
              borderColor: settings?.primary_color || "#0f766e",
            }}
          >
            {settings?.submit_label || "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}
