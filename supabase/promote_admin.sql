-- Ejecutar en el SQL Editor de Supabase, no es una migración (ADR-036).
-- El observatorio entra con matrícula + PIN administrativo. La matrícula solo
-- existe como HMAC y el PIN como hash scrypt con un secreto del servidor, así
-- que ambos se calculan FUERA de la base, en la máquina de quien opera, con un
-- script local que lee MATRICULA_HMAC_SECRET y CHAT_PIN_PEPPER de .env.local.
-- Ese script hace lo equivalente a este bloque; nunca se versiona.
--
-- Este archivo solo sirve para REVOCAR a un administrador conociendo su alias:
do $$
declare
  admin_alias text := 'alias de la cuenta';
  admin_id uuid;
begin
  select user_id into admin_id from public.profiles where alias = admin_alias;
  if admin_id is null then
    raise exception 'No existe un perfil con el alias %', admin_alias;
  end if;

  delete from public.admin_credentials where user_id = admin_id;
  delete from public.user_roles where user_id = admin_id;
end $$;
