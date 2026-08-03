"use client";

import { Check, Copy, GraduationCap } from "lucide-react";
import { useState } from "react";
import { savePreference } from "@/lib/client-preferences";

export function SchoolHubActions({ universityId, referral }: { universityId: string; referral: string }) {
  const [copied, setCopied] = useState(false);
  function choose() { savePreference({ universityId, facultyId: null, completed: true }); window.location.assign("/"); }
  async function copy() { const url = `${window.location.origin}/?ref=${referral}`; await navigator.clipboard.writeText(url); setCopied(true); }
  return <div className="school-actions"><button className="button button-primary" onClick={choose}><GraduationCap size={17} />Nastavit jako moji školu</button><button className="button button-secondary" onClick={copy}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "Odkaz zkopírován" : "Komunitní referral odkaz"}</button></div>;
}
