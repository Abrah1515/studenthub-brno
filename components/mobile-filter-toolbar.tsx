"use client";

import { Filter, RotateCcw, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalDialog } from "@/lib/use-modal-dialog";

export const mobileFilterMediaQuery = "(max-width: 860px)";
const filterTriggers = new Map<string, HTMLButtonElement>();

type FilterButtonProps = {
  open: boolean;
  activeCount: number;
  onOpen: () => void;
  controlsId: string;
  className?: string;
};

type FilterDialogProps = {
  open: boolean;
  activeCount: number;
  onClose: () => void;
  onReset: () => void;
  onApply?: () => void;
  controlsId: string;
  children: ReactNode;
  bodyClassName?: string;
  applyLabel?: string;
};

function useFilterScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const pathname = window.location.pathname;
    const body = document.body;
    const appRoot = document.querySelector<HTMLElement>(".app-shell");
    const bodyProperties = ["position", "top", "left", "right", "width", "overflow", "touchAction", "overscrollBehavior"] as const;
    const rootProperties = ["overflow", "touchAction", "overscrollBehavior"] as const;
    const previousBody = Object.fromEntries(bodyProperties.map((property) => [property, body.style[property]])) as Record<(typeof bodyProperties)[number], string>;
    const previousRoot = appRoot ? Object.fromEntries(rootProperties.map((property) => [property, appRoot.style[property]])) as Record<(typeof rootProperties)[number], string> : null;

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    body.style.overscrollBehavior = "none";
    body.dataset.filterScrollLocked = "true";
    if (appRoot) {
      appRoot.style.overflow = "hidden";
      appRoot.style.touchAction = "none";
      appRoot.style.overscrollBehavior = "none";
    }

    return () => {
      for (const property of bodyProperties) body.style[property] = previousBody[property];
      delete body.dataset.filterScrollLocked;
      if (appRoot && previousRoot) for (const property of rootProperties) appRoot.style[property] = previousRoot[property];
      const restoreScroll = () => { if (window.location.pathname === pathname) window.scrollTo(scrollX, scrollY); };
      restoreScroll();
      window.requestAnimationFrame(restoreScroll);
      window.setTimeout(restoreScroll, 0);
    };
  }, [open]);
}

export function MobileFilterButton({ open, activeCount, onOpen, controlsId, className = "" }: FilterButtonProps) {
  return <button ref={(node) => { if (node) filterTriggers.set(controlsId, node); else filterTriggers.delete(controlsId); }} type="button" className={`button button-secondary mobile-filter-button ${className}`.trim()} aria-haspopup="dialog" aria-expanded={open} aria-controls={controlsId} onClick={(event) => { filterTriggers.set(controlsId, event.currentTarget); onOpen(); }}>
    <Filter size={17} aria-hidden="true" />
    Filtry
    {activeCount > 0 && <span className="filter-count" aria-label={`${activeCount} aktivních filtrů`}>{activeCount}</span>}
  </button>;
}

export function MobileFilterToolbar({ open, activeCount, onToggle, controlsId }: Omit<FilterButtonProps, "onOpen"> & { onToggle: () => void }) {
  return <div className="mobile-filter-toolbar">
    <MobileFilterButton open={open} activeCount={activeCount} onOpen={onToggle} controlsId={controlsId} />
  </div>;
}

export function MobileFilterDialog({ open, activeCount, onClose, onReset, onApply, controlsId, children, bodyClassName = "", applyLabel = "Použít filtry" }: FilterDialogProps) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const pathAtOpen = useRef(pathname);
  const wasOpen = useRef(false);
  const titleId = useId();
  const dialogRef = useModalDialog<HTMLDivElement>(open, onClose);

  useFilterScrollLock(open);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (wasOpen.current && !open) window.requestAnimationFrame(() => filterTriggers.get(controlsId)?.focus());
    wasOpen.current = open;
  }, [controlsId, open]);
  useEffect(() => {
    if (!open) { pathAtOpen.current = pathname; return; }
    if (pathname !== pathAtOpen.current) onClose();
  }, [onClose, open, pathname]);
  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia(mobileFilterMediaQuery);
    const closeOnDesktop = () => { if (!media.matches) onClose(); };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, [onClose, open]);

  if (!mounted || !open) return null;
  return createPortal(
    <div className="mobile-filter-layer" data-modal-layer onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} id={controlsId} className="mobile-filter-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-modal-layer>
        <header className="mobile-filter-dialog-head">
          <h2 id={titleId}>Filtry{activeCount > 0 && <span className="filter-count" aria-label={`${activeCount} aktivních filtrů`}>{activeCount}</span>}</h2>
          <button type="button" className="icon-button" data-autofocus aria-label="Zavřít filtry" onClick={onClose}><X size={20} /></button>
        </header>
        <div className={`mobile-filter-dialog-body filter-panel ${bodyClassName}`.trim()}>{children}</div>
        <footer className="mobile-filter-dialog-actions">
          <button type="button" className="button button-secondary" onClick={onReset}><RotateCcw size={16} />Vymazat</button>
          <button type="button" className="button button-primary" onClick={() => { onApply?.(); onClose(); }}>{applyLabel}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
