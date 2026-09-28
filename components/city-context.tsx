"use client";

import { createContext, useContext } from "react";
import { brnoCity, type City } from "@/lib/cities";

const CityContext = createContext<City>(brnoCity);

export function CityProvider({ city, children }: { city: City; children: React.ReactNode }) {
  return <CityContext.Provider value={city}>{children}</CityContext.Provider>;
}

export function useCurrentCity() { return useContext(CityContext); }
