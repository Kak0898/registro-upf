-- =====================================================================
--  Registro diario de complejos fronterizos (UPF) - instalación en Supabase
--  Pegar TODO este texto en Supabase > SQL Editor > New query y pulsar "Run".
--  Se puede ejecutar más de una vez sin problema.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tablas ----------
create table if not exists public.complejos (
  cid text primary key, orden int not null, region text not null,
  complejo text not null, pais text not null, tipo text not null
);

create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  usuario text not null unique,
  nombre text not null,
  rol text not null check (rol in ('admin','coordinador')),
  complejo text references public.complejos(cid),
  activo boolean not null default true,
  cambiar boolean not null default true,
  creado text not null default to_char(now() at time zone 'America/Santiago','YYYY-MM-DD HH24:MI:SS')
);

create table if not exists public.config (clave text primary key, valor text not null);
insert into public.config values ('hora_limite','08:55') on conflict do nothing;

create table if not exists public.registros (
  fecha date not null,
  complejo text not null references public.complejos(cid),
  estado text not null, motivo text not null default '',
  carga text not null, buses text not null, menores text not null,
  apertura text not null default '', cierre_ingreso text not null default '',
  cierre text not null default '', cierre_salida text not null default '',
  obs text not null default '',
  actualizado_por text not null default '',
  actualizado text not null, creado text not null,
  primary key (fecha, complejo)
);

