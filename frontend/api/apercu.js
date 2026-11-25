/**
 * L'aperçu d'un lien partagé — formulaire ou émargement.
 *
 * WhatsApp, Facebook, LinkedIn, Telegram… composent la miniature d'un lien à
 * partir de la page qu'ils reçoivent, sans exécuter de JavaScript. Le site leur
 * servait la même coquille pour toutes les adresses, avec les balises de la
 * page d'accueil : le lien d'un formulaire s'affichait comme la page d'accueil.
 *
 * vercel.json envoie ici ces robots-là, et eux seuls (reconnus à leur
 * « User-Agent ») : les visiteurs reçoivent l'application comme avant. On leur
 * rend une page minuscule, dont seules comptent les balises Open Graph — le
 * titre du formulaire, sa description, son image d'en-tête.
 *
 * Si l'API ne répond pas, on rend quand même une page correcte, avec les
 * balises du site : un aperçu générique vaut mieux qu'aucun.
 */

const SITE_NOM = "Inside ODC Sénégal";
const DESCRIPTION_SITE =
  "Formations, ateliers et accompagnement aux métiers du numérique à l'Orange Digital Center.";

const echapper = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const dateLongue = (d) => {
  if (!d) return "";
  const x = new Date(`${String(d).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(x.getTime())) return "";
  return x.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

async function lireJson(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/* Ce que l'aperçu dira, selon le type de lien. */
export async function contenuApercu({ type, id, api }) {
  if (!api || !id) return null;
  if (type === "f") {
    const f = await lireJson(`${api}/forms/public/${encodeURIComponent(id)}/apercu`);
    if (!f?.titre) return null;
    return {
      titre: String(f.titre).trim(),
      description: f.description || "Formulaire en ligne — Orange Digital Center.",
      image: f.image || null,
      chemin: `/f/${encodeURIComponent(id)}`,
      action: "Ouvrir le formulaire",
    };
  }
  if (type === "checkin") {
    const a = await lireJson(`${api}/checkin/${encodeURIComponent(id)}`);
    if (!a?.title) return null;
    const details = [dateLongue(a.activity_date), a.location, a.partner_name && `avec ${a.partner_name}`]
      .filter(Boolean)
      .join(" · ");
    return {
      titre: String(a.title).trim(),
      description: `Émargement${details ? ` — ${details}` : ""}. Enregistrez votre présence en un instant.`,
      image: null,
      chemin: `/checkin/${encodeURIComponent(id)}`,
      action: "Émarger",
    };
  }
  return null;
}

export function pageApercu({ site, contenu, chemin }) {
  const url = `${site}${contenu?.chemin || chemin || "/"}`;
  const titre = contenu?.titre || SITE_NOM;
  const description = contenu?.description || DESCRIPTION_SITE;
  const image = contenu?.image || `${site}/og.png`;
  const imageDuSite = !contenu?.image;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${echapper(titre)} — ${echapper(SITE_NOM)}</title>
<meta name="description" content="${echapper(description)}" />
<link rel="canonical" href="${echapper(url)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${echapper(SITE_NOM)}" />
<meta property="og:locale" content="fr_SN" />
<meta property="og:url" content="${echapper(url)}" />
<meta property="og:title" content="${echapper(titre)}" />
<meta property="og:description" content="${echapper(description)}" />
<meta property="og:image" content="${echapper(image)}" />
${imageDuSite ? '<meta property="og:image:width" content="1200" />\n<meta property="og:image:height" content="630" />\n' : ""}<meta property="og:image:alt" content="${echapper(titre)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${echapper(titre)}" />
<meta name="twitter:description" content="${echapper(description)}" />
<meta name="twitter:image" content="${echapper(image)}" />
</head>
<body>
<h1>${echapper(titre)}</h1>
<p>${echapper(description)}</p>
<p><a href="${echapper(url)}">${echapper(contenu?.action || "Ouvrir")}</a></p>
</body>
</html>`;
}

export default async function handler(req, res) {
  const type = String(req.query?.type || "");
  const id = String(req.query?.id || "").slice(0, 200);
  const hote = String(req.headers["x-forwarded-host"] || req.headers.host || "inside-odc.com").split(",")[0].trim();
  const site = `https://${hote}`;
  const api = String(process.env.VITE_API_URL || "").replace(/\/+$/, "");
  const contenu = await contenuApercu({ type, id, api });
  const chemin = type === "f" ? `/f/${encodeURIComponent(id)}` : type === "checkin" ? `/checkin/${encodeURIComponent(id)}` : "/";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  /* Court : un titre corrigé doit se voir au partage suivant. */
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
  res.statusCode = 200;
  res.end(pageApercu({ site, contenu, chemin }));
}
