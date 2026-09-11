import Image from "next/image";
import type { CSSProperties } from "react";
import { brand } from "@/lib/brand";

export function BrandSymbol({ size = 38, priority = false, className = "" }: { size?: number; priority?: boolean; className?: string }) {
  return <span className={`brand-mark ${className}`.trim()} aria-hidden="true" style={{ "--brand-symbol-size": `${size}px`, width: size, height: size, display: "inline-grid", overflow: "hidden" } as CSSProperties}><Image src={brand.assets.icon192} alt="" width={size} height={size} priority={priority} style={{ pointerEvents: "none" }} /></span>;
}

export function BrandLogo({ width = 160, priority = false, className = "" }: { width?: number; priority?: boolean; className?: string }) {
  return <span className={`brand-logo ${className}`.trim()} role="img" aria-label={brand.editionName} style={{ position: "relative", display: "block", width, aspectRatio: "391 / 396", overflow: "hidden" }}>
    <Image className="brand-logo-light" src={brand.assets.logo} alt="" fill sizes={`${width}px`} priority={priority} style={{ pointerEvents: "none" }} />
    <Image className="brand-logo-dark" src={brand.assets.logoDark} alt="" fill sizes={`${width}px`} priority={priority} style={{ pointerEvents: "none" }} />
  </span>;
}

export function BrandHorizontalLogo({ width = 196, priority = false, className = "" }: { width?: number; priority?: boolean; className?: string }) {
  const gap = Math.round(width * 0.05);
  const symbolWidth = Math.round(width * 0.32);
  const wordmarkWidth = width - symbolWidth - gap;
  const symbolHeight = symbolWidth * 263 / 271;
  const wordmarkHeight = wordmarkWidth * 102 / 391;
  const sourceHeight = wordmarkWidth * 396 / 391;
  const cropTop = wordmarkWidth * 286 / 391;

  return <span className={`brand-logo-horizontal ${className}`.trim()} role="img" aria-label={brand.editionName} style={{ position: "relative", display: "inline-flex", alignItems: "center", width, height: symbolHeight, gap, overflow: "hidden" }}>
    <span className="brand-logo-horizontal-symbol" style={{ position: "relative", display: "block", flex: "0 0 auto", width: symbolWidth, height: symbolHeight, overflow: "hidden" }}>
      <Image src={brand.assets.symbol} alt="" fill sizes={`${symbolWidth}px`} priority={priority} style={{ pointerEvents: "none" }} />
    </span>
    <span className="brand-logo-wordmark" style={{ position: "relative", display: "block", flex: "0 0 auto", width: wordmarkWidth, height: wordmarkHeight, overflow: "hidden" }}>
      <Image className="brand-logo-light" src={brand.assets.logo} alt="" width={391} height={396} sizes={`${wordmarkWidth}px`} priority={priority} style={{ position: "absolute", left: 0, width: wordmarkWidth, height: sourceHeight, top: -cropTop, pointerEvents: "none" }} />
      <Image className="brand-logo-dark" src={brand.assets.logoDark} alt="" width={391} height={396} sizes={`${wordmarkWidth}px`} priority={priority} style={{ position: "absolute", left: 0, width: wordmarkWidth, height: sourceHeight, top: -cropTop, pointerEvents: "none" }} />
    </span>
  </span>;
}
