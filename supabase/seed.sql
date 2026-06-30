insert into public.app_settings (key, value)
values ('product_name', 'Prachar')
on conflict (key) do update set value = excluded.value, updated_at = now();

insert into public.cities (name, district, state, active)
values
  ('Ongole', 'Prakasam', 'Andhra Pradesh', true),
  ('Addanki', 'Bapatla', 'Andhra Pradesh', true)
on conflict (name) do update
set district = excluded.district,
    state = excluded.state,
    active = excluded.active;

insert into public.areas (city_id, name, radius_meters, active)
select cities.id, seed_areas.area_name, 800, true
from public.cities
join (
  values
    ('Ongole', 'Main Road'),
    ('Ongole', 'Market Area'),
    ('Ongole', 'Bus Stand'),
    ('Ongole', 'Colony'),
    ('Ongole', 'Village'),
    ('Ongole', 'Junction'),
    ('Addanki', 'Main Road'),
    ('Addanki', 'Market Area'),
    ('Addanki', 'Bus Stand'),
    ('Addanki', 'Colony'),
    ('Addanki', 'Village'),
    ('Addanki', 'Junction')
) as seed_areas(city_name, area_name) on seed_areas.city_name = cities.name
on conflict (city_id, name) do update
set radius_meters = excluded.radius_meters,
    active = excluded.active;
