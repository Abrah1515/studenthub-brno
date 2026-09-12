export const tutorialVersion = 3;
export const tutorialStorageKey = "studenthub-tutorial-state";
export const legacyTutorialStorageKey = "studenthub-tutorial-version";
export const openTutorialEvent = "studenthub-open-tutorial";
export const tutorialMenuEvent = "studenthub-tutorial-menu";
export const tutorialResetUiEvent = "studenthub-tutorial-reset-ui";

export const tutorialBreakpoints = { mobileMax: 767, tabletMax: 860 } as const;
export const tutorialMotion = {
  spotlightMs: 360,
  scrollMaxMs: 480,
  textMs: 190,
  textSwapMs: 110,
  menuMs: 300,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

export type TutorialStatus = "not_started" | "in_progress" | "skipped" | "completed";
export type TutorialLayout = "mobile" | "tablet" | "desktop";
export type TutorialPlacement = "top" | "bottom" | "left" | "right" | "auto";
export type TutorialMenuState = "closed" | "open";
export type TutorialScrollArea = "none" | "sidebar" | "menu" | "viewport";

export type TutorialState = {
  tutorialVersion: number;
  introConfirmed: boolean;
  status: TutorialStatus;
  lastCompletedStep: string | null;
};

export type TutorialStep = {
  id: string;
  order: number;
  targetId: string;
  title: string;
  description: string;
  preferredPlacement: TutorialPlacement;
  availability: "target-present";
  menuState: TutorialMenuState;
  scrollArea: TutorialScrollArea;
};

type StepInput = Omit<TutorialStep, "availability">;
const define = (value: StepInput): TutorialStep => ({ ...value, availability: "target-present" });

export const mobileTourSteps: readonly TutorialStep[] = [
  define({ id: "welcome", order: 1, targetId: "brand-compact", title: "Vítej ve StudentHub Brno", description: "Nejdřív projdeme hlavní ovládání aplikace. Celý návod zůstane na Přehledu.", preferredPlacement: "bottom", menuState: "closed", scrollArea: "none" }),
  define({ id: "overview", order: 2, targetId: "overview-navigation-bottom", title: "Přehled", description: "Tady se vždy vrátíš k personalizovanému souhrnu.", preferredPlacement: "top", menuState: "closed", scrollArea: "none" }),
  define({ id: "calendar", order: 3, targetId: "calendar-navigation-bottom", title: "Kalendář", description: "Školní termíny a studentské akce najdeš na jednom místě.", preferredPlacement: "top", menuState: "closed", scrollArea: "none" }),
  define({ id: "places", order: 4, targetId: "places-navigation-bottom", title: "Místa", description: "Seznam, mapa, filtry a navigace k užitečným místům v Brně.", preferredPlacement: "top", menuState: "closed", scrollArea: "none" }),
  define({ id: "community", order: 5, targetId: "community-navigation-bottom", title: "Studentská komunita", description: "Příspěvky, komentáře a bezpečné nahlašování veřejného obsahu.", preferredPlacement: "top", menuState: "closed", scrollArea: "none" }),
  define({ id: "jobs", order: 6, targetId: "jobs-navigation-bottom", title: "Brigády", description: "Aktuální studentské práce s odměnou a původním zdrojem.", preferredPlacement: "top", menuState: "closed", scrollArea: "none" }),
  define({ id: "buddy", order: 7, targetId: "buddy-navigation-floating", title: "Hledám parťáka", description: "Najdi spolužáka na sport, kulturu, cestu nebo společné učení.", preferredPlacement: "top", menuState: "closed", scrollArea: "none" }),
  define({ id: "chat", order: 8, targetId: "chat-navigation-compact", title: "Chat", description: "Tady uvidíš zprávy a žádosti o kontakt.", preferredPlacement: "bottom", menuState: "closed", scrollArea: "none" }),
  define({ id: "marketplace", order: 9, targetId: "marketplace-navigation-topbar", title: "Studentská burza", description: "Bezpečné nabídky učebnic, skript a studijního vybavení.", preferredPlacement: "bottom", menuState: "closed", scrollArea: "none" }),
  define({ id: "menu", order: 10, targetId: "menu-trigger", title: "Hlavní menu", description: "Další krok menu automaticky otevře a projde ho shora dolů.", preferredPlacement: "bottom", menuState: "closed", scrollArea: "none" }),
  define({ id: "housing", order: 11, targetId: "housing-navigation-menu", title: "Bydlení", description: "Nabídky a poptávky studentského bydlení s kontaktem přes profil.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "watcher", order: 12, targetId: "watcher-navigation-menu", title: "Hlídač", description: "Sledované termíny, akce a důležité ověřené změny.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "school-profile", order: 13, targetId: "settings-navigation-menu", title: "Moje škola a profil", description: "Školu, fakultu a ročník nastavíš i bez účtu. Profil potřebuješ pro publikování a komunikaci.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "change-city", order: 14, targetId: "change-city-navigation-menu", title: "Změnit město", description: "Tudy se vrátíš k výběru městské edice StudentHubu.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "install", order: 15, targetId: "install-navigation-menu", title: "Nainstalovat aplikaci", description: "StudentHub můžeš přidat na plochu jako webovou PWA.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "appearance", order: 16, targetId: "appearance-navigation-menu", title: "Nastavení vzhledu", description: "Vyber systémový, světlý nebo tmavý režim.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "about", order: 17, targetId: "about-navigation-menu", title: "O projektu", description: "Informace o nezávislém StudentHubu a jeho fungování.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "contact", order: 18, targetId: "contact-navigation-menu", title: "Kontakt", description: "Tady najdeš provozní kontakt na StudentHub Brno.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "admin", order: 19, targetId: "admin-navigation-menu", title: "Administrace", description: "Zabezpečený vstup je určený pouze oprávněným editorům.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "complete", order: 20, targetId: "brand-compact", title: "Hotovo", description: "Znáš hlavní ovládání StudentHubu. Návod můžeš kdykoliv spustit znovu.", preferredPlacement: "bottom", menuState: "closed", scrollArea: "none" }),
];

export const tabletTourSteps: readonly TutorialStep[] = [
  define({ id: "welcome", order: 1, targetId: "brand-compact", title: "Vítej ve StudentHub Brno", description: "Nejdřív projdeme hlavní ovládání tabletového rozhraní. Celý návod zůstane na Přehledu.", preferredPlacement: "bottom", menuState: "closed", scrollArea: "none" }),
  ...mobileTourSteps.slice(1, 6).map((item, index) => ({ ...item, order: index + 2 })),
  define({ id: "chat", order: 7, targetId: "chat-navigation-compact", title: "Chat", description: "Tady uvidíš zprávy a žádosti o kontakt.", preferredPlacement: "bottom", menuState: "closed", scrollArea: "none" }),
  define({ id: "appearance", order: 8, targetId: "appearance-navigation-topbar", title: "Nastavení vzhledu", description: "Vyber systémový, světlý nebo tmavý režim.", preferredPlacement: "bottom", menuState: "closed", scrollArea: "none" }),
  define({ id: "menu", order: 9, targetId: "menu-trigger", title: "Hlavní menu", description: "Další krok menu automaticky otevře a projde ho shora dolů.", preferredPlacement: "bottom", menuState: "closed", scrollArea: "none" }),
  define({ id: "watcher", order: 10, targetId: "watcher-navigation-menu", title: "Hlídač", description: "Sledované termíny, akce a důležité ověřené změny.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "buddy", order: 11, targetId: "buddy-navigation-menu", title: "Hledám parťáka", description: "Najdi spolužáka na sport, kulturu, cestu nebo společné učení.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "marketplace", order: 12, targetId: "marketplace-navigation-menu", title: "Studentská burza", description: "Bezpečné nabídky učebnic, skript a studijního vybavení.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "housing", order: 13, targetId: "housing-navigation-menu", title: "Bydlení", description: "Nabídky a poptávky studentského bydlení s kontaktem přes profil.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "school-profile", order: 14, targetId: "settings-navigation-menu", title: "Moje škola a profil", description: "Školu, fakultu a ročník nastavíš i bez účtu. Profil potřebuješ pro publikování a komunikaci.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "change-city", order: 15, targetId: "change-city-navigation-tablet", title: "Změnit město", description: "Tudy se vrátíš k výběru městské edice StudentHubu.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "about", order: 16, targetId: "about-navigation-tablet", title: "O projektu", description: "Informace o nezávislém StudentHubu a jeho fungování.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "install", order: 17, targetId: "install-navigation-tablet", title: "Nainstalovat aplikaci", description: "StudentHub můžeš přidat na plochu jako webovou PWA.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "contact", order: 18, targetId: "contact-navigation-tablet", title: "Kontakt", description: "Tady najdeš provozní kontakt na StudentHub Brno.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "admin", order: 19, targetId: "admin-navigation-tablet", title: "Administrace", description: "Zabezpečený vstup je určený pouze oprávněným editorům.", preferredPlacement: "right", menuState: "open", scrollArea: "menu" }),
  define({ id: "complete", order: 20, targetId: "brand-compact", title: "Hotovo", description: "Znáš hlavní ovládání StudentHubu. Návod můžeš kdykoliv spustit znovu.", preferredPlacement: "bottom", menuState: "closed", scrollArea: "none" }),
];

export const desktopTourSteps: readonly TutorialStep[] = [
  define({ id: "welcome", order: 1, targetId: "brand-desktop", title: "Vítej ve StudentHub Brno", description: "Projdeme levý panel shora dolů a nakonec horní lištu. Celý návod zůstane na Přehledu.", preferredPlacement: "right", menuState: "closed", scrollArea: "none" }),
  define({ id: "overview", order: 2, targetId: "overview-navigation-desktop", title: "Přehled", description: "Tady se vždy vrátíš k personalizovanému souhrnu.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "calendar", order: 3, targetId: "calendar-navigation-desktop", title: "Kalendář", description: "Školní termíny a studentské akce najdeš na jednom místě.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "watcher", order: 4, targetId: "watcher-navigation-desktop", title: "Hlídač", description: "Sledované termíny, akce a důležité ověřené změny.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "chat", order: 5, targetId: "chat-navigation-desktop", title: "Chat", description: "Tady uvidíš zprávy a žádosti o kontakt.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "places", order: 6, targetId: "places-navigation-desktop", title: "Místa", description: "Seznam, mapa, filtry a navigace k užitečným místům v Brně.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "community", order: 7, targetId: "community-navigation-desktop", title: "Studentská komunita", description: "Příspěvky, komentáře a bezpečné nahlašování veřejného obsahu.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "buddy", order: 8, targetId: "buddy-navigation-desktop", title: "Hledám parťáka", description: "Najdi spolužáka na sport, kulturu, cestu nebo společné učení.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "jobs", order: 9, targetId: "jobs-navigation-desktop", title: "Brigády", description: "Aktuální studentské práce s odměnou a původním zdrojem.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "marketplace", order: 10, targetId: "marketplace-navigation-desktop", title: "Studentská burza", description: "Bezpečné nabídky učebnic, skript a studijního vybavení.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "housing", order: 11, targetId: "housing-navigation-desktop", title: "Bydlení", description: "Nabídky a poptávky studentského bydlení s kontaktem přes profil.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "school-profile", order: 12, targetId: "settings-navigation-desktop", title: "Moje škola a profil", description: "Školu, fakultu a ročník nastavíš i bez účtu. Profil potřebuješ pro publikování a komunikaci.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "change-city", order: 13, targetId: "change-city-navigation-desktop", title: "Změnit město", description: "Tudy se vrátíš k výběru městské edice StudentHubu.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "about", order: 14, targetId: "about-navigation-desktop", title: "O projektu", description: "Informace o nezávislém StudentHubu a jeho fungování.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "install", order: 15, targetId: "install-navigation-desktop", title: "Nainstalovat aplikaci", description: "StudentHub můžeš přidat na plochu jako webovou PWA.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "contact", order: 16, targetId: "contact-navigation-desktop", title: "Kontakt", description: "Tady najdeš provozní kontakt na StudentHub Brno.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "admin", order: 17, targetId: "admin-navigation-desktop", title: "Administrace", description: "Zabezpečený vstup je určený pouze oprávněným editorům.", preferredPlacement: "right", menuState: "closed", scrollArea: "sidebar" }),
  define({ id: "appearance", order: 18, targetId: "appearance-navigation-topbar", title: "Nastavení vzhledu", description: "Horní lišta nabízí systémový, světlý a tmavý režim.", preferredPlacement: "bottom", menuState: "closed", scrollArea: "none" }),
  define({ id: "complete", order: 19, targetId: "appearance-navigation-topbar", title: "Hotovo", description: "Znáš hlavní ovládání StudentHubu. Návod můžeš kdykoliv spustit znovu.", preferredPlacement: "bottom", menuState: "closed", scrollArea: "none" }),
];

export function tutorialLayoutForWidth(width: number): TutorialLayout {
  if (width <= tutorialBreakpoints.mobileMax) return "mobile";
  if (width <= tutorialBreakpoints.tabletMax) return "tablet";
  return "desktop";
}

export function tutorialStepsForLayout(layout: TutorialLayout): readonly TutorialStep[] {
  if (layout === "mobile") return mobileTourSteps;
  if (layout === "tablet") return tabletTourSteps;
  return desktopTourSteps;
}

export const emptyTutorialState: TutorialState = {
  tutorialVersion,
  introConfirmed: false,
  status: "not_started",
  lastCompletedStep: null,
};

export function normalizeTutorialState(value: unknown): TutorialState {
  if (!value || typeof value !== "object") return emptyTutorialState;
  const input = value as Partial<TutorialState>;
  const status: TutorialStatus = ["not_started", "in_progress", "skipped", "completed"].includes(input.status || "") ? input.status as TutorialStatus : "not_started";
  if (input.tutorialVersion !== tutorialVersion) return { ...emptyTutorialState, introConfirmed: Boolean(input.introConfirmed) };
  return { tutorialVersion, introConfirmed: Boolean(input.introConfirmed), status, lastCompletedStep: typeof input.lastCompletedStep === "string" ? input.lastCompletedStep : null };
}

export function readTutorialState(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = localStorage): TutorialState {
  let raw: unknown = null;
  try { raw = JSON.parse(storage.getItem(tutorialStorageKey) || "null"); } catch {}
  const legacyConfirmed = Boolean(storage.getItem(legacyTutorialStorageKey));
  const state = normalizeTutorialState(raw);
  const normalized = legacyConfirmed && !state.introConfirmed ? { ...state, introConfirmed: true } : state;
  storage.setItem(tutorialStorageKey, JSON.stringify(normalized));
  if (legacyConfirmed) storage.removeItem(legacyTutorialStorageKey);
  return normalized;
}

export function saveTutorialState(state: TutorialState, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(tutorialStorageKey, JSON.stringify(normalizeTutorialState(state)));
}

export function resumeTutorialIndex(steps: readonly TutorialStep[], state: TutorialState): number {
  if (!state.lastCompletedStep) return 0;
  const current = steps.findIndex((item) => item.id === state.lastCompletedStep);
  return current < 0 ? 0 : Math.min(current + 1, steps.length - 1);
}

export function matchingStepAfterLayoutChange(previous: readonly TutorialStep[], next: readonly TutorialStep[], currentId: string): number {
  const exact = next.findIndex((item) => item.id === currentId);
  if (exact >= 0) return exact;
  const previousIndex = previous.findIndex((item) => item.id === currentId);
  for (let index = Math.max(0, previousIndex + 1); index < previous.length; index += 1) {
    const candidate = next.findIndex((item) => item.id === previous[index].id);
    if (candidate >= 0) return candidate;
  }
  return Math.max(0, next.length - 1);
}
