-- =============================================================================
-- FarmaControl — Esquema de Supabase (Postgres)
-- =============================================================================
-- Cómo usar este archivo:
--   1. Entra a tu proyecto en https://app.supabase.com
--   2. Ve a "SQL Editor" (menú izquierdo) → "New query"
--   3. Pega TODO este archivo y dale a "Run"
--   4. Revisa la sección final para crear tu primer usuario administrador
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. TABLA DE PERFILES (extiende auth.users con los datos del formulario
--    de registro + el sistema de permisos/roles)
-- -----------------------------------------------------------------------------
create table if not exists perfiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  nombre           text not null,
  apellido         text not null,
  tipo_cedula      text not null default 'V' check (tipo_cedula in ('V','E')),
  cedula           text not null,
  telefono         text,
  fecha_nacimiento date,
  rol              text not null default 'sin_permisos'
                     check (rol in ('sin_permisos','cajero','administrador')),
  es_dueno         boolean not null default false,
  creado_en        timestamptz not null default now()
);

comment on table perfiles is 'Datos de ficha + rol/permisos de cada usuario. rol se asigna manualmente por un administrador.';
comment on column perfiles.rol is 'sin_permisos = recién registrado, esperando aprobación. cajero = solo Punto de Venta. administrador = Inventario + POS + gestión de usuarios.';
comment on column perfiles.es_dueno is 'true SOLO para el primer usuario que se registró en el sistema (el dueño). Nadie -- ni otro administrador -- puede cambiarle el rol ni eliminarlo. Solo el dueño puede eliminar usuarios.';

-- Si la tabla YA existía de antes (proyecto en uso), el "create table if not
-- exists" de arriba no le agrega la columna nueva a una tabla que ya existe.
-- Esta línea la agrega de forma seguridad, sin importar si la tabla es
-- nueva o ya tenía datos -- se puede correr las veces que hagan falta.
alter table perfiles add column if not exists es_dueno boolean not null default false;


-- -----------------------------------------------------------------------------
-- 2. TABLAS DEL SISTEMA (equivalentes a las de farmacontrol.db)
-- -----------------------------------------------------------------------------
create table if not exists productos (
  id                bigint generated always as identity primary key,
  nombre            text not null,
  categoria         text not null default 'Medicamentos',
  precio            numeric(10,2) not null default 0,
  minimo            integer not null default 0,
  codigo_barra      text default '',
  fecha_laboracion  date,
  fabricante        text default '',
  proveedor         text default '',
  creado_en         timestamptz not null default now()
);

create table if not exists lotes (
  id                bigint generated always as identity primary key,
  producto_id       bigint not null references productos(id) on delete cascade,
  producto_nombre   text not null default '',
  numero            text not null,
  vence             date not null,
  cantidad          integer not null default 0
);

create table if not exists movimientos (
  id                bigint generated always as identity primary key,
  fecha             timestamptz not null default now(),
  tipo              text not null check (tipo in ('Entrada','Salida')),
  producto_id       bigint references productos(id) on delete set null,
  producto          text not null,
  cantidad          integer not null,
  lote              text default '',
  motivo            text default '',
  usuario           text default ''
);

create table if not exists facturas (
  id                bigint generated always as identity primary key,
  folio             text unique not null,
  fecha             timestamptz not null default now(),
  cliente           text default 'Consumidor Final',
  cajero            text default '',
  metodo_pago       text not null default 'Efectivo',
  subtotal          numeric(10,2) not null,
  iva               numeric(10,2) not null,
  total             numeric(10,2) not null,
  items             jsonb not null
);

create index if not exists idx_lotes_producto on lotes(producto_id);
create index if not exists idx_movimientos_producto on movimientos(producto_id);


-- -----------------------------------------------------------------------------
-- 2.1 CREACIÓN AUTOMÁTICA DEL PERFIL AL REGISTRARSE
-- -----------------------------------------------------------------------------
-- IMPORTANTE: si tu proyecto tiene activa la confirmación de correo, en el
-- momento del registro todavía NO hay sesión activa, así que el navegador
-- no tiene permiso (RLS) para insertar la fila en "perfiles" directamente.
-- La solución correcta es crear esa fila desde la propia base de datos,
-- mediante un trigger sobre auth.users, que se ejecuta con privilegios
-- elevados (SECURITY DEFINER) y por lo tanto no depende de si hay sesión.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_rol text;
  v_es_dueno boolean;
