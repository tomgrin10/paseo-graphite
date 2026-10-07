# paseo-graphite

[![npm version](https://img.shields.io/npm/v/paseo-graphite?style=for-the-badge&color=cb3837)](https://www.npmjs.com/package/paseo-graphite)
[![npm downloads](https://img.shields.io/npm/dm/paseo-graphite?style=for-the-badge&color=cb3837)](https://www.npmjs.com/package/paseo-graphite)
[![Paseo](https://img.shields.io/badge/Paseo-plugin-8A63D2?style=for-the-badge)](https://paseo.sh)
[![License](https://img.shields.io/github/license/tomgrin10/paseo-graphite?style=for-the-badge&color=2563eb)](LICENSE)

A trusted local Paseo plugin that shows the real Graphite stack for each workspace and tells you
whether a PR needs action, is ready to merge, is waiting, or is done.

The stack comes from the Graphite CLI in the workspace. GitHub only enriches those Graphite branches
with reviews, unresolved threads, checks, and mergeability. The plugin does not infer Graphite
membership from GitHub PR base branches.

## Requirements

- The latest Paseo release
- `git`
- Graphite CLI (`gt`) initialized in the repository
- authenticated GitHub CLI (`gh`) for live PR status

## Use

- Open **Graphite PRs** from Paseo's left sidebar or Command Center for an inbox across active
  workspaces, grouped into needs-attention, approved, waiting, and completed sections.
- Press the `Stack N` / `Stack N · Fix M` workspace header button.
- Press the matching composer pill beside Tasks and Subagents.
- Run `/pr-stack` in an agent composer to open the Explorer panel.
- Press **Fix All** to create a separate agent in the workspace using the latest agent's provider
  configuration. If review feedback is present, its prompt starts with your existing `/fix-pr`
  workflow. The plugin does not register or intercept `/fix-pr`.

The workspace panel is intentionally dense: each PR is a compact row with action state,
`resolved/total` review-thread count, check count, and a small Graphite link. GitHub links and
comment bodies are omitted.

## Install

Install from npm using the latest Paseo release:

```sh
paseo plugin install paseo-graphite
```

## Develop

```sh
npm install
npm run verify
paseo plugin install "$PWD"
paseo plugin reload paseo-graphite
paseo plugin logs paseo-graphite
```

See [PLAN.md](PLAN.md) for the product model and roadmap.

## More Paseo plugins

Also available from [Tom Gringauz](https://github.com/tomgrin10):

- [Defer](https://github.com/tomgrin10/paseo-defer) — Schedule messages to agents for later delivery.
- [Smart Session](https://github.com/tomgrin10/paseo-smart-session) — Context-aware compaction and usage insights for long-running agents.
- [Vitals](https://github.com/tomgrin10/paseo-vitals) — Host, Paseo, agent, and Docker health in one dashboard.
- [Send to Paseo](https://github.com/tomgrin10/send-to-paseo) — Send GitHub and Graphite PRs to Paseo from Chrome.
