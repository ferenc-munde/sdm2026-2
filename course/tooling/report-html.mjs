// HTML page for the student report: one section per team, with the contribution share,
// a short summary and a grade proposal per student. Self-contained (no network needed to view it).

const GRADE_WORDS = { 5: "excellent", 4: "good", 3: "satisfactory", 2: "pass", 1: "fail" };
const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const pct = (share) => `${Math.round(share * 100)}%`;
const num = (n) => n.toLocaleString("en-US").replace(/,/g, " ");
const anchor = (team) => `team-${team.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`;

function teamSection({ team, quality, linesAdded, prsMerged, members }) {
  const color = (i) => `var(${SERIES[i % SERIES.length]})`;
  const bar = linesAdded > 0
    ? members
        .map((m, i) => (m.share > 0
          ? `<span style="width:${(m.share * 100).toFixed(2)}%;background:${color(i)}" title="${esc(m.name || m.login)}: ${pct(m.share)}">${m.share >= 0.08 ? pct(m.share) : ""}</span>`
          : ""))
        .join("")
    : `<span class="empty">No merged work yet</span>`;
  const legend = members
    .map((m, i) => `<span><i style="background:${color(i)}"></i>${esc(m.name || m.login)}</span>`)
    .join("");
  const rows = members
    .map((m, i) => {
      const s = m.score;
      return `
      <article class="student">
        <div class="who"><b>${esc(m.name || m.login)}</b><small>@${esc(m.login)}${m.onTime === false ? ` · <span class="late">late: ×1.25 effort</span>` : ""}${m.areas.length ? ` · ${esc(m.areas.slice(0, 2).join(", "))}` : ""}</small></div>
        <div class="share">
          <div class="row"><span class="pct num">${pct(m.share)}</span><span class="num lines">${num(m.linesAdded)} lines</span></div>
          <div class="track"><span style="width:${(m.share * 100).toFixed(2)}%;background:${color(i)}"></span></div>
          <div class="stats"><span><b class="num">${m.prsMerged}</b> ${m.prsMerged === 1 ? "PR" : "PRs"} merged</span><span><b class="num">${m.issuesAssignedClosed}/${m.issuesAssigned}</b> issues closed</span><span><b class="num">${m.reviewsGiven}</b> ${m.reviewsGiven === 1 ? "review" : "reviews"}</span></div>
        </div>
        <div class="summary"><p>${esc(m.summary)}</p>${m.ruleProblems?.length
          ? `<p class="rules" title="${esc(m.ruleProblems.join("\n"))}">${m.ruleProblems.length} rule ${m.ruleProblems.length === 1 ? "problem" : "problems"}: ${esc(m.ruleProblems.slice(0, 3).join("; "))}${m.ruleProblems.length > 3 ? " …" : ""}</p>`
          : ""}</div>
        <div class="grade" title="Activity ${s.points}/10 (Delivery ${s.delivery}/4 · Process ${s.process}/3 · Collaboration ${s.collaboration}/3)${m.onTime === false ? ", late arrival: thresholds ×1.25" : ""} · Game quality ${s.quality ?? "not given yet"}${s.quality === null ? "" : "/10"} · Total = 75% activity + 25% quality">
          <span class="chip g${s.grade}">${s.grade}</span><small>${s.total}/10${s.provisional ? " *" : ""}<br>${s.provisional ? "provisional" : GRADE_WORDS[s.grade]}</small>
        </div>
      </article>`;
    })
    .join("");
  return `
  <section class="sheet" id="${anchor(team)}" aria-labelledby="${anchor(team)}-title">
    <div class="teamhead">
      <h2 id="${anchor(team)}-title">${esc(team)}</h2>
      <span class="teammeta"><span class="num">${num(linesAdded)}</span> lines in <span class="num">${prsMerged}</span> merged pull requests · ${members.length} students${team.startsWith("(") ? "" : ` · game quality ${typeof quality === "number" ? `<span class="num">${quality}</span>/10` : "not given yet"}`}</span>
    </div>
    <div class="sharebar" role="img" aria-label="${esc(members.map((m) => `${m.name || m.login} ${pct(m.share)}`).join(", "))}">${bar}</div>
    <div class="legend">${legend}</div>
    <div class="colhead eyebrow" aria-hidden="true"><span>Student</span><span>Contribution share</span><span>Summary</span><span class="c">Grade</span></div>
    <div class="students">${rows}</div>
  </section>`;
}

