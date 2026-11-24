# Workflow

Seven agents share the work. Each one has a narrow scope and a stopping point.
The permission rules enforce the scope; the prompt describes the job.

## planwright

The default agent. It turns a request into requirements, a design, and a work
breakdown. It writes no files; the plan lives in the reply. It
dispatches `scribewright` to write ADRs, glossary entries, and docs pages. It
cannot edit code, commit, or push.

ADRs and glossary entries are local-only development docs. They stay on disk and
are not in git.

## buildwright

It writes and refactors code and config. Before the first edit it dispatches
`branchwright` to cut the short-lived branch. When the subagent is denied,
unavailable, or the user asks for the branch inline, it cuts the branch itself
with `git switch -c <type/slug>` after the same four checks and the same three
stops. It edits only after the branch exists. It cannot write `README.md`,
`GLOSSARY.md`, `GLOSSARY-MAP.md`, or anything under `docs/`; a decision that
needs recording goes to `scribewright` through a brief. It runs lint, and it
can dispatch `verifywright` for a test run when a change needs one; the
pre-push test gate still belongs to `reviewwright`. It stages and commits one
change on the short-lived branch, and it still cannot push.

## branchwright

A subagent, launched by `buildwright`, and by `shipwright` on a clean tree. It
cuts the short-lived branch from the trunk before the first edit, or stops and
names the condition that blocked it: a different branch already checked out, a
dirty trunk, or a branch name that exists. It is no longer the only owner of
branch creation: `buildwright` holds the same `git switch*` allow and repeats
the guard in its own prompt, so the two lists change together. It edits nothing
and holds one git write, `git switch -c*`, plus `cd *` so it can set the repo as
the shell's working directory; `git -C` is still not allowed. The rest is state
reads. It never force-switches or reuses a name.

Every agent opens its system prompt by naming its own id and repeats it at the
end. A handoff therefore names the right tab, and a subagent never offers to
switch to another agent.

In V2 a mid-session agent switch can reach the model without any signal that it
happened, and the agent's own permissions are the only reliable check. For a
handoff that matters, start a new session on the target agent instead of pressing
Tab.

## reviewwright

It verifies the commits against the trunk in a fresh context. It cannot edit,
stage, commit, or push. The baseline is the merge base with the trunk. A
`git worktree` at a scratch path is used only while the tree is still dirty,
because `git stash` would strand the user's changes if the pop failed. It runs
a static security scan and the `requesting-code-review` pipeline, then
cross-checks the commit message against the diff instead of writing it.

## shipwright

It reads the trunk from `gh repo view`, falling back to `origin/HEAD`, pushes
the commit `buildwright` wrote, and opens the PR on the short-lived branch that
`buildwright` or `branchwright` cut. It commits only when the tree arrives
uncommitted. A fallback branch is cut only when the work was never branched:
through `branchwright` when the tree is clean, or by `shipwright` itself when
the reviewed change is still in the tree and the subagent's dirty-trunk check
would refuse it. It then waits for checks with a script, squash-merges the
PR, deletes the merged remote branch, deletes the local short-lived branch
with `git branch -D`, and syncs the trunk.

The wait script is the gate: a non-zero exit stops the run and names the check
that failed. It cannot force push, amend, rebase, or create a release, and it
never uses `--admin`.

## scribewright

A subagent, launched by `planwright` or `buildwright`. It writes ADRs,
glossary entries, `README.md`, and pages under `docs/`. It loads `docs-writing`
for README and docs pages, and `domain-modeling` for ADRs. It has no shell and
cannot dispatch other subagents.

## verifywright

A subagent, launched by `buildwright` when a change needs a test run to confirm
it. It runs the project's lint, typecheck, and test suite, and reports the
exact commands, exit codes, and failing lines. It never edits, stages, commits,
pushes, or changes branch state.

Lint and typecheck run without a prompt; test runners ask first because they can
be slow or costly. The verdict is `pass`, `fail`, or `not run` with the reason.

## Gates

| Gate | Owner | Why |
| --- | --- | --- |
| Review passes | `reviewwright` | The diff is checked in a fresh context before `shipwright` pushes, and a failed verdict sends the work back to `buildwright` |
| Merge | `shipwright` | Squash merge runs only after the wait script returns ready; a protection rule that blocks it stops the run, and `--admin` is never used |
| Branch deletion | `shipwright`, after the merge | shipwright deletes the remote branch via `--delete-branch` and the local short-lived branch via `git branch -D` after the merge. |
| Release | user | `release-please` reads conventional commits and opens the release PR; no one creates tags by hand |

## Only scribewright writes documents

`planwright` and `buildwright` both dispatch `scribewright`, so there is one
writer for ADRs, glossary entries, README, and `docs/`. Two writers would drift
the format and race on ADR numbers.

`scribewright` starts with no conversation memory, so the caller has to supply a
brief with the target, the decision, the reason, the rejected alternatives, and
the allowed paths. A thin brief produces a guessed document.
