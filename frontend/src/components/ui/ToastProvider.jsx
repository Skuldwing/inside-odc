import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

const ToastContext = createContext(null);

const VARIANTS = {
  success: {
    icon: CheckCircle2,
    ring: "border-emerald-200",
    bar: "bg-emerald-500",
    iconColor: "text-emerald-600",
  },
  error: {
    icon: XCircle,
    ring: "border-red-200",
    bar: "bg-red-500",
    iconColor: "text-red-600",
  },
  warning: {
    icon: AlertTriangle,
    ring: "border-amber-200",
    bar: "bg-amber-500",
    iconColor: "text-amber-600",
  },
  info: {
    icon: Info,
    ring: "border-slate-200",
    bar: "bg-slate-400",
    iconColor: "text-slate-600",
  },
};

const DEFAULT_DURATION = 5000;
/* Les erreurs restent plus longtemps : on les lit, on ne les survole pas. */
const ERROR_DURATION = 8000;

let nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (variant, message, options = {}) => {
      if (!message) return null;
      const id = ++nextId;
      const duration =
        options.duration ?? (variant === "error" ? ERROR_DURATION : DEFAULT_DURATION);

      setToasts((list) => [...list, { id, variant, message, title: options.title }]);

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  const api = useMemo(
    () => ({
      success: (message, options) => push("success", message, options),
      error: (message, options) => push("error", message, options),
      warning: (message, options) => push("warning", message, options),
      info: (message, options) => push("info", message, options),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-4 sm:inset-x-auto sm:right-4 sm:items-end"
          role="region"
          aria-label="Notifications"
        >
          {toasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }) {
  const variant = VARIANTS[toast.variant] || VARIANTS.info;
  const Icon = variant.icon;

  return (
    <div
      /* assertive pour les erreurs : le lecteur d'ecran interrompt et annonce. */
      role={toast.variant === "error" ? "alert" : "status"}
      aria-live={toast.variant === "error" ? "assertive" : "polite"}
      className={`anim-toast-in pointer-events-auto flex w-full max-w-md items-start gap-3 overflow-hidden rounded-xl border ${variant.ring} bg-white py-3 pl-3 pr-2 shadow-lg shadow-slate-900/10`}
    >
      <span className={`mt-0.5 flex-shrink-0 ${variant.iconColor}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        {toast.title && (
          <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
        )}
        <p className="break-words text-sm text-slate-700">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fermer la notification"
        className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast doit etre utilise a l'interieur de <ToastProvider>");
  }
  return ctx;
}
