import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "lucide-react";

/**
 * Enregistre le service worker et previent quand une nouvelle version est
 * prete.
 *
 * Sans cette invite, quelqu'un qui garde l'application ouverte sur son
 * telephone pendant plusieurs jours resterait sur une version ancienne sans
 * jamais le savoir : le service worker telecharge la mise a jour mais ne
 * l'active qu'au prochain demarrage complet.
 *
 * L'enregistrement n'a lieu qu'en production : en developpement, un service
 * worker qui met en cache la coquille masquerait les modifications en cours.
 */
export default function ServiceWorkerUpdate() {
  const [waiting, setWaiting] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (!("serviceWorker" in navigator)) return;

    let registration;
    let reloading = false;

    /* Quand la nouvelle version prend la main, on recharge une seule fois. */
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const watch = (reg) => {
      registration = reg;
      if (reg.waiting) setWaiting(reg.waiting);

      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          /* `controller` absent = premiere installation : rien a annoncer. */
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setWaiting(installing);
            setDismissed(false);
          }
        });
      });
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then(watch)
      .catch((err) => {
        /* Un enregistrement qui echoue ne doit rien casser : l'application
           fonctionne exactement comme avant, sans le hors-ligne. */
        console.warn("Service worker non enregistre :", err?.message);
      });

    /* Verifie une mise a jour au retour au premier plan — un telephone garde
       souvent l'onglet ouvert des jours durant. */
    const onVisible = () => {
      if (document.visibilityState === "visible") registration?.update?.();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!waiting || dismissed) return null;

  return createPortal(
    <div
      role="status"
      className="anim-toast-in fixed inset-x-4 bottom-4 z-[80] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-orange-200 bg-white py-3 pl-4 pr-2 shadow-lg shadow-slate-900/10 sm:inset-x-auto sm:right-4"
    >
      <RefreshCw className="h-5 w-5 flex-shrink-0 text-orange-600" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-slate-700">
        Une nouvelle version d'Inside ODC est disponible.
      </p>
      <button
        type="button"
        onClick={() => waiting.postMessage("SKIP_WAITING")}
        className="btn-primary flex-shrink-0 px-3 py-2 text-xs"
      >
        Recharger
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Plus tard"
        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>,
    document.body
  );
}
