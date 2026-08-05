"use client";

import { useEffect, useRef } from "react";

const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalDialog<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose?: () => void, options: { closeOnEscape?: boolean } = {}) {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = dialogRef.current; if (!open || !dialog) return; const activeDialog = dialog;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const background: HTMLElement[] = []; let branch: HTMLElement = activeDialog; let parent = branch.parentElement;
    while (parent) {
      for (const sibling of [...parent.children]) if (sibling !== branch && !sibling.hasAttribute("data-modal-layer") && sibling instanceof HTMLElement && !background.includes(sibling)) background.push(sibling);
      if (parent === document.body) break; branch = parent; parent = parent.parentElement;
    }
    const previous = background.map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute("aria-hidden") }));
    background.forEach((element) => { element.inert = true; element.setAttribute("aria-hidden", "true"); });
    const focusables = () => [...activeDialog.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    (activeDialog.querySelector<HTMLElement>("[data-autofocus]") || focusables()[0] || activeDialog).focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape" && options.closeOnEscape !== false && onCloseRef.current) { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusables(); if (!items.length) { event.preventDefault(); activeDialog.focus(); return; }
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.documentElement.style.overflow = previousOverflow;
      previous.forEach(({ element, inert, ariaHidden }) => { element.inert = inert; if (ariaHidden === null) element.removeAttribute("aria-hidden"); else element.setAttribute("aria-hidden", ariaHidden); });
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, options.closeOnEscape]);
  return dialogRef;
}
