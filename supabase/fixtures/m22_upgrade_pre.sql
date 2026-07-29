\set ON_ERROR_STOP on

insert into public.user_profiles(auth_user_id,display_name,role)
values('44000000-0000-0000-0000-000000000001','M22 Upgrade Admin','admin');
insert into public.drivers(id,name,phone,approval_status,onboarding_status)
values('44000000-0000-0000-0000-000000000002','Synthetic Upgrade Driver',
  '9000000044','approved','approved');
insert into public.vehicles(id,vehicle_number,vehicle_type,onboarding_status,active)
values('44000000-0000-0000-0000-000000000003','M22-UPGRADE-VEHICLE',
  'van','approved',true);
insert into public.gps_devices(
  id,device_code,vendor,model,adapter_type,protocol_type,status,
  installation_state,gps_readiness,gsm_readiness
) values
('44000000-0000-0000-0000-000000000004','M22-UPGRADE-ACTIVE',
  'Synthetic','Upgrade','generic_http','https','active','installed','ready','ready'),
('44000000-0000-0000-0000-000000000014','M22-UPGRADE-RETIRED',
  'Synthetic','Upgrade','generic_http','https','retired','removed','unknown','unknown');
insert into public.gps_device_vehicle_links(
  id,gps_device_id,vehicle_id,effective_from,change_reason,created_by_admin
) values(
  '44000000-0000-0000-0000-000000000015',
  '44000000-0000-0000-0000-000000000004',
  '44000000-0000-0000-0000-000000000003',
  clock_timestamp()-interval '1 minute','synthetic upgrade fixture',
  '44000000-0000-0000-0000-000000000001'
);
insert into public.gps_device_credential_metadata(
  id,gps_device_id,credential_key_id,status,verification_material_hash,
  issued_at,expires_at,created_by_admin
) values(
  '44000000-0000-0000-0000-000000000005',
  '44000000-0000-0000-0000-000000000004',
  'm22-upgrade-key','active',repeat('b',64),
  clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day',
  '44000000-0000-0000-0000-000000000001'
);
insert into public.ad_works(id,title)
values('44000000-0000-0000-0000-000000000006','Synthetic Upgrade Work');
insert into public.ad_work_assignments(
  id,ad_work_id,driver_id,vehicle_id,status
) values(
  '44000000-0000-0000-0000-000000000007',
  '44000000-0000-0000-0000-000000000006',
  '44000000-0000-0000-0000-000000000002',
  '44000000-0000-0000-0000-000000000003','ready_for_execution'
);
insert into public.ad_work_days(id,ad_work_id,work_date)
values('44000000-0000-0000-0000-000000000008',
  '44000000-0000-0000-0000-000000000006',current_date);
update public.ad_works
set execution_release_status='released_to_driver',
    work_access_code_created_at=clock_timestamp()
where id='44000000-0000-0000-0000-000000000006';
update public.ad_work_days
set execution_status='running',execution_started_at=clock_timestamp(),
    execution_updated_at=clock_timestamp()
where id='44000000-0000-0000-0000-000000000008';

insert into public.tracking_sessions(
  id,ad_work_id,ad_work_day_id,assignment_id,driver_id,vehicle_id,
  source_type,tracking_mode,status,started_at,point_count
) values(
  '44000000-0000-0000-0000-000000000009',
  '44000000-0000-0000-0000-000000000006',
  '44000000-0000-0000-0000-000000000008',
  '44000000-0000-0000-0000-000000000007',
  '44000000-0000-0000-0000-000000000002',
  '44000000-0000-0000-0000-000000000003',
  'mobile','phone_location','running',clock_timestamp(),1
);
insert into public.location_points(
  id,tracking_session_id,source,driver_id,recorded_at,lat,lng,
  accuracy_meters,quality,synthetic
) values(
  '44000000-0000-0000-0000-000000000010',
  '44000000-0000-0000-0000-000000000009','phone',
  '44000000-0000-0000-0000-000000000002',
  clock_timestamp(),15,80,5,'good',true
);

do $$
declare
  v_captured timestamptz;
  v_received timestamptz;
  v_disposition text;
begin
  select effective_from+interval '1 millisecond',
         effective_from+interval '1 second'
  into v_captured,v_received
  from public.m21_execution_history
  where ad_work_day_id='44000000-0000-0000-0000-000000000008'
    and execution_status='running';

  select disposition into v_disposition
  from public.m21_persist_telemetry_event(
    '44000000-0000-0000-0000-000000000005','generic_http','1',
    'upgrade-live-1',repeat('c',64),repeat('e',64),'upgrade-live-1',
    'boot-upgrade',1,v_captured,v_received,v_received,
    15,80,null,5,null,null,8,true,50,true,'upgrade-firmware',
    'three_dimensional',-70,'[]'::jsonb,'valid','simulator',true,'m21-v1'
  );
  if v_disposition<>'accepted_live' then
    raise exception 'expected accepted_live, got %',v_disposition;
  end if;

  select disposition into v_disposition
  from public.m21_persist_telemetry_event(
    '44000000-0000-0000-0000-000000000005','generic_http','1',
    'upgrade-live-1',repeat('d',64),repeat('f',64),'upgrade-live-1',
    'boot-upgrade',1,v_captured,v_received+interval '1 second',
    v_received+interval '1 second',15.1,80.1,null,5,null,null,8,
    true,50,true,'upgrade-firmware','three_dimensional',-70,
    '[]'::jsonb,'valid','simulator',true,'m21-v1'
  );
  if v_disposition<>'duplicate_conflict' then
    raise exception 'expected duplicate_conflict, got %',v_disposition;
  end if;
end $$;

insert into public.alerts(
  id,ad_work_day_id,type,severity,status,message,created_at,
  resolved_at,resolution_note
) values
('44000000-0000-0000-0000-000000000011',
 '44000000-0000-0000-0000-000000000008','gps_lost','warning','open',
 'Synthetic legacy open alert','2026-07-27 01:00:00+00',null,null),
('44000000-0000-0000-0000-000000000012',
 '44000000-0000-0000-0000-000000000008','network_lost','critical','resolved',
 'Synthetic legacy resolved alert','2026-07-27 01:01:00+00',
 '2026-07-27 01:02:00+00','Synthetic resolution');