function rulesTable(rules) {
  if (!rules?.length) return "";
  const rows = rules
    .map((r) => `<tr><td>${esc(r.text)}</td><td class="num">${esc(r.since.slice(0, 16).replace("T", " "))} UTC</td></tr>`)
    .join("");
  return `
  <section class="sheet" aria-labelledby="rules-title">
    <h2 id="rules-title">Rules checked</h2>
    <p class="note">Every issue and pull request is judged by the rules in force when it was created. A rule added later never costs anyone points.</p>
    <div style="overflow-x:auto"><table><thead><tr><th>Rule</th><th>In force since</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}

export function toHtml(report, { repo, generatedAt = new Date(), rules = [] } = {}) {
  const when = generatedAt.toISOString().slice(0, 16).replace("T", " ");
  const nav = report.map(({ team }) => `<a href="#${anchor(team)}">${esc(team)}</a>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Hackathon Evaluation</title>
<style>
:root {
  --bg: #f6f7f9; --sheet: #ffffff; --ink: #17202c; --muted: #5b6676; --line: #e1e5eb; --accent: #1f5f8b;
  --s1: #1f5f8b; --s2: #2f8f83; --s3: #c38b2c; --s4: #8a5aa8; --s5: #c4574b; --s6: #4d6b2f;
  --g5: #1d7a4f; --g4: #3c8f4a; --g3: #b7832a; --g2: #c0612f; --g1: #b23b3b; --chip-fg: #ffffff;
  --font-display: "Space Grotesk", "Segoe UI", system-ui, sans-serif;
  --font-body: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
  --font-data: "IBM Plex Mono", ui-monospace, Consolas, Menlo, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f141b; --sheet: #161d26; --ink: #e6ebf2; --muted: #9aa6b6; --line: #273141; --accent: #6fb3e0;
    --s1: #5aa6dc; --s2: #4fbfae; --s3: #e0ad52; --s4: #b58ad4; --s5: #e57b6e; --s6: #9cc46a;
    --g5: #3fae7a; --g4: #62b56b; --g3: #d6a245; --g2: #e08450; --g1: #e06262; --chip-fg: #0f141b;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font-body); font-size: 15px; line-height: 1.55; }
.page { max-width: 1040px; margin: 0 auto; padding: 32px max(16px, env(safe-area-inset-right)) 48px max(16px, env(safe-area-inset-left)); display: grid; gap: 24px; }
h1, h2 { font-family: var(--font-display); text-wrap: balance; margin: 0; }
h1 { font-size: clamp(1.7rem, 4vw, 2.3rem); letter-spacing: -0.01em; }
h2 { font-size: 1.2rem; }
.eyebrow { font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
header { display: grid; gap: 8px; }
.meta { display: flex; flex-wrap: wrap; gap: 6px 18px; color: var(--muted); font-size: 0.9rem; }
nav { display: flex; flex-wrap: wrap; gap: 8px; }
nav a { color: var(--accent); text-decoration: none; border: 1px solid var(--line); background: var(--sheet); border-radius: 999px; padding: 3px 12px; font-size: 0.88rem; font-weight: 500; }
nav a:hover, nav a:focus-visible { border-color: var(--accent); outline: none; }
.sheet { background: var(--sheet); border: 1px solid var(--line); border-radius: 10px; padding: 20px; display: grid; gap: 14px; scroll-margin-top: 16px; }
.teamhead { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 16px; }
.teammeta { color: var(--muted); font-size: 0.9rem; }
.sharebar { display: flex; height: 34px; border-radius: 6px; overflow: hidden; background: var(--line); }
.sharebar span { display: flex; align-items: center; justify-content: center; min-width: 0; color: var(--chip-fg); font-family: var(--font-data); font-size: 0.8rem; font-weight: 500; }
.sharebar .empty { width: 100%; color: var(--muted); font-family: var(--font-body); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 0.86rem; color: var(--muted); }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.colhead, .student { display: grid; grid-template-columns: minmax(170px, 1.1fr) minmax(220px, 1.6fr) minmax(0, 2.2fr) 92px; gap: 18px; }
.colhead { padding-top: 6px; }
.colhead .c { text-align: center; }
.student { align-items: center; padding-block: 14px; border-top: 1px solid var(--line); }
.who { display: grid; gap: 2px; min-width: 0; }
.who b { font-weight: 600; font-size: 1rem; }
.who small { color: var(--muted); font-size: 0.82rem; overflow-wrap: anywhere; }
.share { display: grid; gap: 6px; }
.share .row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.share .pct { font-size: 1.25rem; font-weight: 500; }
.share .lines { color: var(--muted); font-size: 0.82rem; }
.track { height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
.track span { display: block; height: 100%; border-radius: 4px; }
.stats { display: flex; flex-wrap: wrap; gap: 4px 14px; color: var(--muted); font-size: 0.82rem; }
.stats b { color: var(--ink); font-weight: 500; }
.summary { font-size: 0.93rem; min-width: 0; display: grid; gap: 4px; }
.summary p { margin: 0; }
.summary .rules { font-size: 0.8rem; color: var(--g2); }
.who .late { color: var(--g2); font-weight: 600; }
.grade { display: grid; justify-items: center; gap: 4px; cursor: help; }
.chip { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; color: var(--chip-fg); }
.grade small { font-size: 0.72rem; color: var(--muted); text-align: center; line-height: 1.25; }
.g5 { background: var(--g5); } .g4 { background: var(--g4); } .g3 { background: var(--g3); } .g2 { background: var(--g2); } .g1 { background: var(--g1); }
.method { display: grid; grid-template-columns: 1.4fr 1fr; gap: 24px; }
.method p, .method li { color: var(--muted); font-size: 0.92rem; }
.method p { margin: 0; max-width: 65ch; }
.method ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); }
th { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
footer { color: var(--muted); font-size: 0.82rem; }
.note { margin: 0; color: var(--muted); font-size: 0.92rem; max-width: 65ch; }
@media (max-width: 860px) {
  .colhead { display: none; }
  .student { grid-template-columns: 1fr auto; grid-template-areas: "who grade" "share share" "summary summary"; gap: 10px 16px; }
  .who { grid-area: who; } .grade { grid-area: grade; } .share { grid-area: share; } .summary { grid-area: summary; }
  .method { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<div class="page">
  <header>
    <span class="eyebrow">SDM 2026 · Hackathon evaluation</span>
    <h1>Contribution and grade proposal</h1>
    <div class="meta"><span>Repository: <span class="num">${esc(repo)}</span></span><span>Generated: <span class="num">${esc(when)} UTC</span></span></div>
    <nav aria-label="Teams">${nav}</nav>
  </header>
  ${report.map(teamSection).join("")}
  <section class="sheet method" aria-labelledby="method-title">
    <div style="display:grid;gap:10px">
      <h2 id="method-title">How this is calculated</h2>
      <p>The <b>contribution share</b> is the student's part of the lines added in the team's merged work pull requests. Generated files, dependencies, lockfiles and binary assets are left out. The <b>summary</b> is built from the numbers; rewrite it before you share the page. The <b>grade</b> is a proposal; hover it to see the points behind it.</p>
      <ul>
        <li>Only work visible in the repository counts.</li>
        <li>Promotion and sync pull requests between integration branches are not counted.</li>
        <li>Lines measure size, not quality. The instructor decides the grade.</li>
      </ul>
    </div>
    <div style="overflow-x:auto">
      <table aria-label="Scoring">
        <thead><tr><th>Area</th><th>Points</th></tr></thead>
        <tbody>
          <tr><td><b>Activity</b> (75% of the total), 0–10:</td><td></td></tr>
          <tr><td>Delivery: merged PRs (5+ / 2–4 / 1 / only open)</td><td class="num">4 / 3 / 2 / 1</td></tr>
          <tr><td>Process: PRs follow the rules · issues follow the rules · assigned issue closed</td><td class="num">+1 each</td></tr>
          <tr><td>Collaboration: reviews (5+ / 1–4) · at least half an equal share</td><td class="num">2 / 1 · +1</td></tr>
          <tr><td>Late arrival: every count above ×1.25, rounded up (merged PRs 7+ / 3–6 / 2 / 1 or open, reviews 7+ / 2–6, 62.5% of an equal share, 2 of each Process item)</td><td class="num">×1.25 effort</td></tr>
          <tr><td><b>Game quality</b> (25% of the total): the game runs and meets the requirements, given by the instructors per team</td><td class="num">0–10</td></tr>
          <tr><td>Total = 0.75 × activity + 0.25 × quality. Without a quality score yet: activity alone, marked * (provisional)</td><td class="num">0–10</td></tr>
          <tr><td>Total → grade: 8–10 / 5–7.9 / 3–4.9 / 1–2.9 / below 1</td><td class="num">5 / 4 / 3 / 2 / 1</td></tr>
        </tbody>
      </table>
    </div>
  </section>
  ${rulesTable(rules)}
  <footer>Contains per-person evaluation data. Do not commit or publish it.</footer>
</div>
</body>
</html>`;
}
