-- Orange Market · borrar los datos de prueba
--
-- ⚠ ESTO NO ES UNA MIGRACIÓN. No se corre al instalar ni se vuelve a correr
--   después. Es una herramienta de una sola vez, para dejar la base limpia
--   antes de empezar a trabajar en serio.
--
-- ⚠ BORRA DE VERDAD. No marca deleted = true como hace la app: borra las
--   filas. Es a propósito — una fila marcada igual se sincroniza a los
--   celulares y sigue ocupando lugar. Para datos de prueba no hay nada que
--   auditar.
--
-- ⚠ NO SE PUEDE DESHACER. Leé qué borra antes de correrlo.
--
-- Después de correrlo, en CADA equipo donde se haya usado la app:
--   tocar el punto de conexión → Borrar datos locales.
-- Si no, ese equipo sigue mostrando lo viejo: la sincronización baja cambios,
-- pero no se entera de filas que desaparecieron.


-- ═══════════════════════════════════════════ qué hay antes de borrar

select 'ventas' as tabla, count(*) from public.ventas
union all select 'venta_items',  count(*) from public.venta_items
union all select 'consumos',     count(*) from public.consumos
union all select 'compras',      count(*) from public.compras
union all select 'compra_items', count(*) from public.compra_items
union all select 'proveedores',  count(*) from public.proveedores
union all select 'movimientos',  count(*) from public.movimientos
union all select 'clientes',     count(*) from public.clientes
union all select 'productos',    count(*) from public.productos;


-- ═══════════════════════════════════════════ borrar ventas y compras
--
-- El orden importa: primero lo que apunta a otras tablas. consumos va de
-- primero porque apunta a los renglones de venta Y a los lotes de compra.

delete from public.consumos;

delete from public.movimientos
 where venta_id is not null or compra_id is not null;

delete from public.venta_items;
delete from public.ventas;

delete from public.compra_items;
delete from public.compras;
delete from public.proveedores;


-- ═══════════════════════════════════════════ lo que NO se borra
--
-- Quedan intactos: los 109 productos del catálogo, los clientes, los
-- vendedores, los usuarios y los movimientos de capital (aperturas y retiros).
--
-- Si también querés borrar alguno, quitale los dos guiones del renglón:

-- delete from public.clientes;
-- delete from public.vendedores;
-- delete from public.movimientos;   -- incluye el saldo inicial


-- ═══════════════════════════════════════════ cómo quedó

select 'ventas' as tabla, count(*) from public.ventas
union all select 'compras',     count(*) from public.compras
union all select 'proveedores', count(*) from public.proveedores
union all select 'movimientos', count(*) from public.movimientos
union all select 'clientes',    count(*) from public.clientes
union all select 'productos',   count(*) from public.productos;
