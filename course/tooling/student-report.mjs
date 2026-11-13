#!/usr/bin/env node
// Student activity report: one section per team, one row per student.
//
//   node course/tooling/student-report.mjs                 Markdown tables (stdout)
//   node course/tooling/student-report.mjs --html          one HTML page: contribution share, summary, grade proposal
//   node course/tooling/student-report.mjs --json          the same data as JSON
//   node course/tooling/student-report.mjs --repo owner/name --roster path/to/teams.json
//
// Needs Node 18+ and the GitHub CLI (gh), logged in (`gh auth login`). No npm packages.
// Works the same on Windows, macOS and Linux.
//
// The output contains per-person numbers: keep it out of the repository (e.g. in .private/).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

/**
 * Grade proposal from activity, 0-10 points (the rule the Team 10 evaluation used, adapted):
 *   Delivery 0-4:      merged work PRs 5+ -> 4, 2-4 -> 3, 1 -> 2; none merged but one open -> 1
 *   Process 0-3:       +1 most merged PRs follow the PR rules; +1 issues opened follow the issue
 *                      rules; +1 closed at least one assigned issue. Only the rules in force when the
 *                      issue or PR was created count (RULES); with nothing to judge, the point is given.
 *   Collaboration 0-3: reviewed other people's PRs 5+ -> 2, 1-4 -> 1; +1 at least half of an equal
 *                      share of the team's merged work
 *   Points -> grade:   8-10 -> 5, 5-7 -> 4, 3-4 -> 3, 1-2 -> 2, 0 -> 1
 */
export function scoreOf(p, teamSize) {
  const delivery = p.prsMerged >= 5 ? 4 : p.prsMerged >= 2 ? 3 : p.prsMerged === 1 ? 2 : p.prsOpened > 0 ? 1 : 0;
  let process = 0;
  if (p.prsMerged > 0 && (p.prsJudged === 0 || p.prsOk * 2 >= p.prsJudged)) process++;
  if (p.issuesOpened > 0 && (p.issuesJudged === 0 || p.issuesOk * 5 >= p.issuesJudged * 4)) process++;
  if (p.issuesAssignedClosed > 0) process++;
  let collaboration = p.reviewsGiven >= 5 ? 2 : p.reviewsGiven >= 1 ? 1 : 0;
  if (teamSize > 0 && p.share * teamSize * 2 >= 1) collaboration++;
  const points = delivery + process + collaboration;
  const grade = points >= 8 ? 5 : points >= 5 ? 4 : points >= 3 ? 3 : points >= 1 ? 2 : 1;
  return { delivery, process, collaboration, points, grade };
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
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
  if (p.issuesAssigned > 0) parts.push(`Closed ${p.issuesAssignedClosed} of ${plural(p.issuesAssigned, "assigned issue")}.`);
  if (p.issuesOpened >= 5) parts.push(`Planned the work: opened ${p.issuesOpened} issues.`);
  parts.push(p.reviewsGiven > 0 ? `Reviewed ${plural(p.reviewsGiven, "pull request")} of teammates.` : "No reviews of other people's pull requests.");
  return parts.join(" ");
}

/** Team order in the report: game teams first, then platform, then whatever else the roster has. */
function teamOrder(a, b) {
  const rank = (t) => (/^team-\d+$/.test(t) ? `0${t}` : t === "platform" ? "1" : `2${t}`);
  return rank(a).localeCompare(rank(b));
}

const emptyPerson = (login, name, team) => ({
  login, name, team,
  issuesAssigned: 0, issuesAssignedClosed: 0, issuesOpened: 0, issuesJudged: 0, issuesOk: 0,
  prsOpened: 0, prsMerged: 0, prsJudged: 0, prsOk: 0, reviewsGiven: 0, ruleProblems: [],
  linesAdded: 0, areaLines: {}, areas: [], share: 0,
});

/**
 * Builds the report from plain data, without any network access.
 * @param {{issues: object[], pulls: object[], reviews: Record<number, object[]>, files?: Record<number, object[]>}} data
 *        GitHub REST shapes; `files` holds the changed files of each merged work PR.
 * @param {{instructors: string[], students: {login: string, name: string, nickname?: string, team: string}[]}} roster
 */
