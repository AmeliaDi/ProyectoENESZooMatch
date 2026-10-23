create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now()
);

insert into public.user_roles (user_id, role)
select id, role
from public.profiles
where role = 'admin'::public.app_role
on conflict (user_id) do update set role = excluded.role;

alter table public.user_roles enable row level security;

revoke all on public.user_roles from public, anon, authenticated;
grant select on public.user_roles to authenticated;

create policy user_roles_read_own on public.user_roles
for select to authenticated
using (user_id = (select auth.uid()));

create or replace function private.is_admin(requested_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = requested_user
      and role = 'admin'::public.app_role
  );
$$;

create function public.get_admin_dashboard(p_threshold double precision)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  dashboard jsonb;
begin
  if auth.uid() is null or not private.is_admin(auth.uid()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  if p_threshold is null or p_threshold < 0.85 or p_threshold >= 1 then
    raise exception 'invalid_threshold' using errcode = '22023';
  end if;

  with mbti_codes(code, position) as (
    values
      ('INTJ', 1), ('INTP', 2), ('ENTJ', 3), ('ENTP', 4),
      ('INFJ', 5), ('INFP', 6), ('ENFJ', 7), ('ENFP', 8),
      ('ISTJ', 9), ('ISFJ', 10), ('ESTJ', 11), ('ESFJ', 12),
      ('ISTP', 13), ('ISFP', 14), ('ESTP', 15), ('ESFP', 16)
  ),
  profile_total as (
    select count(*)::bigint as value from public.profiles
  ),
  mbti_counts as (
    select mbti_code, count(*)::bigint as value
    from public.score_vectors
    group by mbti_code
  ),
  mbti_distribution as (
    select jsonb_agg(
      jsonb_build_object('code', codes.code, 'count', coalesce(counts.value, 0))
      order by codes.position
    ) as value
    from mbti_codes codes
    left join mbti_counts counts on counts.mbti_code = codes.code
  ),
  matched_users as (
    select user_a as user_id from public.matches where similarity > p_threshold
    union
    select user_b as user_id from public.matches where similarity > p_threshold
  ),
  matched_total as (
    select count(*)::bigint as value from matched_users
  ),
  animal_counts as (
    select
      coalesce(
        nullif(archetype.animal ->> 'diminutivo_es', ''),
        archetype.readable_combination
      ) as animal,
      count(*)::bigint as value
    from public.profiles profile
    join public.archetypes archetype on archetype.id = profile.archetype_id
    group by 1
    order by value desc, animal asc
    limit 5
  ),
  top_animals as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('animal', animal, 'count', value)
        order by value desc, animal asc
      ),
      '[]'::jsonb
    ) as value
    from animal_counts
  )
  select jsonb_build_object(
    'generatedAt', current_timestamp,
    'threshold', p_threshold,
    'totalProfiles', profile_total.value,
    'matchedUsers', matched_total.value,
    'matchedPercentage', case
      when profile_total.value = 0 then 0
      else round((matched_total.value::numeric * 100) / profile_total.value, 2)
    end,
    'mbtiDistribution', mbti_distribution.value,
    'topAnimals', top_animals.value
  )
  into dashboard
  from profile_total, matched_total, mbti_distribution, top_animals;

  return dashboard;
end;
$$;

revoke all on function public.get_admin_dashboard(double precision)
from public, anon, authenticated;
grant execute on function public.get_admin_dashboard(double precision)
to authenticated;
