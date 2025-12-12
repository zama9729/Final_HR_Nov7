import { useEffect } from "react";

type CountdownOverlayProps = {
  onComplete?: () => void;
  durationMs?: number;
};

/**
 * Simple countdown overlay shown before onboarding wizard starts.
 * Calls onComplete after durationMs (default 1200ms).
 */
export function CountdownOverlay({ onComplete, durationMs = 1200 }: CountdownOverlayProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete?.();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [onComplete, durationMs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="rounded-2xl bg-white px-6 py-4 shadow-lg text-center">
        <div className="text-lg font-semibold text-slate-900">Preparing your experience…</div>
        <div className="mt-2 text-sm text-slate-600">This will just take a moment.</div>
      </div>
    </div>
  );
}

export default CountdownOverlay;

