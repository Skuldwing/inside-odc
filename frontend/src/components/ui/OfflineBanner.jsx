import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { WifiOff } from "lucide-react";

/**
 * Bandeau « hors ligne ».
 *
 * Sans lui, une coupure reseau se manifeste par des pages vides et des
 * enregistrements qui echouent sans raison apparente. Le dire explicitement
 * evite qu'on croie l'application cassee.
 *
 * `navigator.onLine` est optimiste — il indique qu'une interface reseau
 * existe, pas qu'Internet repond — mais son passage a `false` est fiable,
 * et c'est le seul cas qui nous interesse ici.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false
  );

  /* Le bandeau est en position fixe et recouvrirait l'en-tete collant :
     on marque la racine pour que la mise en page se decale d'autant. */
  useEffect(() => {
    const root = document.documentElement;
    if (offline) root.setAttribute("data-offline", "true");
    else root.removeAttribute("data-offline");
    return () => root.removeAttribute("data-offline");
  }, [offline]);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-slate-900 px-4 py-2 text-center text-sm font-medium text-white"
    >
      <WifiOff className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      Hors ligne — les modifications ne seront pas enregistrées tant que la
      connexion n'est pas revenue.
    </div>,
    document.body
  );
}
