import type { EventCategory } from "@/lib/types";

export type SourceFormat = "api" | "json" | "ics" | "xml" | "html" | "pdf";
export type SourceMonitoringMode = "automatic_publish" | "automatic_review" | "not_found_monitored";

export type ContentSource = {
  id: string;
  cityId?: string;
  universityId: string;
  facultyId: string;
  sourceType: "academic_calendar";
  sourceUrl: string;
  officialDomain: string;
  allowedDomains?: string[];
  format: SourceFormat;
  parserKey: string;
  enabled: boolean;
  refreshIntervalHours: number;
  monitoringMode: SourceMonitoringMode;
  termsNote: string;
  academicYear: string | null;
  confidence: number;
  requiresReview: boolean;
  notes: string;
  sourceDocumentTitle?: string;
};

export type NormalizedEvent = {
  externalId: string;
  title: string;
  description: string;
  startAt: string;
  endAt?: string;
  allDay: boolean;
  timezone: "Europe/Prague";
  category: EventCategory;
  academicYear: string;
  universityId: string;
  facultyId: string;
  sourceId: string;
  sourceUrl: string;
  sourceUpdatedAt?: string;
  sourceModifiedBasis?: "explicit_school_update" | "document_revision" | "http_last_modified" | "first_detected";
  sourceHash: string;
  confidence: number;
  status: "approved" | "pending";
  lastVerifiedAt: string;
  cityId?: string;
  programmeId?: string;
  sourceDocumentTitle?: string;
  sourcePage?: number;
  originalText?: string;
};

export type ConnectorContext = { source: ContentSource; body: Uint8Array; contentType: string; checkedAt: string };
export type ConnectorResult = { events: NormalizedEvent[]; warnings: string[]; sourceText?: string; documentTitle?: string; normalizedHash?: string };
