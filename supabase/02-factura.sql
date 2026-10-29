-- Orange Market · migración 02 — cantidades exactas y datos de la factura
--
-- Correr en Supabase → SQL Editor, después de schema.sql. Es idempotente.
--
-- ⚠ No agregar begin;/rollback;: el editor corre todo en una transacción y un
--   rollback deshace también los create de arriba.


-- ═══════════════════════════════════════════════ 1. dos decimales
--
-- La balanza pesa 2,44 kg. Con un solo decimal eso se guarda como 2,4 y la
-- línea pasa de $146.400 a $144.000: la venta pierde plata sola, y nadie lo
-- nota hasta que no cuadra la caja.

-- ⚠ Postgres no deja cambiarle el tipo a una columna de la que dependa una
--   vista: "cannot alter type of a column used by a view or rule". Hay que
--   bajar las vistas, cambiar las columnas y volver a crearlas igual.
--   v_stock se apoya en v_lotes, así que se baja primero.

drop view if exists public.v_stock;
drop view if exists public.v_lotes;

alter table public.compra_items alter column cantidad type numeric(10,2);
alter table public.venta_items  alter column cantidad type numeric(10,2);
alter table public.consumos     alter column cantidad type numeric(10,2);

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


-- ═══════════════════════════════════════════════ 2. vendedores

create table if not exists public.vendedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);

alter table public.vendedores enable row level security;

drop policy if exists ver on public.vendedores;
create policy ver on public.vendedores for select to authenticated
  using (public.habilitado());

drop policy if exists crear on public.vendedores;
create policy crear on public.vendedores for insert to authenticated
  with check (public.habilitado());

drop policy if exists editar on public.vendedores;
create policy editar on public.vendedores for update to authenticated
  using (public.habilitado()) with check (public.habilitado());

drop trigger if exists tocar_fila on public.vendedores;
create trigger tocar_fila before insert or update on public.vendedores
  for each row execute function public.tocar();


-- ═══════════════════════════════════════════════ 3. datos de la factura
--
-- El vendedor se guarda como TEXTO copiado al momento de vender, no como
-- referencia: si mañana se renombra o se da de baja a esa persona, la factura
-- que ya se entregó no puede cambiar.
--
-- El medio de pago es el ACORDADO con el cliente, no el cobrado: sale en la
-- factura aunque todavía deba, que es como funciona la de papel.

alter table public.ventas add column if not exists vendedor   text not null default '';
alter table public.ventas add column if not exists medio_pago text not null default 'efectivo';

do $$
begin
  alter table public.ventas add constraint ventas_medio_pago
    check (medio_pago in ('efectivo', 'transferencia'));
exception
  when duplicate_object then null;
end $$;


notify pgrst, 'reload schema';
