-- Orange Market · migración 03 — catálogo inicial de productos
--
-- Los 109 productos que el negocio ya maneja, tomados de su propia lista.
-- Correr en Supabase → SQL Editor, después de 02-factura.sql.
--
-- Es idempotente por NOMBRE: vuelve a correrse sin duplicar nada y sin tocar
-- los productos que se hayan creado a mano. Si un nombre ya existe, lo salta.
--
-- ⚠ No agregar begin;/rollback;

insert into public.productos (nombre, unidad)
select v.nombre, v.unidad
from (values
  ('Filete de salmon Premium', 'kilo'),
  ('Filete de atún maguro', 'kilo'),
  ('Filete de atún nacional', 'kilo'),
  ('Filete de corvina', 'kilo'),
  ('Filete de robalo nacional', 'unidad'),
  ('Filete de merluza', 'kilo'),
  ('Filete de mero', 'kilo'),
  ('Filete de cherna', 'kilo'),
  ('Filete de berrugate', 'kilo'),
  ('Filete de tilapia', 'kilo'),
  ('Filete de pargo', 'kilo'),
  ('Filete de bravo', 'kilo'),
  ('Filete de dorado', 'kilo'),
  ('Filete de merluzilla', 'kilo'),
  ('Filete de chernilla', 'kilo'),
  ('Filete de basa', 'kilo'),
  ('Camaron tigre', 'kilo'),
  ('Camaron jumbo', 'kilo'),
  ('Camaron crudo 41/50', 'kilo'),
  ('Camaron crudo 36/40', 'kilo'),
  ('Camaron de cultivo U15', 'kilo'),
  ('Camaron de cultivo clasificado', 'kilo'),
  ('Camaron de cultivo CL 70-99gr', 'kilo'),
  ('Camaron de cultivo CL 100-139gr', 'kilo'),
  ('Camaron de cultivo CL 140-up', 'kilo'),
  ('Cola de langosta pequeña', 'kilo'),
  ('Cola de langosta mediana', 'kilo'),
  ('Cola de langosta grande', 'kilo'),
  ('Langosta entera grande', 'kilo'),
  ('Langosta entera pequeña', 'kilo'),
  ('Carne de langosta', 'kilo'),
  ('Carne de camaron', 'kilo'),
  ('Atun entero', 'kilo'),
  ('Tilapia libra', 'kilo'),
  ('Tilapia 2xl', 'kilo'),
  ('Tilapia 3xk', 'kilo'),
  ('Trucha mariposa', 'kilo'),
  ('Sierra', 'kilo'),
  ('Sierrilla', 'kilo'),
  ('Pargo platero', 'kilo'),
  ('Pargo 3/4', 'kilo'),
  ('Pargo mediano', 'kilo'),
  ('Lenguado', 'kilo'),
  ('Picuda', 'kilo'),
  ('Pelada', 'kilo'),
  ('Jurel', 'kilo'),
  ('Burique', 'kilo'),
  ('Lebranche', 'kilo'),
  ('Robalo platero', 'kilo'),
  ('Corvina platera', 'kilo'),
  ('Anillos de calamar', 'kilo'),
  ('Tubos de calamar', 'kilo'),
  ('Calamar blanco (pota)', 'kilo'),
  ('Calamar morado (rejo)', 'kilo'),
  ('Gambas', 'kilo'),
  ('Mixtura de mariscos Premium', 'unidad'),
  ('Mixtura de mariscos', 'unidad'),
  ('Pulpo mexicano', 'kilo'),
  ('Pulpo baby', 'kilo'),
  ('Pulpo nacional', 'kilo'),
  ('Mejillones negros', 'unidad'),
  ('Mejillones verdes', 'unidad'),
  ('Palmito kanikama', 'unidad'),
  ('Palmitos', 'unidad'),
  ('Carne de jaiba Premium', 'kilo'),
  ('Muelas de jaiba', 'kilo'),
  ('Muelas de cangrejo', 'kilo'),
  ('Almeja limpia', 'kilo'),
  ('Almeja negra', 'kilo'),
  ('Almeja blanca', 'kilo'),
  ('Scallops', 'kilo'),
  ('Vieiras', 'unidad'),
  ('Bagre rayado', 'kilo'),
  ('Bagre CBZ', 'kilo'),
  ('Bocon pintado', 'kilo'),
  ('Dorado', 'kilo'),
  ('Amarillo', 'kilo'),
  ('Cajaro', 'kilo'),
  ('Bocachico', 'kilo'),
  ('Valenton', 'kilo'),
  ('Pirabuton', 'kilo'),
  ('Baboso', 'kilo'),
  ('Pluma', 'kilo'),
  ('Yaque', 'kilo'),
  ('Caracol', 'kilo'),
  ('Salpicon de toyo', 'kilo'),
  ('Pulpa', 'kilo'),
  ('Cascara de camaron', 'kilo'),
  ('Muela de camaron cultivo', 'kilo'),
  ('Producto congelado', 'unidad'),
  ('Fideo de frijol', 'unidad'),
  ('Carne de camarón (cabeza)', 'kilo'),
  ('Azafran', 'unidad'),
  ('PANKO', 'unidad'),
  ('Piel de wanton', 'unidad'),
  ('Piel de gyosas', 'unidad'),
  ('Trozo de Salmón Premium', 'kilo'),
  ('Lomo de atún', 'kilo'),
  ('Muelas King Crab', 'kilo'),
  ('Filete de Salmon premium porcionado', 'kilo'),
  ('Mejillones negros x 500 gr', 'unidad'),
  ('Cascara de langosta', 'kilo'),
  ('Langostino U10', 'kilo'),
  ('Langostino U12', 'kilo'),
  ('Langostino U15', 'kilo'),
  ('Langostino 16/20', 'kilo'),
  ('Langostino Tigre', 'kilo'),
  ('Langostino cascara bloque', 'kilo'),
  ('Carne de langosta (cabeza)', 'kilo')
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
