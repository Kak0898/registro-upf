-- =====================================================================
-- BITÁCORA DE AUDITORÍA (se puede ejecutar más de una vez sin problema)
-- Registra: creación/edición/eliminación/desactivación de cuentas,
-- restablecimiento y cambio de contraseña, cambios de configuración y
-- cada registro diario creado o modificado. No guarda contraseñas.
-- Solo el administrador la puede leer y nadie puede editarla ni borrarla.
-- =====================================================================
create table if not exists public.bitacora (
  id bigint generated always as identity primary key,
  fecha text not null,                 -- hora de Chile: aaaa-mm-dd hh:mm:ss
  actor uuid,                          -- quién hizo la acción (null = sistema)
  actor_usuario text not null,
  accion text not null,
  objeto text not null default '',     -- sobre qué cuenta o complejo
  detalle text not null default ''
);
create index if not exists bitacora_fecha_idx on public.bitacora (fecha desc);

create or replace function public.upf_bitacora_registrar(p_accion text, p_objeto text, p_detalle text) returns void
language plpgsql security definer set search_path = public, auth as
$$ declare v_u text; begin
  select usuario into v_u from public.perfiles where id = auth.uid();
  insert into public.bitacora (fecha, actor, actor_usuario, accion, objeto, detalle)
  values (to_char(now() at time zone 'America/Santiago','YYYY-MM-DD HH24:MI:SS'), auth.uid(),
          coalesce(v_u, case when auth.uid() is null then 'sistema' else '(cuenta eliminada)' end),
          p_accion, left(coalesce(p_objeto,''),120), left(coalesce(p_detalle,''),500));
end $$;

-- Inmutable: ni siquiera el sistema puede modificar o borrar entradas
create or replace function public.upf_bitacora_bloquear() returns trigger language plpgsql as
$$ begin raise exception 'La bitácora no se puede modificar ni borrar.'; end $$;
drop trigger if exists t_bitacora_inmutable on public.bitacora;
create trigger t_bitacora_inmutable before update or delete on public.bitacora
  for each row execute function public.upf_bitacora_bloquear();
drop trigger if exists t_bitacora_truncate on public.bitacora;
create trigger t_bitacora_truncate before truncate on public.bitacora
  for each statement execute function public.upf_bitacora_bloquear();

-- Cuentas
create or replace function public.upf_aud_perfiles() returns trigger
language plpgsql security definer set search_path = public, auth as
$$ begin
  if tg_op = 'INSERT' then
    perform public.upf_bitacora_registrar(case when new.rol='admin' then 'Crear administrador' else 'Crear cuenta' end,
      new.usuario, 'Rol: ' || new.rol || coalesce(', complejo: ' || new.complejo, ''));
  elsif tg_op = 'DELETE' then
    perform public.upf_bitacora_registrar('Eliminar cuenta', old.usuario, 'Rol: ' || old.rol || coalesce(', complejo: ' || old.complejo, ''));
  else
    if new.usuario is distinct from old.usuario then
      perform public.upf_bitacora_registrar('Cambiar usuario', new.usuario, 'Antes: ' || old.usuario); end if;
    if new.nombre is distinct from old.nombre then
      perform public.upf_bitacora_registrar('Cambiar nombre', new.usuario, 'Antes: ' || old.nombre || ' · Ahora: ' || new.nombre); end if;
    if new.complejo is distinct from old.complejo then
      perform public.upf_bitacora_registrar('Cambiar complejo', new.usuario, 'Antes: ' || coalesce(old.complejo,'—') || ' · Ahora: ' || coalesce(new.complejo,'—')); end if;
    if new.activo is distinct from old.activo then
      perform public.upf_bitacora_registrar(case when new.activo then 'Activar cuenta' else 'Desactivar cuenta' end, new.usuario, ''); end if;
    if new.cambiar and not old.cambiar then
      perform public.upf_bitacora_registrar('Restablecer contraseña', new.usuario, 'Contraseña temporal; deberá cambiarla al ingresar'); end if;
    if old.cambiar and not new.cambiar then
      perform public.upf_bitacora_registrar('Cambio de contraseña', new.usuario, 'La persona eligió su propia contraseña'); end if;
  end if;
  return null;
