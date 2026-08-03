"use client";

import { createContext, useContext } from "react";
import type { AcademicCatalog } from "@/lib/types";
import { fallbackAcademicCatalog } from "@/lib/universities";

const AcademicCatalogContext = createContext<AcademicCatalog>(fallbackAcademicCatalog);

export function AcademicCatalogProvider({ catalog, children }: { catalog: AcademicCatalog; children: React.ReactNode }) {
  return <AcademicCatalogContext.Provider value={catalog}>{children}</AcademicCatalogContext.Provider>;
}

export function useAcademicCatalog() { return useContext(AcademicCatalogContext); }
