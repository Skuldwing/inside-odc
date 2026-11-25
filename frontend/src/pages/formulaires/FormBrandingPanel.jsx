import { useRef, useState } from "react";
import { Palette, Upload, Image as ImageIcon, X, Loader2, Link2 } from "lucide-react";

/* Une image téléversée telle quelle pèse souvent plusieurs mégaoctets. Elle
   alourdissait chaque ouverture du formulaire, WhatsApp renonçait à l'afficher
   en miniature, et au-delà d'un mégaoctet le formulaire ne s'enregistrait même
   plus. On la ramène à une largeur raisonnable, en JPEG — ou en PNG pour un
   logo, qui a souvent un fond transparent — et l'on resserre jusqu'à passer
   sous un plafond. Un GIF, ou une image déjà légère, passe telle quelle. */
/* Image et logo réunis doivent tenir sous la limite d'1 Mo du serveur. */
export const PLAFOND_IMAGE = 450 * 1024;
export const PLAFOND_LOGO = 180 * 1024;

export async function imageAllegee(file, largeurMax = 1200, qualite = 0.82, format = "image/jpeg", plafond = PLAFOND_IMAGE) {
  const brute = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  if (file.type === "image/gif" || brute.length <= Math.min(plafond, 200 * 1024)) return brute;
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = brute;
    });
    let largeur = Math.min(largeurMax, img.naturalWidth);
    let q = qualite;
    let sortie = brute;
    for (let essai = 0; essai < 5; essai += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(largeur);
      canvas.height = Math.round((img.naturalHeight * largeur) / img.naturalWidth);
      const ctx = canvas.getContext("2d");
      if (format === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      sortie = canvas.toDataURL(format, q);
      if (sortie.length <= plafond) break;
      if (format === "image/jpeg" && q > 0.6) q -= 0.12;
      else largeur *= 0.8;
    }
    return sortie.length < brute.length ? sortie : brute;
  } catch {
    return brute;
  }
}

const PRESET_COLORS = [
  "#0f766e", "#0369a1", "#7c3aed", "#db2777",
  "#DE6A00", "#16a34a", "#ca8a04", "#374151",
];

/* Comment l'image se pose sur le formulaire. */
const MODES_IMAGE = [
  { value: "bandeau", label: "Bandeau", aide: "En tête du formulaire, recadrée en bande." },
  { value: "affiche", label: "Affiche", aide: "Entière, au-dessus du formulaire — pour un visuel à lire en entier." },
  { value: "fond", label: "Fond de scène", aide: "Derrière le formulaire, sur toute la page." },
];

