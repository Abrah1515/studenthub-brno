import { Scale } from "lucide-react";
import { PageHeading } from "@/components/page-heading";

export function LegalPage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="page-stack legal-page"><PageHeading eyebrow="Právní informace" title={title} description={description} /><div className="legal-warning"><Scale size={18} /><p><strong>Návrh dokumentu:</strong> před ostrým spuštěním musí text zkontrolovat právník podle skutečného provozovatele, služeb a zpracovatelů.</p></div><article className="legal-card">{children}</article></div>;
}
