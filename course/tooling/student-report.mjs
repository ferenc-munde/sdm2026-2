#!/usr/bin/env node
// Student activity report: one section per team, one row per student.
//
//   node course/tooling/student-report.mjs                 Markdown tables (stdout)
//   node course/tooling/student-report.mjs --html          one HTML page: contribution share, summary, grade proposal
//   node course/tooling/student-report.mjs --json          the same data as JSON
//   node course/tooling/student-report.mjs --me            your own grade check (your gh login): every point and why
//   node course/tooling/student-report.mjs --student LOGIN one student's grade check
//   add --out path/to/file to write to a file (its folder is created) instead of stdout
//   node course/tooling/student-report.mjs --repo owner/name --roster path/to/teams.json
//
// Needs Node 18+ and the GitHub CLI (gh), logged in (`gh auth login`). No npm packages.
// Works the same on Windows, macOS and Linux.
//
// The output contains per-person numbers: keep it out of the repository (e.g. in .private/).

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toHtml } from "./report-html.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = "ferenc-munde/sdm2026-2";
const DEFAULT_ROSTER = join(HERE, "..", "teams.json");
const TEAM_LABELS = ["team-1", "team-2", "team-3", "team-4", "platform", "team-instructor"];

/**
 * The rules an issue or PR is judged by, with the moment each came into force. Everything is judged
 * by the rules in force when it was created: a rule added later never costs anyone points.
 * Add a line here whenever CLAUDE.md or course/README.md gets a new rule that the report checks.
 */
export const RULES = [
  { id: "issue-label-title", since: "2026-11-13T10:49:09Z", source: "#33",
    text: "An issue has exactly one team label and its title starts with [that label]." },
  { id: "pr-links-issue", since: "2026-11-13T10:49:09Z", source: "#33",
    text: "A pull request links its issue with a closing keyword (Closes #N)." },
  { id: "pr-base-branch", since: "2026-11-13T14:09:54Z", source: "b5180ca",
    text: "A game team's work PR targets its Team_N_Feature branch; platform and instructor work targets development." },
];

/** True when the rule was in force at `createdAt`. Items without a date are judged by the current rules. */
export function ruleApplies(id, createdAt, rules = RULES) {
  const rule = rules.find((r) => r.id === id);
  if (!rule) return false;
  return !createdAt || Date.parse(createdAt) >= Date.parse(rule.since);
}

/** The branch a work PR of `team` must target under the branch-flow rule. */
export function expectedBase(team) {
  const m = /^team-(\d+)$/.exec(team ?? "");
  return m ? `Team_${m[1]}_Feature` : "development";
}

/** Branches that collect work from other branches. A PR from one of them is a promotion or a sync, not new work. */
export function isIntegrationBranch(ref) {
  return /^(main|prod|staging|development|Team_\d+_Feature|feature\/team-\d+|main-[a-z0-9]+)$/.test(ref);
}

/** Generated or vendored files: they say nothing about the work done, so their lines are not counted. */
export function isGeneratedFile(path) {
  return (
    /(^|\/)(node_modules|dist|build|coverage|\.next|out)\//.test(path) ||
    /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb)$/.test(path) ||
    /\.min\.(js|css)$/.test(path) ||
    /\.(png|jpe?g|gif|webp|ico|mp3|wav|ogg|woff2?|ttf|glb|gltf|zip)$/i.test(path)
  );
}

/** The part of the code a file belongs to, for "main areas": games/team-3/client/x.ts -> client, server/host/... -> server/host. */
export function areaOf(path) {
  const parts = path.split("/");
  if (parts[0] === "games" && parts.length > 3) return parts[2];
  if (parts[0] === "games" && parts.length === 3) return "game config";
  if (parts[0] === "server" && parts.length > 2) return `server/${parts[1]}`;
  if (/\.md$/i.test(path)) return "docs";
  if (parts[0] === ".github") return "CI";
  return parts.length > 1 ? parts[0] : "repo root";
}

/** Share of the game quality in the total: the rest (75%) comes from the activity points. */
export const QUALITY_WEIGHT = 0.25;
/** Extra work a late student has to do for the same points: 20% more. */
export const LATE_FACTOR = 1.2;

