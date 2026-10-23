create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('participant', 'admin');

create table public.archetypes (
  id text primary key,
  mbti_code text not null unique check (mbti_code ~ '^[IE][NS][TF][JP]$'),
  nickname text not null,
  role_name text not null,
  traits jsonb not null check (jsonb_typeof(traits) = 'array'),
  animal jsonb not null check (jsonb_typeof(animal) = 'object'),
  palette jsonb not null check (jsonb_typeof(palette) = 'array'),
  primary_color jsonb not null check (jsonb_typeof(primary_color) = 'object'),
  readable_combination text not null
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  matricula_hash text not null unique check (matricula_hash ~ '^[0-9a-f]{64}$'),
  role public.app_role not null default 'participant',
  alias text unique,
  archetype_id text references public.archetypes(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((alias is null) = (archetype_id is null))
);

create table public.quiz_items (
  id text primary key,
  category text not null check (category in ('BigFive', 'MBTI', 'Relaciones', 'Genero')),
  prompt text not null,
  polarity text not null check (polarity in ('positiva', 'negativa')),
  weights jsonb not null check (jsonb_typeof(weights) = 'object'),
  source_id text not null
);

create table public.quiz_responses (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null references public.quiz_items(id),
  value smallint not null check (value between 1 and 4),
  answered_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table public.score_vectors (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  scores jsonb not null check (jsonb_typeof(scores) = 'object'),
  matching_vector double precision[] not null check (array_length(matching_vector, 1) = 13),
  mbti_code text not null check (mbti_code ~ '^[IE][NS][TF][JP]$'),
  updated_at timestamptz not null default now()
);

create table public.matches (
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  similarity double precision not null check (similarity > 0 and similarity <= 1),
  justification jsonb not null check (jsonb_typeof(justification) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create index matches_user_b_idx on public.matches(user_b);
create index profiles_archetype_idx on public.profiles(archetype_id);

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_updated_at();

create trigger score_vectors_touch_updated_at
before update on public.score_vectors
for each row execute function private.touch_updated_at();

create function private.is_admin(requested_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = requested_user and role = 'admin'::public.app_role
  );
$$;

alter table public.archetypes enable row level security;
alter table public.profiles enable row level security;
alter table public.quiz_items enable row level security;
alter table public.quiz_responses enable row level security;
alter table public.score_vectors enable row level security;
alter table public.matches enable row level security;

create policy archetypes_read on public.archetypes
for select using (true);

create policy quiz_items_read on public.quiz_items
for select using (true);

create policy profiles_read_own_or_admin on public.profiles
for select to authenticated
using (id = (select auth.uid()) or private.is_admin((select auth.uid())));

create policy responses_read_own_or_admin on public.quiz_responses
for select to authenticated
using (user_id = (select auth.uid()) or private.is_admin((select auth.uid())));

create policy vectors_read_own_or_admin on public.score_vectors
for select to authenticated
using (user_id = (select auth.uid()) or private.is_admin((select auth.uid())));

create policy matches_read_participant_or_admin on public.matches
for select to authenticated
using (
  user_a = (select auth.uid())
  or user_b = (select auth.uid())
  or private.is_admin((select auth.uid()))
);

revoke all on public.archetypes, public.profiles, public.quiz_items,
  public.quiz_responses, public.score_vectors, public.matches
from anon, authenticated;
grant select on public.archetypes, public.quiz_items to anon, authenticated;
grant select on public.profiles, public.quiz_responses to authenticated;

create function public.is_matricula_available(p_matricula_hash text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_matricula_hash is null or p_matricula_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  return not exists (
    select 1 from public.profiles where matricula_hash = p_matricula_hash
  );
end;
$$;

create function private.assign_archetype_and_alias(
  p_user_id uuid,
  p_archetype_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_alias text;
  current_archetype text;
  alias_base text;
  candidate text;
  attempt integer := 0;
begin
  select alias, archetype_id
    into current_alias, current_archetype
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile_not_found';
  end if;

  if current_alias is not null and current_archetype = p_archetype_id then
    return current_alias;
  end if;

  select readable_combination into alias_base
  from public.archetypes
  where id = p_archetype_id;

  if alias_base is null then
    raise exception 'archetype_not_found';
  end if;

  loop
    attempt := attempt + 1;
    candidate := alias_base || ' · ' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8));

    begin
      update public.profiles
      set alias = candidate, archetype_id = p_archetype_id
      where id = p_user_id;
      return candidate;
    exception when unique_violation then
      if attempt >= 8 then
        raise exception 'alias_assignment_failed';
      end if;
    end;
  end loop;
end;
$$;

create function public.submit_quiz_result(
  p_user_id uuid,
  p_answers jsonb,
  p_scores jsonb,
  p_matching_vector double precision[],
  p_mbti_code text
)
returns table(alias text, archetype_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_archetype text;
  assigned_alias text;
  expected_dimensions constant text[] := array[
    'bigfive_apertura', 'bigfive_responsabilidad', 'bigfive_extraversion',
    'bigfive_amabilidad', 'bigfive_neuroticismo', 'mbti_extraversion',
    'mbti_intuicion', 'mbti_pensamiento', 'mbti_juicio',
    'relaciones_comunicacion', 'relaciones_confianza', 'relaciones_empatia',
    'relaciones_gestion_conflicto', 'genero_igualdad',
    'genero_flexibilidad_roles', 'genero_respeto_diversidad',
    'genero_corresponsabilidad'
  ];
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile_not_found';
  end if;

  select id into selected_archetype
  from public.archetypes
  where mbti_code = p_mbti_code;

  if selected_archetype is null then
    raise exception 'invalid_archetype';
  end if;

  if array_length(p_matching_vector, 1) <> 13
    or exists (select 1 from unnest(p_matching_vector) value where value < 0 or value > 1)
  then
    raise exception 'invalid_vector';
  end if;

  if jsonb_typeof(p_scores) <> 'object'
    or (select count(*) from jsonb_object_keys(p_scores)) <> cardinality(expected_dimensions)
    or exists (
      select 1 from unnest(expected_dimensions) dimension
      where not (p_scores ? dimension)
        or jsonb_typeof(p_scores -> dimension) <> 'number'
    )
  then
    raise exception 'invalid_scores';
  end if;

  if jsonb_typeof(p_answers) <> 'array'
    or jsonb_array_length(p_answers) <> (select count(*) from public.quiz_items)
    or (select count(distinct answer ->> 'itemId') from jsonb_array_elements(p_answers) answer)
      <> (select count(*) from public.quiz_items)
    or exists (
      select 1
      from jsonb_array_elements(p_answers) answer
      left join public.quiz_items item on item.id = answer ->> 'itemId'
      where item.id is null
        or jsonb_typeof(answer -> 'value') <> 'number'
        or (answer ->> 'value')::integer not between 1 and 4
    )
  then
    raise exception 'invalid_answers';
  end if;

  delete from public.quiz_responses where user_id = p_user_id;

  insert into public.quiz_responses (user_id, item_id, value)
  select p_user_id, answer ->> 'itemId', (answer ->> 'value')::smallint
  from jsonb_array_elements(p_answers) answer;

  insert into public.score_vectors (user_id, scores, matching_vector, mbti_code)
  values (p_user_id, p_scores, p_matching_vector, p_mbti_code)
  on conflict (user_id) do update
    set scores = excluded.scores,
        matching_vector = excluded.matching_vector,
        mbti_code = excluded.mbti_code;

  assigned_alias := private.assign_archetype_and_alias(p_user_id, selected_archetype);

  return query select assigned_alias, selected_archetype;
end;
$$;

create function private.cosine_similarity(
  first_vector double precision[],
  second_vector double precision[]
)
returns double precision
language sql
immutable
strict
set search_path = ''
as $$
  with paired as (
    select first_value, second_value
    from unnest(first_vector) with ordinality first_values(first_value, position)
    join unnest(second_vector) with ordinality second_values(second_value, position)
      using (position)
  )
  select case
    when sqrt(sum(first_value * first_value)) * sqrt(sum(second_value * second_value)) = 0 then 0
    else sum(first_value * second_value)
      / (sqrt(sum(first_value * first_value)) * sqrt(sum(second_value * second_value)))
  end
  from paired;
$$;

create function private.dimension_justification(
  first_vector double precision[],
  second_vector double precision[]
)
returns jsonb
language sql
immutable
strict
set search_path = ''
as $$
  with dimension_names as (
    select * from unnest(array[
      'bigfive_apertura', 'bigfive_responsabilidad', 'bigfive_extraversion',
      'bigfive_amabilidad', 'bigfive_neuroticismo',
      'relaciones_comunicacion', 'relaciones_confianza', 'relaciones_empatia',
      'relaciones_gestion_conflicto', 'genero_igualdad',
      'genero_flexibilidad_roles', 'genero_respeto_diversidad',
      'genero_corresponsabilidad'
    ]) with ordinality dimensions(dimension, position)
  ), ranked as (
    select dimension,
      round((1 - abs(first_value - second_value))::numeric, 4) as affinity
    from dimension_names
    join unnest(first_vector) with ordinality first_values(first_value, position)
      using (position)
    join unnest(second_vector) with ordinality second_values(second_value, position)
      using (position)
    order by affinity desc, dimension
    limit 3
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('dimension', dimension, 'affinity', affinity) order by affinity desc, dimension),
    '[]'::jsonb
  )
  from ranked;
$$;

create function public.refresh_matches(
  p_user_id uuid,
  p_threshold double precision default 0.85
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if p_threshold < 0.85 or p_threshold >= 1 then
    raise exception 'invalid_threshold';
  end if;

  if not exists (select 1 from public.score_vectors where user_id = p_user_id) then
    raise exception 'vector_not_found';
  end if;

  delete from public.matches where user_a = p_user_id or user_b = p_user_id;

  insert into public.matches (user_a, user_b, similarity, justification)
  select
    least(current_vector.user_id, candidate.user_id),
    greatest(current_vector.user_id, candidate.user_id),
    calculated.similarity,
    private.dimension_justification(current_vector.matching_vector, candidate.matching_vector)
  from public.score_vectors current_vector
  join public.score_vectors candidate on candidate.user_id <> current_vector.user_id
  cross join lateral (
    select private.cosine_similarity(
      current_vector.matching_vector,
      candidate.matching_vector
    ) as similarity
  ) calculated
  where current_vector.user_id = p_user_id
    and calculated.similarity > p_threshold
  on conflict (user_a, user_b) do update
    set similarity = excluded.similarity,
        justification = excluded.justification,
        updated_at = now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create function public.get_my_matches()
returns table(alias text, similarity double precision, justification jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select other_profile.alias, match.similarity, match.justification
  from public.matches match
  join public.profiles other_profile
    on other_profile.id = case
      when match.user_a = auth.uid() then match.user_b
      else match.user_a
    end
  where (match.user_a = auth.uid() or match.user_b = auth.uid())
    and other_profile.alias is not null
  order by match.similarity desc, other_profile.alias;
$$;

revoke all on function public.is_matricula_available(text) from public, anon, authenticated;
revoke all on function public.submit_quiz_result(uuid, jsonb, jsonb, double precision[], text) from public, anon, authenticated;
revoke all on function public.refresh_matches(uuid, double precision) from public, anon, authenticated;
revoke all on function public.get_my_matches() from public, anon, authenticated;

grant execute on function public.is_matricula_available(text) to service_role;
grant execute on function public.submit_quiz_result(uuid, jsonb, jsonb, double precision[], text) to service_role;
grant execute on function public.refresh_matches(uuid, double precision) to service_role;
grant execute on function public.get_my_matches() to authenticated;