begin
  -- Si todavía no existe NINGÚN perfil en este proyecto, esta es la primera
  -- persona en registrarse: se convierte automáticamente en administrador
  -- Y en el "dueño" del sistema (es_dueno = true), sin necesidad de tocar el
  -- SQL Editor. El dueño es intocable: nadie puede cambiarle el rol ni
  -- eliminarlo, ni siquiera otro administrador. Todo el que se registre
  -- después entra como 'sin_permisos', esperando que se le asigne rol.
  if (select count(*) from perfiles) = 0 then
    v_rol := 'administrador';
    v_es_dueno := true;
  else
    v_rol := 'sin_permisos';
    v_es_dueno := false;
  end if;

  insert into perfiles (id, nombre, apellido, tipo_cedula, cedula, telefono, fecha_nacimiento, rol, es_dueno)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    coalesce(new.raw_user_meta_data->>'apellido', ''),
    coalesce(new.raw_user_meta_data->>'tipo_cedula', 'V'),
    coalesce(new.raw_user_meta_data->>'cedula', ''),
    new.raw_user_meta_data->>'telefono',
    nullif(new.raw_user_meta_data->>'fecha_nacimiento', '')::date,
    v_rol,
    v_es_dueno
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function handle_new_user();


-- -----------------------------------------------------------------------------
-- 3. FUNCIONES AUXILIARES (para las políticas de seguridad)
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER: se ejecutan con permisos elevados para poder leer la
-- tabla perfiles sin caer en recursión infinita de RLS.

create or replace function is_admin()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol = 'administrador'
  );
$$;

create or replace function is_staff()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and rol in ('administrador','cajero')
  );
$$;

-- Evita que un usuario se auto-asigne un rol distinto al que ya tiene, y
-- protege al dueño: NADIE (ni siquiera otro administrador) puede cambiarle
-- el rol al dueño, ni puede des-marcarlo como dueño. Ambos campos, una vez
-- fijados por el trigger de registro, quedan bloqueados para siempre.
create or replace function prevent_rol_escalation()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if OLD.es_dueno = true then
    NEW.rol := OLD.rol;       -- el rol del dueño nunca cambia, lo pida quien lo pida
    NEW.es_dueno := true;     -- y nunca deja de ser el dueño
    return NEW;
  end if;

  if NEW.rol is distinct from OLD.rol and not is_admin() then
    NEW.rol := OLD.rol;
  end if;
  NEW.es_dueno := OLD.es_dueno; -- es_dueno jamás se toca desde la aplicación
  return NEW;
end;
$$;

drop trigger if exists trg_prevent_rol_escalation on perfiles;
create trigger trg_prevent_rol_escalation
  before update on perfiles
  for each row execute function prevent_rol_escalation();


-- -----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) — activar en todas las tablas
-- -----------------------------------------------------------------------------
alter table perfiles    enable row level security;
alter table productos   enable row level security;
alter table lotes       enable row level security;
alter table movimientos enable row level security;
alter table facturas    enable row level security;

-- -----------------------------------------------------------------------------
-- 4.1 PERMISOS DE TABLA (GRANT) — el candado que va ANTES de RLS
-- -----------------------------------------------------------------------------
-- RLS solo filtra FILAS dentro de una tabla a la que el rol ya tiene acceso.
-- Como en la creación del proyecto dejamos "Automatically expose new tables"
-- SIN marcar (a propósito, por seguridad), Supabase no le da automáticamente
-- a los roles "authenticated"/"anon" el permiso base para tocar estas tablas
-- nuevas. Sin este GRANT, cualquier consulta devuelve 403 "Forbidden" ANTES
-- de siquiera evaluar las políticas de RLS de abajo.
grant usage on schema public to authenticated;
grant select, insert, update, delete on perfiles, productos, lotes, movimientos, facturas to authenticated;

-- ===== perfiles =====
drop policy if exists "ver_propio_perfil_o_admin" on perfiles;
create policy "ver_propio_perfil_o_admin" on perfiles
  for select using (auth.uid() = id or is_admin());

drop policy if exists "crear_propio_perfil" on perfiles;
create policy "crear_propio_perfil" on perfiles
  for insert with check (auth.uid() = id);

drop policy if exists "actualizar_propio_perfil_o_admin" on perfiles;
create policy "actualizar_propio_perfil_o_admin" on perfiles
  for update using (auth.uid() = id or is_admin());

drop policy if exists "admin_elimina_perfiles" on perfiles;
create policy "admin_elimina_perfiles" on perfiles
  for delete using (is_admin() and id <> auth.uid() and es_dueno = false);
-- "id <> auth.uid()" y "es_dueno = false" son una segunda capa de protección
-- a nivel de base de datos: ni siquiera un administrador puede borrar su
-- propia cuenta ni la del dueño desde aquí (aunque alguien manipulara el
-- código del sitio para saltarse el
-- botón deshabilitado, la base de datos igual lo rechazaría).

-- ===== productos (solo admin escribe, todo el staff lee) =====
drop policy if exists "staff_lee_productos" on productos;
create policy "staff_lee_productos" on productos
  for select using (is_staff());

drop policy if exists "admin_escribe_productos" on productos;
create policy "admin_escribe_productos" on productos
  for all using (is_admin()) with check (is_admin());

-- ===== lotes =====
drop policy if exists "staff_lee_lotes" on lotes;
create policy "staff_lee_lotes" on lotes
  for select using (is_staff());

