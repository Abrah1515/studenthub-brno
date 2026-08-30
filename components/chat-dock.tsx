"use client";

import { MessageCircle, Minus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChatComposerCard } from "@/components/chat-composer-card";
import { ChatThread } from "@/components/chat-thread";
import { openChatComposerEvent, type ChatComposerTarget } from "@/components/chat-start-button";

type DockState = { id?: string; target?: ChatComposerTarget; minimized?: boolean };
const storageKey = "studenthub-chat-dock-v1";
export const chatDockPrioritySurfaceSelector = '[aria-modal="true"],.community-comment-form,.community-inline-edit,.community-compose-dialog,.place-suggestion-dialog,.place-comment-form,.marketplace-form,.buddy-form';

export function ChatDock() {
  const [state, setState] = useState<DockState | null>(null); const [priorityActive, setPriorityActive] = useState(false); const previousFocus = useRef<HTMLElement | null>(null); const dockRef = useRef<HTMLElement>(null);
  useEffect(() => {
    try { const saved = sessionStorage.getItem(storageKey); if (saved && !matchMedia("(max-width: 860px)").matches) setState(JSON.parse(saved)); } catch {}
    const compose = (event: Event) => { if (matchMedia("(max-width: 860px)").matches) return; previousFocus.current = document.activeElement as HTMLElement; setState({ target: (event as CustomEvent<ChatComposerTarget>).detail }); };
    const open = (event: Event) => { previousFocus.current = document.activeElement as HTMLElement; setState({ id: (event as CustomEvent<{ id: string }>).detail.id }); };
    document.documentElement.dataset.chatDockReady = "true";
    window.addEventListener(openChatComposerEvent, compose); window.addEventListener("studenthub-open-chat", open);
    return () => { delete document.documentElement.dataset.chatDockReady; window.removeEventListener(openChatComposerEvent, compose); window.removeEventListener("studenthub-open-chat", open); };
  }, []);
  useEffect(() => { if (state) sessionStorage.setItem(storageKey, JSON.stringify(state)); else sessionStorage.removeItem(storageKey); }, [state]);
  useEffect(() => {
    if (!state || state.minimized) return;
    if (document.querySelector(chatDockPrioritySurfaceSelector)) { setState({ ...state, minimized: true }); return; }
    requestAnimationFrame(() => dockRef.current?.focus());
  }, [state]);
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && state && !state.minimized) setState({ ...state, minimized: true }); }; window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape); }, [state]);
  useEffect(() => {
    const minimize = () => setState((current) => current && !current.minimized ? { ...current, minimized: true } : current);
    const inspect = () => { const active = Boolean(document.querySelector(chatDockPrioritySurfaceSelector)); setPriorityActive(active); if (active) minimize(); };
    const focus = (event: FocusEvent) => { const target = event.target; if (target instanceof Element && !target.closest(".chat-dock") && target.closest(chatDockPrioritySurfaceSelector)) minimize(); };
    const observer = new MutationObserver(inspect); observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal", "class"] });
    document.addEventListener("focusin", focus, true); inspect();
    return () => { observer.disconnect(); document.removeEventListener("focusin", focus, true); };
  }, []);
  function close() { setState(null); requestAnimationFrame(() => previousFocus.current?.focus()); }
  if (!state) return null;
  if (priorityActive) return null;
  if (state.minimized) return <button className="chat-dock-minimized" type="button" onClick={() => setState({ ...state, minimized: false })}><MessageCircle size={18} /><span>Otevřít chat</span></button>;
  return <aside ref={dockRef} tabIndex={-1} role="dialog" aria-modal="false" className="chat-dock" aria-label="Okno soukromého chatu"><div className="chat-dock-controls"><button type="button" className="icon-button" aria-label="Minimalizovat chat" onClick={() => setState({ ...state, minimized: true })}><Minus size={17} /></button><button type="button" className="icon-button" aria-label="Zavřít chat" onClick={close}><X size={17} /></button></div>{state.target ? <ChatComposerCard dock target={state.target} onClose={close} /> : state.id ? <ChatThread dock conversationId={state.id} onClose={close} /> : null}</aside>;
}
