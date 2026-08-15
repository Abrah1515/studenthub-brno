"use client";

import { CalendarDays, Sparkles } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AcademicEvent, CommunityEvent, StudyYear } from "@/lib/types";
import { EventExplorer } from "@/components/event-explorer";
import { CommunityEventsExplorer } from "@/components/community-events-explorer";

export function CalendarHub({ academicEvents, communityEvents, cityId, initialUniversityId = "", initialFacultyId = "", initialStudyYear }: { academicEvents: AcademicEvent[]; communityEvents: CommunityEvent[]; cityId: string; initialUniversityId?: string; initialFacultyId?: string; initialStudyYear?: StudyYear }) {
  const router = useRouter(); const pathname = usePathname(); const searchParams = useSearchParams(); const community = searchParams.get("view") === "community";
  function switchView(next: "school" | "community") { const query = new URLSearchParams(searchParams); if (next === "community") query.set("view", "community"); else query.delete("view"); router.replace(`${pathname}${query.size ? `?${query}` : ""}`, { scroll: false }); }
  return <>
    <div className="calendar-mode-switch" role="tablist" aria-label="Typ kalendáře" data-tutorial="calendar-switch">
      <button role="tab" aria-selected={!community} className={!community ? "active" : ""} onClick={() => switchView("school")}><CalendarDays size={18} />Školní termíny</button>
      <button role="tab" aria-selected={community} className={community ? "active" : ""} onClick={() => switchView("community")}><Sparkles size={18} />Co se děje</button>
    </div>
    {community ? <CommunityEventsExplorer initialItems={communityEvents} cityId={cityId} /> : <EventExplorer events={academicEvents} cityId={cityId} initialUniversityId={initialUniversityId} initialFacultyId={initialFacultyId} initialStudyYear={initialStudyYear} />}
  </>;
}
