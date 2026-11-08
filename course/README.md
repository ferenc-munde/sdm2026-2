# Course

Information for participants of the Team 12 hackathon (2026-11-13 and 2026-11-14): how we work, how progress is tracked and how the results are evaluated.

The most important information is also on the course's e-learning page: <https://elearning.unideb.hu/course/view.php?id=5322>

## Ground rules

- **One shared repository:** every team works in this repository. No private forks or side repositories.
- **Everything in English:** code, comments, commit messages, issues, pull requests and documentation.
- **AI first:** use AI agents for as much of the work as possible.
- **Your own folder:** each team works only in its own folder under `games/` (`games/team-1/` … `games/team-4/`).
- **Test everything:** no change is merged without being tested.

## Teams

Every issue and pull request carries exactly one team label:

| Label               | Who             | Folder          |
|---------------------|-----------------|-----------------|
| `team-1` … `team-4` | the game teams  | `games/team-N/` |
| `team-instructor`   | the instructors | `course/`       |

**Team roster.** [`teams.json`](teams.json) is the official list of who is in which team, with each student's GitHub login, name and nickname, and the instructors. Everyone can read it; only the instructors change it. The students are added once their GitHub logins are collected and the teams are formed on the first day.

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
