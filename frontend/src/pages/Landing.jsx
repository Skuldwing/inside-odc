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
import "../styles/landing.css";

/* ─────────────────────────────────────────────────────────────────────────
   TEXTES A VALIDER PAR L'EQUIPE ODC

   Tout ce qui decrit le centre est regroupe ici pour etre relu et corrige en
   un seul endroit, sans toucher a la mise en page.

   Ces formulations decrivent le modele Orange Digital Center tel qu'il est
   presente publiquement. Elles n'avancent volontairement aucun chiffre —
   nombre de personnes formees, de projets accompagnes, dates — car aucune
   source interne ne les a fournies. Mieux vaut une page sobre qu'une page
   qui affiche des donnees inventees au nom du centre.
   ───────────────────────────────────────────────────────────────────────── */

const POLES = [
  {
    icon: Code2,
    titre: "École du code",
    texte:
      "Une formation aux métiers du développement, gratuite et ouverte sans condition de diplôme, pour entrer dans le numérique par la pratique.",
  },
  {
    icon: Wrench,
    titre: "FabLab Solidaire",
    texte:
      "Un atelier de fabrication numérique : impression 3D, prototypage, électronique, et l'initiation des plus jeunes à la création.",
  },
  {
    icon: Rocket,
    titre: "Accélérateur",
    texte:
      "L'accompagnement des jeunes entreprises déjà lancées : mentorat, mise en relation, accès à l'écosystème du groupe.",
  },
  {
    icon: TrendingUp,
    titre: "Investissement",
    texte:
      "Le relais de financement pour les projets prêts à changer d'échelle, une fois le modèle éprouvé.",
  },
];

