import Link from "next/link";
export default function NotFound() { return <div className="empty-state"><h1>Tady nic není</h1><p>Odkaz mohl zestárnout nebo byl obsah odebrán.</p><Link className="button button-primary" href="/">Zpět na přehled</Link></div>; }
