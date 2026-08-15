-- M26 exact-head tie closure.
-- A physical observation window is immutable evidence identity under one exact
-- commissioning/network authority. Conflicting pass/partial/blocked receipts
-- for the same physical window are rejected instead of letting receipt arrival
-- order decide readiness.

create unique index physical_pilot_evidence_physical_window_authority_unique
  on public.physical_pilot_evidence_receipts (
    commissioning_id,
    commissioning_version,
    selected_candidate_id,
    certification_run_id,
    repository_authority_generation,
    manifest_id,
    gps_device_id,
    installation_receipt_id,
    vehicle_link_id,
    credential_id,
    network_validation_receipt_id,
    observation_started_at,
    observation_ended_at
  )
  where classification = 'physical';

comment on index public.physical_pilot_evidence_physical_window_authority_unique is
  'One immutable physical evidence receipt per exact authority and observation window; tied contradictory runs cannot supersede each other by arrival order.';
