export function resolutionForReviewReason(reason) {
  switch (reason) {
    case "stale_academic_year":
      return { status: "rejected", code: "rejected_stale_academic_year", note: "Zamítnuto: návrh pochází ze staršího akademického roku a nesmí měnit aktuální veřejný kalendář." };
    case "suspicious_mass_change":
      return { status: "rejected", code: "rejected_suspicious_mass_change", note: "Zamítnuto: hromadná změna nebyla dostatečně doložena aktuálním oficiálním zdrojem; veřejná data zůstala beze změny." };
    case "unproven_revision":
      return { status: "rejected", code: "rejected_unproven_revision", note: "Zamítnuto: novější oficiální revize nebyla prokázána; veřejná data zůstala beze změny." };
    case "manual_monitoring_only":
      return { status: "technical_closed", code: "blocked_manual_monitoring", note: "BLOCKED: zdroj je určen pouze k ručnímu ověření. Automatická publikace ani odstranění dat nejsou povolené." };
    case "incomplete_result":
      return { status: "technical_closed", code: "blocked_incomplete_result", note: "BLOCKED: parser vrátil neúplný výsledek. Návrh nebyl publikován a poslední ověřená data zůstala zachována." };
    default:
      return null;
  }
}
