# M29 Hosted Release Activation and Recovery Control

This runbook controls promotion of a specific Kootha commit from repository-ready to hosted preview and, later, production. It does not convert blocked external work into a pass. A secret-free M29 release manifest is evidence of configuration policy, source provenance and migration provenance only; live Supabase, hosted browser, rollback and field evidence must be verified separately after they actually run.

## Current capacity state

Kootha's existing Supabase project is currently inactive because the organization already has its free active-project slots in use. Do **not** pause or delete AvalaOS, MockMate, or another unrelated project to make Kootha appear ready. Until capacity is legitimately available, hosted Supabase migration parity, backup/restore, end-to-end hosted testing, rollback rehearsal and public production promotion remain blocked.

The existing Netlify project is `kootha-preview`. Keep it preview-only while Supabase is inactive. Public enquiry intake and retention deletion remain fail-closed.

## Release evidence model

Run repository policy checks for every candidate from a clean tracked checkout:

```bash
SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)" \
RELEASE_SOURCE_SHA="$(git rev-parse HEAD)" \
pnpm check:release-readiness -- --mode preview --config-source repository --output output/m29-preview-release-manifest.json

SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)" \
RELEASE_SOURCE_SHA="$(git rev-parse HEAD)" \
pnpm check:release-readiness -- --mode production --config-source repository --output output/m29-production-release-manifest.json
```

The CLI derives the evaluated SHA and default manifest timestamp from the checked-out Git commit, rejects tracked dirty state, and rejects a supplied `RELEASE_SOURCE_SHA` that does not match the checkout. `SOURCE_DATE_EPOCH` is an optional reproducible override and is validated as a non-negative, integral, in-range Unix epoch; without it, repeated evaluation of the same commit remains byte-stable. Repository mode proves contract coverage, public/server authority separation, `.env.example` safety, migration timestamp uniqueness and deterministic migration fingerprinting.

The local CLI has **no trusted external attestation channel**. It therefore never sets `promotionReady=true`, and its Supabase, Netlify preview and rollback fields remain `external-attestation-required` even if a caller tries to provide plain environment strings claiming those checks passed. Actual hosted evidence must be verified by the release controller through the real systems before promotion.

Environment mode validates actual variable **presence/policy** without ever outputting values:

```bash
pnpm check:release-readiness -- --mode preview --config-source environment --output output/m29-preview-environment.json
pnpm check:release-readiness -- --mode production --config-source environment --output output/m29-production-environment.json
```

Production environment mode is fail-closed: launch configuration must be present and `ENQUIRY_INTAKE_ENABLED=false` plus `RETENTION_DELETION_ENABLED=false` must be explicit before promotion. Optional telemetry/statistical engines stay disabled unless deliberately enabled. Enabling telemetry requires Supabase URL + minimum-strength service-role authority, credential pepper and rate-limit key; enabling M22/M23/M25 similarly requires their Supabase server authority.

## Capacity-approved activation sequence

Only start this section after a legitimate Supabase slot/plan is available.

1. **Freeze authority**
   - Record the exact `main` SHA being promoted.
   - Confirm exact-head Quality and Hosted release readiness workflows are green.
   - Archive the two M29 repository manifests for that SHA.
   - Confirm each manifest `sourceSha` equals that exact Git commit. Do not promote an artifact whose claimed source differs from the tested checkout.

2. **Restore Kootha Supabase**
   - Restore the existing Kootha project; do not create a substitute database just to bypass capacity controls.
   - Confirm project health before changing Netlify.
   - Record only project/ref/status in release evidence; never paste service-role keys or other secrets.

3. **Verify migration parity and security**
   - Compare the hosted migration ledger with `supabase/migrations` for the candidate SHA.
   - Apply only missing reviewed migrations in canonical order.
   - Run fresh database/pgTAP/RLS verification.
   - Run Supabase security/performance advisors and resolve release-blocking security findings.
   - Confirm proof storage remains private and admin/RLS authority is intact.
   - Store the controller evidence reference separately from the local M29 manifest; do not convert an environment string into an attestation.

4. **Configure Netlify preview**
   - Configure required preview public values and server values in Netlify UI/secret storage.
   - Keep `ENQUIRY_INTAKE_ENABLED=false` and `RETENTION_DELETION_ENABLED=false`.
   - Keep `TELEMETRY_INGEST_ENABLED`, `M22_RULE_ENGINE_ENABLED`, `M23_COMPARISON_ENGINE_ENABLED`, and `M25_STATISTICAL_ENGINE_ENABLED` disabled unless that capability is intentionally part of this release and all dependencies are present.
   - Run M29 environment-mode preview readiness. Do not copy secret values into logs or GitHub.

5. **Deploy preview from the frozen SHA**
   - Deploy the exact candidate commit to `kootha-preview`.
   - Verify the deployed commit/release identifier matches the frozen SHA and manifest source.
   - Do not attach or promote a public/custom production domain at this stage.

6. **Hosted fake-data acceptance**
   - Use fake business data only.
   - Exercise public website safe-unavailable behaviour while intake remains disabled.
   - Exercise admin authentication and the retained M0-M28 workflows appropriate to the hosted environment.
   - Verify Driver/API safe failure modes where real Android/hardware evidence is unavailable.
   - Verify no internal commercial notes, service-role authority, telemetry secrets, precise coordinates or private proof paths appear in customer-facing surfaces.
   - Keep a separate controller evidence reference for the hosted acceptance result.

7. **Production configuration preflight**
   - Configure all production-required public and server-only controls.
   - Run production environment-mode readiness from the exact frozen SHA.
   - Production policy must still show enquiry intake and retention deletion explicitly disabled.
   - A configuration-policy pass is not a production promotion pass; controller-verified external evidence is still required.

8. **Rollback rehearsal**
   - Record the prior known-good deploy/SHA.
   - Rehearse reverting Netlify to that deploy without changing database history.
   - Verify the reverted app reaches the same Supabase authority safely.
   - Record a controller evidence reference only after the rehearsal actually succeeds. The local manifest itself cannot attest this result.

9. **Production promotion**
   - Require explicit controller approval after hosted acceptance, security review and rollback rehearsal are independently verified.
   - Promote the exact tested SHA; do not rebuild from an unpinned branch tip.
   - Re-run smoke checks after promotion.

10. **Separately enable capabilities**
    - Public enquiry intake is a separate approval after production stability is proven. Before setting `ENQUIRY_INTAKE_ENABLED=true`, verify Turnstile, rate limiting, service-role boundary, customer consent and monitoring.
    - Retention deletion is a separate approval after retention candidates and storage deletion behaviour have been verified.
    - Telemetry/M22/M23/M25 engines are separately governed capabilities and must not be enabled by a generic web promotion.

## Rollback triggers

Rollback the web deploy immediately for material authentication/RLS regressions, unsafe customer data exposure, broken admin authority, invalid migration/runtime contract, uncontrolled error rates, or a mismatch between deployed SHA and release manifest. If database state is suspected, stop mutation-capable features first; do not attempt destructive down-migrations as an improvised rollback.

## Physical evidence boundary

M29 is release-control software only. It does not satisfy M18 Android real-device evidence, selected-device M24, or real physical M26 pilot evidence. Synthetic/CI/hosted fake-data evidence cannot be relabelled as physical evidence.
