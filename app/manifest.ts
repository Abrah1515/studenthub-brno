import type { MetadataRoute } from "next";
import { brnoCity } from "@/lib/cities";
import { manifestForCity } from "@/lib/pwa-manifest";

export default function manifest(): MetadataRoute.Manifest {
  return manifestForCity(brnoCity);
}
