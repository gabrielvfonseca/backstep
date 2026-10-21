---
name: backstep-rule-authoring
description: Add or change a divergence rule (a finding) in @gabrielvfonseca/backstep. Use when a new kind of array bug should be reported, when an existing finding needs a different threshold or message, or when a corpus case shows the library missing a bug. Covers recording facts in proxy.ts, the rule in analyze.ts, tests, and a corpus case.
---

# Authoring a divergence rule

Use this skill when a bug class should produce a finding, or an existing finding needs to change.

## Where things live

- `packages/backstep/src/proxy.ts`: records each operation as a step. Measures facts while the
  operation runs.
- `packages/backstep/src/types.ts`: `FindingCode`, `StepFacts`, `Step`.
- `packages/backstep/src/analyze.ts`: the rules. Each rule reads a step and its facts and adds a
  finding.
- `packages/backstep/src/report.ts`: renders findings. No change is needed for a new code.
- `packages/corpus/src/cases.ts`: realistic bugs the library must diagnose.

## Steps

1. **Write the corpus case first.** Add a case that reproduces the bug, with the expected step and
   code. Run `pnpm --filter @backstep/corpus test` and confirm it fails.

2. **Record the facts you need in `proxy.ts`.** Facts are measured while the operation runs, so the
   analysis never re-scans data. Add a field to `StepFacts` in `types.ts`, set its default in
   `recorder.ts`, and set it inside the operation that observes it. Do not add a fact that the step
   already exposes, such as its counts.

3. **Add the code to `FindingCode`** in `types.ts`.

4. **Add the rule in `analyze.ts`**, inside `inspect`. Pick the severity:
   - `error`: the value is almost certainly wrong. It can diverge.
   - `warning`: probably wrong. It can diverge.
   - `info`: noteworthy only. It never diverges.

   The message should state what happened and the likely cause, in plain words.

5. **Add unit tests** in `packages/backstep/tests/rules.test.ts`. Cover the rule firing, and a
   nearby case where it must stay quiet.

6. **Run the full check**: `pnpm lint && pnpm typecheck && pnpm test`. The corpus case must pass.

7. **Document the code** in `docs/FINDINGS.md`, in the table, with the typical cause.

8. **Add a changeset** with `pnpm changeset` if the behaviour changes for users.

## Guidance

- Prefer a rule that fires rarely and is right over one that fires often and is noisy. A noisy
  warning teaches people to ignore findings.
- A rule that matches intentional code is a bug in the rule. Add a quiet-path test for the
  intentional form.
- Keep the message specific to the step: name the operation and the observed counts.
