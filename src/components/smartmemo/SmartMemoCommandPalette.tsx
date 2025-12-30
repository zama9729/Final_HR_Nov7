import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SmartMemoAI } from "./SmartMemoAI";
import { useLocation, useParams } from "react-router-dom";

// Global state for Smart Memo command palette
let globalSetIsOpen: ((open: boolean) => void) | null = null;

export function SmartMemoCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const params = useParams();

  // Register global setter
  useEffect(() => {
    globalSetIsOpen = setIsOpen;
    return () => {
      globalSetIsOpen = null;
    };
  }, []);

  // Extract current entity context from URL
  const getCurrentContext = () => {
    const path = location.pathname;
    
    // Employee profile page
    if (path.includes('/employees/') && params.id) {
      return {
        currentEntityId: params.id,
        currentEntityType: 'employee' as const,
        currentEntityName: undefined, // Could fetch if needed
      };
    }
    
    // Project page
    if (path.includes('/projects/') && params.id) {
      return {
        currentEntityId: params.id,
        currentEntityType: 'project' as const,
        currentEntityName: undefined,
      };
    }
    
    // Appraisal page
    if (path.includes('/my-appraisal')) {
      return {
        currentEntityId: undefined,
        currentEntityType: 'appraisal' as const,
        currentEntityName: undefined,
      };
    }
    
    return {
      currentEntityId: undefined,
      currentEntityType: null,
      currentEntityName: undefined,
    };
  };

  // Global keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      
      // Close on Escape
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    const handleOpenEvent = () => {
      setIsOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-smart-memo', handleOpenEvent);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-smart-memo', handleOpenEvent);
    };
  }, [isOpen]);

  const context = getCurrentContext();

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl p-0">
        <div className="p-6">
          <SmartMemoAI
            embedded={true}
            currentEntityId={context.currentEntityId}
            currentEntityType={context.currentEntityType}
            currentEntityName={context.currentEntityName}
            onClose={() => setIsOpen(false)}
            onEventsCreated={() => {
              setIsOpen(false);
              // Trigger page refresh if needed
              window.dispatchEvent(new CustomEvent('smart-memo-created'));
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

