# M24/M26 selected-device field handoff

This runbook starts **only after AP selects hardware**. It does not select or recommend a vendor, device, protocol, transport, SIM/network, installation method, compliance position, or cost. Synthetic fixtures and CI are conformance evidence only and never physical evidence.

The machine-readable companion template is [`m26-field-handoff.template.json`](./m26-field-handoff.template.json). Its `productionEvidence: false`, `classification: template`, empty authority selectors, zero observations, `not_run` outcomes and blocked disposition are intentional: the template cannot be ingested as physical evidence.

## Required AP handoff

- Approved vendor, model/device family and privacy-safe device identifiers.
- Protocol/transport and authentication/signature documentation, sample payload/schema, retry, replay, sequence, timestamp and offline-buffer behavior.
- SIM/network class and approved test environment; credentials delivered through the approved server-side secret store, never Git, browser fields, logs or receipts.
- Installation/fitment method, installer, effective time, replacement approach and approved vehicle.
- Documented privacy/compliance decision, data-residency/support contacts, commercial plan and cost approval.
- Selected M24F candidate and exact certified adapter manifest/version.

## Bounded execution

1. Confirm the AP-approved candidate and certified manifest match vendor/model/protocol/capabilities exactly. Fail closed on any mismatch.
2. Register the physical device, create its effective-dated vehicle link, record installation, and issue/verify least-privilege credentials. Do not expose secret material.
3. Record expected heartbeat and approved network configuration class. Validate connectivity without recording coordinates or raw vendor payloads.
4. Pin the repository head, workflow run and selected adapter version. Run authentication, duplicate/replay/out-of-order, reconnect/store-and-forward (when supported), freshness, health and comparison checks during a bounded window.
5. Submit an immutable privacy-safe manifest. A physical pass requires real hardware/network telemetry and exact matching device, installation, link, network, adapter and repository bindings. Record pass, partial or blocked honestly.
6. Keep M24-T003 and M26 incomplete for synthetic, missing, contradictory, stale or changed-head evidence.

## Rollback and deprovision

Suspend commissioning, revoke/rotate credentials in the server-side store, stop ingestion, close the effective vehicle link, record removal/replacement, and decommission the commissioning record. Preserve immutable safe receipts; never copy coordinates, raw payloads or secrets into audit/evidence. Re-entry uses a new transition key and current version after the cause is resolved.


## Response-loss and recovery

Retry a lost RPC response with the identical transition key or receipt ID and every original selector unchanged. Exact replay returns the frozen receipt even if current authority later rotates; changed reuse conflicts. Reopen only after refreshing current certification, link, installation, credential, repository and network authority. Routine verification of the same active credential is allowed, but rotation or revocation requires new network and physical evidence.

Software-complete scope covers state transitions, immutable receipts, server-derived blocking reasons, replay recovery and the empty handoff contract. AP selection, production credentials, network approval, installation, the real field window and physical outcomes remain hardware/field gated.
