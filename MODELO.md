# Orange Market — modelo de datos

Documento de diseño. Describe **qué se guarda, por qué así**, y qué reglas no se
deducen leyendo los nombres de las tablas.

Negocio: compra y venta de producto fresco a varios proveedores, con precio de
compra y precio de venta variables en cada operación.

---

## 1. La idea central

**La compra es el inventario.** No hay una tabla de stock que suba y baje.

Cada línea de una compra ("3 kilos de salmón a $30.000, proveedor X, pedido 12")
es un **lote** con su costo propio. El stock de un producto es la suma de lo que
queda vivo en sus lotes, y cada venta descuenta de lotes concretos.

De ahí salen las tres cosas que pediste, y son la misma cosa mirada desde
ángulos distintos:

```
Desde el producto     Salmón · 8 kg
                      ├─ 2 kg  pedido 1 · proveedor X · $30.000
                      ├─ 2 kg  pedido 3 · proveedor Y · $35.000
                      └─ 4 kg  pedido 4 · proveedor Y · $33.000

Desde el pedido       Pedido 1 · proveedor X · 12-oct
                      └─ Salmón  3 kg a $30.000 → quedan 2, se vendió 1

Desde la venta        Factura 45 · Hotel Mar · 8 kg de salmón a $48.000
                      ├─ 3 kg del pedido 1 (costo $30.000)
                      ├─ 2 kg del pedido 3 (costo $35.000)
                      └─ 3 kg del pedido 4 (costo $33.000)
```

El puente es la tabla `consumos`: una fila por cada "tantos kilos de esta venta
salieron de este lote". Sin esa tabla no hay trazabilidad ni utilidad real.

---

## 2. Tablas

Diez tablas. Toda fila lleva `id` (uuid), `updated_at` y `deleted`.

### Catálogos

**`productos`** — lo que se compra y se vende.
| campo | |
|---|---|
| `nombre` | "Salmón", "Camarón tigre" |
| `unidad` | `kilo` · `libra` · `unidad` |

**`proveedores`**
| campo | |
|---|---|
| `nombre`, `telefono`, `nota` | |

**`clientes`**
| campo | |
|---|---|
| `nombre`, `telefono`, `nota` | |
| `condicion` | `contado` · `credito` |
| `dias_plazo` | solo si es `credito`; define cuándo se pinta la alerta |

### Compra

**`compras`** — el pedido que le hacés a un proveedor.
| campo | |
|---|---|
| `numero` | consecutivo propio y visible ("pedido 12") |
| `proveedor_id`, `fecha`, `nota` | |
| `condicion` | `contado` · `credito` |

**`compra_items`** — **esto es el lote.**
| campo | |
|---|---|
| `compra_id`, `producto_id` | |
| `cantidad` | lo que entró |
| `costo_unit` | precio pagado por kilo/libra/unidad en *esta* compra |

Dos compras al mismo proveedor, del mismo producto, a distinto precio, son dos
lotes distintos. Nunca se promedian.

### Venta

**`ventas`** — el despacho. Se crea y se entrega en el mismo acto.
| campo | |
|---|---|
| `numero` | consecutivo propio, el de la factura de WhatsApp |
| `cliente_id`, `fecha`, `nota` | |

**`venta_items`** — lo que pidió el cliente.
| campo | |
|---|---|
| `venta_id`, `producto_id` | |
| `cantidad` | lo que se lleva |
| `precio_unit` | se digita a mano en cada venta |

**`consumos`** — el puente venta ↔ lote.
| campo | |
|---|---|
| `venta_item_id`, `lote_id` | |
| `cantidad` | cuánto salió de ese lote |
| `costo_unit` | **copiado del lote al momento de vender** |

### Plata

**`movimientos`** — el libro de caja. Todo peso que entra o sale está acá.
| campo | |
|---|---|
| `tipo` | `apertura` · `cobro` · `pago` · `retiro` |
| `medio` | `efectivo` · `transferencia` |
| `monto`, `fecha`, `nota` | |
| `venta_id` | si es `cobro` |
| `compra_id` | si es `pago` |

Un solo libro en vez de tres tablas sueltas: así el dinero disponible es una
suma y no puede descuadrarse entre pantallas.

