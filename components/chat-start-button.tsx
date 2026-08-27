"use client";

import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ChatContextType } from "@/lib/chat-types";
import { classNames } from "@/lib/format";

export const openChatComposerEvent = "studenthub-open-chat-composer";
export type ChatComposerTarget = { contextType: ChatContextType; contextId?: string; recipientUsername?: string; label?: string };

export function ChatStartButton({ contextType, contextId, recipientUsername, label = "Napsat", className }: ChatComposerTarget & { className?: string }) {
  const router = useRouter();
  function open() {
    const detail = { contextType, contextId, recipientUsername, label };
    if (window.matchMedia("(max-width: 860px)").matches) {
      const query = new URLSearchParams({ compose: contextType }); if (contextId) query.set("contextId", contextId); if (recipientUsername) query.set("to", recipientUsername); if (label) query.set("label", label);
      router.push(`/chat?${query}`); return;
    }
    window.dispatchEvent(new CustomEvent<ChatComposerTarget>(openChatComposerEvent, { detail }));
  }
  return <button type="button" className={classNames("button button-primary chat-start-button", className)} onClick={open}><MessageCircle size={17} aria-hidden="true" />{label}</button>;
}
