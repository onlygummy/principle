# principle

This repo is a personal OpenCode configuration, installed at `~/.config/opencode`
(`%USERPROFILE%\.config\opencode` on Windows). It defines seven agents, a global
permission baseline, and the skills those agents load.

Machines do the work and run the checks. Humans own the verdict.

Automated tools can lint, typecheck, and run tests. They catch syntax errors, missing imports, and broken builds, but not a wrong assumption, a misread requirement, or a diff that passes every check yet solves the wrong problem. That takes a person reading the change with fresh eyes.

Every gate in this setup exists to make human review easier, not to replace
it:

- `reviewwright` checks the diff in a clean context and reports findings, but it does not merge.
- `shipwright` runs the checks and opens the PR, but merges only after the wait script confirms the branch is safe.
- `shipwright` never uses `--admin`, so a branch protection rule that blocks the merge stops the run instead of being bypassed.
- After a successful squash merge, `shipwright` deletes the local short-lived branch with `git branch -D`.

Automation handles the mechanical work; judgment stays with the human.

## Install

Put the repo at `~/.config/opencode`. On Windows that is
`%USERPROFILE%\.config\opencode`.

Restart OpenCode after you change an agent file. Sessions start in `planwright`.
Switch agents with `tab`.

## OpenCode Go Proxy

The agents use the `opencode-go` provider, which points at a Cloudflare Worker that proxies OpenCode Go inference. The Worker URL and key come from environment variables, so neither enters git. Built-in OpenCode free models are disabled with `disabled_providers: ["opencode"]`.

Setup, verification, worker behavior, and troubleshooting are in [docs/proxy.md](docs/proxy.md).

## Flow

1. `planwright` clarifies the request and records decisions through `scribewright`. When the request is fuzzy it loads `grill-with-docs`, which runs the grilling interview and writes ADRs and glossary entries as decisions settle.
2. `buildwright` dispatches `branchwright`, or cuts the short-lived branch itself when the subagent is unavailable, then edits, runs lint, and sends any docs work to `scribewright`. When a change needs a test run, `buildwright` can dispatch `verifywright`; the pre-push test gate still belongs to `reviewwright`.
3. `buildwright` commits the change. `reviewwright` loads `requesting-code-review`, verifies the commits against the trunk in a fresh context, and cross-checks the conventional commit message.
4. `shipwright` loads `git-delivery`, pushes without a prompt, and opens the PR on the short-lived branch. It dispatches `branchwright` for an unbranched clean tree and commits only when the tree arrives uncommitted. It then waits for checks, squash-merges, deletes the merged branch, and syncs the trunk.
5. The merge is automated by `shipwright` with a squash merge and no `--admin`. A branch protection rule that blocks the merge stops the run instead of being bypassed.

## Docs

- [docs/workflow.md](docs/workflow.md): what each agent does and where it stops
- [docs/permissions.md](docs/permissions.md): how the permission rules work
- [docs/proxy.md](docs/proxy.md): OpenCode Go proxy setup and troubleshooting
- [docs/contributing.md](docs/contributing.md): adding agents, skills, and docs

`GLOSSARY.md` and `docs/adr/` are local-only development docs, kept on disk, not in git.
