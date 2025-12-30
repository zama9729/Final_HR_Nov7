import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  id?: string;
  className?: string;
}

/**
 * Unified toggle switch component used across the app.
 *
 * - ON: bold red background (#E53935), white knob, soft glow
 * - OFF: soft gray background (#E0E0E0)
 * - Smooth transitions, slight hover lift on the track and subtle knob scale
 * - Accessible: role="switch", aria-checked via Radix Switch, keyboard (Space/Enter)
 */
export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled,
  label,
  id,
  className,
}) => {
  const switchElement = (
    <Switch
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange}
      className={cn(
        "group", // allow child hover styles if needed
        className,
      )}
    />
  );

  if (!label) {
    return switchElement;
  }

  return (
    <label
      htmlFor={id}
      className={cn(
        "inline-flex items-center gap-2 cursor-pointer select-none",
        disabled && "cursor-not-allowed opacity-70",
      )}
    >
      {switchElement}
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
};


