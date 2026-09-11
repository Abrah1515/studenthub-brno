export const tutorialVersion = 2;
export const tutorialStorageKey = "studenthub-tutorial-state";
export const legacyTutorialStorageKey = "studenthub-tutorial-version";
export const openTutorialEvent = "studenthub-open-tutorial";
export const tutorialMenuEvent = "studenthub-tutorial-menu";

export type TutorialStatus = "not_started" | "in_progress" | "skipped" | "completed";

export type TutorialState = {
  tutorialVersion: number;
  introConfirmed: boolean;
  status: TutorialStatus;
  lastCompletedStep: string | null;
};

export type TutorialStep = {
  id: string;
  order: number;
  desktopTarget: string;
  compactTarget: string;
  title: string;
  description: string;
  availability: "target-present";
  route?: string;
  compactMenu?: boolean;
  allowTargetAction?: boolean;
};

export const emptyTutorialState: TutorialState = {
  tutorialVersion,
  introConfirmed: false,
  status: "not_started",
  lastCompletedStep: null,
};

export const tutorialSteps: readonly TutorialStep[] = [
  { id: "welcome", order: 1, availability: "target-present", desktopTarget: "brand-desktop", compactTarget: "brand-compact", title: "Vítej ve StudentHub Brno", description: "Na jednom místě najdeš akademické termíny, studentská místa, komunitu a praktické služby v Brně.", route: "", allowTargetAction: true },
  { id: "school-profile", order: 2, availability: "target-present", desktopTarget: "settings-navigation-desktop", compactTarget: "settings-navigation-menu", title: "Moje škola a profil", description: "Školu, fakultu a ročník si nastavíš i bez účtu. Přihlášení potřebuješ až pro publikování a komunikaci.", route: "/nastaveni", compactMenu: true, allowTargetAction: true },
  { id: "calendar", order: 3, availability: "target-present", desktopTarget: "calendar-navigation-desktop", compactTarget: "calendar-navigation-bottom", title: "Kalendář a Co se děje", description: "Školní termíny se přizpůsobí tvému výběru. Vedle nich najdeš ověřené veřejné studentské akce.", route: "/kalendar", allowTargetAction: true },
  { id: "watcher", order: 4, availability: "target-present", desktopTarget: "watcher-navigation-desktop", compactTarget: "watcher-navigation-menu", title: "Hlídač", description: "Ulož si termín nebo akci a nastav připomenutí. Tady uvidíš také důležité ověřené změny.", route: "/hlidac", compactMenu: true, allowTargetAction: true },
  { id: "places", order: 5, availability: "target-present", desktopTarget: "places-navigation-desktop", compactTarget: "places-navigation-bottom", title: "Místa v Brně", description: "Procházej seznam i mapu, filtruj místa a po svolení je řaď podle vzdálenosti nebo otevři navigaci.", route: "/mista", allowTargetAction: true },
  { id: "community", order: 6, availability: "target-present", desktopTarget: "community-navigation-desktop", compactTarget: "community-navigation-bottom", title: "Komunita a Hledám parťáka", description: "Ptej se, komentuj a hledej lidi na společné aktivity. Veřejný obsah lze nahlásit a profily blokovat.", route: "/komunita", allowTargetAction: true },
  { id: "chat", order: 7, availability: "target-present", desktopTarget: "chat-navigation-desktop", compactTarget: "chat-navigation-compact", title: "Soukromý chat", description: "Zde jsou zprávy a žádosti o kontakt. První zpráva cizímu uživateli čeká na jeho přijetí nebo odpověď.", route: "/chat", allowTargetAction: true },
  { id: "practical-services", order: 8, availability: "target-present", desktopTarget: "housing-navigation-desktop", compactTarget: "housing-navigation-menu", title: "Brigády, Burza a Bydlení", description: "Najdeš tu pracovní nabídky z uvedených zdrojů, studentskou burzu a bezpečný kontakt k inzerátům bydlení.", route: "/bydleni", compactMenu: true, allowTargetAction: true },
  { id: "install", order: 9, availability: "target-present", desktopTarget: "install-navigation-desktop", compactTarget: "install-navigation-menu", title: "Nainstaluj si aplikaci", description: "StudentHub můžeš používat jako PWA z plochy telefonu nebo počítače. Postup se přizpůsobí tvému zařízení.", compactMenu: true },
  { id: "complete", order: 10, availability: "target-present", desktopTarget: "brand-desktop", compactTarget: "brand-compact", title: "Máš hotovo", description: "Zůstaneš v právě otevřené části. Celou prohlídku můžeš kdykoli spustit znovu položkou Návod." },
] as const;

export function normalizeTutorialState(value: unknown, legacyIntroConfirmed = false): TutorialState {
  if (!value || typeof value !== "object") return legacyIntroConfirmed ? { ...emptyTutorialState, introConfirmed: true } : { ...emptyTutorialState };
  const source = value as Partial<TutorialState>;
  const sameVersion = source.tutorialVersion === tutorialVersion;
  const validStatus: TutorialStatus[] = ["not_started", "in_progress", "skipped", "completed"];
  return {
    tutorialVersion,
    introConfirmed: Boolean(source.introConfirmed),
    status: sameVersion && validStatus.includes(source.status as TutorialStatus) ? source.status as TutorialStatus : "not_started",
    lastCompletedStep: sameVersion && typeof source.lastCompletedStep === "string" ? source.lastCompletedStep : null,
  };
}

export function readTutorialState(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = window.localStorage) {
  let parsed: unknown = null;
  try { parsed = JSON.parse(storage.getItem(tutorialStorageKey) || "null"); } catch { parsed = null; }
  const legacy = storage.getItem(legacyTutorialStorageKey);
  const state = normalizeTutorialState(parsed, Boolean(legacy));
  storage.setItem(tutorialStorageKey, JSON.stringify(state));
  if (legacy) storage.removeItem(legacyTutorialStorageKey);
  return state;
}

export function saveTutorialState(state: TutorialState, storage: Pick<Storage, "setItem"> = window.localStorage) {
  const normalized = normalizeTutorialState(state);
  storage.setItem(tutorialStorageKey, JSON.stringify(normalized));
  return normalized;
}

export function resumeTutorialIndex(state: TutorialState) {
  if (!state.lastCompletedStep) return 0;
  const completedIndex = tutorialSteps.findIndex((step) => step.id === state.lastCompletedStep);
  return completedIndex < 0 ? 0 : Math.min(completedIndex + 1, tutorialSteps.length - 1);
}
