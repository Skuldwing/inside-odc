import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

/* Elements focalisables, pour le piege de focus. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* Compte les modales ouvertes : sans ca, fermer une modale imbriquee
   rendrait le defilement a la page alors qu'une autre est encore ouverte. */
let openCount = 0;

/**
 * Modale accessible, partagee par toute la plateforme.
 *
 * Ce que les modales maison ne faisaient pas :
 *  - fermeture par Echap
 *  - piege de focus (la tabulation ne s'echappe plus derriere la modale)
 *  - restitution du focus a l'element qui a ouvert la modale
 *  - roles ARIA, pour que le lecteur d'ecran annonce un dialogue
 *  - blocage du defilement de la page en arriere-plan
 */
export default function Modal({
  open = true,
  onClose,
  title,
  children,
  footer,
  maxWidth = "max-w-lg",
  /* Certaines modales (upload en cours, resultat d'envoi) ne doivent pas
     pouvoir etre fermees par inadvertance. */
  dismissable = true,
  labelledBy,
}) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);
  const titleId = useId();

  const requestClose = useCallback(() => {
    if (dismissable && onClose) onClose();
  }, [dismissable, onClose]);

  /* Focus initial + restitution a la fermeture. */
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;

    const panel = panelRef.current;
    const first = panel?.querySelector(FOCUSABLE);
    (first || panel)?.focus?.();

    return () => {
      const target = previouslyFocused.current;
      if (target && typeof target.focus === "function" && document.contains(target)) {
        target.focus();
      }
    };
  }, [open]);

  /* Blocage du defilement de l'arriere-plan. */
  useEffect(() => {
    if (!open) return;
    openCount += 1;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) document.body.style.overflow = previous;
    };
  }, [open]);

  /* Echap + piege de focus. */
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, requestClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-6 backdrop-blur-[2px] sm:py-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || (title ? titleId : undefined)}
        tabIndex={-1}
        className={`anim-modal-panel card-solid mx-auto flex w-full ${maxWidth} flex-col outline-none`}
        style={{ maxHeight: "calc(100dvh - 3rem)" }}
      >
        {title && (
          <div className="flex flex-shrink-0 items-center justify-between gap-3 rounded-t-2xl border-b border-slate-200 bg-white px-6 py-4">
            <h2 id={titleId} className="text-xl font-semibold">
              {title}
            </h2>
            {dismissable && (
              <button
                type="button"
                onClick={requestClose}
                aria-label="Fermer"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>

        {footer && (
          <div className="flex flex-shrink-0 items-center justify-end gap-3 rounded-b-2xl border-t border-slate-200 bg-white px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