insert into public.complejos (cid, orden, region, complejo, pais, tipo) values
  ('chacalluta',1,'Región de Arica y Parinacota','Chacalluta','Perú','Permanente'),
  ('chungara',2,'Región de Arica y Parinacota','Chungará','Bolivia','Permanente'),
  ('visviri',3,'Región de Arica y Parinacota','Visviri','Bolivia','Permanente'),
  ('colchane',4,'Región Tarapacá','Colchane','Bolivia','Permanente'),
  ('hito-cajon',5,'Región de Antofagasta','Hito Cajón','Bolivia','Permanente'),
  ('jama',6,'Región de Antofagasta','Jama
(Integrado en Argentina)','Argentina','Permanente'),
  ('sico',7,'Región de Antofagasta','Sico (Integrado en Argentina)','Argentina','Permanente'),
  ('san-pedro-de-atacama',8,'Región de Antofagasta','San Pedro de Atacama','Argentina/Bolivia','Permanente'),
  ('ollague',9,'Región de Antofagasta','Ollagüe','Bolivia','Permanente'),
  ('san-francisco',10,'Región de Atacama','San Francisco','Argentina','Permanente'),
  ('pircas-negras',11,'Región de Atacama','Pircas Negras (Integrado en Argentina)','Argentina','Permanente'),
  ('agua-negra',12,'Región de Coquimbo','Agua Negra','Argentina','Permanente'),
  ('los-libertadores',13,'Región de Valparaíso','Los Libertadores','Argentina','Permanente'),
  ('san-pedro-de-vergara',14,'Región del Maule','San Pedro de Vergara','Argentina','Temporal'),
  ('pehuenche',15,'Región del Maule','Pehuenche','Argentina','Permanente'),
  ('pichachen',16,'Región del Bío-Bío','Pichachén','Argentina','Permanente'),
  ('pino-hachado',17,'Región de la Araucanía','Pino Hachado','Argentina','Permanente'),
  ('liucura',18,'Región de la Araucanía','Liucura','Argentina','Permanente'),
  ('icalma',19,'Región de la Araucanía','Icalma','Argentina','Permanente'),
  ('mamuil-malal',20,'Región de la Araucanía','Mamuil Malal','Argentina','Permanente'),
  ('hua-hum',21,'Región de Los Ríos','Hua Hum','Argentina','Permanente'),
  ('carirrine',22,'Región de Los Ríos','Carirriñe','Argentina','Permanente'),
  ('cardenal-a-samore',23,'Región de Los Lagos','Cardenal A. Samoré','Argentina','Permanente'),
  ('el-limite-futaleufu',24,'Región de Los Lagos','El Límite - Futaleufú','Argentina','Permanente'),
  ('rio-encuentro',25,'Región de Los Lagos','Río Encuentro','','Permanente'),
  ('peulla',26,'Región de Los Lagos','Peulla','Argentina','Permanente'),
  ('coyhaique-alto',27,'Región de Aysén del G. Carlos Ibáñez del Campo','Coyhaique Alto','Argentina','Permanente'),
  ('balmaceda',28,'Región de Aysén del G. Carlos Ibáñez del Campo','Balmaceda','Argentina','Permanente'),
  ('roballos',29,'Región de Aysén del G. Carlos Ibáñez del Campo','Roballos','Argentina','Permanente'),
  ('rio-mayer',30,'Región de Aysén del G. Carlos Ibáñez del Campo','Río Mayer','Argentina','Permanente'),
  ('rio-mosco',31,'Región de Aysén del G. Carlos Ibáñez del Campo','Río Mosco','Argentina','Permanente'),
  ('dos-lagunas',32,'Región de Aysén del G. Carlos Ibáñez del Campo','Dos Lagunas','Argentina','Permanente'),
  ('chile-chico',33,'Región de Aysén del G. Carlos Ibáñez del Campo','Chile Chico','Argentina','Permanente'),
  ('palavicini',34,'Región de Aysén del G. Carlos Ibáñez del Campo','Palavicini','Argentina','Permanente'),
  ('integracion-austral',35,'Región de Magallanes y la Antártica Chilena','Integración Austral','Argentina','Permanente'),
  ('dorotea',36,'Región de Magallanes y la Antártica Chilena','Dorotea','Argentina','Permanente'),
  ('laurita-casas-viejas',37,'Región de Magallanes y la Antártica Chilena','Laurita Casas Viejas','Argentina','Permanente'),
  ('rio-don-guillermo',38,'Región de Magallanes y la Antártica Chilena','Río Don Guillermo','Argentina','Permanente'),
  ('san-sebastian',39,'Región de Magallanes y la Antártica Chilena','San Sebastián','Argentina','Permanente'),
  ('rio-bellavista',40,'Región de Magallanes y la Antártica Chilena','Río Bellavista','Argentina','Temporal')
on conflict (cid) do update set orden=excluded.orden, region=excluded.region,
  complejo=excluded.complejo, pais=excluded.pais, tipo=excluded.tipo;

-- ---------- Utilidades ----------
create or replace function public.upf_ahora() returns text language sql stable as
$$ select to_char(now() at time zone 'America/Santiago','YYYY-MM-DD HH24:MI:SS') $$;

create or replace function public.upf_hoy() returns date language sql stable as
$$ select (now() at time zone 'America/Santiago')::date $$;

create or replace function public.upf_es_admin() returns boolean
language sql stable security definer set search_path = public, auth as
$$ select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin' and activo) $$;

create or replace function public.upf_mi_complejo() returns text
language sql stable security definer set search_path = public, auth as
$$ select complejo from public.perfiles where id = auth.uid() and activo and not cambiar $$;

create or replace function public.upf_exigir_admin() returns void
language plpgsql stable security definer set search_path = public, auth as
$$ begin
  if auth.uid() is null then raise exception 'Tu sesión expiró. Vuelve a ingresar.'; end if;
  if not public.upf_es_admin() then raise exception 'No tienes permiso para esta acción.'; end if;
end $$;

create or replace function public.upf_email(p_usuario text) returns text language sql immutable as
$$ select lower(p_usuario) || '@upf-registro.local' $$;

create or replace function public.upf_clave_aleatoria() returns text language plpgsql volatile as
$$ declare a text := 'abcdefghjkmnpqrstuvwxyz23456789'; o text := ''; i int;
begin
  for i in 1..10 loop
    o := o || substr(a, 1 + floor(random()*length(a))::int, 1);
    if i = 5 then o := o || '-'; end if;
  end loop; return o;
end $$;

create or replace function public.upf_validar(p_usuario text, p_clave text) returns void language plpgsql immutable as
$$ begin
  if p_usuario !~ '^[a-z0-9._-]{3,40}$' then
    raise exception 'El usuario debe tener entre 3 y 40 caracteres: letras sin tilde, números, punto, guion o guion bajo.'; end if;
  if p_clave is not null then
    if length(p_clave) < 8 then raise exception 'La contraseña debe tener al menos 8 caracteres.'; end if;
    if lower(p_clave) = lower(p_usuario) then raise exception 'La contraseña no puede ser igual al usuario.'; end if;
  end if;
end $$;

-- Crea la cuenta de acceso + el perfil (uso interno; nadie puede llamarla desde fuera)
create or replace function public.upf_crear_interno(p_usuario text, p_nombre text, p_rol text,
  p_complejo text, p_clave text, p_cambiar boolean) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as
$$ declare v_id uuid := gen_random_uuid(); v_mail text := public.upf_email(p_usuario);
begin
  if exists (select 1 from public.perfiles where usuario = p_usuario) then
    raise exception 'Ese nombre de usuario ya existe.'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_mail,
    extensions.crypt(p_clave, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_mail, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now());
  insert into public.perfiles (id, usuario, nombre, rol, complejo, cambiar)
  values (v_id, p_usuario, left(p_nombre, 80), p_rol, p_complejo, p_cambiar);
  return v_id;
end $$;
revoke all on function public.upf_crear_interno(text,text,text,text,text,boolean) from public, anon, authenticated;

-- ---------- Acciones que llama la aplicación ----------
create or replace function public.upf_estado() returns jsonb
language sql stable security definer set search_path = public as
$$ select jsonb_build_object(
     'configurado', exists (select 1 from public.perfiles where rol = 'admin'),
     'hora_limite', coalesce((select valor from public.config where clave = 'hora_limite'), '08:55'),
     'hoy', public.upf_hoy()::text) $$;

create or replace function public.upf_configurar(p_usuario text, p_nombre text, p_clave text) returns void
language plpgsql security definer set search_path = public, auth, extensions as
$$ begin
  if exists (select 1 from public.perfiles where rol = 'admin') then
    raise exception 'La plataforma ya está configurada.'; end if;
  p_usuario := lower(trim(p_usuario)); p_nombre := trim(coalesce(p_nombre,''));
  if p_nombre = '' then raise exception 'Escribe tu nombre.'; end if;
  perform public.upf_validar(p_usuario, p_clave);
  perform public.upf_crear_interno(p_usuario, p_nombre, 'admin', null, p_clave, false);
end $$;

create or replace function public.upf_crear_cuenta(p_usuario text, p_nombre text, p_rol text,
  p_complejo text, p_clave text, p_varios boolean default true) returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as
$$ declare v_cx public.complejos; v_nom text; v_clave text;
begin
  perform public.upf_exigir_admin();
  p_usuario := lower(trim(coalesce(p_usuario,''))); p_nombre := trim(coalesce(p_nombre,'')); p_clave := trim(coalesce(p_clave,''));
  if p_rol = 'admin' then
    if p_nombre = '' then raise exception 'Escribe el nombre del administrador.'; end if;
    p_complejo := null; v_nom := 'Administrador';
  else
    p_rol := 'coordinador';
    select * into v_cx from public.complejos where cid = p_complejo;
    if not found then raise exception 'Elige el complejo fronterizo.'; end if;
    if not p_varios and exists (select 1 from public.perfiles where rol='coordinador' and complejo = p_complejo) then
      raise exception 'Ese complejo ya tiene una cuenta de coordinador.'; end if;
    if p_usuario = '' then p_usuario := p_complejo; end if;
    v_nom := regexp_replace(v_cx.complejo, '\s+', ' ', 'g');
    if p_nombre = '' then p_nombre := 'Coordinador ' || v_nom; end if;
  end if;
  if p_clave = '' then v_clave := public.upf_clave_aleatoria(); perform public.upf_validar(p_usuario, null);
  else v_clave := p_clave; perform public.upf_validar(p_usuario, p_clave); end if;
  perform public.upf_crear_interno(p_usuario, p_nombre, p_rol, p_complejo, v_clave, true);
  return jsonb_build_object('complejo', coalesce(p_complejo,''), 'nombre_complejo', v_nom,
                            'nombre', left(p_nombre,80), 'usuario', p_usuario, 'clave', v_clave);
end $$;

create or replace function public.upf_crear_todas() returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as
$$ declare r record; v_out jsonb := '[]'::jsonb;
begin
  perform public.upf_exigir_admin();
  for r in select c.cid from public.complejos c
           where not exists (select 1 from public.perfiles p where p.rol='coordinador' and p.complejo = c.cid)
           order by c.orden loop
    v_out := v_out || jsonb_build_array(public.upf_crear_cuenta('', '', 'coordinador', r.cid, '', false));
  end loop;
  return v_out;
end $$;

create or replace function public.upf_restablecer(p_id uuid, p_clave text) returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as
$$ declare v public.perfiles; v_clave text := trim(coalesce(p_clave,''));
begin
  perform public.upf_exigir_admin();
  select * into v from public.perfiles where id = p_id;
  if not found then raise exception 'Cuenta no encontrada.'; end if;
  if v.id = auth.uid() then raise exception 'Tu propia contraseña se cambia desde “Mi cuenta”.'; end if;
  if v_clave = '' then v_clave := public.upf_clave_aleatoria(); else perform public.upf_validar(v.usuario, v_clave); end if;
  update auth.users set encrypted_password = extensions.crypt(v_clave, extensions.gen_salt('bf')), updated_at = now() where id = p_id;
  update public.perfiles set cambiar = true where id = p_id;
  return jsonb_build_object('usuario', v.usuario, 'clave', v_clave);
end $$;

create or replace function public.upf_editar(p_id uuid, p_usuario text, p_nombre text, p_complejo text) returns void
language plpgsql security definer set search_path = public, auth, extensions as
$$ declare v public.perfiles; v_mail text;
begin
  perform public.upf_exigir_admin();
  select * into v from public.perfiles where id = p_id;
  if not found then raise exception 'Cuenta no encontrada.'; end if;
  p_usuario := lower(trim(coalesce(p_usuario,''))); p_nombre := trim(coalesce(p_nombre,''));
  if p_nombre = '' then raise exception 'Escribe el nombre.'; end if;
  perform public.upf_validar(p_usuario, null);
  if v.rol = 'coordinador' and not exists (select 1 from public.complejos where cid = p_complejo) then
    raise exception 'Complejo no válido.'; end if;
  if exists (select 1 from public.perfiles where usuario = p_usuario and id <> p_id) then
    raise exception 'Ese nombre de usuario ya existe.'; end if;
  v_mail := public.upf_email(p_usuario);
  update public.perfiles set usuario = p_usuario, nombre = left(p_nombre,80),
    complejo = case when rol = 'admin' then null else p_complejo end where id = p_id;
  update auth.users set email = v_mail, updated_at = now() where id = p_id;
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', v_mail), updated_at = now()
    where user_id = p_id and provider = 'email';
end $$;

create or replace function public.upf_eliminar(p_id uuid) returns void
language plpgsql security definer set search_path = public, auth as
$$ begin
  perform public.upf_exigir_admin();
  if not exists (select 1 from public.perfiles where id = p_id) then raise exception 'Cuenta no encontrada.'; end if;
  if p_id = auth.uid() then raise exception 'No puedes eliminar tu propia cuenta.'; end if;
  delete from auth.users where id = p_id;
end $$;

create or replace function public.upf_activar(p_id uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public, auth as
$$ begin
  perform public.upf_exigir_admin();
  if not exists (select 1 from public.perfiles where id = p_id) then raise exception 'Cuenta no encontrada.'; end if;
  if p_id = auth.uid() then raise exception 'No puedes desactivar tu propia cuenta.'; end if;
  update public.perfiles set activo = p_activo where id = p_id;
  update auth.users set banned_until = case when p_activo then null else 'infinity'::timestamptz end where id = p_id;
end $$;

-- Se llama después de que la persona cambió su contraseña
create or replace function public.upf_clave_cambiada(p_nombre text) returns void
language plpgsql security definer set search_path = public, auth as
$$ begin
  if auth.uid() is null then raise exception 'Tu sesión expiró. Vuelve a ingresar.'; end if;
  update public.perfiles set cambiar = false,
    nombre = case when length(trim(coalesce(p_nombre,''))) between 1 and 80 then trim(p_nombre) else nombre end
  where id = auth.uid();
end $$;

create or replace function public.upf_guardar_config(p_hora text) returns void
language plpgsql security definer set search_path = public, auth as
$$ begin
  perform public.upf_exigir_admin();
  if p_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'La hora límite no es válida (usa formato 24 horas, por ejemplo 08:55).'; end if;
  insert into public.config values ('hora_limite', p_hora)
    on conflict (clave) do update set valor = excluded.valor;
end $$;

create or replace function public.upf_guardar_registro(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, auth as
$$ declare
  v public.perfiles; v_cx text; v_f date; v_est text[] := array['Habilitado','Habilitado con Restricción','No Habilitado','Alerta'];
  v_mot text[] := array['Condiciones climáticas adversas','Ruta inhabilitada','Procesos de reparación y/o habilitación de infraestructura','Falla de equipamiento crítico','Término de Temporada Estival','Activación de alertas y protocolos de seguridad','Requerimiento de cierre por parte de País Limítrofe','Otras'];
  k text; v_h text; v_ahora text := public.upf_ahora(); v_prev public.registros; v_existe boolean;
  v_estado text := coalesce(p->>'estado',''); v_motivo text := trim(coalesce(p->>'motivo',''));
  v_carga text := coalesce(p->>'carga',''); v_buses text := coalesce(p->>'buses',''); v_men text := coalesce(p->>'menores','');
  v_ap text := trim(coalesce(p->>'apertura','')); v_ci text := trim(coalesce(p->>'cierre_ingreso',''));
  v_ce text := trim(coalesce(p->>'cierre','')); v_cs text := trim(coalesce(p->>'cierre_salida',''));
  v_obs text := trim(coalesce(p->>'obs',''));
begin
  if auth.uid() is null then raise exception 'Tu sesión expiró. Vuelve a ingresar.'; end if;
  select * into v from public.perfiles where id = auth.uid() and activo;
  if not found then raise exception 'Tu sesión expiró. Vuelve a ingresar.'; end if;
  if v.cambiar then raise exception 'Debes cambiar tu contraseña antes de continuar.'; end if;
  v_cx := case when v.rol = 'coordinador' then v.complejo else coalesce(p->>'complejo','') end;
  if not exists (select 1 from public.complejos where cid = v_cx) then raise exception 'Complejo no válido.'; end if;
  begin v_f := (p->>'fecha')::date; exception when others then raise exception 'La fecha no es válida.'; end;
  if v_f is null then raise exception 'La fecha no es válida.'; end if;
  if v_f > public.upf_hoy() then raise exception 'No se puede registrar una fecha futura.'; end if;
  if v.rol = 'coordinador' and v_f < public.upf_hoy() - 7 then
    raise exception 'Solo puedes registrar o corregir los últimos 7 días. Para fechas anteriores contacta al administrador.'; end if;
  if not (v_estado = any (v_est)) then raise exception 'Elige el estado de operación.'; end if;
  if v_motivo <> '' and not (v_motivo = any (v_mot)) then raise exception 'Motivo no válido.'; end if;
  if v_estado = 'No Habilitado' and v_motivo = '' then raise exception 'Indica el motivo de no habilitación.'; end if;
  if not (v_carga = any (v_est)) then raise exception 'Elige el estado de transporte de carga.'; end if;
  if not (v_buses = any (v_est)) then raise exception 'Elige el estado de buses.'; end if;
  if not (v_men = any (v_est)) then raise exception 'Elige el estado de vehículos menores.'; end if;
  foreach v_h in array array[v_ap, v_ci, v_ce, v_cs] loop
    if v_h <> '' and v_h !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'Una de las horas no es válida (usa formato 24 horas, por ejemplo 18:30).'; end if;
  end loop;
  if length(v_obs) > 1000 then raise exception 'Las observaciones no pueden superar los 1000 caracteres.'; end if;
  select * into v_prev from public.registros where fecha = v_f and complejo = v_cx;
  v_existe := found;
  insert into public.registros (fecha, complejo, estado, motivo, carga, buses, menores, apertura, cierre_ingreso, cierre,
                                cierre_salida, obs, actualizado_por, actualizado, creado)
  values (v_f, v_cx, v_estado, v_motivo, v_carga, v_buses, v_men, v_ap, v_ci, v_ce, v_cs, v_obs, v.nombre, v_ahora, v_ahora)
  on conflict (fecha, complejo) do update set estado = excluded.estado, motivo = excluded.motivo,
    carga = excluded.carga, buses = excluded.buses, menores = excluded.menores, apertura = excluded.apertura,
    cierre_ingreso = excluded.cierre_ingreso, cierre = excluded.cierre, cierre_salida = excluded.cierre_salida,
    obs = excluded.obs, actualizado_por = excluded.actualizado_por, actualizado = excluded.actualizado;
  return jsonb_build_object('ok', true, 'actualizado', v_existe);
end $$;

-- ---------- Seguridad: cada persona solo ve lo que le corresponde ----------
alter table public.complejos enable row level security;
alter table public.perfiles  enable row level security;
alter table public.config    enable row level security;
alter table public.registros enable row level security;

drop policy if exists p_complejos_leer on public.complejos;
create policy p_complejos_leer on public.complejos for select to authenticated using (true);
drop policy if exists p_perfiles_leer on public.perfiles;
create policy p_perfiles_leer on public.perfiles for select to authenticated
  using (id = auth.uid() or public.upf_es_admin());
drop policy if exists p_config_leer on public.config;
create policy p_config_leer on public.config for select to authenticated using (true);
drop policy if exists p_registros_leer on public.registros;
create policy p_registros_leer on public.registros for select to authenticated
  using (public.upf_es_admin() or complejo = public.upf_mi_complejo());

-- Nadie escribe directamente en las tablas: solo a través de las funciones de arriba
revoke all on public.complejos, public.perfiles, public.config, public.registros from anon, authenticated;
grant select on public.complejos, public.perfiles, public.config, public.registros to authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.upf_estado() to anon, authenticated;
grant execute on function public.upf_configurar(text,text,text) to anon, authenticated;
grant execute on function public.upf_crear_cuenta(text,text,text,text,text,boolean) to authenticated;
grant execute on function public.upf_crear_todas() to authenticated;
grant execute on function public.upf_restablecer(uuid,text) to authenticated;
grant execute on function public.upf_editar(uuid,text,text,text) to authenticated;
grant execute on function public.upf_eliminar(uuid) to authenticated;
grant execute on function public.upf_activar(uuid,boolean) to authenticated;
grant execute on function public.upf_clave_cambiada(text) to authenticated;
grant execute on function public.upf_guardar_config(text) to authenticated;
grant execute on function public.upf_guardar_registro(jsonb) to authenticated;
-- funciones auxiliares que las políticas necesitan
grant execute on function public.upf_es_admin(), public.upf_mi_complejo(), public.upf_hoy(), public.upf_ahora() to authenticated;
