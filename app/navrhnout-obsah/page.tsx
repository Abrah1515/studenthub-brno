import type { Metadata } from "next";
import { Suspense } from "react";
import { Users } from "lucide-react";
import { ContentSubmissionForm } from "@/components/content-submission-form";
import { PageHeading } from "@/components/page-heading";
export const metadata: Metadata = { title: "Navrhnout obsah za studentský spolek", description: "Moderované zaslání veřejné akce, nabídky, místa nebo brigády studentským spolkem.", alternates: { canonical: "/navrhnout-obsah" } };
export default function SubmitContentPage() { return <div className="page-stack club-submit-page"><PageHeading eyebrow="Studentské spolky a týmy" title="Navrhnout obsah" description="Pošlete veřejně ověřitelný tip. Zveřejní se až po kontrole administrátorem nebo fakultním editorem." /><div className="independent-banner"><Users size={18} /><p>StudentHub není školní systém. Neposílejte interní dokumenty, hesla ani materiály bez oprávnění autora.</p></div><Suspense fallback={<div className="loading-state"><span /><span /><span /></div>}><ContentSubmissionForm /></Suspense></div>; }
