import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

/**
 * Base Switch component used by all toggle switches in the app.
 * Styling is intentionally generic; prefer using ToggleSwitch for most use cases.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      "group",
      // Layout & size
      "inline-flex h-6 w-11 shrink-0 items-center rounded-full border-0",
      "transition-colors duration-200 ease-in-out",
      // Interaction
      "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      // OFF state
      "bg-[#E0E0E0] data-[state=unchecked]:bg-[#E0E0E0]",
      // ON state - bold red with soft glow
      "data-[state=checked]:bg-[#E53935]",
      "shadow-inner data-[state=checked]:shadow-[0_0_0_1px_rgba(229,57,53,0.2),0_0_10px_rgba(229,57,53,0.45)]",
      // Hover subtle lift
      "hover:shadow-md hover:-translate-y-[0.5px] transition-transform",
      className,
    )}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-[18px] w-[18px] rounded-full bg-white",
        "shadow-[0_1px_3px_rgba(0,0,0,0.3)] ring-0",
        "transition-transform duration-200 ease-in-out",
        "data-[state=unchecked]:translate-x-[3px]",
        "data-[state=checked]:translate-x-[21px]",
        // Slight knob hover scale (via parent hover)
        "group-hover:scale-[1.03]",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
