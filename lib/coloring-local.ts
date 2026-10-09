"use client";
import type { SavedDrawing } from "@/lib/coloring";
import { drawingSchema } from "@/lib/coloring";

const key = (owner: string, id: string) => `studenthub-coloring-v1:${owner}:${id}`;
export function readLocalDrawing(owner: string, id: string): SavedDrawing | null {
  try { const row = JSON.parse(localStorage.getItem(key(owner, id)) || "null"); if (!row || !drawingSchema.safeParse(row.drawing).success || !Number.isSafeInteger(row.revision) || row.revision<0 || typeof row.dirty!=="boolean" || typeof row.updatedAt!=="string") return null; return row; } catch { return null; }
}
export function writeLocalDrawing(owner: string, id: string, value: SavedDrawing) { localStorage.setItem(key(owner, id), JSON.stringify(value)); }

function database(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const req = indexedDB.open("studenthub-coloring-assets-v1", 1); req.onupgradeneeded = () => req.result.createObjectStore("assets"); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
export async function cachedAsset(url: string): Promise<Blob> {
  let db: IDBDatabase | null = null;
  try {
    db = await database();
    const cached = await new Promise<Blob | undefined>((resolve, reject) => { const req = db!.transaction("assets").objectStore("assets").get(url); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    if (cached) { db.close(); return cached; }
  } catch { /* The editor remains usable when IndexedDB is unavailable. */ }
  const response = await fetch(url); if (!response.ok) throw new Error("Obrázek se nepodařilo načíst. Zkuste to po připojení znovu.");
  const blob = await response.blob();
  if (db) { const activeDb = db; await new Promise<void>((resolve) => { const tx = activeDb.transaction("assets", "readwrite"); tx.objectStore("assets").put(blob, url); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); }); db.close(); }
  return blob;
}
