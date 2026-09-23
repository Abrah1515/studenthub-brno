export const testModeNoticeStorageKey = "studenthub-test-notice-v1";
export const testModeNoticeDismissedEvent =
  "studenthub-test-notice-dismissed";

export function hasSeenTestModeNotice(
  storage: Pick<Storage, "getItem"> = localStorage,
) {
  try {
    return storage.getItem(testModeNoticeStorageKey) === "true";
  } catch {
    return false;
  }
}

export function shouldShowTestModeNotice(
  storage: Pick<Storage, "getItem"> = localStorage,
) {
  try {
    if (hasSeenTestModeNotice(storage)) return false;

    // Pokud už zařízení StudentHub dříve používalo,
    // nejde o úplně první návštěvu.
    const hasPreviousStudentHubState =
      storage.getItem("studenthub-consent") ||
      storage.getItem("studenthub-preference-v4") ||
      storage.getItem("studenthub-tutorial-state");

    return !hasPreviousStudentHubState;
  } catch {
    return false;
  }
}

export function saveTestModeNotice(
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  storage.setItem(testModeNoticeStorageKey, "true");
}
