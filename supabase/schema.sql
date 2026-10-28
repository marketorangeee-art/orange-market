-- Orange Market · esquema base
--
-- Correr completo en Supabase → SQL Editor. Es idempotente: se puede volver a
-- correr sin romper nada.
--
-- ⚠ No agregar begin;/rollback; a este archivo. El editor de Supabase ya corre
--   todo el script en una sola transacción, y un rollback al final deshace
--   también los create function de arriba.
--
-- ⚠ Antes de usarlo: en Authentication → Providers, APAGAR el registro público.
--   Los perfiles nacen activos, así que cualquiera que se registre entraría.

create extension if not exists pgcrypto;


-- ═══════════════════════════════════════════════════════════ 1. acceso

create table if not exists public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text        not null default '',
  activo     boolean     not null default true,
  updated_at timestamptz not null default now()
);

-- Toda política se cruza con esto. Desactivar a alguien le corta el acceso
-- aunque tenga la sesión abierta en el celular.
create or replace function public.habilitado()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and activo
  );
$$;

create or replace function public.crear_perfil()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre',
                           split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();


-- ═══════════════════════════════════════════════════════════ 2. catálogos

create table if not exists public.productos (
  id         uuid primary key default gen_random_uuid(),
  nombre     text    not null,
  unidad     text    not null check (unidad in ('kilo', 'libra', 'unidad')),
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);

create table if not exists public.proveedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text    not null,
  telefono   text    not null default '',
  nota       text    not null default '',
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);

create table if not exists public.clientes (
  id         uuid primary key default gen_random_uuid(),
  nombre     text    not null,
  telefono   text    not null default '',
  nota       text    not null default '',
  -- de esto depende cuándo se pinta la alerta de deuda vencida
  condicion  text    not null default 'contado'
             check (condicion in ('contado', 'credito')),
  dias_plazo integer not null default 0 check (dias_plazo >= 0),
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);


-- ═══════════════════════════════════════════════════════════ 3. compra

create table if not exists public.compras (
  id           uuid primary key default gen_random_uuid(),
  numero       integer unique,                      -- lo asigna un trigger
  proveedor_id uuid    not null references public.proveedores(id),
  fecha        date    not null default current_date,
  condicion    text    not null default 'contado'
               check (condicion in ('contado', 'credito')),
  nota         text    not null default '',
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false
);

