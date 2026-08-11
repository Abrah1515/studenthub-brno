type RobotsGroup = { agents: string[]; rules: Array<{ allow: boolean; path: string }> };

export function robotsAllowsPath(pathname: string, text: string, productToken = "studenthub-brno") {
  const groups: RobotsGroup[] = [];
  let group: RobotsGroup | null = null;
  let hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (!group || hasRules) { group = { agents: [], rules: [] }; groups.push(group); hasRules = false; }
      group.agents.push(value.toLowerCase());
      continue;
    }
    if (!group || (key !== "allow" && key !== "disallow")) continue;
    hasRules = true;
    if (value) group.rules.push({ allow: key === "allow", path: value });
  }

  const token = productToken.toLowerCase();
  const matching = groups.map((candidate) => ({
    candidate,
    specificity: Math.max(...candidate.agents.map((agent) => agent === "*" ? 0 : token.startsWith(agent) ? agent.length : -1)),
  })).filter((item) => item.specificity >= 0);
  if (!matching.length) return true;
  const specificity = Math.max(...matching.map((item) => item.specificity));
  const rules = matching.filter((item) => item.specificity === specificity).flatMap((item) => item.candidate.rules)
    .filter((rule) => pathname.startsWith(rule.path))
    .sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return rules[0]?.allow ?? true;
}
