"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BrandSymbol } from "@/components/brand-logo";
import { useModalDialog } from "@/lib/use-modal-dialog";
import {
  saveTestModeNotice,
  shouldShowTestModeNotice,
  testModeNoticeDismissedEvent,
} from "@/lib/test-mode-notice";

export function TestModeNotice() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Nezobrazovat například během auth callbacku nebo v administraci.
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/auth")
    ) {
      setOpen(false);
      return;
    }

    setOpen(shouldShowTestModeNotice());
  }, [pathname]);

  const dialogRef = useModalDialog<HTMLDivElement>(
    open,
    undefined,
    { closeOnEscape: false },
  );

  if (!open) return null;

  const confirm = () => {
    saveTestModeNotice();
    setOpen(false);

    window.dispatchEvent(
      new Event(testModeNoticeDismissedEvent),
    );
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="tutorial-intro-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="test-mode-title"
      aria-describedby="test-mode-description"
      data-testid="test-mode-notice"
      data-modal-layer
    >
      <div className="tutorial-intro-card">
        <BrandSymbol size={50} />

        <span className="eyebrow">
          Testovací provoz
        </span>

        <h2 id="test-mode-title">
          StudentHub je v testovacím provozu.
        </h2>

        <p id="test-mode-description">
          Aplikaci právě ladíme společně s prvními studenty.
          Pokud něco nebude fungovat podle očekávání,
          dej nám prosím vědět.
        </p>

        <small>
          Napsat nám můžete přes sekci Kontakt.
        </small>

        <button
          type="button"
          className="button button-primary"
          data-autofocus
          onClick={confirm}
        >
          Rozumím, pokračovat
        </button>
      </div>
    </div>
  );
}
