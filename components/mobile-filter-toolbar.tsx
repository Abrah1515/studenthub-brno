"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";

export function MobileFilterToolbar({ open, activeCount, onToggle, onReset, controlsId }: { open: boolean; activeCount: number; onToggle: () => void; onReset: () => void; controlsId: string }) {
  return <div className="mobile-filter-toolbar">
    <button type="button" className="button button-secondary" aria-expanded={open} aria-controls={controlsId} onClick={onToggle}>
      <SlidersHorizontal size={17} />Filtry{activeCount > 0 && <span className="filter-count" aria-label={`${activeCount} aktivních filtrů`}>{activeCount}</span>}
    </button>
    {activeCount > 0 && <button type="button" className="button button-secondary" onClick={onReset}><RotateCcw size={16} />Resetovat filtry</button>}
  </div>;
}
