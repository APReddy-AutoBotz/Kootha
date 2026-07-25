# Physical GPS and IoT Decision Register

Decisions marked "Required later" do not block M20A, M20B, or simulator-based M21 planning.

| ID | Decision | Current planning position | Owner | Needed by | Status |
|---|---|---|---|---|---|
| DEC-001 | Architecture | Hybrid adapter architecture with one canonical core | AP/Engineering | M20B | Approved for planning |
| DEC-002 | First adapter | Deterministic simulator and generic secure HTTP | AP/Engineering | M20B/M21 | Approved for planning |
| DEC-003 | Pilot HTTP host | Netlify/serverless is fastest to evaluate, not mandatory long term | Engineering | M21 gate | Provisional |
| DEC-004 | Live freshness | Separate configurable window; initial two-minute assumption | AP/Operations | M21 | Required later |
| DEC-005 | Delayed backfill | Separate authenticated store-and-forward window; initial 24-hour assumption | AP/Operations/Privacy | M21 | Required later |
| DEC-006 | Device/vendor/model | No vendor selected in M19 | AP | M24 | Required later |
| DEC-007 | Vendor cloud vs direct | Prefer vendor webhook/API when it meets requirements; keep direct gateway option | AP/Engineering | M24 | Required later |
| DEC-008 | Expected device count | Plan for 25 pilot, 100 next, path to one million events/day | AP | Procurement/M21 | Required later |
| DEC-009 | Telemetry interval | Use 15 seconds for load and simulator assumptions | AP/Operations | M21/M24 | Required later |
| DEC-010 | SIM/network plan | No provider selected | AP | M24 | Required later |
| DEC-011 | Installation type | Wired, OBD, portable, certified fitment, and tamper needs remain open | AP/Operations | M24 | Required later |
| DEC-012 | Protocol | HTTP/webhook, MQTT, TCP, UDP, or polling follows device selection | AP/Engineering | M24 | Required later |
| DEC-013 | Device authentication | Hashed per-device bearer for generic HTTP; use HMAC/vendor signatures when supported | Security/Engineering | M21/M24 | Provisional |
| DEC-014 | Credential secret store | Server-only approved host secret store; never frontend/Git/database plaintext | Security/AP | M21 | Required later |
| DEC-015 | AIS-140/regulatory position | Determine applicability from actual vehicle class and operation; no blanket claim | AP/Legal/Operations | Purchase/M24 | Required later |
| DEC-016 | Driver notice/consent | Existing privacy principle applies; physical-device notice/consent process needs AP/legal approval | AP/Legal | Real-device activation | Required later |
| DEC-017 | Data retention | Start from existing proposed 90-day point policy; approve heartbeat/rejection/alert periods | AP/Legal | M21 production | Required later |
| DEC-018 | Customer live tracking | Disabled and out of scope | AP | Future premium decision | Deferred |
| DEC-019 | Map provider | None selected; maps are not required | AP | Optional future layer | Deferred |
| DEC-020 | Monthly cost ceiling | No purchase or paid vendor without AP approval | AP | M24 | Required later |
| DEC-021 | Comparison thresholds | Initial ±60 seconds, 250 m, five minutes, three pairs; calibrate | AP/Operations | M23 | Required later |
| DEC-022 | AI/anomaly scope | Deterministic first; statistical/ML only with reviewed evidence | AP/Operations | M25 | Required later |
| DEC-023 | AI data sufficiency | Counts are provisional and target-class dependent | AP/Data reviewer | M25 | Required later |

## Decision Rules

- Record vendor quotations and real credentials outside Git.
- Revisit DEC-003 after M21 load, burst, retry, concurrency, and cost evidence.
- Revisit DEC-004 and DEC-005 after simulator results and the selected device's store-and-forward behavior.
- None of DEC-006 through DEC-023 authorizes customer live tracking, maps, or a production AI claim.