export function buildReport(data, roster) {
  const instructors = new Set(roster.instructors.map((l) => l.toLowerCase()));
  const people = new Map();
  for (const s of roster.students) {
    if (!s.login) continue;
    people.set(s.login.toLowerCase(), emptyPerson(s.login, s.name, s.team || "(no team)"));
  }
  // Someone active in the repository but not in the roster still shows up, so nobody is lost.
  const person = (login) => {
    if (!login) return null;
    const key = login.toLowerCase();
    if (instructors.has(key) || key.endsWith("[bot]")) return null;
    if (!people.has(key)) people.set(key, emptyPerson(login, "", "(not in roster)"));
    return people.get(key);
  };

  for (const issue of data.issues) {
    if (issue.pull_request) continue; // the issues endpoint also returns PRs
    const author = person(issue.user?.login);
    if (author) {
      author.issuesOpened++;
      if (ruleApplies("issue-label-title", issue.created_at)) {
        author.issuesJudged++;
        const labels = (issue.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)).filter((l) => TEAM_LABELS.includes(l));
        const prefix = /^\[([^\]]+)\]/.exec(issue.title ?? "")?.[1];
        if (labels.length === 1 && prefix === labels[0]) author.issuesOk++;
        else author.ruleProblems.push(`issue #${issue.number}: team label / [label] title`);
      }
    }
    for (const a of issue.assignees ?? []) {
      const p = person(a.login);
      if (!p) continue;
      p.issuesAssigned++;
      if (issue.state === "closed" && issue.state_reason !== "not_planned") p.issuesAssignedClosed++;
    }
  }

  for (const pr of data.pulls) {
    if (isIntegrationBranch(pr.head?.ref ?? "")) continue; // promotions and syncs repeat work counted elsewhere
    const author = person(pr.user?.login);
    if (author) {
      author.prsOpened++;
      if (pr.merged_at) {
        author.prsMerged++;
        const checks = [];
        if (ruleApplies("pr-links-issue", pr.created_at)) {
          checks.push(/\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s+#\d+/i.test(pr.body ?? "") || "no Closes #N");
        }
        if (ruleApplies("pr-base-branch", pr.created_at) && pr.base?.ref) {
          const want = expectedBase(author.team);
          checks.push(pr.base.ref === want || `targets ${pr.base.ref}, not ${want}`);
        }
        if (checks.length) {
          author.prsJudged++;
          const problems = checks.filter((c) => c !== true);
          if (problems.length === 0) author.prsOk++;
          else author.ruleProblems.push(`PR #${pr.number}: ${problems.join(", ")}`);
        }
        for (const f of data.files?.[pr.number] ?? []) {
          if (isGeneratedFile(f.filename)) continue;
          author.linesAdded += f.additions ?? 0;
          const area = areaOf(f.filename);
          author.areaLines[area] = (author.areaLines[area] ?? 0) + (f.additions ?? 0);
        }
      }
    }
    const reviewers = new Set();
    for (const r of data.reviews[pr.number] ?? []) {
      const login = r.user?.login;
      if (!login || login === pr.user?.login || r.state === "PENDING") continue;
      reviewers.add(login.toLowerCase());
    }
    for (const login of reviewers) {
      const p = person(login);
      if (p) p.reviewsGiven++;
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
        m.score = scoreOf(m, members.length);
        m.summary = summaryOf(m);
      }
      members.sort((a, b) => b.share - a.share || a.name.localeCompare(b.name) || a.login.localeCompare(b.login));
      return { team, linesAdded, prsMerged: members.reduce((s, m) => s + m.prsMerged, 0), members };
    });
}

export function toMarkdown(report, repo) {
  const lines = [`# Student activity – ${repo}`, ""];
  lines.push(
    "Issues assigned: closed / all issues the student is assigned to. PRs: work pull requests only",
    "(promotion and sync PRs between integration branches are left out). Reviews: other people's PRs reviewed.",
    "Share: part of the team's lines added in merged work PRs (generated files left out). Grade: proposal, 0-10 points -> 1-5.",
    "Rule problems: issues and PRs judged by the rules in force when they were created (see RULES in the script).",
    "",
  );
  for (const { team, members } of report) {
    lines.push(`## ${team}`, "");
    lines.push("| Student | GitHub | Issues assigned (closed / all) | Issues opened | PRs opened | PRs merged | Reviews given | Lines added | Share | Rule problems | Points | Grade |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const m of members) {
      lines.push(
        `| ${m.name || "–"} | ${m.login} | ${m.issuesAssignedClosed} / ${m.issuesAssigned} | ${m.issuesOpened} | ${m.prsOpened} | ${m.prsMerged} | ${m.reviewsGiven} | ${m.linesAdded} | ${Math.round(m.share * 100)}% | ${m.ruleProblems.length} | ${m.score.points} | ${m.score.grade} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
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
  const out = argv.includes("--json")
    ? JSON.stringify(report, null, 2)
    : argv.includes("--html")
      ? toHtml(report, { repo, generatedAt: new Date(), rules: RULES })
      : toMarkdown(report, repo);
  process.stdout.write(`${out}\n`);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  main(process.argv.slice(2));
}
