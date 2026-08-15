from pathlib import Path

readme_path = Path("README.md")
readme = readme_path.read_text()
readme = readme.replace(
    "M18 remains incomplete/in progress; M20A–M23, M24F, M25, and the software-only M26 commissioning/evidence layer are completed; M27 Governed Operations Export & Audit Workbench is in progress; the original selected-device M24 and real physical M26 remain AP/hardware/evidence-gated.",
    "M18 remains incomplete/in progress; M20A–M23, M24F, M25, the software-only M26 commissioning/evidence layer, and M27 Governed Operations Export & Audit Workbench are completed; the original selected-device M24 and real physical M26 remain AP/hardware/evidence-gated.",
    1,
)
readme = readme.replace(
    "Current milestone status on this branch: M18 remains incomplete; M20A–M23, M24F, M25, and the software-only M26 layer are completed; M27 governed export/audit work is in progress; original M24 physical selection and real M26 physical execution remain incomplete pending AP selection and real evidence.",
    "Current milestone status on this branch: M18 remains incomplete; M20A–M23, M24F, M25, the software-only M26 layer, and M27 governed export/audit work are completed; original M24 physical selection and real M26 physical execution remain incomplete pending AP selection and real evidence.",
    1,
)
if "M27 Governed Operations Export & Audit Workbench is in progress" in readme or "M27 governed export/audit work is in progress" in readme:
    raise SystemExit("README M27 status replacement incomplete")
readme_path.write_text(readme)

tasks_path = Path(".kiro/specs/kootha-prachar-mvp/tasks.md")
tasks = tasks_path.read_text()
tasks = tasks.replace(
    "## Milestone M27 - Governed Operations Export & Audit Workbench\n\n- [~] In progress.",
    "## Milestone M27 - Governed Operations Export & Audit Workbench\n\n- [x] Completed.",
    1,
)
if "## Milestone M27 - Governed Operations Export & Audit Workbench\n\n- [~] In progress." in tasks:
    raise SystemExit("Task ledger M27 status replacement incomplete")
tasks_path.write_text(tasks)

doc_path = Path("docs/operations/m27-governed-export-audit.md")
doc = doc_path.read_text()
doc = doc.replace(
    "Status: In Progress until the Draft PR is merged and post-merge verification is complete.",
    "Status: Software implementation complete and exact-head verified. Merge/public-hosted activation remain separate controller gates.",
    1,
)
doc = doc.replace(
    "## Completion gates\n\nBefore merge:",
    "## Completion evidence\n\nSoftware implementation has satisfied these gates before final controller merge:",
    1,
)
if "Status: In Progress" in doc:
    raise SystemExit("M27 runbook status replacement incomplete")
doc_path.write_text(doc)

print("M27 status closure applied")
