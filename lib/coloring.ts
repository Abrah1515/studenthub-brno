import { z } from "zod";

export const COLORING_VERSION = 1;
export const MAX_POINTS = 16000;
export const MAX_PAYLOAD = 600000;
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const pointSchema = z.tuple([z.number().finite().min(0).max(1), z.number().finite().min(0).max(1), z.number().finite().min(0).max(1)]);
export const strokeSchema = z.object({ color: colorSchema, width: z.number().min(1).max(70), erase: z.boolean(), points: z.array(pointSchema).min(1).max(4000) }).strict();
export const drawingSchema = z.object({ assetVersion: z.literal(COLORING_VERSION), colors: z.record(z.string().regex(/^\d{1,5}$/), colorSchema), strokes: z.array(strokeSchema).max(300), completed: z.boolean() }).strict().superRefine((value, ctx) => {
  if (Object.keys(value.colors).length > 1500 || value.strokes.reduce((n, s) => n + s.points.length, 0) > MAX_POINTS || JSON.stringify(value).length > MAX_PAYLOAD) ctx.addIssue({ code: "custom", message: "Omalovánka překročila limit velikosti. Exportujte ji a omezte počet tahů." });
});
export const saveDrawingSchema = z.object({ revision: z.number().int().min(0), drawing: drawingSchema }).strict();
export type Drawing = z.infer<typeof drawingSchema>;
export type Stroke = z.infer<typeof strokeSchema>;
export type Point = z.infer<typeof pointSchema>;
export type SavedDrawing = { drawing: Drawing; revision: number; updatedAt: string; dirty: boolean };
export type ColoringAsset = { id: string; title: string; collection: string; difficulty: string; alt: string };
export type Region = { id: number; area: number; x: number; y: number };
export const coloringAssets: ColoringAsset[] = [
  { id: "botanical", title: "Botanický klid", collection: "Chvilka pro sebe", difficulty: "Střední", alt: "Velké listy a květy v harmonickém botanickém vzoru" },
  { id: "desk", title: "Můj studijní kout", collection: "Studentský den", difficulty: "Snadná", alt: "Útulný studentský pracovní stůl s knihami a rostlinou" },
  { id: "library", title: "Ticho mezi knihami", collection: "Studentský den", difficulty: "Střední", alt: "Klidná univerzitní knihovna s policemi a čtecím místem" },
  { id: "cafe", title: "Pauza na kávu", collection: "Studentský den", difficulty: "Snadná", alt: "Studentská kavárna s malými stolky a rostlinami" },
  { id: "brno", title: "Studentské Brno", collection: "Naše města", difficulty: "Střední", alt: "Originální pohled na Brno s dvojicí věží a městským parkem" },
  { id: "praha", title: "Studentská Praha", collection: "Naše města", difficulty: "Střední", alt: "Originální pohled na Prahu s mostem a věží" },
  { id: "olomouc", title: "Studentská Olomouc", collection: "Naše města", difficulty: "Střední", alt: "Originální pohled na olomoucké náměstí s kašnou a věží" },
  { id: "ostrava", title: "Studentská Ostrava", collection: "Naše města", difficulty: "Střední", alt: "Originální ostravská industriální architektura s parkem" },
];
export const assetPath = (id: string, name: string) => `/coloring/v1/${id}/${name}`;
export function emptyDrawing(): Drawing { return { assetVersion: COLORING_VERSION, colors: {}, strokes: [], completed: false }; }
export function regionAt(mask: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  const i = (Math.floor(y) * width + Math.floor(x)) * 4;
  return mask[i] + (mask[i + 1] << 8) + (mask[i + 2] << 16);
}
export function completion(drawing: Drawing, regions: Region[]) {
  const total = regions.reduce((n, r) => n + r.area, 0);
  const colored = regions.reduce((n, r) => n + (drawing.colors[String(r.id)] && drawing.colors[String(r.id)].toLowerCase() !== "#ffffff" ? r.area : 0), 0);
  return drawing.completed ? 100 : total ? Math.min(99, Math.round(colored / total * 100)) : 0;
}
export function simplifyPoints(points: Point[], tolerance = 0.0015): Point[] {
  if (points.length <= 2) return points;
  const kept: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const last = kept[kept.length - 1]; const p = points[i];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= tolerance || Math.abs(p[2] - last[2]) > 0.1) kept.push(p);
  }
  kept.push(points[points.length - 1]); return kept;
}
export type History = { past: Drawing[]; present: Drawing; future: Drawing[] };
export function historyChange(history: History, drawing: Drawing): History { return { past: [...history.past.slice(-29), history.present], present: drawing, future: [] }; }
export function historyUndo(h: History): History { return h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future].slice(0, 30) } : h; }
export function historyRedo(h: History): History { return h.future.length ? { past: [...h.past, h.present].slice(-30), present: h.future[0], future: h.future.slice(1) } : h; }
export function panForKey(pan:{x:number;y:number},key:string){const offsets:Record<string,[number,number]>={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};const delta=offsets[key];return delta?{x:pan.x+delta[0],y:pan.y+delta[1]}:pan;}
export function reconcileDrawing(local: SavedDrawing | null, cloud: SavedDrawing | null) {
  if (!local) return { value: cloud, conflict: false };
  if (!cloud) return { value: local, conflict: local.revision > 0 };
  if (local.dirty && local.revision !== cloud.revision) return { value: local, conflict: true };
  return { value: local.dirty ? local : cloud, conflict: false };
}
