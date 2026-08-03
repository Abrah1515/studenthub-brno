"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useStudentPreference } from "@/lib/client-preferences";

export function PrivacyAnalytics() {
  const pathname = usePathname(); const search = useSearchParams(); const preference = useStudentPreference();
  useEffect(() => {
    const incoming = search.get("ref");
    if (incoming && /^[a-z0-9-]{2,80}$/.test(incoming)) sessionStorage.setItem("studenthub-referral", incoming);
    function send() {
      try { const consent = JSON.parse(localStorage.getItem("studenthub-consent") || "{}"); if (!consent.analytics) return; const key = `studenthub-view:${pathname}:${preference.cityId}:${preference.universityId || "all"}:${preference.facultyId || "all"}`; if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); navigator.sendBeacon("/api/analytics/pageview", new Blob([JSON.stringify({ path: pathname, cityId: preference.cityId, universityId: preference.universityId, facultyId: preference.facultyId, referralCode: sessionStorage.getItem("studenthub-referral") })], { type: "application/json" })); } catch { /* Analytika nesmí ovlivnit aplikaci. */ }
    }
    send();
    window.addEventListener("studenthub-consent-changed", send);
    return () => window.removeEventListener("studenthub-consent-changed", send);
  }, [pathname, search, preference]);
  return null;
}
