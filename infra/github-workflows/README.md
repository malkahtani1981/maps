# GitHub Actions workflows (staged)

These two workflow files could not be written directly to `.github/workflows/` because the automated push token lacks the `workflow` scope.

**To activate CI/CD:** move both files into `.github/workflows/` — either in the GitHub web UI (open each file → copy → Add file → Create new file at `.github/workflows/<name>.yml`) or locally:

```bash
git clone git@github.com:malkahtani1981/maps.git && cd maps
mkdir -p .github/workflows
git mv infra/github-workflows/*.yml .github/workflows/
git commit -m 'Activate CI/CD workflows' && git push
```

Then add the repository secrets listed in `infra/README.md`.
