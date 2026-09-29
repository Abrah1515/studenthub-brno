"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useCurrentCity } from "@/components/city-context";

export function BrandSymbol({ size = 38, priority = false, className = "" }: { size?: number; priority?: boolean; className?: string }) {
  const city = useCurrentCity();
  return <span className={`brand-mark ${className}`.trim()} aria-hidden="true" style={{ "--brand-symbol-size": `${size}px`, position: "relative", width: size, height: size, display: "inline-grid", overflow: "hidden" } as CSSProperties}><Image src={city.selectionLogo.symbol} alt="" fill sizes={`${size}px`} priority={priority} style={{ objectFit: "contain", pointerEvents: "none" }} /></span>;
}

export function BrandLogo({ width = 160, priority = false, className = "" }: { width?: number; priority?: boolean; className?: string }) {
  const city = useCurrentCity();
  const editionName = String(city.brandConfig.editionName || `StudentHub ${city.name}`);
  return <span className={`brand-logo ${className}`.trim()} role="img" aria-label={editionName} style={{ position: "relative", display: "block", width, aspectRatio: `${city.selectionLogo.width} / ${city.selectionLogo.height}`, overflow: "hidden" }}>
    <Image className="brand-logo-light" src={city.selectionLogo.light} alt="" fill sizes={`${width}px`} priority={priority} style={{ pointerEvents: "none" }} />
    <Image className="brand-logo-dark" src={city.selectionLogo.dark} alt="" fill sizes={`${width}px`} priority={priority} style={{ pointerEvents: "none" }} />
  </span>;
}

export function BrandHorizontalLogo({ width = 196, priority = false, className = "" }: { width?: number; priority?: boolean; className?: string }) {
  const city = useCurrentCity();
  const editionName = String(city.brandConfig.editionName || `StudentHub ${city.name}`);
  const gap = Math.round(width * 0.05);
  const symbolWidth = Math.round(width * 0.32);
  const wordmarkWidth = width - symbolWidth - gap;
  const symbolHeight = symbolWidth * city.selectionLogo.height / city.selectionLogo.width;
  const wordmarkHeight = wordmarkWidth * 102 / city.selectionLogo.width;
  const sourceHeight = wordmarkWidth * city.selectionLogo.height / city.selectionLogo.width;
  const cropTop = wordmarkWidth * 286 / city.selectionLogo.width;

  return <span className={`brand-logo-horizontal ${className}`.trim()} role="img" aria-label={editionName} style={{ position: "relative", display: "inline-flex", alignItems: "center", width, height: symbolHeight, gap, overflow: "hidden" }}>
    <span className="brand-logo-horizontal-symbol" style={{ position: "relative", display: "block", flex: "0 0 auto", width: symbolWidth, height: symbolHeight, overflow: "hidden" }}>
      <Image src={city.selectionLogo.symbol} alt="" fill sizes={`${symbolWidth}px`} priority={priority} style={{ pointerEvents: "none" }} />
    </span>
    <span className="brand-logo-wordmark" style={{ position: "relative", display: "block", flex: "0 0 auto", width: wordmarkWidth, height: wordmarkHeight, overflow: "hidden" }}>
      <Image className="brand-logo-light" src={city.selectionLogo.light} alt="" width={city.selectionLogo.width} height={city.selectionLogo.height} sizes={`${wordmarkWidth}px`} priority={priority} style={{ position: "absolute", left: 0, width: wordmarkWidth, height: sourceHeight, top: -cropTop, pointerEvents: "none" }} />
      <Image className="brand-logo-dark" src={city.selectionLogo.dark} alt="" width={city.selectionLogo.width} height={city.selectionLogo.height} sizes={`${wordmarkWidth}px`} priority={priority} style={{ position: "absolute", left: 0, width: wordmarkWidth, height: sourceHeight, top: -cropTop, pointerEvents: "none" }} />
    </span>
  </span>;
}
