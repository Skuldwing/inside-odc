import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";

const ConfirmContext = createContext(null);

/**
 * Remplacant de window.confirm().
 *
 * S'utilise exactement comme lui, mais rend une promesse :
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Supprimer ?", destructive: true }))) return;
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((options = {}) => {
    const opts = typeof options === "string" ? { title: options } : options;
    setState({
      title: opts.title || "Confirmer l'action",
      body: opts.body || null,
      confirmLabel: opts.confirmLabel || (opts.destructive ? "Supprimer" : "Confirmer"),
      cancelLabel: opts.cancelLabel || "Annuler",
      destructive: !!opts.destructive,
    });
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value) => {
    setState(null);
    const resolve = resolver.current;
    resolver.current = null;
    if (resolve) resolve(value);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          open
          onClose={() => settle(false)}
          maxWidth="max-w-md"
          footer={
            <>
              <Button variant="ghost" onClick={() => settle(false)}>
                {state.cancelLabel}
              </Button>
              <Button
                variant={state.destructive ? "danger" : "primary"}
                icon={state.destructive ? Trash2 : undefined}
                onClick={() => settle(true)}
                autoFocus
              >
                {state.confirmLabel}
              </Button>
            </>
          }
        >
          <div className="flex items-start gap-4">
            <span
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${
                state.destructive ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-600"
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-base font-semibold text-slate-900">{state.title}</p>
              {state.body && <p className="mt-1.5 text-sm text-slate-600">{state.body}</p>}
            </div>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm doit etre utilise a l'interieur de <ConfirmProvider>");
  }
  return ctx;
}