/**
 * Grade proposal, 0-10 points. The total is 75% activity and 25% game quality.
 *
 * Activity, 0-10 points (the rule the Team 10 evaluation used, adapted):
 *   Delivery 0-4:      merged work PRs 5+ -> 4, 2-4 -> 3, 1 -> 2; none merged but one open -> 1
 *   Process 0-3:       +1 most merged PRs follow the PR rules; +1 issues opened follow the issue
 *                      rules; +1 closed at least one assigned issue. Only the rules in force when the
 *                      issue or PR was created count (RULES); with nothing to judge, the point is given.
 *   Collaboration 0-3: reviewed other people's PRs 5+ -> 2, 1-4 -> 1; +1 at least half of an equal
 *                      share of the team's merged work
 *
 * Late arrival: a student marked `"onTime": false` in the roster has to do 20% more for the same
 * activity points. Every count threshold is multiplied by 1.2 and rounded up (merged PRs 6+ -> 4,
 * 3-5 -> 3, 2 -> 2, 1 or only open -> 1; 2 merged PRs / 2 issues opened / 2 closed assigned issues
 * for the Process points; reviews 6+ -> 2, 2-5 -> 1; 60% of an equal share). The rule ratios (half
 * of the PRs, 80% of the issues) stay the same. A missing `onTime` counts as on time.
 *
 * Game quality, 0-10 points: given by the instructors by hand, per team, in `gameQuality` in the roster
 * (does the game run, does it meet the requirements). Every member of the team gets the team's value.
 * While it is missing (null), the total is the activity points alone and the grade is provisional.
 *
 *   Total = 0.75 x activity + 0.25 x quality (one decimal)
 *   Total -> grade:    8-10 -> 5, 5-7.9 -> 4, 3-4.9 -> 3, 1-2.9 -> 2, below 1 -> 1
 */
export function effortFactor(p) {
  return p.onTime === false ? LATE_FACTOR : 1;
}

export function gradeOf(total) {
  return total >= 8 ? 5 : total >= 5 ? 4 : total >= 3 ? 3 : total >= 1 ? 2 : 1;
}

export function scoreOf(p, teamSize, quality = null) {
  const f = effortFactor(p);
  const need = (n) => Math.ceil(n * f - 1e-9); // the smallest whole count that reaches n x f
  const delivery = p.prsMerged >= need(5) ? 4 : p.prsMerged >= need(2) ? 3 : p.prsMerged >= need(1) ? 2 : p.prsOpened > 0 ? 1 : 0;
  let process = 0;
  if (p.prsMerged >= need(1) && (p.prsJudged === 0 || p.prsOk * 2 >= p.prsJudged)) process++;
  if (p.issuesOpened >= need(1) && (p.issuesJudged === 0 || p.issuesOk * 5 >= p.issuesJudged * 4)) process++;
  if (p.issuesAssignedClosed >= need(1)) process++;
  let collaboration = p.reviewsGiven >= need(5) ? 2 : p.reviewsGiven >= need(1) ? 1 : 0;
  if (teamSize > 0 && p.share * teamSize * 2 >= f) collaboration++;
  const points = delivery + process + collaboration;
  const hasQuality = typeof quality === "number" && Number.isFinite(quality);
  const q = hasQuality ? Math.min(10, Math.max(0, quality)) : null;
  const total = hasQuality ? Math.round(((1 - QUALITY_WEIGHT) * points + QUALITY_WEIGHT * q) * 10) / 10 : points;
  return { delivery, process, collaboration, points, quality: q, total, provisional: !hasQuality, grade: gradeOf(total) };
}

