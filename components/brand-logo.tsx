import Image from "next/image";
import type { CSSProperties } from "react";
import { brand } from "@/lib/brand";

export function BrandSymbol({ size = 38, priority = false, className = "" }: { size?: number; priority?: boolean; className?: string }) {
  return <span className={`brand-mark ${className}`.trim()} aria-hidden="true" style={{ "--brand-symbol-size": `${size}px` } as CSSProperties}><Image src={brand.assets.icon192} alt="" width={size} height={size} priority={priority} /></span>;
}

export function BrandLogo({ width = 160, priority = false, className = "" }: { width?: number; priority?: boolean; className?: string }) {
  return <span className={`brand-logo ${className}`.trim()} role="img" aria-label={brand.editionName} style={{ width, aspectRatio: "216 / 219" }}>
    <Image className="brand-logo-light" src={brand.assets.logo} alt="" fill sizes={`${width}px`} priority={priority} />
    <Image className="brand-logo-dark" src={brand.assets.logoDark} alt="" fill sizes={`${width}px`} priority={priority} />
  </span>;
}

export function BrandHorizontalLogo({ width = 196, priority = false, className = "" }: { width?: number; priority?: boolean; className?: string }) {
  const gap = Math.round(width * 0.05);
  const symbolWidth = Math.round(width * 0.32);
  const wordmarkWidth = width - symbolWidth - gap;
  const symbolHeight = symbolWidth * 150 / 155;
  const wordmarkHeight = wordmarkWidth * 56 / 216;
  const sourceHeight = wordmarkWidth * 219 / 216;
  const cropTop = wordmarkWidth * 163 / 216;

  return <span className={`brand-logo-horizontal ${className}`.trim()} role="img" aria-label={brand.editionName} style={{ width, height: symbolHeight, gap }}>
    <span className="brand-logo-horizontal-symbol" style={{ width: symbolWidth, height: symbolHeight }}>
      <Image src={brand.assets.symbol} alt="" fill sizes={`${symbolWidth}px`} priority={priority} />
    </span>
    <span className="brand-logo-wordmark" style={{ width: wordmarkWidth, height: wordmarkHeight }}>
      <Image className="brand-logo-light" src={brand.assets.logo} alt="" width={216} height={219} sizes={`${wordmarkWidth}px`} priority={priority} style={{ width: wordmarkWidth, height: sourceHeight, top: -cropTop }} />
      <Image className="brand-logo-dark" src={brand.assets.logoDark} alt="" width={216} height={219} sizes={`${wordmarkWidth}px`} priority={priority} style={{ width: wordmarkWidth, height: sourceHeight, top: -cropTop }} />
    </span>
  </span>;
}
