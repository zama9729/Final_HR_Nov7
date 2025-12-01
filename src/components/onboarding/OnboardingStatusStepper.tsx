import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEP_FLOW = [
  { key: 'STARTED', label: 'Onboarding Started' },
  { key: 'PASSWORD_SETUP', label: 'Password Setup' },
  { key: 'DOCUMENTS_UPLOADED', label: 'Documents Uploaded' },
  { key: 'FIRST_LOGIN', label: 'First Time Login' },
  { key: 'ONBOARDING_COMPLETED', label: 'Onboarding Completed' },
] as const;

const STATUS_ALIASES: Record<string, typeof STEP_FLOW[number]['key']> = {
  ONBOARDING_STARTED: 'STARTED',
  STARTED: 'STARTED',
  PASSWORD_SETUP: 'PASSWORD_SETUP',
  DOCUMENTS_UPLOADED: 'DOCUMENTS_UPLOADED',
  FIRST_LOGIN: 'FIRST_LOGIN',
  BG_CHECK_PENDING: 'FIRST_LOGIN',
  BG_CHECK_HOLD: 'FIRST_LOGIN',
  BG_CHECK_COMPLETED: 'ONBOARDING_COMPLETED',
  ONBOARDING_COMPLETED: 'ONBOARDING_COMPLETED',
};

type StepKey = typeof STEP_FLOW[number]['key'];

const normalizeStatus = (value?: string | null): StepKey | null => {
  if (!value) return null;
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');
  return STATUS_ALIASES[normalized] || (STEP_FLOW.find((s) => s.key === normalized)?.key ?? null);
};

interface OnboardingStatusStepperProps {
  currentStatus?: string | null;
  completedSteps?: Array<string> | null;
  className?: string;
}

export function OnboardingStatusStepper({
  currentStatus,
  completedSteps,
  className,
}: OnboardingStatusStepperProps) {
  const currentKey = normalizeStatus(currentStatus) || 'STARTED';
  const completedSet = new Set<StepKey>();

  (completedSteps || []).forEach((step) => {
    const normalized = normalizeStatus(step);
    if (normalized) {
      completedSet.add(normalized);
    }
  });

  const orderMap = STEP_FLOW.reduce<Record<StepKey, number>>((acc, step, index) => {
    acc[step.key] = index;
    return acc;
  }, {} as Record<StepKey, number>);

  const currentIndex = orderMap[currentKey] ?? 0;

  const getState = (step: StepKey, index: number) => {
    if (completedSet.has(step) || index < currentIndex) {
      return 'completed';
    }
    if (currentKey === step) {
      return 'current';
    }
    return 'pending';
  };

  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-5', className)}>
      {STEP_FLOW.map((step, index) => {
        const state = getState(step.key, index);

        return (
          <div
            key={step.key}
            className={cn(
              'rounded-xl border p-4 shadow-sm transition-colors',
              state === 'completed' && 'border-emerald-200 bg-emerald-50',
              state === 'current' && 'border-primary/40 bg-primary/5',
              state === 'pending' && 'border-border bg-background'
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'h-9 w-9 rounded-full border-2 flex items-center justify-center text-sm font-semibold',
                  state === 'completed' && 'border-emerald-500 bg-emerald-500 text-white',
                  state === 'current' && 'border-primary text-primary',
                  state === 'pending' && 'border-muted-foreground/30 text-muted-foreground'
                )}
              >
                {state === 'completed' ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">{step.label}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {state === 'completed'
                    ? 'Completed'
                    : state === 'current'
                    ? 'In progress'
                    : 'Pending'}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default OnboardingStatusStepper;

