# M21 Netlify Hosting Suitability — 27 July 2026

Decision: **suitable with conditions** for a bounded synthetic/pilot HTTP evaluation. This is not deployment or plan-purchase approval.

The M21 model is 25 devices, one event every 15 seconds, and 10 active hours: 60,000 events/day. One event/request means 60,000 requests/day or 1,800,000 over 30 days. Batches of 10 mean 6,000/day or 180,000/month; batches of 100 mean 600/day or 18,000/month. Reconnect queues must remain within 100 events and 256 KiB.

The local evidence models one persistence RPC per event plus four successful-request database operations for credential lookup, verification update, and global/device throttling. Therefore batching reduces invocation, authentication, and rate-limit overhead, but not the per-event persistence work:

| Shape | Requests/day | Modeled database operations/day |
| --- | ---: | ---: |
| One event/request | 60,000 | 300,000 |
| Batch 10 | 6,000 | 84,000 |
| Batch 100 reconnect | 600 | 62,400 |

Current official Netlify and Supabase pricing was not verified during implementation. No quote or hosted performance/cost claim is made. Estimate monthly cost only with then-current official terms, using the formulas above plus execution duration, logs, egress, database/storage growth, and failed unauthenticated throttle operations.

Netlify’s serverless HTTP boundary is operationally simpler for bounded pilot requests and reuses the current TLS/secret/deployment pattern. Its risks are cold-start/compute overhead for single events, timeout and concurrency pressure during reconnects, amplified retry work, and limited control if traffic becomes sustained. Devices must retain stable identities, honor bounded `Retry-After`, use exponential backoff with jitter, and split reconnect queues into bounded batches. The database-backed `m21-pilot-v1` policy uses 60-second windows: unauthenticated 60 requests/60 events, device 120 requests/6,000 events, and global 300 requests/12,000 events, with 86,400-second bucket retention. These thresholds are provisional/configurable and not AP-approved production policy.

Continue only while deployed p95/p99 duration, timeout rate, concurrency, throttle rate, reconnect recovery, database load, and monthly cost remain inside an AP-approved pilot envelope. Migrate before pilot if long-lived protocols are required, traffic approaches serverless concurrency/time limits, reconnect batches time out, per-request cost dominates, or operations require process-level control.

The generic adapter, M20B canonical contracts, HMAC authentication boundary, transactional database semantics, acknowledgements, and verification suite have no Netlify dependency and remain portable to an always-on/containerized HTTP host. No hosted Supabase migration or Netlify deployment was performed.
