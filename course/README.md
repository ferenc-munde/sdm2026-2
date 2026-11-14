# Course

Information for participants of the Team 12 hackathon (2026-11-13 and 2026-11-14): how we work, how progress is tracked and how the results are evaluated.

The most important information is also on the course's e-learning page: <https://elearning.unideb.hu/course/view.php?id=5322>

## Meeting

During the hackathon we use this Google Meet room:

**https://meet.google.com/qca-ueup-nmr**

## Ground rules

- **One shared repository:** every team works in this repository. No private forks or side repositories.
- **Everything in English:** code, comments, commit messages, issues, pull requests and documentation.
- **AI first:** use AI agents for as much of the work as possible.
- **Your own folder:** each game team works only in its own folder under `games/` (`games/team-1/` … `games/team-3/`), and the platform team in `server/`.
- **Test everything:** no change is merged without being tested.

## Teams

Every issue and pull request carries exactly one team label:

| Label               | Who             | Folder          |
|---------------------|-----------------|-----------------|
| `team-1` … `team-3` | the game teams  | `games/team-N/` |
| `platform`          | the platform team | `server/`     |
| `team-instructor`   | the instructors | `course/`       |

**Team roster.** [`teams.json`](teams.json) is the official list of who is in which team, with each student's GitHub login, name, nickname and whether they arrived on time (`onTime`), the instructors, and the game quality score of each team (`gameQuality`, 0–10, given by the instructors). Everyone can read it; only the instructors change it. The `team` field stays empty until the teams are formed at the hackathon; then it is set to `team-1` … `team-3` or `platform`.

## Tracking progress

We track progress with GitHub issues and pull requests.

1. **Issue first, then work.** Before you start a piece of work, open an issue:
   - Title starts with your team label: `[team-2] Short description`, `[team-instructor] ...`
   - Describe the **goal** and the **done when** criteria (a short checklist).
   - Add your team label and assign the issue to whoever works on it.
2. **Every pull request closes an issue.** Put `Closes #<issue number>` in the PR description, so the issue is closed automatically when the PR is merged.
3. **Every pull request is reviewed** by someone else before it is merged.

## Evaluation

The grading rules are presented at the opening on the first day. The results are evaluated with the help of AI, based on each team's issues, pull requests and commits. The main criteria:

- **Delivery:** how much of what you planned got done (closed issues with merged PRs).
- **Result:** the state of the game: does it run, how complete it is.
- **Process:** clean workflow: clear issues, small PRs, meaningful descriptions, tests.
- **Collaboration:** contributions spread across the team members, reviews of other people's PRs.

Only work that is visible in this repository counts, so keep your issues and PRs up to date.

### Student activity report (instructors)

```bash
node course/tooling/student-report.mjs --html > .private/student-report.html
node course/tooling/student-report.mjs > .private/student-report.md
node course/tooling/student-report.mjs --json > .private/student-report.json
```

`--html` writes one page with a section per team: a bar with each student's contribution share, and per student the numbers, a short summary built from them, and a grade proposal. Open the file in a browser.

- **Contribution share:** the student's part of the lines added in the team's merged work pull requests. Generated files, dependencies, lockfiles and binary assets are left out. Lines measure size, not quality.
- **Grade proposal** (0–10 points): **75% activity + 25% game quality**.
  - *Activity* (0–10, from the repository): Delivery 0–4 (merged PRs: 5+ → 4, 2–4 → 3, 1 → 2, only open → 1); Process 0–3 (+1 most merged PRs link their issue, +1 issues opened follow the label and title rules, +1 closed an assigned issue); Collaboration 0–3 (reviews: 5+ → 2, 1–4 → 1; +1 at least half of an equal share).
  - *Game quality* (0–10, per team): does the game run, does it meet the requirements. The instructors give it by hand in `gameQuality` in [`teams.json`](teams.json); every member of the team gets the team's value. Until it is given, the total is the activity alone and the grade is marked provisional (*).
  - *Total* = 0.75 × activity + 0.25 × quality. Total → grade: 8–10 → 5, 5–7.9 → 4, 3–4.9 → 3, 1–2.9 → 2, below 1 → 1. The instructor decides the final grade.
- **Late arrival:** students marked `"onTime": false` in [`teams.json`](teams.json) did not arrive on time on the first day, and have to do 25% more for the same activity points: every count is multiplied by 1.25 and rounded up (merged PRs 7+ → 4, 3–6 → 3, 2 → 2, 1 or only open → 1; Process needs 2 merged PRs, 2 issues opened and 2 closed assigned issues; reviews 7+ → 2, 2–6 → 1; Collaboration +1 needs 62.5% of an equal share). The game quality is not affected. The report marks them.
- **Rules of their time:** every issue and pull request is judged by the rules in force when it was created, so a rule added later never costs anyone points. The rules the report checks, and the moment each came into force, are listed in `RULES` at the top of `course/tooling/student-report.mjs` and at the bottom of the HTML page. When `CLAUDE.md` gets a new rule that the report should check, add it there with its date.

One table per team, one row per student (from [`teams.json`](teams.json)): issues assigned (closed / all), issues opened, work pull requests opened and merged, and reviews given on other people's pull requests. Promotion and sync pull requests between integration branches (`main`, `development`, `staging`, `Team_N_Feature`) are not counted. Accounts that are active but not in the roster are listed under *(not in roster)*.

It needs Node and the [GitHub CLI](https://cli.github.com/), logged in with `gh auth login`, and works the same on Windows, macOS and Linux. **The output has per-person numbers: never commit it.**
