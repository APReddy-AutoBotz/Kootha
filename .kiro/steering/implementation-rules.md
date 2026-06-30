# Implementation Rules - Kootha / Prachar

## Task Completion

Codex may mark a task complete only when:

- Code, config, or docs are implemented.
- Relevant tests or verification steps are run.
- `tasks.md` status is updated.
- Completion summary mentions requirement IDs.
- No known blocker remains.

## Privacy Rules

- Location starts only after Start Work.
- Location stops after End Work or admin stop.
- No tracking outside active work.
- No hidden audio recording.
- Driver consent is required before active location proof.
- Customer live tracking requires admin approval and driver consent.

## Low-Cost Rules

- Do not add paid APIs unless AP approves.
- Use copy/share WhatsApp message flow first in later milestones.
- Do not add iOS until AP approves.
- Do not add customer app until AP approves.
- Build mobile GPS first later; keep device GPS modular.

## Verification Rules

Every milestone should verify:

- Build passes.
- Tests pass.
- Access control is checked when implemented.
- Tracking privacy is checked when implemented.
- Customer live tracking remains disabled by default unless explicitly enabled in a later premium task.
