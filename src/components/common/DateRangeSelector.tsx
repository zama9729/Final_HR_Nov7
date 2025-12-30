import { useState } from "react";
import { format } from "date-fns";
import { Calendar } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { cn } from "@/lib/utils";

interface DateRangeSelectorProps {
  value?: { from?: Date; to?: Date };
  onChange: (range: { from?: Date; to?: Date }) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DateRangeSelector({
  value,
  onChange,
  placeholder = "Select date range",
  className,
  disabled = false,
}: DateRangeSelectorProps) {
  const [open, setOpen] = useState(false);

  const displayValue = value?.from && value?.to
    ? `${format(value.from, "MMM d")} – ${format(value.to, "MMM d, yyyy")}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Select scheduling date range"
          className={cn(
            "flex items-center gap-2 w-full px-4 py-2.5 rounded-[0.75rem]",
            "bg-[rgba(255,255,255,0.75)] backdrop-blur-sm",
            "border border-gray-200",
            "shadow-[0_4px_10px_rgba(0,0,0,0.05)]",
            "text-left text-sm font-medium text-[#444]",
            "transition-all duration-200",
            "hover:bg-white/90 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]",
            "focus:outline-none focus:ring-2 focus:ring-[#E53935]/30 focus:border-[#E53935]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "cursor-pointer",
            className
          )}
        >
          <Calendar className="h-4 w-4 text-[#E53935] shrink-0" />
          <span className={cn(
            "flex-1 truncate",
            value?.from && value?.to ? "text-gray-900" : "text-gray-500"
          )}>
            {displayValue}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        onEscapeKeyDown={() => setOpen(false)}
      >
        <DateRangePicker
          startDate={value?.from}
          endDate={value?.to}
          onChange={(start, end) => {
            onChange({ from: start, to: end });
            // Close popover when both dates are selected
            if (start && end) {
              setOpen(false);
            }
          }}
          mode="range"
          placeholder={placeholder}
        />
      </PopoverContent>
    </Popover>
  );
}

