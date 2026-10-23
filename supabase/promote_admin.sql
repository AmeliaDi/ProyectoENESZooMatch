-- Ejecutar en el SQL Editor de Supabase, no es una migración.
-- 1. Crea el usuario con email y contraseña en Authentication > Users.
-- 2. Cambia el correo de abajo y ejecuta el bloque.

do $$
declare
  admin_email text := 'admin@example.com';
  admin_id uuid;
begin
  select id into admin_id from auth.users where email = lower(admin_email);

  if admin_id is null then
    raise exception 'No existe un usuario de Auth con el correo %', admin_email;
  end if;

  insert into public.profiles (id, matricula_hash, role)
  values (
    admin_id,
    encode(extensions.digest('admin:' || lower(admin_email), 'sha256'), 'hex'),
    'admin'
  )
  on conflict (id) do update set role = 'admin';

  insert into public.user_roles (user_id, role)
  values (admin_id, 'admin')
  on conflict (user_id) do update set role = 'admin';
end $$;
