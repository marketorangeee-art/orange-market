/* Orange Market · datos y reglas de negocio
 *
 * Todo se escribe primero en localStorage y se marca _dirty. cloud.js sube lo
 * pendiente cuando hay señal. La app funciona completa sin internet.
 *
 * Regla que gobierna el archivo: NADA se guarda calculado. Stock, restante,
 * saldos y utilidad se derivan siempre de las filas base. Un número guardado
 * que en algún punto se recalcula mal descuadra para siempre.
 */
(function () {
  'use strict';

  const TABLAS = ['productos', 'proveedores', 'clientes', 'compras',
                  'compra_items', 'ventas', 'venta_items', 'consumos',
                  'movimientos'];

  const datos = {};

  // ── piso ──────────────────────────────────────────────────────────────

  // Las cantidades van a un decimal (3.5 kg). Sumar flotantes arrastra basura
  // (0.1 + 0.2 = 0.30000000000000004) y un restante de 0.0000001 hace que un
  // lote vacío siga apareciendo como disponible.
  const kg = n => Math.round((Number(n) || 0) * 10) / 10;
  const peso = n => Math.round(Number(n) || 0);

  const clave = t => 'om.' + t;

  function cargar() {
    TABLAS.forEach(t => {
      try {
        datos[t] = JSON.parse(localStorage.getItem(clave(t))) || [];
      } catch (e) {
        datos[t] = [];
      }
    });
  }

  function persistir(tabla) {
    localStorage.setItem(clave(tabla), JSON.stringify(datos[tabla]));
  }

  function nuevoId() {
    if (self.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function guardar(tabla, fila) {
    fila.updated_at = new Date().toISOString();
    fila._dirty = true;
    if (fila.deleted === undefined) fila.deleted = false;

    const filas = datos[tabla];
    if (!fila.id) {
      fila.id = nuevoId();
      filas.push(fila);
    } else {
      const i = filas.findIndex(f => f.id === fila.id);
      if (i >= 0) filas[i] = fila; else filas.push(fila);
    }
    persistir(tabla);
    return fila;
  }

  // Nadie borra: anular deja el rastro. Es lo que permite auditar una venta
  // anulada o entender por qué un lote quedó con stock de vuelta.
  function anular(tabla, id) {
    const fila = datos[tabla].find(f => f.id === id);
    if (!fila) return null;
    fila.deleted = true;
    return guardar(tabla, fila);
  }

  // Número provisional, para que el pedido tenga nombre desde el momento en que
  // se crea y no quede como "s/n" hasta que haya señal. Cuenta también las
  // filas anuladas, así un número no se reusa. Si dos equipos sin señal
  // inventan el mismo, el servidor desempata y la app lo corrige al bajar.
  const siguienteNumero = tabla =>
    datos[tabla].reduce((max, f) => Math.max(max, f.numero || 0), 0) + 1;

  const todos = tabla => datos[tabla].filter(f => !f.deleted);
  const uno = (tabla, id) => datos[tabla].find(f => f.id === id && !f.deleted);
  const donde = (tabla, campo, valor) => todos(tabla).filter(f => f[campo] === valor);

  // ── lotes ─────────────────────────────────────────────────────────────
  //
  // Un lote ES una línea de compra. No hay tabla de stock: lo que queda vivo
  // es lo que entró menos lo que ya salió por consumos.

  function lotes() {
    const salido = {};
    todos('consumos').forEach(c => {
      salido[c.lote_id] = (salido[c.lote_id] || 0) + kg(c.cantidad);
    });

    const compras = {};
    todos('compras').forEach(c => { compras[c.id] = c; });

    return todos('compra_items')
      .filter(li => compras[li.compra_id])
      .map(li => {
        const compra = compras[li.compra_id];
        const vendido = kg(salido[li.id] || 0);
        return {
          id:           li.id,
          compra_id:    li.compra_id,
          pedido:       compra.numero,
          fecha:        compra.fecha,
          proveedor_id: compra.proveedor_id,
          producto_id:  li.producto_id,
          cantidad:     kg(li.cantidad),
          vendido:      vendido,
          restante:     kg(kg(li.cantidad) - vendido),
          costo_unit:   peso(li.costo_unit)
        };
      });
  }

  // Del más viejo al más nuevo. Con fechas iguales manda el consecutivo, que
  // nunca empata.
  const porAntiguedad = (a, b) =>
    a.fecha === b.fecha ? (a.pedido || 0) - (b.pedido || 0)
                        : String(a.fecha).localeCompare(String(b.fecha));

  function lotesDe(producto_id, soloConSaldo) {
    return lotes()
      .filter(l => l.producto_id === producto_id && (!soloConSaldo || l.restante > 0))
      .sort(porAntiguedad);
  }

  const stock = producto_id =>
    kg(lotesDe(producto_id, true).reduce((s, l) => s + l.restante, 0));

  // Reparte una cantidad entre los lotes disponibles, del más viejo primero.
  // Devuelve la propuesta y cuánto quedó sin cubrir: vender sin stock no se
  // bloquea, el faltante queda pendiente de entrega.
  function repartir(producto_id, cantidad, yaTomado) {
    const tomado = yaTomado || {};
    let falta = kg(cantidad);
    const reparto = [];

    for (const lote of lotesDe(producto_id, true)) {
      if (falta <= 0) break;
      const libre = kg(lote.restante - (tomado[lote.id] || 0));
      if (libre <= 0) continue;

      const toma = kg(Math.min(libre, falta));
      reparto.push({
        lote_id:    lote.id,
        pedido:     lote.pedido,
        fecha:      lote.fecha,
        proveedor_id: lote.proveedor_id,
        cantidad:   toma,
        costo_unit: lote.costo_unit,
        disponible: libre
      });
      falta = kg(falta - toma);
    }

    return { reparto: reparto, faltante: kg(Math.max(0, falta)) };
  }

  // ── venta ─────────────────────────────────────────────────────────────

  function cubierto(venta_item_id) {
    return kg(donde('consumos', 'venta_item_id', venta_item_id)
      .reduce((s, c) => s + kg(c.cantidad), 0));
  }

  // La factura cobra lo PEDIDO, no lo entregado: si pidió 8 kg y se le
  // despacharon 7, debe los 8 desde el primer día. El kilo faltante queda
  // pendiente de entrega, pero ya está cobrado.
  function totalVenta(venta_id) {
    return peso(donde('venta_items', 'venta_id', venta_id)
      .reduce((s, it) => s + kg(it.cantidad) * peso(it.precio_unit), 0));
  }

  const cobrado = venta_id =>
    peso(donde('movimientos', 'venta_id', venta_id)
      .filter(m => m.tipo === 'cobro')
      .reduce((s, m) => s + peso(m.monto), 0));

  const saldoVenta = venta_id => peso(totalVenta(venta_id) - cobrado(venta_id));

  const faltanteVenta = venta_id =>
    kg(donde('venta_items', 'venta_id', venta_id)
      .reduce((s, it) => s + Math.max(0, kg(it.cantidad) - cubierto(it.id)), 0));

  const diasDesde = fecha =>
    Math.floor((Date.now() - new Date(fecha + 'T00:00:00').getTime()) / 86400000);

  // Una venta está vencida si el cliente es de crédito y se pasó del plazo que
  // se le fijó al crearlo. Al cliente de contado se le cuenta desde el día uno.
  function vencida(venta) {
    if (saldoVenta(venta.id) <= 0) return false;
    const cliente = uno('clientes', venta.cliente_id);
    const plazo = cliente && cliente.condicion === 'credito' ? (cliente.dias_plazo || 0) : 0;
    return diasDesde(venta.fecha) > plazo;
  }

  // ── compra ────────────────────────────────────────────────────────────

  const totalCompra = compra_id =>
    peso(donde('compra_items', 'compra_id', compra_id)
      .reduce((s, li) => s + kg(li.cantidad) * peso(li.costo_unit), 0));

  const pagado = compra_id =>
    peso(donde('movimientos', 'compra_id', compra_id)
      .filter(m => m.tipo === 'pago')
      .reduce((s, m) => s + peso(m.monto), 0));

  const saldoCompra = compra_id => peso(totalCompra(compra_id) - pagado(compra_id));

  // ── plata ─────────────────────────────────────────────────────────────

  // Un solo libro: apertura y cobros suman, pagos y retiros restan.
  function disponible() {
    const caja = { efectivo: 0, transferencia: 0 };
    todos('movimientos').forEach(m => {
      const signo = (m.tipo === 'apertura' || m.tipo === 'cobro') ? 1 : -1;
      if (caja[m.medio] === undefined) return;
      caja[m.medio] += signo * peso(m.monto);
    });
    caja.efectivo = peso(caja.efectivo);
    caja.transferencia = peso(caja.transferencia);
    caja.total = caja.efectivo + caja.transferencia;
    return caja;
  }

  function porCobrar() {
    const r = { alDia: 0, vencido: 0, total: 0, detalle: [] };
    todos('ventas').forEach(v => {
      const saldo = saldoVenta(v.id);
      if (saldo <= 0) return;
      const esVencida = vencida(v);
      r[esVencida ? 'vencido' : 'alDia'] += saldo;
      r.total += saldo;
      r.detalle.push({
        venta_id: v.id,
        numero:   v.numero,
        cliente_id: v.cliente_id,
        fecha:    v.fecha,
        dias:     diasDesde(v.fecha),
        saldo:    saldo,
        vencido:  esVencida
      });
    });
    r.detalle.sort((a, b) => b.dias - a.dias);
    return r;
  }

  function porPagar() {
    const r = { total: 0, detalle: [] };
    todos('compras').forEach(c => {
      const saldo = saldoCompra(c.id);
      if (saldo <= 0) return;
      r.total += saldo;
      r.detalle.push({
        compra_id: c.id,
        numero: c.numero,
        proveedor_id: c.proveedor_id,
        fecha: c.fecha,
        dias: diasDesde(c.fecha),
        saldo: saldo
      });
    });
    r.detalle.sort((a, b) => b.dias - a.dias);
    return r;
  }

  const valorStock = () =>
    peso(lotes().reduce((s, l) => s + Math.max(0, l.restante) * l.costo_unit, 0));

  // Solo cuenta lo que tiene lote asignado. Un faltante todavía no tiene costo,
  // así que no se puede saber qué se ganó con él.
  function utilidad(desde, hasta) {
    const items = {};
    todos('venta_items').forEach(it => { items[it.id] = it; });
    const ventas = {};
    todos('ventas').forEach(v => { ventas[v.id] = v; });

    let total = 0;
    todos('consumos').forEach(c => {
      const item = items[c.venta_item_id];
      if (!item) return;
      const venta = ventas[item.venta_id];
      if (!venta) return;
      if (desde && venta.fecha < desde) return;
      if (hasta && venta.fecha > hasta) return;
      total += kg(c.cantidad) * (peso(item.precio_unit) - peso(c.costo_unit));
    });
    return peso(total);
  }

  function resumen(desde, hasta) {
    const caja = disponible();
    const cobrar = porCobrar();
    const pagar = porPagar();
    const stockValor = valorStock();
    return {
      efectivo:      caja.efectivo,
      transferencia: caja.transferencia,
      porCobrar:     cobrar,
      porPagar:      pagar,
      valorStock:    stockValor,
      capital:       peso(caja.total + cobrar.total + stockValor - pagar.total),
      utilidad:      utilidad(desde, hasta)
    };
  }

  // ── sincronización ────────────────────────────────────────────────────

  const sucias = tabla => datos[tabla].filter(f => f._dirty);

  function limpiar(tabla, ids) {
    const set = new Set(ids);
    datos[tabla].forEach(f => { if (set.has(f.id)) delete f._dirty; });
    persistir(tabla);
  }

  // Gana el servidor, salvo que la fila local tenga cambios sin subir: esa se
  // conserva para que no se pierda una venta hecha sin señal.
  function recibir(tabla, filas) {
    const porId = {};
    datos[tabla].forEach(f => { porId[f.id] = f; });

    filas.forEach(fila => {
      const local = porId[fila.id];
      if (local && local._dirty) return;
      if (local) Object.assign(local, fila);
      else { datos[tabla].push(fila); porId[fila.id] = fila; }
    });
    persistir(tabla);
  }

  cargar();

  const api = {
    TABLAS, kg, peso,
    guardar, anular, todos, uno, donde, recargar: cargar, siguienteNumero,
    lotes, lotesDe, stock, repartir,
    cubierto, totalVenta, cobrado, saldoVenta, faltanteVenta, vencida, diasDesde,
    totalCompra, pagado, saldoCompra,
    disponible, porCobrar, porPagar, valorStock, utilidad, resumen,
    sucias, limpiar, recibir
  };

  if (typeof window !== 'undefined') {
    window.OM = window.OM || {};
    window.OM.store = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
