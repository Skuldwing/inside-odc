import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Award,
  Bot,
  Calendar,
  FileText,
  KanbanSquare,
  LogIn,
  MessageSquare,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  WifiOff,
} from "lucide-react";
import ODCLogo from "../components/branding/ODCLogo";
import { useAuth } from "../auth/useAuth";
import "../styles/landing.css";

/* Les modules reellement presents dans la plateforme. Une page d'accueil qui
   promet plus que ce qui existe se retourne contre elle des la premiere
   connexion. */
const MODULES = [
  {
    icon: Calendar,
    titre: "Activités",
    texte:
      "Planification, import Excel des listes de présence, pointage par QR code, rapport et photos rattachés à chaque session.",
  },
  {
    icon: Users,
    titre: "Participants",
    texte:
      "Base nominative consolidée, recherche instantanée, répartition par genre et par dispositif, export complet.",
  },
  {
    icon: KanbanSquare,
    titre: "Mbootay",
    texte:
      "L'espace collaboratif de l'équipe : projets, tâches, tableau Kanban et calendrier partagé.",
  },
  {
    icon: Award,
    titre: "Vote / Jury",
    texte:
      "Sessions de notation par critères pondérés, accès jury sur mobile, écran public pour la salle.",
  },
  {
    icon: Bot,
    titre: "Pobarr",
    texte:
      "L'assistant qui répond en langage courant sur les données du centre, sans passer par un tableur.",
  },
  {
    icon: ShieldCheck,
    titre: "Fiabilité",
    texte:
      "Un score de qualité par activité : ce qui manque, ce qui semble incohérent, ce qui est prêt à être publié.",
  },
  {
    icon: FileText,
    titre: "Formulaires",
    texte:
      "Formulaires d'inscription publics, réponses rattachées directement aux activités concernées.",
  },
  {
    icon: MessageSquare,
    titre: "Campagnes",
    texte:
      "Messages aux participants et aux partenaires, depuis les listes déjà présentes dans la plateforme.",
  },
];

const ETAPES = [
  {
    numero: "01",
    titre: "On crée l'activité",
    texte:
      "Titre, dates, lieu, dispositif, partenaire. Une fiche suffit pour ouvrir le suivi.",
  },
  {
    numero: "02",
    titre: "Les présences arrivent",
    texte:
      "Les participants scannent le QR code sur place, ou la liste Excel est importée en une fois.",
  },
  {
    numero: "03",
    titre: "Le bilan se construit seul",
    texte:
      "Indicateurs, répartitions et exports se mettent à jour à mesure. Le rapport n'est plus à reconstituer.",
  },
];

