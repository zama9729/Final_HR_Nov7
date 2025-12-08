import { useState } from "react";
import { CountdownOverlay } from "@/components/onboarding/CountdownOverlay";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export default function OnboardingWizardPage() {
  const [showCountdown, setShowCountdown] = useState(true);

  const handleCountdownComplete = () => {
    setShowCountdown(false);
  };

  if (showCountdown) {
    return <CountdownOverlay onComplete={handleCountdownComplete} />;
  }

  return <OnboardingWizard />;
}

