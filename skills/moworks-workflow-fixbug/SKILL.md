---
name: moworks-workflow-fixbug
description: Work through the open bug tickets on a Moworks project end to end — read your ClickUp queue, sort it, fix the safe batch then the judgement-call batch, review each branch against the lessons checklist, ship to staging and report back on the tickets. Takes an optional pause point, "local" or "main", to hand the work back before it goes further. Use when asked to clear the bug list, work the ticket queue, or fix the open tickets on a project.
---

# Moworks bug workflow

Two passes over the queue. The **simple batch** first, then the **decision
batch** once the answers are back. Each pass runs the same steps and pauses at
the same place, so a full run reaches staging twice.

## Where it pauses

A pause is a pause, not a stop. Report, then **wait**. When the go-ahead comes,
the same run carries on to the end.

| Argument | Pauses after | On your go-ahead |
|---|---|---|
| `local` | the lessons review — everything committed, nothing pushed | PR into `main`, merge, PR into `staging`, watch, reply to tickets |
| `main` | the merge into `main` | PR into `staging`, watch, reply to tickets |
| *(none)* | never | runs end to end |

`main` is a safe place to pause **because nothing deploys from it** — staging is
the only environment wired to a pipeline. Code sitting in `main` is reviewed and
merged and still invisible to the client.

**It pauses once per batch**, so `local` on a full queue pauses twice — once on
the simple branch, once on the decision branch.

At a pause:

- Say what is on the branch: the commits, the tickets they close, what is left.
- Hand over the lessons report — what it found, what you fixed, what you left and
  why (step 5 draws that line).
- **Do not touch ClickUp.** A comment saying a fix is ready is false until it is
  somewhere the client can open.
- Then **wait**. Do not carry on because the next step looks obvious.

An unrecognised argument narrows the queue to a project or a ticket; it is not a
pause point. Ask if it is ambiguous.

## 1. Clean tree, right branch — in every repo

These projects are a frontend and a backend side by side and a ticket often
needs both.

```bash
git status --short && git branch --show-current
```

- Uncommitted work you did not make: stop and ask. Never stash or discard it.
- On `main`: cut a branch. `fix/ui-and-strapi-YYYY-MM-DD`, or
  `fix/ui-YYYY-MM-DD` where no CMS change is involved. Today's date.
- Already on today's fix branch: stay on it.
- `git config user.name` on **each** repo — it does not survive a clone.

Restart any running Strapi dev server after a checkout. The watcher reloads
mid-switch and answers 500 until it does.

## 2. Read the queue — yours only

**Only tickets assigned to you.** Resolve your own id with
`clickup_resolve_assignees` on `"me"`, then `clickup_filter_tasks` with the
project's list and the open statuses. Read the whole board for context; work and
comment on nothing that is someone else's. Name theirs in the report and leave
them.

Then pull each ticket's description and comments.

**Read the screenshots.** These descriptions are usually one line and a picture,
and the picture is the spec — which element, which field, which edge.

```bash
python - <<'EOF'
import json, io, re, base64
d = json.load(io.open(PATH, encoding="utf-8"))
for i, m in enumerate(re.finditer(r'data:image/(png|jpe?g);base64,([A-Za-z0-9+/=]+)',
                                  d.get("markdown_description") or ""), 1):
    open("%s_%d.png" % (d["id"], i), "wb").write(base64.b64decode(m.group(2)))
EOF
```

Then look at the files. "Add margins" means nothing until you see the two red
arrows saying where.

**Descriptions embed screenshots as base64**, so one `clickup_get_task` can blow
the context window. When the result lands in a file, read only what you need:

```bash
python -c "import json,io; d=json.load(io.open(PATH,encoding='utf-8')); print(d['markdown_description'][:3000])"
```

Comments carry the acceptance criteria as often as the description does.

## 3. Sort, then ask every question at once

| Bucket | Meaning |
|---|---|
| **Quick** | A CMS tick box, a copy change, a value. Minutes, no code. |
| **Simple** | Clear fix, one obvious approach, small blast radius. |
| **Needs a decision** | Ambiguous ask, a design call, or it changes something shared across pages. |

Show the list, then ask about **the whole decision bucket now**, in one message,
while every ticket is fresh: what it asks, what is ambiguous, the options, a
recommendation. The answers arrive while the safe work is being done, which is
the only reason this is two batches and not two runs.

Start quick and simple immediately, lowest risk first. Never start a decision
ticket on a guess.

## 4. Fix the batch, one ticket at a time

1. Read the code before changing it. A one-liner often is not, and a big-sounding
   one is often a tick box.
2. Make the fix.
3. Verify: `pnpm typecheck`, `pnpm lint`, and every `lint:*` script the repo has.
   **Never scaffold a temp route or probe page to check UI.**
