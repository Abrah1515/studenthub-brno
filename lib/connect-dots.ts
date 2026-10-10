import { z } from "zod";

export type Dot = Readonly<{ x: number; y: number }>;
export type DotsManifest = Readonly<{
  id: string; slug: string; title: string; previewAsset: string; completedAsset: string;
  relatedColoringPageSlug: string; difficulty: "Lehká" | "Střední"; version: 1;
  points: readonly Dot[];
}>;
const manifest = (id: string, title: string, difficulty: DotsManifest["difficulty"], pairs: readonly (readonly [number, number])[]): DotsManifest => ({
  id, slug: id, title, difficulty, version: 1,
  previewAsset: `/coloring/v1/${id}/preview.webp`, completedAsset: `/coloring/v1/${id}/lines.png`,
  relatedColoringPageSlug: id, points: pairs.map(([x, y]) => ({ x, y })),
});
// Hand-traced feature outlines in the original 768 × 1024 artwork. The view fits
// this outline, not a fixed screen size. The final edge closes back to point 1.
export const dotsGames: readonly DotsManifest[] = [
  manifest("botanical", "Botanický klid – list", "Střední", [[.24,.025],[.40,.075],[.49,.18],[.48,.30],[.40,.39],[.29,.46],[.15,.42],[.055,.34],[.025,.22],[.08,.10]]),
  manifest("desk", "Studentský stůl – notebook", "Lehká", [[.423,.37],[.735,.39],[.721,.554],[.67,.639],[.257,.587],[.407,.53]]),
  manifest("library", "Univerzitní knihovna – okno", "Lehká", [[.135,.515],[.13,.15],[.18,.065],[.265,.018],[.375,.034],[.46,.12],[.483,.525]]),
  manifest("brno", "Brno – Petrov", "Střední", [[.407,.414],[.447,.325],[.514,.301],[.548,.226],[.578,.055],[.611,.23],[.633,.288],[.652,.228],[.681,.062],[.713,.232],[.739,.322],[.766,.414]]),
  manifest("praha", "Praha – mostecká věž", "Střední", [[.31,.621],[.306,.262],[.346,.221],[.379,.073],[.421,.184],[.47,.25],[.514,.268],[.519,.62]]),
  manifest("olomouc", "Olomouc – radniční věž", "Střední", [[.262,.794],[.262,.349],[.305,.29],[.312,.19],[.34,.024],[.367,.192],[.38,.289],[.414,.351],[.414,.794]]),
];
export const DOTS_MAX_PAYLOAD = 4096;
export const dotsProgressSchema = z.object({
  manifestVersion: z.literal(1), cursor: z.number().int().min(0).max(100),
  undo: z.array(z.number().int().min(0).max(100)).max(30),
  redo: z.array(z.number().int().min(0).max(100)).max(30),
}).strict();
export type DotsProgress = z.infer<typeof dotsProgressSchema>;
export const emptyDots = (): DotsProgress => ({ manifestVersion: 1, cursor: 0, undo: [], redo: [] });
export const dotsSaveSchema = z.object({ revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), progress: dotsProgressSchema }).strict();
export function validDotsProgress(game: DotsManifest, input: unknown): DotsProgress | null {
  const parsed = dotsProgressSchema.safeParse(input);
  if (!parsed.success || [parsed.data.cursor, ...parsed.data.undo, ...parsed.data.redo].some(n => n > game.points.length)) return null;
  return parsed.data;
}
export function dotsPercentage(game: DotsManifest, progress: DotsProgress) { return Math.round(progress.cursor / game.points.length * 100); }
export function dotCoordinates(point: Dot, width: number, height: number): Dot { return { x: point.x * width, y: point.y * height }; }
export function connectDot(game: DotsManifest, progress: DotsProgress, index: number): DotsProgress {
  if (index !== progress.cursor || index >= game.points.length) return progress;
  return { ...progress, cursor: index + 1, undo: [...progress.undo, progress.cursor].slice(-30), redo: [] };
}
export function undoDot(progress: DotsProgress): DotsProgress {
  const cursor = progress.undo.at(-1); return cursor === undefined ? progress : { ...progress, cursor, undo: progress.undo.slice(0,-1), redo: [...progress.redo, progress.cursor].slice(-30) };
}
export function redoDot(progress: DotsProgress): DotsProgress {
  const cursor = progress.redo.at(-1); return cursor === undefined ? progress : { ...progress, cursor, redo: progress.redo.slice(0,-1), undo: [...progress.undo, progress.cursor].slice(-30) };
}