const PUBLICS = [
  {
    icon: GraduationCap,
    titre: "Celles et ceux qui se forment",
    texte:
      "Jeunes en recherche de compétences, en reconversion, ou simplement curieux d'un métier du numérique.",
  },
  {
    icon: Lightbulb,
    titre: "Les porteurs de projet",
    texte:
      "D'une idée griffonnée à une entreprise qui recrute, chaque étape trouve un interlocuteur au centre.",
  },
  {
    icon: School,
    titre: "Les scolaires et les enseignants",
    texte:
      "Ateliers d'initiation, découverte du code et de la fabrication numérique, encadrés par l'équipe.",
  },
];

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

  const lienApp = isAuthenticated ? "/dashboard" : "/login";
  const libelleApp = isAuthenticated ? "Accéder à la plateforme" : "Se connecter";

  return (
    <div className="lp">
      {/* ===== EN-TETE ===== */}
      <header className={`lp-header ${enHaut ? "" : "lp-header-fixe"}`}>
        <div className="lp-conteneur lp-header-inner">
          <a href="#top" className="lp-marque" aria-label="Orange Digital Center Sénégal, accueil">
            <ODCLogo variant="mark" className="h-9 w-9 rounded-xl" />
            <span className="lp-marque-texte">
              <strong>Orange Digital Center</strong>
              <span>Sénégal</span>
            </span>
          </a>

          <nav className="lp-nav" aria-label="Sections">
            <a href="#centre">Le centre</a>
            <a href="#poles">Les pôles</a>
            <a href="#publics">Pour qui</a>
            <a href="#plateforme">La plateforme</a>
          </nav>

          <Link to={lienApp} className="lp-btn lp-btn-primaire lp-btn-connexion">
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
            Orange Digital Center · Sénégal
          </p>

          <h1 className="lp-titre lp-titre-large">
            <span className="lp-monte" style={{ animationDelay: "160ms" }}>
              Apprendre, créer,
            </span>{" "}
            <span className="lp-monte lp-degrade" style={{ animationDelay: "260ms" }}>
              entreprendre.
            </span>
          </h1>

          <p className="lp-chapo lp-monte" style={{ animationDelay: "380ms" }}>
            Un même lieu pour se former aux métiers du numérique, fabriquer un premier
            prototype et faire grandir un projet. Ouvert à celles et ceux qui veulent
            s&apos;y mettre, quel que soit leur point de départ.
          </p>

          <div className="lp-actions lp-monte" style={{ animationDelay: "500ms" }}>
            <a href="#centre" className="lp-btn lp-btn-primaire lp-btn-lg">
              Découvrir le centre
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <Link to={lienApp} className="lp-btn lp-btn-fantome lp-btn-lg">
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
            <p className="lp-surtitre">Le centre</p>
            <p className="lp-manifeste-texte">
              Le <strong>Orange Digital Center Sénégal</strong> réunit sous un même toit la
              formation, la fabrication et l&apos;accompagnement. On peut y pousser la porte
              sans rien connaître au code, et en ressortir avec un métier, un prototype ou
              une entreprise.
            </p>
            <p className="lp-manifeste-note">
              Le centre s&apos;inscrit dans le réseau des Orange Digital Centers déployés en
              Afrique et au Moyen-Orient, porté au Sénégal avec Sonatel.
            </p>
          </div>
        </div>
      </section>

      {/* ===== LES POLES ===== */}
      <section className="lp-section lp-section-douce" id="poles">
        <div className="lp-conteneur">
          <div className="lp-section-tete" data-reveal>
            <p className="lp-surtitre">Les pôles</p>
            <h2 className="lp-h2">Quatre portes d&apos;entrée, un seul parcours</h2>
            <p className="lp-texte-section">
              Chacun répond à un moment différent. On peut n&apos;en pousser qu&apos;une, ou
              les traverser toutes.
            </p>
          </div>

          <div className="lp-cartes">
            {POLES.map((pole, i) => {
              const Icone = pole.icon;
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
            <p className="lp-surtitre">Pour qui</p>
            <h2 className="lp-h2">Le centre s&apos;adresse à qui pousse la porte</h2>
          </div>

          <div className="lp-terrain">
            {PUBLICS.map((item, i) => {
              const Icone = item.icon;
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

      {/* ===== LA PLATEFORME =====
          La vitrine ne doit pas faire oublier a quoi sert cette adresse : c'est
          aussi la porte d'entree de l'outil interne. */}
      <section className="lp-section lp-section-sombre" id="plateforme">
        <div className="lp-conteneur lp-plateforme">
          <div className="lp-plateforme-texte" data-reveal>
            <p className="lp-surtitre lp-surtitre-clair">Les coulisses</p>
            <h2 className="lp-h2 lp-h2-clair">Inside ODC, l&apos;outil de l&apos;équipe</h2>
            <p className="lp-texte-section">
              Derrière chaque atelier, il y a des inscriptions, des présences, des
              partenaires et un bilan à rendre. Inside ODC rassemble ce suivi en un seul
              endroit, pour que le temps passe avec les participants plutôt que sur des
              tableurs.
            </p>
            <p className="lp-plateforme-acces">
              L&apos;accès est réservé à l&apos;équipe du centre et à ses partenaires.
            </p>
            <Link to={lienApp} className="lp-btn lp-btn-primaire lp-btn-lg">
              {libelleApp}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          {/* Maquette volontairement abstraite : une fausse capture d'ecran
              afficherait des chiffres qui n'existent pas. */}
          <div className="lp-apercu" data-reveal aria-hidden="true">
            <div className="lp-fenetre">
              <div className="lp-fenetre-barre">
                <span /><span /><span />
              </div>
              <div className="lp-fenetre-corps">
                <div className="lp-faux-rail">
                  <span className="lp-faux-logo" />
                  <span className="lp-faux-ligne lp-w-70" />
                  <span className="lp-faux-ligne lp-w-90 lp-actif" />
                  <span className="lp-faux-ligne lp-w-60" />
                  <span className="lp-faux-ligne lp-w-80" />
                  <span className="lp-faux-ligne lp-w-50" />
                </div>
                <div className="lp-faux-contenu">
                  <div className="lp-faux-kpis">
                    <div className="lp-faux-kpi"><span className="lp-faux-barre lp-pulse-1" /></div>
                    <div className="lp-faux-kpi"><span className="lp-faux-barre lp-pulse-2" /></div>
                    <div className="lp-faux-kpi"><span className="lp-faux-barre lp-pulse-3" /></div>
                    <div className="lp-faux-kpi"><span className="lp-faux-barre lp-pulse-4" /></div>
                  </div>
                  <div className="lp-faux-graphe">
                    {[38, 62, 45, 78, 56, 88, 70, 94, 66, 82, 58, 76].map((h, i) => (
                      <span key={i} style={{ "--h": `${h}%`, "--d": `${i * 70}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="lp-fenetre-lueur" />
          </div>
        </div>
      </section>

      {/* ===== APPEL FINAL ===== */}
      <section className="lp-final">
        <div className="lp-conteneur lp-final-inner" data-reveal>
          <span className="lp-final-icone">
            <Users className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2>Le numérique s&apos;apprend en le faisant</h2>
          <p>
            Le centre ouvre ses ateliers, ses machines et son accompagnement à celles et
            ceux qui veulent s&apos;y mettre.
          </p>
          <a href="#poles" className="lp-btn lp-btn-primaire lp-btn-lg">
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
            <p>
              Orange Digital Center Sénégal — formation, fabrication numérique et
              accompagnement des porteurs de projet.
            </p>
          </div>
          <div className="lp-pied-liens">
            <Link to={lienApp}>{libelleApp}</Link>
            <p className="lp-pied-mentions">
              © {new Date().getFullYear()} Orange Digital Center Sénégal · Sonatel
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
