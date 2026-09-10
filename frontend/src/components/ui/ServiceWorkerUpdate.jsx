import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "lucide-react";

/**
 * Enregistre le service worker et previent quand une nouvelle version est
 * deployee.
 *
 * Sans cette invite, quelqu'un qui garde l'application ouverte sur son
 * telephone pendant des jours resterait sur une version ancienne sans jamais
 * le savoir.
 *
 * La detection ne peut pas reposer sur le service worker seul. Le navigateur
 * n'installe une nouvelle version du worker que si le fichier sw.js a change
 * d'un octet — or il est identique d'un deploiement a l'autre. On compare donc
 * le script charge par la page a celui reference par la derniere version du
 * document servie par le serveur : Vite renomme ce fichier a chaque build, un
 * nom different signifie une nouvelle version en ligne.
 *
 * L'enregistrement n'a lieu qu'en production : en developpement, un service
 * worker qui met en cache la coquille masquerait les modifications en cours.
 */

const INTERVALLE_VERIFICATION_MS = 15 * 60 * 1000;

function scriptCourant() {
  return (
    document.querySelector('script[type="module"][src]')?.getAttribute("src") || null
  );
}

export default function ServiceWorkerUpdate() {
  const [disponible, setDisponible] = useState(false);
  const [reporte, setReporte] = useState(false);
  const registrationRef = useRef(null);
  const scriptRef = useRef(null);

  /* Compare le script de la page a celui du document actuellement servi. */
  const verifierNouvelleVersion = useCallback(async () => {
    if (!scriptRef.current) return;
    try {
      const res = await fetch(`/index.html?v=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const html = await res.text();
      const trouve = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
      if (trouve && trouve[1] && trouve[1] !== scriptRef.current) {
        setDisponible(true);
        setReporte(false);
      }
    } catch {
      /* Hors ligne ou serveur injoignable : rien a annoncer. */
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    scriptRef.current = scriptCourant();

    /* Le service worker peut aussi signaler une version en attente, quand
       c'est sw.js lui-meme qui a change. */
    let reloading = false;

    /* Au tout premier chargement il n'y a pas encore de controleur : quand le
       worker s'installe puis reclame la page, controllerchange se declenche
       sans qu'aucune mise a jour n'ait eu lieu. Recharger la  serait un
       rechargement surprise des la premiere visite — sur la page d'accueil
       publique, ou au milieu de la saisie du mot de passe. On ne recharge donc
       que si la page etait deja controlee par une version precedente. */
    const avaitControleur = Boolean(
      "serviceWorker" in navigator && navigator.serviceWorker.controller
    );

    const onControllerChange = () => {
      if (reloading || !avaitControleur) return;
      reloading = true;
      window.location.reload();
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          registrationRef.current = reg;
          if (reg.waiting) setDisponible(true);
          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              /* `controller` absent = premiere installation : rien a annoncer. */
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                setDisponible(true);
                setReporte(false);
              }
            });
          });
        })
        .catch((err) => {
          /* Un enregistrement qui echoue ne doit rien casser : l'application
             fonctionne exactement comme avant, sans le hors-ligne. */
          console.warn("Service worker non enregistre :", err?.message);
        });
    }

    /* Au retour au premier plan — un telephone garde souvent l'onglet ouvert
       des jours durant — et a intervalle regulier pour un poste laisse allume. */
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      registrationRef.current?.update?.();
      verifierNouvelleVersion();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(verifierNouvelleVersion, INTERVALLE_VERIFICATION_MS);
    verifierNouvelleVersion();

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      }
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [verifierNouvelleVersion]);

  const recharger = () => {
    const waiting = registrationRef.current?.waiting;
    if (waiting) {
      /* Le rechargement suivra l'evenement controllerchange. */
      waiting.postMessage("SKIP_WAITING");
      return;
    }
    window.location.reload();
  };

  if (!disponible || reporte) return null;

  return createPortal(
    <div
      role="status"
      className="anim-toast-in fixed inset-x-4 bottom-4 z-[80] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-orange-200 bg-white py-3 pl-4 pr-2 shadow-lg shadow-slate-900/10 sm:inset-x-auto sm:right-4"
    >
      <RefreshCw className="h-5 w-5 flex-shrink-0 text-orange-600" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-slate-700">
        Une nouvelle version d&apos;Inside ODC est disponible.
      </p>
      <button
        type="button"
        onClick={recharger}
        className="btn-primary flex-shrink-0 px-3 py-2 text-xs"
      >
        Recharger
      </button>
      <button
        type="button"
        onClick={() => setReporte(true)}
        aria-label="Plus tard"
        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>,
    document.body
  );
}