---

## 3. Reglas que no se ven en los nombres

**Nada se guarda calculado.** `restante`, `stock`, `saldo` y `utilidad` se
derivan siempre. Un número guardado que se recalcula mal en un solo punto
descuadra para siempre; uno derivado no puede mentir.

```
lote.restante      = cantidad − Σ consumos de ese lote
stock(producto)    = Σ restante de sus lotes
item.cubierto      = Σ consumos de esa línea
item.faltante      = cantidad − cubierto
venta.cobrado      = Σ movimientos (cobro, venta_id)
compra.pagado      = Σ movimientos (pago, compra_id)
```

**El costo se congela al vender.** `consumos.costo_unit` es una copia, no una
referencia. Corregir mañana el precio de un pedido viejo no mueve la utilidad de
una venta ya hecha.

**FIFO propuesto, no impuesto.** Al validar la venta el sistema reparte desde el
lote más viejo, muestra el reparto con proveedor, fecha y costo de cada uno, y
deja cambiarlo a mano antes de confirmar.

**Vender sin stock no se bloquea.** Si pedís 8 kg y hay 7, se despachan 7 y el
kilo restante queda como **faltante** en esa línea. La venta vive, y el cliente
queda marcado con alerta en el listado hasta que se complete. Completar es
agregar consumos a la línea cuando entre mercancía.

**El faltante se cobra desde el primer día.** La factura dice 8 kg aunque se
hayan entregado 7, y el cliente debe los 8. La alerta de entrega incompleta y la
deuda son dos cosas distintas y se miran por separado.

**La utilidad solo cuenta lo entregado.** Un faltante no tiene costo todavía,
así que no suma utilidad hasta que se le asigne lote. La asimetría con la regla
anterior es a propósito: se cobra completo, pero solo se reconoce ganancia sobre
el producto que ya salió de un lote, que es el único del que se sabe el costo.

**Cantidades con un decimal.** 3.5 kg, 3.7 kg. El dinero va en pesos enteros.

**Nadie borra.** Anular marca `deleted = true`. Queda el rastro.

---

## 4. Resumen financiero

Cada número y de dónde sale:

| | |
|---|---|
| **Efectivo** | Σ movimientos en efectivo (apertura + cobros − pagos − retiros) |
| **En cuenta** | lo mismo, en transferencia |
| **Cuentas por cobrar** | Σ (venta.total − venta.cobrado), partido en *al día* / *vencido* según el plazo del cliente |
| **Cuentas por pagar** | Σ (compra.total − compra.pagado) |
| **Stock a costo** | Σ (lote.restante × lote.costo_unit) |
| **Capital total** | efectivo + cuenta + por cobrar + stock − por pagar |
| **Utilidad** | Σ consumos de (precio_unit − costo_unit) × cantidad |

La utilidad es **antes de gastos**: no hay flete, hielo ni empaque en el modelo.
El costo de un producto es lo que le pagaste al proveedor por él, nada más.

**Retiros.** Sacar ganancia es un movimiento `retiro` con su medio, su fecha y su
nota. Baja el disponible y el capital total; no toca la utilidad, porque sacar
plata no es perderla.

---

## 5. Fuera de la primera versión

Decidido a propósito, para no cargar la app con lo que hoy no se usa:

- **Merma.** Hoy se asume que lo que entra es lo que sale.
- **Transformación** (comprar entero, vender filete).
- **Devoluciones.**
- **Gastos** distintos al producto.
- **Roles.** Dos usuarios, ambos ven todo.
- **Factura legal DIAN.** La factura es informal, consecutiva, para WhatsApp.

El modelo de lotes soporta merma y devoluciones sin rediseño: ambas son filas
que suman o restan contra un lote. Cuando hagan falta, se agregan.

---

## 6. Decisiones cerradas

- **El faltante se cobra desde el principio** (regla en §3).
- **Los consecutivos de compras y ventas arrancan en 1**, y los asigna el
  servidor, no la app.
- **El saldo inicial de efectivo y cuenta se carga desde la app**, con un botón
  en el resumen financiero. No vive en ningún archivo del repositorio: son
  montos del negocio y no tienen por qué estar en el código.