const TERRAIN = [
  {
    icon: WifiOff,
    titre: "Résiste aux coupures",
    texte:
      "La plateforme reste ouverte quand le réseau lâche en salle, et reprend dès qu'il revient.",
  },
  {
    icon: Smartphone,
    titre: "S'installe sur le téléphone",
    texte:
      "Depuis le navigateur, sans passer par un magasin d'applications : l'icône se pose sur l'écran d'accueil.",
  },
  {
    icon: ShieldCheck,
    titre: "Chacun voit ce qui le concerne",
    texte:
      "Administrateur, partenaire, coach ou lecteur : les données affichées suivent le rôle, jamais l'inverse.",
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
          <a href="#top" className="lp-marque" aria-label="Inside ODC, accueil">
            <ODCLogo variant="mark" className="h-9 w-9 rounded-xl" />
            <span className="lp-marque-texte">
              <strong>Inside ODC</strong>
              <span>Orange Digital Center · Sénégal</span>
            </span>
          </a>

          <nav className="lp-nav" aria-label="Sections">
            <a href="#modules">Modules</a>
            <a href="#demarche">Démarche</a>
            <a href="#terrain">Sur le terrain</a>
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
            Plateforme interne du Digital Center
          </p>

          <h1 className="lp-titre">
            <span className="lp-monte" style={{ animationDelay: "160ms" }}>
              Tout le centre,
            </span>{" "}
            <span className="lp-monte lp-degrade" style={{ animationDelay: "260ms" }}>
              d&apos;un seul regard.
            </span>
          </h1>

          <p className="lp-chapo lp-monte" style={{ animationDelay: "380ms" }}>
            Activités, participants, partenaires, dispositifs : Inside ODC rassemble le suivi
            du Digital Center, de l&apos;inscription au bilan. Fini les classeurs éparpillés et
            les chiffres qu&apos;on recompte la veille du rapport.
          </p>

          <div className="lp-actions lp-monte" style={{ animationDelay: "500ms" }}>
            <Link to={lienApp} className="lp-btn lp-btn-primaire lp-btn-lg">
              {libelleApp}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a href="#modules" className="lp-btn lp-btn-fantome lp-btn-lg">
              Découvrir la plateforme
            </a>
          </div>

          {/* Apercu : une maquette, pas une capture — elle ne peut pas mentir
              sur des chiffres qu'elle n'affiche pas. */}
          <div className="lp-apercu lp-monte" style={{ animationDelay: "640ms" }} aria-hidden="true">
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

      {/* ===== BANDEAU DEFILANT ===== */}
      <div className="lp-bandeau" aria-hidden="true">
        <div className="lp-bandeau-piste">
          {[...Array(2)].map((_, boucle) => (
            <div className="lp-bandeau-groupe" key={boucle}>
              {[
                "Activités", "Participants", "Partenaires", "Dispositifs", "Mbootay",
                "Vote & Jury", "Formulaires", "Campagnes", "Fiabilité", "Journaux d'audit",
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

      {/* ===== MODULES ===== */}
      <section className="lp-section" id="modules">
        <div className="lp-conteneur">
          <div className="lp-section-tete" data-reveal>
            <p className="lp-surtitre">Les modules</p>
            <h2 className="lp-h2">Une plateforme, pas une pile d&apos;outils</h2>
            <p className="lp-texte-section">
              Chaque module s&apos;appuie sur les mêmes données. Une présence pointée en salle
              alimente aussitôt les participants, les indicateurs et le score de fiabilité.
            </p>
          </div>

          <div className="lp-cartes">
            {MODULES.map((module, i) => {
              const Icone = module.icon;
              return (
                <article
                  className="lp-carte"
                  key={module.titre}
                  data-reveal
                  style={{ transitionDelay: `${i * 60}ms` }}
                >
                  <span className="lp-carte-icone">
                    <Icone className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3>{module.titre}</h3>
                  <p>{module.texte}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== DEMARCHE ===== */}
      <section className="lp-section lp-section-sombre" id="demarche">
        <div className="lp-conteneur">
          <div className="lp-section-tete" data-reveal>
            <p className="lp-surtitre lp-surtitre-clair">La démarche</p>
            <h2 className="lp-h2 lp-h2-clair">Trois gestes, et le suivi existe</h2>
          </div>

          <ol className="lp-etapes">
            {ETAPES.map((etape, i) => (
              <li key={etape.numero} data-reveal style={{ transitionDelay: `${i * 120}ms` }}>
                <span className="lp-etape-numero">{etape.numero}</span>
                <h3>{etape.titre}</h3>
                <p>{etape.texte}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ===== TERRAIN ===== */}
      <section className="lp-section" id="terrain">
        <div className="lp-conteneur">
          <div className="lp-section-tete" data-reveal>
            <p className="lp-surtitre">Sur le terrain</p>
            <h2 className="lp-h2">Conçu pour une salle, pas pour un bureau</h2>
            <p className="lp-texte-section">
              Les ateliers se tiennent là où le réseau est capricieux et où l&apos;outil de
              travail tient dans une main.
            </p>
          </div>

          <div className="lp-terrain">
            {TERRAIN.map((item, i) => {
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

      {/* ===== APPEL FINAL ===== */}
      <section className="lp-final">
        <div className="lp-conteneur lp-final-inner" data-reveal>
          <span className="lp-final-icone">
            <QrCode className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2>Votre espace vous attend</h2>
          <p>
            L&apos;accès est réservé à l&apos;équipe du Digital Center et à ses partenaires.
            Connectez-vous avec l&apos;adresse qui vous a été communiquée.
          </p>
          <Link to={lienApp} className="lp-btn lp-btn-primaire lp-btn-lg">
            {libelleApp}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* ===== PIED ===== */}
      <footer className="lp-pied">
        <div className="lp-conteneur lp-pied-inner">
          <div className="lp-pied-marque">
            <ODCLogo variant="full" className="h-10" />
            <p>
              Inside ODC — plateforme de pilotage du Orange Digital Center Sénégal.
            </p>
          </div>
          <p className="lp-pied-mentions">
            © {new Date().getFullYear()} Orange Digital Center Sénégal · Sonatel
          </p>
        </div>
      </footer>
    </div>
  );
}
