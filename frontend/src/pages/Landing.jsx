import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Code2,
  GraduationCap,
  Lightbulb,
  LogIn,
  Rocket,
  School,
  Sparkles,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import ODCLogo from "../components/branding/ODCLogo";
import { useAuth } from "../auth/useAuth";
import { suivreAudience } from "../analytics/audience";
import { useMeta, PAGES } from "../seo/meta";
import { HERO, CENTRE, POLES, PUBLICS, FINAL, EDITEUR } from "../content/centre";
import "../styles/landing.css";

/* Les textes du centre vivent dans content/centre.js, et nulle part ailleurs.

   Ils en sont sortis parce qu'une version statique de cette page est écrite
   dans le document au moment de la construction, pour les robots qui
   n'exécutent pas de JavaScript — WhatsApp et Facebook quand ils composent
   l'aperçu d'un lien partagé, et la plupart des robots des moteurs par
   intelligence artificielle. Le greffon qui la produit lit ce même fichier :
   les deux versions ne peuvent donc pas diverger.

   Ne restent ici que les icônes, qui sont du dessin et non du texte. */
const ICONES_POLE = {
  code: Code2,
  fablab: Wrench,
  accelerateur: Rocket,
  investissement: TrendingUp,
};

const ICONES_PUBLIC = {
  formation: GraduationCap,
  projet: Lightbulb,
  scolaires: School,
};

/* Revele les elements au defilement. Un seul observateur pour toute la page,
   et les elements observes ne le sont plus une fois apparus. */
