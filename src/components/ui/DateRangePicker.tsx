import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { DayPicker, DateRange } from "react-day-picker";
import { format, isToday, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export interface DateRangePickerProps {
  startDate?: Date;
  endDate?: Date;
  onChange: (startDate: Date | undefined, endDate: Date | undefined) => void;
  mode: "single" | "range";
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  mode,
  placeholder = "Select date",
  className,
  disabled = false,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [internalStartDate, setInternalStartDate] = useState<Date | undefined>(startDate);
  const [internalEndDate, setInternalEndDate] = useState<Date | undefined>(endDate);
  const [selectingStart, setSelectingStart] = useState(true);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sync internal state with props
  useEffect(() => {
    setInternalStartDate(startDate);
    setInternalEndDate(endDate);
  }, [startDate, endDate]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [open]);

  const handleDateSelect = (selected: Date | DateRange | undefined) => {
    if (mode === "single") {
      const date = selected as Date | undefined;
      setInternalStartDate(date);
      setInternalEndDate(undefined);
      onChange(date, undefined);
      if (date) {
        setOpen(false);
      }
      return;
    }

    // Range mode - react-day-picker handles this automatically
    const range = selected as DateRange | undefined;
    if (!range) {
      setInternalStartDate(undefined);
      setInternalEndDate(undefined);
      onChange(undefined, undefined);
      return;
    }

    if (range.from && range.to) {
      // Both dates selected - close picker
      setInternalStartDate(range.from);
      setInternalEndDate(range.to);
      onChange(range.from, range.to);
      setOpen(false);
    } else if (range.from) {
      // Only start date selected - keep picker open
      setInternalStartDate(range.from);
      setInternalEndDate(undefined);
      onChange(range.from, undefined);
    } else {
      // No date selected
      setInternalStartDate(undefined);
      setInternalEndDate(undefined);
      onChange(undefined, undefined);
    }
  };

  const getDisplayText = () => {
    if (mode === "single") {
      return internalStartDate ? format(internalStartDate, "MMM d, yyyy") : placeholder;
    }

    if (internalStartDate && internalEndDate) {
      return `${format(internalStartDate, "MMM d, yyyy")} - ${format(internalEndDate, "MMM d, yyyy")}`;
    }
    if (internalStartDate) {
      return `${format(internalStartDate, "MMM d, yyyy")} - ${placeholder.split(" ").slice(1).join(" ") || "End date"}`;
    }
    return placeholder;
  };

  const selectedRange: DateRange | undefined = mode === "range"
    ? {
        from: internalStartDate,
        to: internalEndDate,
      }
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal border-white/60 bg-white/60 backdrop-blur-md shadow-sm hover:bg-white/80 transition-all duration-200",
            !internalStartDate && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {getDisplayText()}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={popoverRef}
        className="w-auto p-0 bg-white/80 backdrop-blur-xl border-white/60 shadow-xl rounded-xl overflow-hidden"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DayPicker
          mode={mode === "single" ? "single" : "range"}
          selected={mode === "single" ? internalStartDate : selectedRange}
          onSelect={handleDateSelect}
          numberOfMonths={mode === "range" ? 2 : 1}
          className="p-3"
          classNames={{
            months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
            month: "space-y-4",
            caption: "flex justify-center pt-1 relative items-center",
            caption_label: "text-sm font-medium text-gray-900",
            nav: "space-x-1 flex items-center",
            nav_button: cn(
              "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 hover:scale-105 transition-all duration-150 ease-out text-gray-700 hover:text-gray-900"
            ),
            nav_button_previous: "absolute left-1",
            nav_button_next: "absolute right-1",
            table: "w-full border-collapse space-y-1",
            head_row: "flex",
            head_cell: "text-gray-600 rounded-md w-9 font-normal text-[0.8rem]",
            row: "flex w-full mt-2",
            cell: "h-9 w-9 text-center text-sm p-0 relative",
            day: cn(
              "h-9 w-9 p-0 font-normal rounded-md transition-all duration-150 ease-out",
              "text-gray-900 hover:scale-[1.05] hover:shadow-md",
              "focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:ring-offset-0"
            ),
            day_range_start: "bg-red-500 text-white rounded-l-full hover:bg-red-600",
            day_range_end: "bg-red-500 text-white rounded-r-full hover:bg-red-600",
            day_selected: "bg-red-500 text-white hover:bg-red-600 focus:bg-red-600 rounded-full",
            day_range_middle: "bg-red-500/12 text-gray-900 hover:bg-red-500/20",
            day_today: "font-semibold border border-gray-300",
            day_outside: "text-gray-400 opacity-50",
            day_disabled: "text-gray-300 opacity-30 cursor-not-allowed",
            day_hidden: "invisible",
          }}
          modifiersClassNames={{
            today: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:bg-gray-400 after:rounded-full",
          }}
          components={{
            IconLeft: ({ ...props }) => (
              <ChevronLeft className="h-4 w-4" {...props} />
            ),
            IconRight: ({ ...props }) => (
              <ChevronRight className="h-4 w-4" {...props} />
            ),
          }}
          styles={{
            day_range_middle: {
              backgroundColor: "rgba(239, 68, 68, 0.12)",
            },
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

