import { Palette } from "lucide-react";

const PRESET_COLORS = [
  "#0f766e", "#0369a1", "#7c3aed", "#db2777",
  "#ea580c", "#16a34a", "#ca8a04", "#374151",
];

export default function FormBrandingPanel({ settings, title, description, onChange }) {
  const set = (patch) => onChange({ ...settings, ...patch });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <p className="font-medium text-slate-900 inline-flex items-center gap-2">
          <Palette className="w-4 h-4 text-orange-500" />
          Branding / Theme
        </p>

        {/* Couleur principale */}
        <div>
          <label className="text-xs font-medium text-slate-500">Couleur principale</label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${settings?.primary_color === c ? "border-slate-800 scale-110" : "border-transparent"}`}
                style={{ backgroundColor: c }}
                onClick={() => set({ primary_color: c })}
                title={c}
              />
            ))}
            <div className="relative">
              <input
                type="color"
                className="w-7 h-7 rounded-full cursor-pointer border border-slate-200 p-0.5"
                value={settings?.primary_color || "#0f766e"}
                onChange={(e) => set({ primary_color: e.target.value })}
                title="Couleur personnalisee"
              />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Couleur actuelle : <span className="font-mono">{settings?.primary_color || "#0f766e"}</span></p>
        </div>

        {/* Logo */}
        <div>
          <label className="text-xs font-medium text-slate-500">Logo URL</label>
          <input className="input mt-1 text-sm" value={settings?.logo_url || ""}
            placeholder="https://..." onChange={(e) => set({ logo_url: e.target.value })} />
        </div>

        {/* Image d'entête */}
        <div>
          <label className="text-xs font-medium text-slate-500">Image d&apos;entete</label>
          <div className="mt-1 flex gap-2">
            <input className="input flex-1 text-sm" value={settings?.header_image_url || ""}
              placeholder="URL de l'image..." onChange={(e) => set({ header_image_url: e.target.value })} />
          </div>
          <div className="mt-2">
            <label className="text-xs text-slate-400 cursor-pointer hover:text-orange-600">
              ou uploader une image locale :
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file || !file.type.startsWith("image/")) return;
                  const reader = new FileReader();
                  reader.onload = () => set({ header_image_url: String(reader.result || "") });
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }} />
            </label>
          </div>
        </div>

        {/* Texte bouton */}
        <div>
          <label className="text-xs font-medium text-slate-500">Texte du bouton d&apos;envoi</label>
          <input className="input mt-1 text-sm" value={settings?.submit_label || ""}
            placeholder="Envoyer" onChange={(e) => set({ submit_label: e.target.value })} />
        </div>
      </div>

      {/* Aperçu */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="font-medium text-slate-900 mb-3 text-sm">Apercu rapide</p>
        <div className="rounded-xl border border-slate-100 overflow-hidden">
          {settings?.header_image_url ? (
            <img src={settings.header_image_url} alt="Entete" className="h-24 w-full object-cover" />
          ) : (
            <div className="h-12 w-full" style={{ backgroundColor: settings?.primary_color || "#0f766e", opacity: 0.15 }} />
          )}
          <div className="p-4 space-y-2">
            {settings?.logo_url && (
              <img src={settings.logo_url} alt="Logo" className="h-8 object-contain" />
            )}
            <p className="font-semibold text-slate-900 text-sm">{title || "Titre du formulaire"}</p>
            <p className="text-xs text-slate-500">{description || "Description du formulaire"}</p>
            <div className="h-px bg-slate-100 my-2" />
            <button type="button" className="w-full rounded-lg py-2 text-white text-sm font-medium"
              style={{ backgroundColor: settings?.primary_color || "#0f766e" }}>
              {settings?.submit_label || "Envoyer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