-- Cada fila de acá es un LOTE: cantidad propia y costo propio.
-- Dos compras del mismo producto al mismo proveedor a distinto precio son dos
-- lotes distintos y nunca se promedian.
create table if not exists public.compra_items (
  id          uuid primary key default gen_random_uuid(),
  compra_id   uuid not null references public.compras(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  cantidad    numeric(10,1) not null check (cantidad > 0),
  costo_unit  numeric(14,2) not null check (costo_unit >= 0),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);


-- ═══════════════════════════════════════════════════════════ 4. venta

create table if not exists public.ventas (
  id         uuid primary key default gen_random_uuid(),
  numero     integer unique,
  cliente_id uuid not null references public.clientes(id),
  fecha      date not null default current_date,
  nota       text not null default '',
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);

create table if not exists public.venta_items (
  id          uuid primary key default gen_random_uuid(),
  venta_id    uuid not null references public.ventas(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  cantidad    numeric(10,1) not null check (cantidad > 0),
  precio_unit numeric(14,2) not null check (precio_unit >= 0),
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

-- El puente venta ↔ lote. Sin esta tabla no hay trazabilidad ni utilidad real.
-- costo_unit es una COPIA del lote, no una referencia: corregir mañana el
-- precio de un pedido viejo no mueve la utilidad de una venta ya hecha.
create table if not exists public.consumos (
  id            uuid primary key default gen_random_uuid(),
  venta_item_id uuid not null references public.venta_items(id) on delete cascade,
  lote_id       uuid not null references public.compra_items(id),
  cantidad      numeric(10,1) not null check (cantidad > 0),
  costo_unit    numeric(14,2) not null check (costo_unit >= 0),
  updated_at    timestamptz not null default now(),
  deleted       boolean not null default false
);


-- ═══════════════════════════════════════════════════════════ 5. plata

-- Un solo libro de caja. Todo peso que entra o sale está acá, y por eso el
-- dinero disponible es una suma y no puede descuadrarse entre pantallas.
create table if not exists public.movimientos (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('apertura', 'cobro', 'pago', 'retiro')),
  medio      text not null check (medio in ('efectivo', 'transferencia')),
  monto      numeric(14,2) not null check (monto > 0),
  fecha      date not null default current_date,
  venta_id   uuid references public.ventas(id),   -- si es cobro
  compra_id  uuid references public.compras(id),  -- si es pago
  nota       text not null default '',
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false,

  constraint movimiento_coherente check (
    (tipo = 'cobro'    and venta_id is not null and compra_id is null) or
    (tipo = 'pago'     and compra_id is not null and venta_id is null) or
    (tipo in ('apertura', 'retiro') and venta_id is null and compra_id is null)
  )
);


-- ═══════════════════════════════════════════════════════════ 6. índices

create index if not exists ix_compra_items_compra   on public.compra_items(compra_id);
create index if not exists ix_compra_items_producto on public.compra_items(producto_id);
create index if not exists ix_venta_items_venta     on public.venta_items(venta_id);
create index if not exists ix_venta_items_producto  on public.venta_items(producto_id);
create index if not exists ix_consumos_item         on public.consumos(venta_item_id);
create index if not exists ix_consumos_lote         on public.consumos(lote_id);
create index if not exists ix_movimientos_venta     on public.movimientos(venta_id);
create index if not exists ix_movimientos_compra    on public.movimientos(compra_id);
create index if not exists ix_ventas_cliente        on public.ventas(cliente_id);
create index if not exists ix_compras_proveedor     on public.compras(proveedor_id);


-- ═══════════════════════════════════════════════════════════ 7. triggers

-- updated_at lo pone el SERVIDOR, no el cliente. Un celular con la hora mal
-- puesta escribiría una marca de agua falsa y la sincronización se saltaría
-- filas para siempre.
create or replace function public.tocar()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- El consecutivo se asigna acá, no en la app. Dos celulares sin señal pueden
-- inventar el mismo número; el servidor desempata y la app lo corrige al bajar.
create or replace function public.asignar_numero()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  chocado boolean;
begin
  if new.numero is not null then
    execute format(
      'select exists(select 1 from public.%I where numero = $1 and id <> $2)',
      tg_table_name)
      into chocado using new.numero, new.id;
    if not chocado then
      return new;
    end if;
  end if;

  execute format('select coalesce(max(numero), 0) + 1 from public.%I', tg_table_name)
    into new.numero;
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['perfiles', 'productos', 'proveedores', 'clientes',
                           'compras', 'compra_items', 'ventas', 'venta_items',
                           'consumos', 'movimientos']
  loop
    execute format('drop trigger if exists tocar_fila on public.%I', t);
    execute format('create trigger tocar_fila before insert or update on public.%I
                    for each row execute function public.tocar()', t);
  end loop;

  foreach t in array array['compras', 'ventas']
  loop
    execute format('drop trigger if exists numerar on public.%I', t);
    execute format('create trigger numerar before insert on public.%I
                    for each row execute function public.asignar_numero()', t);
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════ 8. permisos
--
-- Los dos usuarios ven y hacen todo. La única restricción real es estar
-- habilitado. No hay política de DELETE en ninguna tabla: anular marca
-- deleted = true y queda el rastro.

do $$
declare
  t text;
begin
  foreach t in array array['productos', 'proveedores', 'clientes',
                           'compras', 'compra_items', 'ventas', 'venta_items',
                           'consumos', 'movimientos']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists ver on public.%I', t);
    execute format('create policy ver on public.%I for select to authenticated
                    using (public.habilitado())', t);

    execute format('drop policy if exists crear on public.%I', t);
    execute format('create policy crear on public.%I for insert to authenticated
                    with check (public.habilitado())', t);

    execute format('drop policy if exists editar on public.%I', t);
    execute format('create policy editar on public.%I for update to authenticated
                    using (public.habilitado()) with check (public.habilitado())', t);
  end loop;
end $$;

-- El perfil propio se lee siempre, incluso desactivado: si no, la app no
-- podría decirle al usuario por qué lo sacaron.
alter table public.perfiles enable row level security;

drop policy if exists ver on public.perfiles;
create policy ver on public.perfiles for select to authenticated
  using (id = auth.uid() or public.habilitado());

drop policy if exists editar on public.perfiles;
create policy editar on public.perfiles for update to authenticated
  using (public.habilitado()) with check (public.habilitado());


-- ═══════════════════════════════════════════════════════════ 9. vistas
--
-- La app calcula todo esto en memoria; estas vistas existen para poder
-- contrastar desde el SQL Editor cuando un número no cuadre.

create or replace view public.v_lotes as
select
  ci.id                         as lote_id,
  c.numero                      as pedido,
  c.fecha,
  pr.nombre                     as proveedor,
  p.nombre                      as producto,
  p.unidad,
  ci.cantidad,
  coalesce(sum(co.cantidad), 0) as vendido,
  ci.cantidad - coalesce(sum(co.cantidad), 0) as restante,
  ci.costo_unit
from public.compra_items ci
  join public.compras      c  on c.id  = ci.compra_id
  join public.proveedores  pr on pr.id = c.proveedor_id
  join public.productos    p  on p.id  = ci.producto_id
  left join public.consumos co on co.lote_id = ci.id and not co.deleted
where not ci.deleted and not c.deleted
group by ci.id, c.numero, c.fecha, pr.nombre, p.nombre, p.unidad,
         ci.cantidad, ci.costo_unit;

create or replace view public.v_stock as
select
  producto,
  unidad,
  sum(restante)              as stock,
  sum(restante * costo_unit) as valor
from public.v_lotes
where restante > 0
group by producto, unidad;


-- ═══════════════════════════════════════════════════════════ 10. rezagados
--
-- Si alguien creó usuarios ANTES de correr este archivo, el trigger todavía no
-- existía y esas cuentas quedaron sin fila en perfiles. Sin ella habilitado()
-- las deja afuera y no pueden entrar, sin ningún mensaje que lo explique.

insert into public.perfiles (id, nombre)
select id, coalesce(raw_user_meta_data ->> 'nombre', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;


-- PostgREST no ve las funciones nuevas hasta que se le avisa.
notify pgrst, 'reload schema';