drop policy if exists "admin_escribe_lotes" on lotes;
create policy "admin_escribe_lotes" on lotes
  for all using (is_admin()) with check (is_admin());

-- ===== movimientos (el staff puede insertar —ventas del POS y ajustes—, solo se lee) =====
drop policy if exists "staff_lee_movimientos" on movimientos;
create policy "staff_lee_movimientos" on movimientos
  for select using (is_staff());

drop policy if exists "staff_inserta_movimientos" on movimientos;
create policy "staff_inserta_movimientos" on movimientos
  for insert with check (is_staff());

-- ===== facturas (cajero y admin generan y ven facturas) =====
drop policy if exists "staff_lee_facturas" on facturas;
create policy "staff_lee_facturas" on facturas
  for select using (is_staff());

drop policy if exists "staff_inserta_facturas" on facturas;
create policy "staff_inserta_facturas" on facturas
  for insert with check (is_staff());


-- -----------------------------------------------------------------------------
-- 5. DATOS DE DEMOSTRACIÓN (los mismos 4 productos que trae FarmaControl)
--    Se insertan solo si la tabla productos está vacía.
-- -----------------------------------------------------------------------------
do $$
declare
  v_count integer;
  v_id bigint;
begin
  select count(*) into v_count from productos;
  if v_count = 0 then

    insert into productos (nombre, categoria, precio, minimo, codigo_barra, fecha_laboracion, fabricante, proveedor)
    values ('Amoxicilina 500mg','Antibioticos',8.50,10,'7501234567890','2025-06-15','Laboratorios Bago','Distribuidora Medica SA')
    returning id into v_id;
    insert into lotes (producto_id, producto_nombre, numero, vence, cantidad) values (v_id, 'Amoxicilina 500mg', 'A1024', '2028-12-01', 3);

    insert into productos (nombre, categoria, precio, minimo, codigo_barra, fecha_laboracion, fabricante, proveedor)
    values ('Paracetamol 500mg','Medicamentos',2.50,15,'7502345678901','2025-09-20','Genfar','Farmacorp')
    returning id into v_id;
    insert into lotes (producto_id, producto_nombre, numero, vence, cantidad) values (v_id, 'Paracetamol 500mg', 'B2091', '2029-06-01', 45);

    insert into productos (nombre, categoria, precio, minimo, codigo_barra, fecha_laboracion, fabricante, proveedor)
    values ('Ibuprofeno 400mg','Medicamentos',3.10,15,'7503456789012','2025-03-10','Pfizer','Distribuidora Medica SA')
    returning id into v_id;
    insert into lotes (producto_id, producto_nombre, numero, vence, cantidad) values (v_id, 'Ibuprofeno 400mg', 'C3150', '2028-03-01', 6);

    insert into productos (nombre, categoria, precio, minimo, codigo_barra, fecha_laboracion, fabricante, proveedor)
    values ('Suero Fisiologico 500ml','Insumos',1.80,5,'7504567890123','2025-11-05','Baxter','MediSupply')
    returning id into v_id;
    insert into lotes (producto_id, producto_nombre, numero, vence, cantidad) values (v_id, 'Suero Fisiologico 500ml', 'D4087', '2027-11-01', 15);

  end if;
end $$;


-- =============================================================================
-- 6. CÓMO CREARTE A TI MISMO COMO ADMINISTRADOR (léelo, no se ejecuta solo)
-- =============================================================================
-- Paso 1: Regístrate normalmente desde la página web (index.html) con tu
--         correo real. Tu cuenta quedará con rol = 'sin_permisos'.
-- Paso 2: Vuelve a este SQL Editor y ejecuta (cambia el correo por el tuyo):
--
--   update perfiles set rol = 'administrador'
--   where id = (select id from auth.users where email = 'tu-correo@ejemplo.com');
--
-- Con eso ya puedes entrar como administrador y desde el panel de
-- "Usuarios" asignarle rol a todos los demás (cajero / administrador)
-- sin volver a tocar el SQL Editor nunca más.
-- =============================================================================


-- =============================================================================
-- 7. MIGRACIÓN ÚNICA — marcar al dueño en un proyecto que YA tenía usuarios
-- =============================================================================
-- Esto SOLO hace falta correrlo una vez, en un proyecto que ya existía antes
-- de que se agregara el concepto de "dueño" (es_dueno). En un proyecto
-- totalmente nuevo, el trigger de la sección 2.1 ya marca al primer
-- registrado automáticamente y este bloque no hace nada (no encuentra a
-- nadie a quién corregir).
--
-- Verifica primero que nadie más quedó marcado como dueño por error:
--   select id, nombre, apellido, es_dueno from perfiles where es_dueno = true;
--
-- Y luego marca al dueño real (cambia el correo si no es este):
update perfiles set es_dueno = true
where id = (select id from auth.users where email = 'morrisluis1982@gmail.com');
-- =============================================================================