function useRevelation() {
  useEffect(() => {
    const cibles = document.querySelectorAll("[data-reveal]");
    if (!cibles.length) return;

    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduit) {
      cibles.forEach((el) => el.classList.add("lp-visible"));
      return;
    }

    const observateur = new IntersectionObserver(
      (entrees) => {
        entrees.forEach((entree) => {
          if (!entree.isIntersecting) return;
          entree.target.classList.add("lp-visible");
          observateur.unobserve(entree.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
    );

    cibles.forEach((el) => observateur.observe(el));
    return () => observateur.disconnect();
  }, []);
}

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const [enHaut, setEnHaut] = useState(true);
  const heroRef = useRef(null);

  useRevelation();

  /* Mesure d'audience : combien de visites, par ou elles arrivent, jusqu'ou
     elles descendent dans la page, combien de temps elles restent. Aucun
     identifiant de personne n'est envoye, et la synthese n'est lisible que par
     un Admin +. Le detail de ce qui circule est en tete de analytics/audience.js.

     Le montage se fait une seule fois : les dependances sont vides a dessein,
     une visite ne redemarre pas parce qu'un etat de la page a change. */
  useEffect(() => suivreAudience("accueil"), []);

  /* Le titre et la description propres à cette page. Sans cela, toutes les
     adresses du site s'annonçaient « Inside ODC » — dans l'onglet, dans un
     favori, et dans les résultats de recherche. */
  useMeta(PAGES.accueil);

  /* L'en-tete devient opaque des que la page bouge : au-dessus du hero
     sombre, un fond blanc permanent ecraserait l'image. */
  useEffect(() => {
    const onScroll = () => setEnHaut(window.scrollY < 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Halo qui suit le pointeur dans le hero. Ignore sur ecran tactile et quand
     les animations sont reduites : ce n'est qu'un agrement. */
  useEffect(() => {
    const zone = heroRef.current;
    if (!zone) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onMove = (e) => {
      const r = zone.getBoundingClientRect();
      zone.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      zone.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
    };
    zone.addEventListener("pointermove", onMove);
    return () => zone.removeEventListener("pointermove", onMove);
  }, []);

  /* La connexion mise en avant ici est celle des beneficiaires : la page
     d'accueil s'adresse au public, pas a l'equipe. L'acces a la plateforme —
     reserve a l'interne et aux partenaires — reste atteignable depuis
     l'espace, et bien sur directement par /login. */
  const lienApp = isAuthenticated ? "/dashboard" : "/espace";
  const libelleApp = isAuthenticated ? "Accéder à la plateforme" : "Mon espace";

  return (
    <div className="lp">
      {/* ===== EN-TETE ===== */}
      <header className={`lp-header ${enHaut ? "" : "lp-header-fixe"}`}>
        <div className="lp-conteneur lp-header-inner">
          <a href="#top" className="lp-marque" aria-label="Inside ODC Sénégal, accueil">
            <ODCLogo variant="mark" className="h-9 w-9 rounded-xl" />
            <span className="lp-marque-texte">
              <strong>Inside ODC</strong>
              <span>Sénégal</span>
            </span>
          </a>

          <nav className="lp-nav" aria-label="Sections">
            <a href="#centre">Le centre</a>
            <a href="#poles">Les pôles</a>
            <a href="#publics">Pour qui</a>
          </nav>

          {/* « data-audience » : le nom du bouton pour la mesure d'audience.
              Un seul ecouteur delegue les releve tous, et le serveur n'accepte
              que les noms de sa liste. Rien n'est envoye sur la personne qui
              clique — seul le compte du jour est incremente. */}
          <Link
            to={lienApp}
            className="lp-btn lp-btn-primaire lp-btn-connexion"
            data-audience="espace"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            {libelleApp}
          </Link>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="lp-hero" id="top" ref={heroRef}>
        <div className="lp-aurore" aria-hidden="true">
          <span className="lp-blob lp-blob-1" />
          <span className="lp-blob lp-blob-2" />
          <span className="lp-blob lp-blob-3" />
        </div>
        <div className="lp-grille" aria-hidden="true" />
        <div className="lp-halo" aria-hidden="true" />

        <div className="lp-conteneur lp-hero-inner">
          <p className="lp-eyebrow lp-monte" style={{ animationDelay: "80ms" }}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {HERO.surtitre}
          </p>

          <h1 className="lp-titre lp-titre-large">
            <span className="lp-monte" style={{ animationDelay: "160ms" }}>
              {HERO.titre[0]}
            </span>{" "}
            <span className="lp-monte lp-degrade" style={{ animationDelay: "260ms" }}>
              {HERO.titre[1]}
            </span>
          </h1>

          <p className="lp-chapo lp-monte" style={{ animationDelay: "380ms" }}>
            {HERO.chapo}
          </p>

          <div className="lp-actions lp-monte" style={{ animationDelay: "500ms" }}>
            <a
              href="#centre"
              className="lp-btn lp-btn-primaire lp-btn-lg"
              data-audience="decouvrir"
            >
              Découvrir le centre
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <Link
              to={lienApp}
              className="lp-btn lp-btn-fantome lp-btn-lg"
              data-audience="espace-hero"
            >
              {libelleApp}
            </Link>
          </div>

          <div className="lp-defile lp-monte" style={{ animationDelay: "760ms" }} aria-hidden="true">
            <span className="lp-defile-trait" />
          </div>
        </div>
      </section>

      {/* ===== BANDEAU DEFILANT ===== */}
      <div className="lp-bandeau" aria-hidden="true">
        <div className="lp-bandeau-piste">
          {[...Array(2)].map((_, boucle) => (
            <div className="lp-bandeau-groupe" key={boucle}>
              {[
                "Code", "Fabrication numérique", "Entrepreneuriat", "Prototypage",
                "Accompagnement", "Mentorat", "Découverte", "Écosystème",
              ].map((mot) => (
                <span key={mot}>
                  {mot}
                  <i />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ===== LE CENTRE ===== */}
      <section className="lp-section" id="centre">
        <div className="lp-conteneur">
          <div className="lp-manifeste" data-reveal>
            <p className="lp-surtitre">{CENTRE.surtitre}</p>
            {/* Un titre de niveau 2 : cette section était la seule de la page
                sans titre, ce qui laissait un trou dans sa structure pour qui
                la lit sans la voir — un lecteur d'écran, un moteur de
                recherche. */}
            <h2 className="lp-manifeste-texte">{CENTRE.titre}</h2>
            <p className="lp-manifeste-texte lp-manifeste-corps">{CENTRE.texte}</p>
            <p className="lp-manifeste-note">{CENTRE.note}</p>
          </div>
        </div>
      </section>

      {/* ===== LES POLES ===== */}
      <section className="lp-section lp-section-douce" id="poles">
        <div className="lp-conteneur">
          <div className="lp-section-tete" data-reveal>
            <p className="lp-surtitre">{POLES.surtitre}</p>
            <h2 className="lp-h2">{POLES.titre}</h2>
            <p className="lp-texte-section">{POLES.chapo}</p>
          </div>

          <div className="lp-cartes">
            {POLES.items.map((pole, i) => {
              const Icone = ICONES_POLE[pole.cle];
              return (
                <article
                  className="lp-carte lp-carte-pole"
                  key={pole.titre}
                  data-reveal
                  style={{ transitionDelay: `${i * 70}ms` }}
                >
                  <span className="lp-carte-numero" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="lp-carte-icone">
                    <Icone className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3>{pole.titre}</h3>
                  <p>{pole.texte}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== POUR QUI ===== */}
      <section className="lp-section" id="publics">
        <div className="lp-conteneur">
          <div className="lp-section-tete" data-reveal>
            <p className="lp-surtitre">{PUBLICS.surtitre}</p>
            <h2 className="lp-h2">{PUBLICS.titre}</h2>
          </div>

          <div className="lp-terrain">
            {PUBLICS.items.map((item, i) => {
              const Icone = ICONES_PUBLIC[item.cle];
              return (
                <div key={item.titre} data-reveal style={{ transitionDelay: `${i * 100}ms` }}>
                  <span className="lp-terrain-icone">
                    <Icone className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3>{item.titre}</h3>
                  <p>{item.texte}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== APPEL FINAL ===== */}
      {/* « id » pour que la mesure d'audience sache que le visiteur est
          descendu jusqu'au bout : l'observateur ne regarde que les sections
          qui en portent un. */}
      <section className="lp-final" id="final">
        <div className="lp-conteneur lp-final-inner" data-reveal>
          <span className="lp-final-icone">
            <Users className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2>{FINAL.titre}</h2>
          <p>{FINAL.texte}</p>
          <a href="#poles" className="lp-btn lp-btn-primaire lp-btn-lg" data-audience="poles">
            Voir les pôles
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </section>

      {/* ===== PIED ===== */}
      <footer className="lp-pied">
        <div className="lp-conteneur lp-pied-inner">
          <div className="lp-pied-marque">
            <ODCLogo variant="full" className="h-10" />
            <p>{EDITEUR.resume}</p>
            {/* Qui édite ce site. Descendue ici depuis la section « Le centre »,
                qui ne parle plus que du centre : c'est la seule mention, hors
                mentions légales, que ce site n'est celui d'aucune entreprise —
                et c'est ce que vérifie un service de conformité avant
                d'autoriser un compte d'envoi. */}
            <p className="lp-pied-editeur">{EDITEUR.mention}</p>
          </div>
          <div className="lp-pied-liens">
            <Link to={lienApp} data-audience="espace">{libelleApp}</Link>
            {/* Qui édite ce site, et comment le joindre. Un visiteur — ou un
                service de conformité qui vérifie un expéditeur — doit pouvoir
                le trouver sans compte. */}
            <Link to="/mentions-legales" data-audience="mentions">Mentions légales</Link>
            <a href="mailto:contact@inside-odc.com" data-audience="contact">
              contact@inside-odc.com
            </a>
            <p className="lp-pied-mentions">
              © {new Date().getFullYear()} Inside ODC Sénégal
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