/* Téléverser d'abord ; coller un lien reste possible, en second. */
function ChampImage({ id, libelle, valeur, onChange, largeurMax, format, plafond, aide }) {
  const entree = useRef(null);
  const [enCours, setEnCours] = useState(false);
  const [lien, setLien] = useState(false);
  const estLien = /^https?:\/\//i.test(valeur || "");

  const choisir = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setEnCours(true);
    try {
      onChange(await imageAllegee(file, largeurMax, 0.82, format, plafond));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-slate-500">{libelle}</label>
      {valeur ? (
        <div className="mt-1 flex items-center gap-3 rounded-xl border border-slate-200 p-2">
          <img src={valeur} alt="" className="h-14 w-20 shrink-0 rounded-lg bg-slate-50 object-contain" />
          <div className="min-w-0 flex-1 text-xs text-slate-500">
            {estLien ? <span className="block truncate">{valeur}</span> : "Image téléversée"}
          </div>
          <button type="button" onClick={() => entree.current?.click()} className="text-xs font-medium text-orange-700 hover:underline">
            Remplacer
          </button>
          <button type="button" onClick={() => onChange("")} className="icon-btn h-7 w-7" aria-label={`Retirer ${libelle.toLowerCase()}`}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => entree.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); choisir(e.dataTransfer.files?.[0]); }}
          className="mt-1 flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-xs text-slate-600 transition hover:border-orange-300 hover:bg-orange-50/40"
        >
          {enCours ? <Loader2 className="h-5 w-5 animate-spin text-orange-500" /> : <Upload className="h-5 w-5 text-orange-500" />}
          <span className="font-semibold text-slate-700">{enCours ? "Préparation de l'image…" : "Téléverser une image"}</span>
          <span className="text-slate-500">{aide}</span>
        </button>
      )}
      <input
        id={id}
        ref={entree}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; choisir(f); }}
      />
      {!valeur && (
        lien ? (
          <input
            className="input mt-2 text-sm"
            placeholder="https://…"
            autoFocus
            onBlur={(e) => { if (e.target.value.trim()) onChange(e.target.value.trim()); else setLien(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
          />
        ) : (
          <button type="button" onClick={() => setLien(true)} className="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-orange-700">
            <Link2 className="h-3 w-3" /> ou coller un lien
          </button>
        )
      )}
    </div>
  );
}

export default function FormBrandingPanel({ settings, title, description, onChange }) {
  const set = (patch) => onChange({ ...settings, ...patch });
  const mode = settings?.image_mode || "bandeau";
  const couleur = settings?.primary_color || "#0f766e";
  const image = settings?.header_image_url;

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
                value={couleur}
                onChange={(e) => set({ primary_color: e.target.value })}
                title="Couleur personnalisee"
              />
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">Couleur actuelle : <span className="font-mono">{couleur}</span></p>
        </div>

        {/* Image : affiche, bandeau ou fond de scène */}
        <ChampImage
          id="image-formulaire"
          libelle="Image du formulaire"
          valeur={image}
          onChange={(v) => set({ header_image_url: v })}
          largeurMax={mode === "fond" ? 1600 : 1200}
          format="image/jpeg"
          plafond={PLAFOND_IMAGE}
          aide="Affiche, visuel de l'événement, photo… (JPEG, PNG)"
        />
        {image && (
          <div>
            <p className="text-xs font-medium text-slate-500">Affichage de l&apos;image</p>
            <div className="mt-1 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Affichage de l'image">
              {MODES_IMAGE.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.value}
                  onClick={() => set({ image_mode: m.value })}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                    mode === m.value ? "border-orange-500 bg-orange-50 text-orange-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">{MODES_IMAGE.find((m) => m.value === mode)?.aide}</p>
          </div>
        )}

        {/* Logo */}
        <ChampImage
          id="logo-formulaire"
          libelle="Logo"
          valeur={settings?.logo_url}
          onChange={(v) => set({ logo_url: v })}
          largeurMax={600}
          format="image/png"
          plafond={PLAFOND_LOGO}
          aide="PNG avec fond transparent de préférence"
        />

        {/* Texte bouton */}
        <div>
          <label className="text-xs font-medium text-slate-500">Texte du bouton d&apos;envoi</label>
          <input className="input mt-1 text-sm" value={settings?.submit_label || ""}
            placeholder="Envoyer" onChange={(e) => set({ submit_label: e.target.value })} />
        </div>
      </div>

      {/* Aperçu */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="font-medium text-slate-900 mb-3 text-sm inline-flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-orange-500" /> Aperçu rapide
        </p>
        <div
          className="police-formulaire overflow-hidden rounded-xl border border-slate-100 bg-cover bg-center"
          style={image && mode === "fond" ? { backgroundImage: `url("${image}")`, padding: "14px" } : undefined}
        >
          <div className={image && mode === "fond" ? "overflow-hidden rounded-lg bg-white/95 shadow" : ""}>
            {image && mode === "bandeau" && <img src={image} alt="" className="h-24 w-full object-cover" />}
            {image && mode === "affiche" && <img src={image} alt="" className="block h-auto w-full" />}
            {!image && <div className="h-12 w-full" style={{ backgroundColor: couleur, opacity: 0.15 }} />}
            <div className="p-4 space-y-2">
              {settings?.logo_url && (
                <img src={settings.logo_url} alt="Logo" className="h-8 object-contain" />
              )}
              <p className="font-semibold text-slate-900 text-sm">{title || "Titre du formulaire"}</p>
              <p className="text-xs text-slate-500">{description || "Description du formulaire"}</p>
              <div className="h-px bg-slate-100 my-2" />
              <button type="button" className="w-full rounded-lg py-2 text-white text-sm font-medium"
                style={{ backgroundColor: couleur }}>
                {settings?.submit_label || "Envoyer"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
