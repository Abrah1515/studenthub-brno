"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="empty-state"><h1>Něco se nepovedlo</h1><p>Zkuste stránku načíst znovu. Pokud problém trvá, dejte nám vědět.</p><button className="button button-primary" onClick={reset}>Zkusit znovu</button></div>; }
