export function foldSearchText(value: unknown) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs-CZ").replace(/\s+/g, " ").trim();
}

export function includesFolded(haystack: unknown, needle: unknown) { return foldSearchText(haystack).includes(foldSearchText(needle)); }
