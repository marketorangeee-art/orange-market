-- Orange Market · migración 03 — la unidad "kilo neto" y el catálogo
--
-- Correr en Supabase → SQL Editor, después de 02-factura.sql. Es idempotente.
--
-- ⚠ No agregar begin;/rollback;


-- ═══════════════════════════════════════════════ 1. la unidad kilo_neto
--
-- El negocio pesa casi todo "kilogramo neto": el mismo kilogramo, pero sin
-- hielo ni glaseo. No cambia ninguna cuenta — cambia lo que dice la factura,
-- que es lo que evita un reclamo.
--
-- Se borra cualquier check viejo sobre unidad antes de poner el nuevo, para
-- que esto se pueda volver a correr sin chocar con el que ya está.

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.productos'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%unidad%'
  loop
    execute format('alter table public.productos drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.productos add constraint productos_unidad
  check (unidad in ('kilo', 'kilo_neto', 'libra', 'unidad'));


-- ═══════════════════════════════════════════════ 2. catálogo inicial
--
--
-- Los 109 productos del negocio, con la unidad que trae cada uno en su propia
-- lista. Idempotente por NOMBRE: vuelve a correrse sin duplicar nada y sin
-- tocar los productos creados a mano.

insert into public.productos (nombre, unidad)
select v.nombre, v.unidad
from (values
  ('Filete de salmon Premium', 'kilo_neto'),
  ('Filete de atún maguro', 'kilo_neto'),
  ('Filete de atún nacional', 'kilo_neto'),
  ('Filete de corvina', 'kilo_neto'),
  ('Filete de robalo nacional', 'unidad'),
  ('Filete de merluza', 'kilo_neto'),
  ('Filete de mero', 'kilo_neto'),
  ('Filete de cherna', 'kilo_neto'),
  ('Filete de berrugate', 'kilo_neto'),
  ('Filete de tilapia', 'kilo_neto'),
  ('Filete de pargo', 'kilo_neto'),
  ('Filete de bravo', 'kilo_neto'),
  ('Filete de dorado', 'kilo_neto'),
  ('Filete de merluzilla', 'kilo_neto'),
  ('Filete de chernilla', 'kilo_neto'),
  ('Filete de basa', 'kilo_neto'),
  ('Camaron tigre', 'kilo_neto'),
  ('Camaron jumbo', 'kilo_neto'),
  ('Camaron crudo 41/50', 'kilo_neto'),
  ('Camaron crudo 36/40', 'kilo_neto'),
  ('Camaron de cultivo U15', 'kilo_neto'),
  ('Camaron de cultivo clasificado', 'kilo_neto'),
  ('Camaron de cultivo CL 70-99gr', 'kilo_neto'),
  ('Camaron de cultivo CL 100-139gr', 'kilo_neto'),
  ('Camaron de cultivo CL 140-up', 'kilo_neto'),
  ('Cola de langosta pequeña', 'kilo_neto'),
  ('Cola de langosta mediana', 'kilo_neto'),
  ('Cola de langosta grande', 'kilo_neto'),
  ('Langosta entera grande', 'kilo_neto'),
  ('Langosta entera pequeña', 'kilo_neto'),
  ('Carne de langosta', 'kilo_neto'),
  ('Carne de camaron', 'kilo_neto'),
  ('Atun entero', 'kilo_neto'),
  ('Tilapia libra', 'kilo_neto'),
  ('Tilapia 2xl', 'kilo_neto'),
  ('Tilapia 3xk', 'kilo_neto'),
  ('Trucha mariposa', 'kilo_neto'),
  ('Sierra', 'kilo_neto'),
  ('Sierrilla', 'kilo_neto'),
  ('Pargo platero', 'kilo_neto'),
  ('Pargo 3/4', 'kilo_neto'),
  ('Pargo mediano', 'kilo_neto'),
  ('Lenguado', 'kilo_neto'),
  ('Picuda', 'kilo_neto'),
  ('Pelada', 'kilo_neto'),
  ('Jurel', 'kilo_neto'),
  ('Burique', 'kilo_neto'),
  ('Lebranche', 'kilo_neto'),
  ('Robalo platero', 'kilo_neto'),
  ('Corvina platera', 'kilo_neto'),
  ('Anillos de calamar', 'kilo_neto'),
  ('Tubos de calamar', 'kilo_neto'),
  ('Calamar blanco (pota)', 'kilo_neto'),
  ('Calamar morado (rejo)', 'kilo_neto'),
  ('Gambas', 'kilo_neto'),
  ('Mixtura de mariscos Premium', 'unidad'),
  ('Mixtura de mariscos', 'unidad'),
  ('Pulpo mexicano', 'kilo_neto'),
  ('Pulpo baby', 'kilo_neto'),
  ('Pulpo nacional', 'kilo_neto'),
  ('Mejillones negros', 'unidad'),
  ('Mejillones verdes', 'unidad'),
  ('Palmito kanikama', 'unidad'),
  ('Palmitos', 'unidad'),
  ('Carne de jaiba Premium', 'kilo_neto'),
  ('Muelas de jaiba', 'kilo_neto'),
  ('Muelas de cangrejo', 'kilo_neto'),
  ('Almeja limpia', 'kilo_neto'),
  ('Almeja negra', 'kilo_neto'),
  ('Almeja blanca', 'kilo_neto'),
  ('Scallops', 'kilo_neto'),
  ('Vieiras', 'unidad'),
  ('Bagre rayado', 'kilo_neto'),
  ('Bagre CBZ', 'kilo_neto'),
  ('Bocon pintado', 'kilo_neto'),
  ('Dorado', 'kilo_neto'),
  ('Amarillo', 'kilo_neto'),
  ('Cajaro', 'kilo_neto'),
  ('Bocachico', 'kilo_neto'),
  ('Valenton', 'kilo_neto'),
  ('Pirabuton', 'kilo_neto'),
  ('Baboso', 'kilo_neto'),
  ('Pluma', 'kilo_neto'),
  ('Yaque', 'kilo_neto'),
  ('Caracol', 'kilo_neto'),
  ('Salpicon de toyo', 'kilo_neto'),
  ('Pulpa', 'kilo_neto'),
  ('Cascara de camaron', 'kilo_neto'),
  ('Muela de camaron cultivo', 'kilo'),
  ('Producto congelado', 'unidad'),
  ('Fideo de frijol', 'unidad'),
  ('Carne de camarón (cabeza)', 'kilo_neto'),
  ('Azafran', 'unidad'),
  ('PANKO', 'unidad'),
  ('Piel de wanton', 'unidad'),
  ('Piel de gyosas', 'unidad'),
  ('Trozo de Salmón Premium', 'kilo_neto'),
  ('Lomo de atún', 'kilo_neto'),
  ('Muelas King Crab', 'kilo_neto'),
  ('Filete de Salmon premium porcionado', 'kilo_neto'),
  ('Mejillones negros x 500 gr', 'unidad'),
  ('Cascara de langosta', 'kilo_neto'),
  ('Langostino U10', 'kilo_neto'),
  ('Langostino U12', 'kilo_neto'),
  ('Langostino U15', 'kilo_neto'),
  ('Langostino 16/20', 'kilo_neto'),
  ('Langostino Tigre', 'kilo_neto'),
  ('Langostino cascara bloque', 'kilo_neto'),
  ('Carne de langosta (cabeza)', 'kilo_neto')
) as v(nombre, unidad)
where not exists (
  select 1 from public.productos p
  where lower(p.nombre) = lower(v.nombre) and not p.deleted
);

-- Cuántos quedaron, para verificar de un vistazo.
select unidad, count(*) as productos
from public.productos
where not deleted
group by unidad
order by unidad;