end $$;
drop trigger if exists t_aud_perfiles on public.perfiles;
create trigger t_aud_perfiles after insert or update or delete on public.perfiles
  for each row execute function public.upf_aud_perfiles();

-- Configuración
create or replace function public.upf_aud_config() returns trigger
language plpgsql security definer set search_path = public, auth as
$$ begin
  if tg_op = 'INSERT' or new.valor is distinct from old.valor then
    perform public.upf_bitacora_registrar('Cambiar configuración', new.clave,
      case when tg_op = 'UPDATE' then 'Antes: ' || old.valor || ' · Ahora: ' || new.valor else 'Valor: ' || new.valor end);
  end if;
  return null;
end $$;
drop trigger if exists t_aud_config on public.config;
create trigger t_aud_config after insert or update on public.config
  for each row execute function public.upf_aud_config();

-- Registros diarios
create or replace function public.upf_aud_registros() returns trigger
language plpgsql security definer set search_path = public, auth as
$$ declare v_d text; begin
  if tg_op = 'INSERT' then
    perform public.upf_bitacora_registrar('Crear registro', new.complejo || ' · ' || to_char(new.fecha,'DD/MM/YYYY'), 'Estado: ' || new.estado);
  else
    v_d := '';
    if new.estado is distinct from old.estado then v_d := v_d || 'Estado: ' || old.estado || ' → ' || new.estado || '. '; end if;
    if new.motivo is distinct from old.motivo then v_d := v_d || 'Motivo modificado. '; end if;
    if new.carga is distinct from old.carga or new.buses is distinct from old.buses or new.menores is distinct from old.menores then
      v_d := v_d || 'Estados de carga/buses/menores modificados. '; end if;
    if new.apertura is distinct from old.apertura or new.cierre_ingreso is distinct from old.cierre_ingreso
       or new.cierre is distinct from old.cierre or new.cierre_salida is distinct from old.cierre_salida then
      v_d := v_d || 'Horarios modificados. '; end if;
    if new.obs is distinct from old.obs then v_d := v_d || 'Observaciones modificadas. '; end if;
    if v_d <> '' then
      perform public.upf_bitacora_registrar('Modificar registro', new.complejo || ' · ' || to_char(new.fecha,'DD/MM/YYYY'), trim(v_d)); end if;
  end if;
  return null;
end $$;
drop trigger if exists t_aud_registros on public.registros;
create trigger t_aud_registros after insert or update on public.registros
  for each row execute function public.upf_aud_registros();

-- Solo el administrador puede leer la bitácora
alter table public.bitacora enable row level security;
drop policy if exists p_bitacora_leer on public.bitacora;
create policy p_bitacora_leer on public.bitacora for select to authenticated using (public.upf_es_admin());
revoke all on public.bitacora from anon, authenticated;
grant select on public.bitacora to authenticated;
revoke all on function public.upf_bitacora_registrar(text,text,text), public.upf_bitacora_bloquear(),
  public.upf_aud_perfiles(), public.upf_aud_config(), public.upf_aud_registros() from public, anon, authenticated;

-- ---------- Inicios de sesión ----------
-- Supabase actualiza last_sign_in_at cada vez que alguien ingresa con usuario y contraseña.
-- Si por cualquier motivo el registro fallara, NUNCA bloquea el ingreso.
create or replace function public.upf_aud_login() returns trigger
language plpgsql security definer set search_path = public, auth as
$$ declare p public.perfiles; begin
  begin
    select * into p from public.perfiles where id = new.id;
    if found then
      insert into public.bitacora (fecha, actor, actor_usuario, accion, objeto, detalle)
      values (to_char(now() at time zone 'America/Santiago','YYYY-MM-DD HH24:MI:SS'), p.id, p.usuario,
              'Inicio de sesión', p.usuario, 'Rol: ' || p.rol || coalesce(', complejo: ' || p.complejo, ''));
    end if;
  exception when others then null;
  end;
  return null;
end $$;
revoke all on function public.upf_aud_login() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.upf_aud_login() to supabase_auth_admin;
  end if;
end $$;
drop trigger if exists t_aud_login on auth.users;
create trigger t_aud_login after update of last_sign_in_at on auth.users
  for each row when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function public.upf_aud_login();