function plural(n, word) {
  return `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;
}

/** A short, factual summary built from the numbers. The instructor can rewrite it before sharing. */
export function summaryOf(p) {
  if (p.prsOpened === 0 && p.issuesAssigned === 0 && p.issuesOpened === 0 && p.reviewsGiven === 0) {
    return "No visible activity in the repository yet.";
  }
  const parts = [];
  if (p.prsMerged > 0) {
    const areas = p.areas.slice(0, 2).join(" and ");
    parts.push(`Merged ${plural(p.prsMerged, "pull request")}${areas ? `, mostly in ${areas}` : ""}.`);
  } else if (p.prsOpened > 0) {
    parts.push(`${plural(p.prsOpened, "pull request")} opened, none merged yet.`);
  } else {
    parts.push("No pull request yet.");
  }
  if (p.issuesAssigned > 0) parts.push(`Closed ${fmt(p.issuesAssignedClosed)} of ${plural(p.issuesAssigned, "assigned issue")}.`);
  if (p.issuesOpened >= 5) parts.push(`Planned the work: opened ${fmt(p.issuesOpened)} issues.`);
  parts.push(p.reviewsGiven > 0 ? `Reviewed ${plural(p.reviewsGiven, "pull request")} of teammates.` : "No reviews of other people's pull requests.");
  return parts.join(" ");
}

/**
 * Shared credit: while one student could not push, a teammate pushed for both. Everything in the
 * window (issues, PRs, reviews and lines, by the time they were created) that either of them did is
 * pooled and split evenly between them. Set in the roster:
 *   "sharedCredit": [{"logins": ["a", "b"], "until": "2026-11-13T23:00:00Z", "reason": "..."}]
 * `since` is optional (open start); `until` is exclusive.
 */
export function sharedGroups(roster) {
  return (roster.sharedCredit ?? []).map((g) => ({
    logins: g.logins.map((l) => l.toLowerCase()),
    since: g.since ? Date.parse(g.since) : -Infinity,
    until: g.until ? Date.parse(g.until) : Infinity,
    reason: g.reason ?? "",
  }));
}

/** A count for display: whole numbers as they are, shared (split) counts with one decimal. */
export function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Team order in the report: game teams first, then platform, then whatever else the roster has. */
function teamOrder(a, b) {
  const rank = (t) => (/^team-\d+$/.test(t) ? `0${t}` : t === "platform" ? "1" : `2${t}`);
  return rank(a).localeCompare(rank(b));
}

const emptyPerson = (login, name, team, onTime = true) => ({
  login, name, team, onTime,
  issuesAssigned: 0, issuesAssignedClosed: 0, issuesOpened: 0, issuesJudged: 0, issuesOk: 0,
  prsOpened: 0, prsMerged: 0, prsJudged: 0, prsOk: 0, reviewsGiven: 0, ruleProblems: [],
  linesAdded: 0, areaLines: {}, areas: [], share: 0, sharedWith: [],
});

/**
 * Builds the report from plain data, without any network access.
 * @param {{issues: object[], pulls: object[], reviews: Record<number, object[]>, files?: Record<number, object[]>}} data
 *        GitHub REST shapes; `files` holds the changed files of each merged work PR.
 * @param {{instructors: string[], students: {login: string, name: string, nickname?: string, team: string, onTime?: boolean}[],
 *          gameQuality?: Record<string, number | null>}} roster
 */
export function buildReport(data, roster) {
  const gameQuality = roster.gameQuality ?? {};
  const instructors = new Set(roster.instructors.map((l) => l.toLowerCase()));
  const people = new Map();
  for (const s of roster.students) {
    if (!s.login) continue;
    people.set(s.login.toLowerCase(), emptyPerson(s.login, s.name, s.team || "(no team)", s.onTime !== false));
  }
  // Someone active in the repository but not in the roster still shows up, so nobody is lost.
  const person = (login) => {
    if (!login) return null;
    const key = login.toLowerCase();
    if (instructors.has(key) || key.endsWith("[bot]")) return null;
    if (!people.has(key)) people.set(key, emptyPerson(login, "", "(not in roster)"));
    return people.get(key);
  };

  // Who gets the credit for something `login` did at `when`: [person, weight] pairs. Normally the one
  // person with weight 1; inside a shared-credit window, every member of the group with an even part.
  const groups = sharedGroups(roster);
  for (const g of groups) {
    for (const l of g.logins) {
      const p = person(l);
      if (p) p.sharedWith.push({ with: g.logins.filter((o) => o !== l), reason: g.reason, until: g.until });
    }
  }
  const credit = (login, when) => {
    const p = person(login);
    if (!p) return [];
    const t = when ? Date.parse(when) : NaN;
    const g = groups.find((x) => x.logins.includes(login.toLowerCase()) && t >= x.since && t < x.until);
    if (!g) return [[p, 1]];
    const members = g.logins.map(person).filter(Boolean);
    return members.map((m) => [m, 1 / members.length]);
  };

  for (const issue of data.issues) {
    if (issue.pull_request) continue; // the issues endpoint also returns PRs
    let issueOk = null;
    if (ruleApplies("issue-label-title", issue.created_at)) {
      const labels = (issue.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)).filter((l) => TEAM_LABELS.includes(l));
      const prefix = /^\[([^\]]+)\]/.exec(issue.title ?? "")?.[1];
      issueOk = labels.length === 1 && prefix === labels[0];
    }
    const authors = credit(issue.user?.login, issue.created_at);
    for (const [author, w] of authors) {
      author.issuesOpened += w;
      if (issueOk === null) continue;
      author.issuesJudged += w;
      if (issueOk) author.issuesOk += w;
      else author.ruleProblems.push(`issue #${issue.number}: team label / [label] title${authors.length > 1 ? " (shared)" : ""}`);
    }
    for (const a of issue.assignees ?? []) {
      for (const [p, w] of credit(a.login, issue.created_at)) {
        p.issuesAssigned += w;
        if (issue.state === "closed" && issue.state_reason !== "not_planned") p.issuesAssignedClosed += w;
      }
    }
  }

  for (const pr of data.pulls) {
    if (isIntegrationBranch(pr.head?.ref ?? "")) continue; // promotions and syncs repeat work counted elsewhere
    const authors = credit(pr.user?.login, pr.created_at);
    for (const [author, w] of authors) {
      author.prsOpened += w;
      if (!pr.merged_at) continue;
      author.prsMerged += w;
      const checks = [];
      if (ruleApplies("pr-links-issue", pr.created_at)) {
        checks.push(/\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s+#\d+/i.test(pr.body ?? "") || "no Closes #N");
      }
      if (ruleApplies("pr-base-branch", pr.created_at) && pr.base?.ref) {
        const want = expectedBase(author.team);
        checks.push(pr.base.ref === want || `targets ${pr.base.ref}, not ${want}`);
      }
      if (checks.length) {
        author.prsJudged += w;
        const problems = checks.filter((c) => c !== true);
        if (problems.length === 0) author.prsOk += w;
        else author.ruleProblems.push(`PR #${pr.number}: ${problems.join(", ")}${authors.length > 1 ? " (shared)" : ""}`);
      }
      for (const f of data.files?.[pr.number] ?? []) {
        if (isGeneratedFile(f.filename)) continue;
        const added = (f.additions ?? 0) * w;
        author.linesAdded += added;
        const area = areaOf(f.filename);
        author.areaLines[area] = (author.areaLines[area] ?? 0) + added;
      }
    }
    const reviewers = new Map(); // login -> time of the first review on this PR
    for (const r of data.reviews[pr.number] ?? []) {
      const login = r.user?.login;
      if (!login || login === pr.user?.login || r.state === "PENDING") continue;
      if (!reviewers.has(login.toLowerCase())) reviewers.set(login.toLowerCase(), r.submitted_at);
    }
    for (const [login, when] of reviewers) {
      for (const [p, w] of credit(login, when)) p.reviewsGiven += w;
    }
  }

  const active = (p) => p.issuesAssigned + p.issuesOpened + p.prsOpened + p.reviewsGiven > 0;
  const teams = new Map();
  for (const p of people.values()) {
    if (p.team === "(no team)" && !active(p)) continue; // in the roster but not taking part
    if (!teams.has(p.team)) teams.set(p.team, []);
    teams.get(p.team).push(p);
  }

  return [...teams.entries()]
    .sort(([a], [b]) => teamOrder(a, b))
    .map(([team, members]) => {
      const linesAdded = members.reduce((sum, m) => sum + m.linesAdded, 0);
      for (const m of members) {
        m.share = linesAdded > 0 ? m.linesAdded / linesAdded : 0;
        m.areas = Object.entries(m.areaLines).sort((a, b) => b[1] - a[1]).map(([area]) => area);
        m.score = scoreOf(m, members.length, gameQuality[team] ?? null);
        m.summary = summaryOf(m);
      }
      members.sort((a, b) => b.share - a.share || a.name.localeCompare(b.name) || a.login.localeCompare(b.login));
      return { team, quality: gameQuality[team] ?? null, linesAdded, prsMerged: members.reduce((s, m) => s + m.prsMerged, 0), members };
    });
}

