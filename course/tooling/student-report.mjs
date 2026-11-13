#!/usr/bin/env node
// Student activity report: one table per team, one row per student.
//
//   node course/tooling/student-report.mjs              Markdown tables (stdout)
//   node course/tooling/student-report.mjs --json       the same data as JSON
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

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = "ferenc-munde/sdm2026-2";
const DEFAULT_ROSTER = join(HERE, "..", "teams.json");

/** Branches that collect work from other branches. A PR from one of them is a promotion or a sync, not new work. */
export function isIntegrationBranch(ref) {
  return /^(main|prod|staging|development|Team_\d+_Feature|feature\/team-\d+|main-[a-z0-9]+)$/.test(ref);
}

/** Team order in the report: game teams first, then platform, then whatever else the roster has. */
function teamOrder(a, b) {
  const rank = (t) => (/^team-\d+$/.test(t) ? `0${t}` : t === "platform" ? "1" : `2${t}`);
  return rank(a).localeCompare(rank(b));
}

/**
 * Builds the report from plain data, without any network access.
 * @param {{issues: object[], pulls: object[], reviews: Record<number, object[]>}} data  GitHub REST shapes
 * @param {{instructors: string[], students: {login: string, name: string, nickname?: string, team: string}[]}} roster
 */
export function buildReport(data, roster) {
  const instructors = new Set(roster.instructors.map((l) => l.toLowerCase()));
  const people = new Map();
  for (const s of roster.students) {
    if (!s.login) continue;
    people.set(s.login.toLowerCase(), {
      login: s.login,
      name: s.name,
      team: s.team || "(no team)",
      issuesAssigned: 0,
      issuesAssignedClosed: 0,
      issuesOpened: 0,
      prsOpened: 0,
      prsMerged: 0,
      reviewsGiven: 0,
    });
  }
  // Someone active in the repository but not in the roster still shows up, so nobody is lost.
  const person = (login) => {
    if (!login) return null;
    const key = login.toLowerCase();
    if (instructors.has(key) || key.endsWith("[bot]")) return null;
    if (!people.has(key)) {
      people.set(key, {
        login, name: "", team: "(not in roster)",
        issuesAssigned: 0, issuesAssignedClosed: 0, issuesOpened: 0, prsOpened: 0, prsMerged: 0, reviewsGiven: 0,
      });
    }
    return people.get(key);
  };

  for (const issue of data.issues) {
    if (issue.pull_request) continue; // the issues endpoint also returns PRs
    const author = person(issue.user?.login);
    if (author) author.issuesOpened++;
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
      if (pr.merged_at) author.prsMerged++;
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

  const teams = new Map();
  const active = (p) => p.issuesAssigned + p.issuesOpened + p.prsOpened + p.reviewsGiven > 0;
  for (const p of people.values()) {
    if (p.team === "(no team)" && !active(p)) continue; // in the roster but not taking part

    if (!teams.has(p.team)) teams.set(p.team, []);
    teams.get(p.team).push(p);
  }
  return [...teams.entries()]
    .sort(([a], [b]) => teamOrder(a, b))
    .map(([team, members]) => ({
      team,
      members: members.sort((a, b) => a.name.localeCompare(b.name) || a.login.localeCompare(b.login)),
    }));
}

export function toMarkdown(report, repo) {
  const lines = [`# Student activity – ${repo}`, ""];
  lines.push(
    "Issues assigned: closed / all issues the student is assigned to. PRs: work pull requests only",
    "(promotion and sync PRs between integration branches are left out). Reviews: other people's PRs reviewed.",
    "",
  );
  for (const { team, members } of report) {
    lines.push(`## ${team}`, "");
    lines.push("| Student | GitHub | Issues assigned (closed / all) | Issues opened | PRs opened | PRs merged | Reviews given |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const m of members) {
      lines.push(
        `| ${m.name || "–"} | ${m.login} | ${m.issuesAssignedClosed} / ${m.issuesAssigned} | ${m.issuesOpened} | ${m.prsOpened} | ${m.prsMerged} | ${m.reviewsGiven} |`,
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
  for (const pr of pulls) {
    if (isIntegrationBranch(pr.head?.ref ?? "")) continue;
    reviews[pr.number] = ghAll(`repos/${repo}/pulls/${pr.number}/reviews`);
  }
  return { issues, pulls, reviews };
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
  process.stdout.write(argv.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : `${toMarkdown(report, repo)}\n`);
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  main(process.argv.slice(2));
}
