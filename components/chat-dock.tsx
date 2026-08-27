"use client";

import { MessageCircle, Minus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChatComposerCard } from "@/components/chat-composer-card";
import { ChatThread } from "@/components/chat-thread";
import { openChatComposerEvent, type ChatComposerTarget } from "@/components/chat-start-button";

type DockState = { id?: string; target?: ChatComposerTarget; minimized?: boolean };
const storageKey = "studenthub-chat-dock-v1";

export function ChatDock() {
  const [state, setState] = useState<DockState | null>(null); const previousFocus = useRef<HTMLElement | null>(null); const dockRef = useRef<HTMLElement>(null);
  useEffect(() => {
    try { const saved = sessionStorage.getItem(storageKey); if (saved && !matchMedia("(max-width: 860px)").matches) setState(JSON.parse(saved)); } catch {}
    const compose = (event: Event) => { if (matchMedia("(max-width: 860px)").matches) return; previousFocus.current = document.activeElement as HTMLElement; setState({ target: (event as CustomEvent<ChatComposerTarget>).detail }); };
    const open = (event: Event) => { previousFocus.current = document.activeElement as HTMLElement; setState({ id: (event as CustomEvent<{ id: string }>).detail.id }); };
    document.documentElement.dataset.chatDockReady = "true";
    window.addEventListener(openChatComposerEvent, compose); window.addEventListener("studenthub-open-chat", open);
    return () => { delete document.documentElement.dataset.chatDockReady; window.removeEventListener(openChatComposerEvent, compose); window.removeEventListener("studenthub-open-chat", open); };
  }, []);
  useEffect(() => { if (state) sessionStorage.setItem(storageKey, JSON.stringify(state)); else sessionStorage.removeItem(storageKey); }, [state]);
  useEffect(() => { if (state && !state.minimized) requestAnimationFrame(() => dockRef.current?.focus()); }, [state]);
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && state && !state.minimized) setState({ ...state, minimized: true }); }; window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape); }, [state]);
  function close() { setState(null); requestAnimationFrame(() => previousFocus.current?.focus()); }
  if (!state) return null;
  if (state.minimized) return <button className="chat-dock-minimized" type="button" onClick={() => setState({ ...state, minimized: false })}><MessageCircle size={18} /><span>Otevřít chat</span></button>;
  return <aside ref={dockRef} tabIndex={-1} role="dialog" aria-modal="false" className="chat-dock" aria-label="Okno soukromého chatu" onKeyDown={(event) => { if (event.key !== "Tab") return; const focusable = [...(dockRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])') || [])].filter((item) => item.offsetParent !== null); if (!focusable.length) return; const first = focusable[0]; const last = focusable.at(-1)!; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }}><div className="chat-dock-controls"><button type="button" className="icon-button" aria-label="Minimalizovat chat" onClick={() => setState({ ...state, minimized: true })}><Minus size={17} /></button><button type="button" className="icon-button" aria-label="Zavřít chat" onClick={close}><X size={17} /></button></div>{state.target ? <ChatComposerCard dock target={state.target} onClose={close} /> : state.id ? <ChatThread dock conversationId={state.id} onClose={close} /> : null}</aside>;
}
