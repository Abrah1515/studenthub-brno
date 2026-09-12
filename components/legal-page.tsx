import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { operator } from "@/lib/legal";

type SectionLink = { id: string; label: string };

export function LegalPage({ title, description, version, effectiveDate, updatedDate, sections, children }: { title: string; description: string; version: string; effectiveDate: string; updatedDate: string; sections: SectionLink[]; children: React.ReactNode }) {
  return <div className="page-stack legal-page">
    <Link className="legal-back" href="/brno"><ArrowLeft size={16} />Zpět do aplikace</Link>
    <PageHeading eyebrow="Právní informace" title={title} description={description} />
    <div className="legal-meta" aria-label="Verze dokumentu">
      <span>Verze <strong>{version}</strong></span>
      <span>Účinné od <strong>{effectiveDate}</strong></span>
      <span>Poslední aktualizace <strong>{updatedDate}</strong></span>
    </div>
    <nav className="legal-toc" aria-labelledby="legal-toc-title"><h2 id="legal-toc-title">Obsah dokumentu</h2><ol>{sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.label}</a></li>)}</ol></nav>
    <article className="legal-card">{children}</article>
    <footer className="legal-contact"><Mail size={17} /><span>Dotazy k dokumentu: <a href={`mailto:${operator.email}`}>{operator.email}</a></span></footer>
  </div>;
}
