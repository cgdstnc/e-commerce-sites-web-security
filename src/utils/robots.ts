export type Robots = {
  allows: (path: string) => boolean;
  crawlDelay: number | null;
};

const ALLOW_ALL: Robots = { allows: () => true, crawlDelay: null };

type Group = { agents: string[]; rules: Array<{ allow: boolean; path: string }>; delay: number | null };

export function parseRobots(text: string, userAgent: string): Robots {
  const groups: Group[] = [];
  let current: Group | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (line === "") continue;

    const colon = line.indexOf(":");
    if (colon < 0) continue;

    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!current || current.rules.length > 0 || current.delay !== null) {
        current = { agents: [], rules: [], delay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (!current) continue;

    if (field === "disallow") current.rules.push({ allow: false, path: value });
    else if (field === "allow") current.rules.push({ allow: true, path: value });
    else if (field === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) current.delay = seconds;
    }
  }

  const group = selectGroup(groups, userAgent);
  if (!group) return ALLOW_ALL;

  return {
    allows: (path) => {
      const rule = group.rules.find((candidate) => matches(candidate.path, path));
      return rule ? rule.allow : true;
    },
    crawlDelay: group.delay,
  };
}

function selectGroup(groups: Group[], userAgent: string): Group | null {
  const name = userAgent.toLowerCase();

  const named = groups.find((group) =>
    group.agents.some((agent) => agent !== "*" && name.includes(agent)),
  );
  return named ?? groups.find((group) => group.agents.includes("*")) ?? null;
}

function matches(rulePath: string, path: string): boolean {
  if (rulePath === "") return false;

  const anchored = rulePath.endsWith("$");
  const pattern = anchored ? rulePath.slice(0, -1) : rulePath;
  const parts = pattern.split("*");

  let cursor = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "") continue;

    const found = i === 0 ? (path.startsWith(part) ? 0 : -1) : path.indexOf(part, cursor);
    if (found < 0) return false;
    cursor = found + part.length;
  }

  return anchored ? cursor === path.length : true;
}
