import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/useAuth";
import { X, ChevronRight } from "lucide-react";

const PAD = 10;

const STEPS = [
  {
    id: "welcome",
    title: "Bienvenue sur Inside ODC 👋",
    content:
      "Ce guide rapide vous présente les fonctionnalités disponibles pour votre compte partenaire. Quelques clics pour vous mettre à l'aise !",
  },
  {
    id: "dashboard",
    icon: "📊",
    title: "Tableau de bord",
    content:
      "Votre page d'accueil. Elle affiche vos indicateurs clés : activités menées, participants accueillis, heures de formation et répartition par genre.",
    target: "[data-tour='nav-dashboard']",
  },
  {
    id: "activities",
    icon: "📅",
    title: "Activités",
    content:
      "Consultez toutes les activités de votre structure — formations, ateliers, événements. Cliquez sur une activité pour voir ses détails et la liste des participants.",
    target: "[data-tour='nav-activities']",
  },
  {
    id: "participants",
    icon: "👥",
    title: "Participants",
    content:
      "Accédez à la liste complète des participants enregistrés dans vos activités. Recherchez, filtrez par dispositif et exportez les données.",
    target: "[data-tour='nav-participants']",
  },
  {
    id: "done",
    title: "Vous êtes prêt ! 🎉",
    content:
      "Voilà l'essentiel ! Si vous avez des questions sur la plateforme, n'hésitez pas à contacter votre administrateur Orange Digital Center.",
  },
];

export default function OnboardingTour() {
  const { isPartner, user } = useAuth();
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const [visible, setVisible] = useState(false);

  const storageKey = user ? `tour_partner_v1_${user.id}` : null;
  const shouldShow = isPartner && storageKey && !localStorage.getItem(storageKey);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (storageKey) localStorage.setItem(storageKey, "1");
  }, [storageKey]);

  const next = useCallback(() => {
    if (step >= STEPS.length - 1) dismiss();
    else setStep(s => s + 1);
  }, [step, dismiss]);

  const updateGeometry = useCallback(() => {
    const target = STEPS[step]?.target;
    const isMobile = window.innerWidth < 1024;
    if (!target || isMobile) { setRect(null); return; }
    const el = document.querySelector(target);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useEffect(() => {
    if (!shouldShow) return;
    const t = setTimeout(() => setVisible(true), 700);
    return () => clearTimeout(t);
  }, [shouldShow]);

  useEffect(() => {
    if (!visible) return;
    updateGeometry();
    window.addEventListener("resize", updateGeometry);
    window.addEventListener("scroll", updateGeometry, true);
    return () => {
      window.removeEventListener("resize", updateGeometry);
      window.removeEventListener("scroll", updateGeometry, true);
    };
  }, [visible, updateGeometry]);

  if (!shouldShow || !visible) return null;

  const currentStep = STEPS[step];
  const hasTarget = !!rect;

  const spotTop    = rect ? rect.top - PAD : 0;
  const spotLeft   = rect ? rect.left - PAD : 0;
  const spotRight  = rect ? rect.left + rect.width + PAD : 0;
  const spotBottom = rect ? rect.top + rect.height + PAD : 0;

  const tooltipTop  = rect ? Math.max(16, Math.min(rect.top + rect.height / 2 - 90, window.innerHeight - 280)) : 0;
  const tooltipLeft = spotRight + 16;
  const fitsRight   = tooltipLeft + 308 < window.innerWidth;

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none">

      {/* ── Overlay ── */}
      {hasTarget ? (
        <>
          <div
            className="absolute bg-black/60 pointer-events-auto transition-all duration-300"
            style={{ top: 0, left: 0, right: 0, height: Math.max(0, spotTop) }}
            onClick={dismiss}
          />
          <div
            className="absolute bg-black/60 pointer-events-auto transition-all duration-300"
            style={{ top: spotBottom, left: 0, right: 0, bottom: 0 }}
            onClick={dismiss}
          />
          <div
            className="absolute bg-black/60 pointer-events-auto transition-all duration-300"
            style={{ top: spotTop, left: 0, width: Math.max(0, spotLeft), height: spotBottom - spotTop }}
            onClick={dismiss}
          />
          <div
            className="absolute bg-black/60 pointer-events-auto transition-all duration-300"
            style={{ top: spotTop, left: spotRight, right: 0, height: spotBottom - spotTop }}
            onClick={dismiss}
          />
          {/* Spotlight ring */}
          <div
            className="absolute rounded-xl pointer-events-none tour-spotlight-ring"
            style={{ top: spotTop, left: spotLeft, width: spotRight - spotLeft, height: spotBottom - spotTop }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={dismiss} />
      )}

      {/* ── Tooltip card (sidebar steps) ── */}
      {hasTarget && (
        <div
          key={step}
          className="absolute bg-white rounded-2xl shadow-2xl pointer-events-auto anim-modal-panel"
          style={{
            top: fitsRight ? tooltipTop : spotBottom + 16,
            left: fitsRight ? tooltipLeft : Math.max(16, spotLeft),
            width: 292,
          }}
        >
          {fitsRight && (
            <div
              className="absolute -left-[7px] top-8 w-3.5 h-3.5 bg-white rotate-45 rounded-sm"
              style={{ boxShadow: "-2px 2px 4px rgba(0,0,0,0.08)" }}
            />
          )}
          <div className="p-5">
            <StepContent step={currentStep} stepIdx={step} total={STEPS.length} onNext={next} onSkip={dismiss} />
          </div>
        </div>
      )}

      {/* ── Center modal (welcome / done) ── */}
      {!hasTarget && (
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-auto">
          <div key={step} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 anim-modal-panel">
            <StepContent step={currentStep} stepIdx={step} total={STEPS.length} onNext={next} onSkip={dismiss} />
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

function StepContent({ step, stepIdx, total, onNext, onSkip }) {
  const isLast = stepIdx === total - 1;
  const isFirst = stepIdx === 0;

  return (
    <>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {step.icon && <span className="text-lg leading-none">{step.icon}</span>}
          <h3 className="font-bold text-slate-900 text-sm leading-snug">{step.title}</h3>
        </div>
        <button
          onClick={onSkip}
          className="ml-3 flex-shrink-0 rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          title="Fermer le guide"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-slate-600 text-xs leading-relaxed mb-5">{step.content}</p>

      <div className="flex items-center justify-between gap-2">
        {/* Dot progress */}
        <div className="flex gap-1.5 items-center">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`rounded-full transition-all duration-300 inline-block ${
                i === stepIdx ? "w-4 h-2 bg-orange-500" : "w-2 h-2 bg-slate-200"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {!isLast && !isFirst && (
            <button
              onClick={onSkip}
              className="text-xs text-slate-400 hover:text-slate-600 transition px-1"
            >
              Passer
            </button>
          )}
          {isFirst && (
            <button
              onClick={onSkip}
              className="text-xs text-slate-400 hover:text-slate-600 transition border border-slate-200 rounded-xl px-3 py-2"
            >
              Passer le guide
            </button>
          )}
          <button
            onClick={onNext}
            className="inline-flex items-center gap-1 rounded-xl bg-orange-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-600 transition-colors"
          >
            {isLast ? "Terminer" : "Suivant"}
            {!isLast && <ChevronRight className="w-3 h-3" />}
          </button>
        </div>
      </div>
    </>
  );
}
