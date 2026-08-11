import { useEffect, useRef, useState } from "react";
import { subscribeLoading } from "../api";

export default function TopProgressBar() {
  const [visible, setVisible] = useState(false);
  const [complete, setComplete] = useState(false);
  const showTimer = useRef(null);
  const hideTimer = useRef(null);

  useEffect(() => {
    return subscribeLoading((count) => {
      if (count > 0) {
        clearTimeout(hideTimer.current);
        if (!showTimer.current) {
          showTimer.current = setTimeout(() => {
            setComplete(false);
            setVisible(true);
            showTimer.current = null;
          }, 120);
        }
      } else {
        clearTimeout(showTimer.current);
        showTimer.current = null;
        setComplete(true);
        hideTimer.current = setTimeout(() => setVisible(false), 350);
      }
    });
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden bg-orange-50/40">
      <div
        className={`h-full rounded-r-full bg-gradient-to-r from-orange-400 via-orange-500 to-amber-400 ${
          complete ? "topbar-complete" : "topbar-progress"
        }`}
      />
    </div>
  );
}
