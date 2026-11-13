# SABC online planner

The SABC navigation entry embeds the isolated planner in `planner/`. Visitors read
the published JSON and see its last successful fetch time. No public refresh
button, automatic club requests, Python server or external proxy is needed.

To refresh and publish from PowerShell in the repository root:

```powershell
python sabc/update.py
```

Requires Python 3.10+, Git and your existing GitHub push credentials. No Python
packages are needed. Start on `main` with a clean working tree. The command pulls
with `--ff-only`, fetches the member list and bulk availability (two requests,
with retries on transient errors), validates every member/day, updates both the
source JSON and the copy served from `docs/`, commits just those files, and pushes
to `origin/main`. GitHub Pages publishes through the repository's normal process.
If push fails after committing, run `git push origin main` to retry.

Fetch without committing or pushing:

```powershell
python sabc/update.py --local-only
```

The previous JSON is retained if fetching or validation fails. Missing members
or days are errors, never silently interpreted as free time. Empty source days
mean free all day as displayed by the club website; submission status is unknown.

The local planner in the separate SABC planner project is unchanged. This online
copy uses relative asset paths and loads `data/availability.json`. Selections are
saved in the visitor's browser. Data older than 24 hours is marked as possibly
out of date. Publishing makes the member list and schedules publicly accessible.

Quarto source is `index.qmd`; assets are registered in `_quarto.yml`. Render the
site with `quarto render --no-execute` to reuse existing notebook output. Never
hand-edit generated Quarto HTML. Data-only updates do not require rendering.
