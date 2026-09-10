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
