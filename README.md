# paseo-graphite

[![npm version](https://img.shields.io/npm/v/paseo-graphite?style=for-the-badge&color=cb3837)](https://www.npmjs.com/package/paseo-graphite)
[![npm downloads](https://img.shields.io/npm/dm/paseo-graphite?style=for-the-badge&color=cb3837)](https://www.npmjs.com/package/paseo-graphite)
[![Paseo](https://img.shields.io/badge/Paseo-%E2%89%A5%200.8.0-8A63D2?style=for-the-badge)](https://paseo.sh)
[![License](https://img.shields.io/github/license/tomgrin10/paseo-graphite?style=for-the-badge&color=2563eb)](LICENSE)

A trusted local Paseo 0.8 plugin that shows the real Graphite stack for each workspace and tells you
whether a PR needs action, is ready to merge, is waiting, or is done.

The stack comes from the Graphite CLI in the workspace. GitHub only enriches those Graphite branches
with reviews, unresolved threads, checks, and mergeability. The plugin does not infer Graphite
membership from GitHub PR base branches.

## Requirements

- Paseo 0.8+
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

Install from npm on Paseo 0.9.0 or newer:

```sh
paseo plugin install npm:paseo-graphite
```

Paseo 0.8 can install the same plugin from Git:

```sh
paseo plugin add tomgrin10/paseo-graphite
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

- [Defer](https://www.npmjs.com/package/paseo-defer) — Schedule messages to agents for later delivery.
- [Smart Session](https://www.npmjs.com/package/paseo-smart-session) — Context-aware compaction and usage insights for long-running agents.
- [Vitals](https://www.npmjs.com/package/paseo-vitals) — Host, Paseo, agent, and Docker health in one dashboard.