4. A change spanning both repos goes in both commit messages. A frontend populate
   naming a field the backend has not got answers 400 and takes the page down —
   both halves ship together or neither does.
5. Commit with the ClickUp id in the message. **One ticket per commit**, never
   batched: they get reviewed and reverted one at a time, and on a twenty-commit
   branch that is the only thing that makes a red deploy findable.

Explain **why** in the message, not what the diff already shows. No attribution
trailers.

## 5. Review the branch against the lessons checklist

Run **`/moworks-next-strapi-bugs-lesson-learnt`** over `main...HEAD` before
anything leaves the machine. It routes by the files touched, so a fix branch
loads three or four of its twelve sections.

The skill's own "report, do not fix" rule is for reviewing **someone else's**
branch. This is your own, written minutes ago, and on `main` or a full run there
is no pause between this step and the merge — so a defect left unfixed here is a
defect merged into `main`.

**Fix it yourself when it is an objective defect in code this branch wrote:**

- a class that emits no CSS, a `group-hover:` on its own group, a misspelt utility
- a populate key missing its `.*`, a field named that the type has not got
- an unguarded enum, a `fb!`, a missing fallback gate
- a `string` field rendered `pre-line`, or the reverse

Commit those as their own commit — `fix(review): …` — never amended into the
ticket's commit. The review has to stay visible as a separate thing that happened.

**Report without touching it when:**

- fixing it widens the branch beyond the tickets it is for — "this section should
  be a component" is a refactor, not a review finding
- it is one of the sixteen the checklist flags as unconfirmable from a diff, and
  the Figma file or a running CMS would be needed to settle it
- it was already there before this branch and the branch only brushed past it
- the fix is a judgement call with more than one defensible answer

Hand over the branch summary, what you fixed, and what you are reporting instead.
That set is what `local` pauses on.

## 6. Ship it

> `local` pauses before this and resumes into it. `main` runs the merge below
> and pauses before the staging PR.

The review gate is the PR into `main`. Code does not reach `main` unreviewed.

1. PR from the fix branch into `main`. Both repos, if both changed.
2. Merge once reviewed.
3. PR `main` into `staging`, merge, and watch the run:

```bash
gh run watch --exit-status
```

Watch **both** pipelines where both repos shipped. There is no production on
these projects — staging is where the client looks, so a broken staging is a
broken site as far as they are concerned.

A CMS schema change needs its fold or migration run against the staging database
**before** the frontend half arrives, or the content it points at is orphaned.
Check this before merging, not after.

## 7. When staging goes red

Stop everything else. This is now the whole queue. Which kind of failure it is
decides the response:

**Failed before deploying** — build, typecheck, lint. Nothing reached the
environment and the client sees the old site, so **fix forward**: reproduce
locally, fix, commit, let it run again.

**Deployed and the site is wrong** — pages 500, content missing, a section gone.
The client is looking at it now, so **revert first, investigate after**:

```bash
git revert -m 1 <merge-commit-sha>
```

Push, watch it green, open the affected pages and confirm they are actually
back. Then work out what happened.

**Failed on something unrelated** — a dead runner, a timeout, a registry hiccup.
Re-run once. Twice the same way is real.

Two things to check before reverting anything:

- **Did only one half of a two-repo change deploy?** Reverting the frontend while
  the backend stays ahead leaves the same breakage in place. Both go back or
  neither does.
- **Has a data migration already run?** A schema fold is often not reversible by
  reverting code, and reverting may orphan content. Fix forward instead, and say
  so plainly.

Afterwards: move the ticket back out of internal review, comment saying it was
rolled back and why, and tell the user before carrying on.

## 8. Report back on each ticket

Only once the fix is **on staging and seen there** — open the live page, do not
trust the deploy log.

**Keep the comment to one word.** `Done` for a fix, `Fixed` for a defect,
`Added` where something was added. That is the whole comment.

Anything longer is the exception, not the default. If a ticket genuinely needs a
sentence — the fix differs from what was asked, or the client has to do something
— **ask first**, then keep it short and plain. The client reads these.

No attribution trailers in a ClickUp comment any more than in a commit.

Then move the ticket to **Internal Review**.

## 9. Second pass — the decision batch

The step 3 answers should be back. New branch, then steps 4 through 8 again:
fix, review, pause per the argument, ship, reply, move.

If an answer has not arrived by the time the simple batch is on staging, say what
is still waiting and stop there rather than guessing.

## Reminders that have bitten before

- A page serves its fallback copy while looking completely healthy. If CMS edits
  are not showing, check the dev log for `[cms] ... HTTP 400` before believing
  the CMS is at fault.
- Untracked files are not in a stash. Anything new goes into git before any
  `git stash`, or it is gone.
- Before reporting a fix, re-read what you changed against what the ticket asked.
  They drift.
- A ticket in the decision bucket that turns out to be a tick box is still a
  decision ticket until someone answers. Cheap is not the same as clear.
