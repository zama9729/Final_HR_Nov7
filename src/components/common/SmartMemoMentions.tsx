import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmployeeSuggestion {
  id: string;
  user_id: string;
  employee_id: string;
  name: string;
  email: string;
  designation: string;
  department: string;
  team: string;
}

interface SmartMemoMentionsProps {
  show: boolean;
  suggestions: EmployeeSuggestion[];
  selectedIndex: number;
  onSelect: (employee: EmployeeSuggestion) => void;
  onHover: (index: number) => void;
  query: string;
  textareaElement: HTMLTextAreaElement | null;
  onClose: () => void;
}

export function SmartMemoMentions({
  show,
  suggestions,
  selectedIndex,
  onSelect,
  onHover,
  query,
  textareaElement,
  onClose,
}: SmartMemoMentionsProps) {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    placement: "below" | "above";
  }>({
    top: 0,
    left: 0,
    width: 0,
    placement: "below",
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calculate cursor position and update dropdown position
  const updatePosition = useCallback(() => {
    if (!textareaElement || !show) return;

    const rect = textareaElement.getBoundingClientRect();
    const textarea = textareaElement;
    const selectionStart = textarea.selectionStart;
    
    // Calculate cursor position more accurately
    const textBeforeCursor = textarea.value.substring(0, selectionStart);
    const textLines = textBeforeCursor.split("\n");
    const currentLine = textLines.length - 1;
    const currentLineText = textLines[currentLine] || "";
    
    // Get computed styles
    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(computedStyle.lineHeight) || 20;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
    const borderTop = parseFloat(computedStyle.borderTopWidth) || 0;
    const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
    
    // Create a mirror element to measure text width accurately
    const mirror = document.createElement("div");
    mirror.style.visibility = "hidden";
    mirror.style.position = "absolute";
    mirror.style.top = "-9999px";
    mirror.style.left = "-9999px";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.font = computedStyle.font;
    mirror.style.fontSize = computedStyle.fontSize;
    mirror.style.fontFamily = computedStyle.fontFamily;
    mirror.style.fontWeight = computedStyle.fontWeight;
    mirror.style.letterSpacing = computedStyle.letterSpacing;
    mirror.style.wordSpacing = computedStyle.wordSpacing;
    mirror.style.width = `${rect.width - paddingLeft - paddingRight}px`;
    mirror.textContent = currentLineText;
    document.body.appendChild(mirror);
    
    // Calculate cursor position within the line
    const cursorX = Math.min(mirror.offsetWidth, rect.width - paddingLeft - paddingRight);
    const lineIndex = currentLine;
    const cursorY = lineIndex * lineHeight;
    
    document.body.removeChild(mirror);
    
    // Calculate dropdown dimensions
    const dropdownHeight = Math.min(suggestions.length * 60 + 8, 288); // max-h-72 = 288px
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - (rect.top + cursorY + lineHeight);
    const spaceAbove = rect.top + cursorY;
    
    // Determine placement: above if not enough space below, otherwise below
    const placement = spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? "above" : "below";
    
    // Calculate top position (use fixed positioning relative to viewport)
    let top: number;
    if (placement === "below") {
      top = rect.top + cursorY + lineHeight + borderTop;
    } else {
      top = rect.top + cursorY - dropdownHeight + borderTop;
    }
    
    // Ensure dropdown doesn't go off-screen (with 8px margin)
    const minTop = 8;
    const maxTop = viewportHeight - dropdownHeight - 8;
    top = Math.max(minTop, Math.min(top, maxTop));
    
    // Calculate left position (align with textarea left edge)
    const left = rect.left + borderLeft;
    
    setPosition({
      top,
      left,
      width: Math.max(rect.width, 280), // Minimum width for readability
      placement,
    });
  }, [textareaElement, show, suggestions.length]);

  // Update position when suggestions change or window events occur
  useEffect(() => {
    if (!show || !textareaElement) return;

    updatePosition();

    const handleResize = () => updatePosition();
    const handleScroll = () => updatePosition();
    const handleInput = () => updatePosition();

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);
    textareaElement.addEventListener("input", handleInput);
    textareaElement.addEventListener("selectionchange", handleInput);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      textareaElement.removeEventListener("input", handleInput);
      textareaElement.removeEventListener("selectionchange", handleInput);
    };
  }, [show, textareaElement, updatePosition]);

  // Handle click outside to close
  useEffect(() => {
    if (!show) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaElement &&
        !textareaElement.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [show, textareaElement, onClose]);

  if (!show || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={dropdownRef}
      className={cn(
        "fixed z-[9999]",
        "bg-[rgba(255,255,255,0.95)] backdrop-blur-md",
        "border border-gray-200/50",
        "rounded-[0.75rem]",
        "shadow-[0_4px_12px_rgba(0,0,0,0.1)]",
        "overflow-hidden",
        "transition-opacity duration-150 ease-out",
        show ? "opacity-100" : "opacity-0"
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
        maxHeight: "288px",
      }}
    >
      <div className="overflow-y-auto max-h-[288px]">
        {suggestions.length > 0 ? (
          suggestions.map((employee, idx) => (
            <div
              key={employee.id}
              className={cn(
                "px-4 py-3 cursor-pointer transition-colors duration-150",
                "hover:bg-[#E53935]/10",
                idx === selectedIndex && "bg-[#E53935]/15"
              )}
              onClick={() => onSelect(employee)}
              onMouseEnter={() => onHover(idx)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-900 truncate">
                    {employee.name}
                    {employee.employee_id && (
                      <span className="ml-1.5 text-xs text-gray-500 font-normal">
                        · {employee.employee_id}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 truncate mt-0.5">
                    {employee.designation}
                    {employee.department && ` • ${employee.department}`}
                    {employee.team && employee.team !== "No Team" && ` • ${employee.team}`}
                  </div>
                  {employee.email && (
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      {employee.email}
                    </div>
                  )}
                </div>
                <User className="h-4 w-4 text-gray-400 shrink-0" />
              </div>
            </div>
          ))
        ) : query.length > 0 ? (
          <div className="px-4 py-3 text-sm text-gray-500">
            No employees found matching "{query}"
          </div>
        ) : (
          <div className="px-4 py-3 text-sm text-gray-500">
            Type a name after @ to search...
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