export function toMarkdown(report, repo) {
  const lines = [`# Student activity – ${repo}`, ""];
  lines.push(
    "Issues assigned: closed / all issues the student is assigned to. PRs: work pull requests only",
    "(promotion and sync PRs between integration branches are left out). Reviews: other people's PRs reviewed.",
    "Share: part of the team's lines added in merged work PRs (generated files left out). Grade: proposal, 0-10 points -> 1-5.",
    "Activity: 0-10 points from the repository. Quality: the team's game quality, 0-10, given by the instructors.",
    "Total: 75% activity + 25% quality; while the quality is missing, the total is the activity alone (provisional, marked *).",
    "Rule problems: issues and PRs judged by the rules in force when they were created (see RULES in the script).",
    "Shared: in a shared-credit window (see sharedCredit in teams.json) the work of the group is split evenly, so counts can be fractions.",
    "On time: no = arrived late, every activity threshold is 20% higher (rounded up) for this student.",
    "",
  );
  for (const { team, quality: q, members } of report) {
    lines.push(`## ${team}`, "");
    if (!team.startsWith("(")) lines.push(`Game quality: ${typeof q === "number" ? `${q} / 10` : "not given yet"}`, "");
    lines.push("| Student | GitHub | On time | Issues assigned (closed / all) | Issues opened | PRs opened | PRs merged | Reviews given | Lines added | Share | Rule problems | Activity | Quality | Total | Grade |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const m of members) {
      lines.push(
        `| ${m.name || "–"} | ${m.login} | ${m.onTime ? "yes" : "no (×1.2)"} | ${fmt(m.issuesAssignedClosed)} / ${fmt(m.issuesAssigned)} | ${fmt(m.issuesOpened)} | ${fmt(m.prsOpened)} | ${fmt(m.prsMerged)} | ${fmt(m.reviewsGiven)} | ${Math.round(m.linesAdded)} | ${Math.round(m.share * 100)}% | ${m.ruleProblems.length} | ${m.score.points} | ${m.score.quality ?? "–"} | ${m.score.total} | ${m.score.grade}${m.score.provisional ? "*" : ""} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * One student's grade check: every part of the score with the reason behind it and what the next point
 * needs. Plain Markdown, written for the student (or their AI agent) to read.
 */
export function toStudentCheck(report, login, repo) {
  const key = login.toLowerCase();
  const t = report.find((x) => x.members.some((m) => m.login.toLowerCase() === key));
  if (!t) {
    return [
      "# Grade check: @" + login,
      "",
      "No activity and no roster entry found for @" + login + " in " + repo + ".",
      "Check the login: it is your GitHub username, as listed in course/teams.json.",
    ].join("\n");
  }
  const m = t.members.find((x) => x.login.toLowerCase() === key);
  const s = m.score;
  const f = effortFactor(m);
  const need = (n) => Math.ceil(n * f - 1e-9);
  const size = t.members.length;
  const pctOf = (x) => Math.round(x * 1000) / 10 + "%";
  const when = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const L = [];
  L.push("# Grade check: " + (m.name || m.login) + " (@" + m.login + "), " + t.team, "");
  L.push("Repository: " + repo + ". Generated: " + when(Date.now()) + ".");
  L.push("This is a proposal computed from the repository. The instructors decide the final grade.", "");
  L.push("- On time on the first day: " + (m.onTime ? "yes" : "no, so every activity threshold is x" + LATE_FACTOR + ", rounded up"));
  for (const g of m.sharedWith ?? []) {
    L.push("- Shared credit with @" + g.with.join(", @") + " until " + when(g.until) + ": " + g.reason);
  }

  L.push("", "## Activity: " + s.points + " / 10 (75% of the total)", "");
  L.push("| Part | Points | Why | Next point |", "|---|---|---|---|");
  const nextDelivery =
    s.delivery >= 4 ? "maximum reached"
    : s.delivery === 3 ? need(5) + " merged work PRs"
    : s.delivery === 2 ? need(2) + " merged work PRs"
    : s.delivery === 1 ? need(1) + " merged work PR" + (need(1) === 1 ? "" : "s")
    : "open a work PR (1 point) and get it merged";
  L.push("| Delivery | " + s.delivery + " / 4 | " + fmt(m.prsMerged) + " merged, " + fmt(m.prsOpened) + " opened work PRs | " + nextDelivery + " |");

  const prRule = m.prsMerged >= need(1) && (m.prsJudged === 0 || m.prsOk * 2 >= m.prsJudged);
  const issueRule = m.issuesOpened >= need(1) && (m.issuesJudged === 0 || m.issuesOk * 5 >= m.issuesJudged * 4);
  const closed = m.issuesAssignedClosed >= need(1);
  L.push("| Process: PRs follow the rules | " + (prRule ? 1 : 0) + " / 1 | " + fmt(m.prsOk) + " of " + fmt(m.prsJudged) + " judged merged PRs OK (needs " + need(1) + "+ merged, at least half OK) | " + (prRule ? "done" : "merged PRs that say Closes #N and target the right branch") + " |");
  L.push("| Process: issues follow the rules | " + (issueRule ? 1 : 0) + " / 1 | " + fmt(m.issuesOk) + " of " + fmt(m.issuesJudged) + " judged issues OK, " + fmt(m.issuesOpened) + " opened (needs " + need(1) + "+ opened, 80% OK) | " + (issueRule ? "done" : "open issues with one team label and a [label] title") + " |");
  L.push("| Process: assigned issue closed | " + (closed ? 1 : 0) + " / 1 | " + fmt(m.issuesAssignedClosed) + " of " + fmt(m.issuesAssigned) + " assigned issues closed (needs " + need(1) + ") | " + (closed ? "done" : "get assigned to an issue and close it with a merged PR") + " |");

  const shareOk = size > 0 && m.share * size * 2 >= f;
  const reviewPts = s.collaboration - (shareOk ? 1 : 0);
  L.push("| Collaboration: reviews | " + reviewPts + " / 2 | " + fmt(m.reviewsGiven) + " PRs of others reviewed | " + (reviewPts >= 2 ? "maximum reached" : (reviewPts === 1 ? need(5) + " reviews" : need(1) + (need(1) === 1 ? " review" : " reviews"))) + " |");
  L.push("| Collaboration: share | " + (shareOk ? 1 : 0) + " / 1 | " + pctOf(m.share) + " of the team's lines in merged work PRs (" + Math.round(m.linesAdded) + " lines) | " + (shareOk ? "done" : "reach " + pctOf(size > 0 ? f / (2 * size) : 0) + " of the team's lines") + " |");

  L.push("", "## Game quality (25% of the total)", "");
  L.push(s.quality === null
    ? "Not given yet. The instructors score each team's game by hand (does it run, does it meet the requirements)."
    : "Your team's game: " + s.quality + " / 10.");

  L.push("", "## Total", "");
  L.push(s.provisional
    ? "Total: " + s.total + " / 10 (activity only, until the game quality is given) -> grade proposal " + s.grade + " (provisional)."
    : "Total: 0.75 x " + s.points + " + 0.25 x " + s.quality + " = " + s.total + " / 10 -> grade proposal " + s.grade + ".");
  L.push("Grades: 8-10 -> 5, 5-7.9 -> 4, 3-4.9 -> 3, 1-2.9 -> 2, below 1 -> 1.");
  if (m.ruleProblems.length) L.push("", "## Rule problems", "", ...m.ruleProblems.map((r) => "- " + r));
  L.push("", "Rules and scoring: course/README.md, section Evaluation.");
  return L.join("\n");
}

// ---- GitHub access (gh CLI) -------------------------------------------------

function gh(path) {
  const out = execFileSync("gh", ["api", "-H", "Accept: application/vnd.github+json", path], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function ghAll(path) {
  const all = [];
  for (let page = 1; ; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const batch = gh(`${path}${sep}per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) return all;
  }
}

function fetchData(repo) {
  const issues = ghAll(`repos/${repo}/issues?state=all`);
  const pulls = ghAll(`repos/${repo}/pulls?state=all`);
  const reviews = {};
  const files = {};
  for (const pr of pulls) {
    if (isIntegrationBranch(pr.head?.ref ?? "")) continue;
    process.stderr.write(`reading PR #${pr.number}\r`);
    reviews[pr.number] = ghAll(`repos/${repo}/pulls/${pr.number}/reviews`);
    if (pr.merged_at) files[pr.number] = ghAll(`repos/${repo}/pulls/${pr.number}/files`);
  }
  process.stderr.write("\n");
  return { issues, pulls, reviews, files };
}

function main(argv) {
  const arg = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const repo = arg("--repo", DEFAULT_REPO);
  const roster = JSON.parse(readFileSync(arg("--roster", DEFAULT_ROSTER), "utf8"));
  let data;
  try {
    data = fetchData(repo);
  } catch (err) {
    console.error(`Could not read ${repo} with the GitHub CLI. Is gh installed and logged in (gh auth login)?`);
    console.error(err.message);
    process.exit(3);
  }
  const report = buildReport(data, roster);
  let student = arg("--student", null);
  if (argv.includes("--me")) {
    try {
      student = gh("user").login;
    } catch {
      console.error("Could not read your GitHub login. Is gh logged in (gh auth login)?");
      process.exit(3);
    }
  }
  const out = student
    ? toStudentCheck(report, student, repo)
    : argv.includes("--json")
    ? JSON.stringify(report, null, 2)
    : argv.includes("--html")
      ? toHtml(report, { repo, generatedAt: new Date(), rules: RULES })
      : toMarkdown(report, repo);
  const file = arg("--out", null);
  if (file) {
    mkdirSync(dirname(resolve(file)), { recursive: true });
    writeFileSync(file, `${out}\n`);
    console.error(`Written to ${file}`);
  } else {
    process.stdout.write(`${out}\n`);
  }
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  main(process.argv.slice(2));
}
