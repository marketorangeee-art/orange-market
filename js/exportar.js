/* Orange Market · el informe del período, para abrir en Excel
 *
 * Sale como CSV y no como .xlsx a propósito: un .xlsx de verdad obliga a
 * cargar una librería de casi un mega para escribir un ZIP con XML adentro.
 * El CSV lo abre Excel de doble clic y pesa unos kilobytes.
 *
 * Tres detalles que hacen que Excel en español lo lea bien sin pedir nada:
 *   · separador punto y coma, que es el que espera la configuración regional
 *   · BOM al principio, o los acentos salen como símbolos raros
 *   · decimales con coma, para que las cantidades entren como número y no
 *     como texto
 *
 * Los montos van sin separador de miles: así Excel los reconoce como números
 * en cualquier configuración y se pueden sumar.
 */
(function () {
  'use strict';

  const store = OM.store;

  const UNIDAD = { kilo: 'KG', kilo_neto: 'KG NETO', libra: 'LB', unidad: 'UND' };
  const MEDIO = { efectivo: 'Efectivo', transferencia: 'Transferencia' };

  const nombre = (tabla, id, siNo) =>
    (store.uno(tabla, id) || { nombre: siNo || '—' }).nombre;

  const fecha = f => {
    if (!f) return '';
    const p = String(f).slice(0, 10).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  };

  // Un punto y coma o una comilla dentro de un nombre parten la columna si no
  // se entrecomillan.
  function celda(valor) {
    if (valor == null) return '';
    const s = String(valor);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  const fila = (...campos) => campos.map(celda).join(';');
  const cantidad = n => String(store.kg(n)).replace('.', ',');
  const monto = n => String(store.peso(n));

  /* ── el informe ───────────────────────────────────────────────────── */

  function armar(desde, hasta) {
    const p = store.periodo(desde, hasta);
    const l = [];

    l.push(fila('INFORME DE ORANGE MARKET'));
    l.push(fila('Desde', fecha(desde) || 'el principio',
                'Hasta', fecha(hasta) || 'hoy'));
    l.push(fila('Generado', fecha(OM.ui.hoy())));
    l.push('');

    l.push(fila('RESUMEN DEL PERÍODO'));
    l.push(fila('Facturado',                monto(p.facturado)));
    l.push(fila('Costo de lo vendido',      monto(p.costo)));
    l.push(fila('Utilidad antes de gastos', monto(p.utilidad)));
    l.push(fila('Comprado a proveedores',   monto(p.comprado)));
    l.push(fila('Cobrado a clientes',       monto(p.cobrado)));
    l.push(fila('Pagado a proveedores',     monto(p.pagado)));
    l.push(fila('Retirado',                 monto(p.retirado)));
    l.push(fila('Capital ingresado',        monto(p.aportado)));
    l.push('');

    // ── ventas, una línea por pedido ──
    l.push(fila('VENTAS'));
    l.push(fila('Fecha', 'Pedido', 'Cliente', 'Vendedor', 'Método de pago',
                'Total', 'Cobrado', 'Saldo', 'Utilidad'));

    p.ventas.forEach(v => {
      const total = store.totalVenta(v.id);
      const cobrado = store.cobrado(v.id);
      const util = store.donde('venta_items', 'venta_id', v.id)
        .reduce((s, it) => s + store.donde('consumos', 'venta_item_id', it.id)
          .reduce((t, c) => t + store.kg(c.cantidad) *
            (store.peso(it.precio_unit) - store.peso(c.costo_unit)), 0), 0);

      l.push(fila(fecha(v.fecha), v.numero || '', nombre('clientes', v.cliente_id),
                  v.vendedor || '', MEDIO[v.medio_pago] || v.medio_pago || '',
                  monto(total), monto(cobrado), monto(total - cobrado), monto(util)));
    });
    l.push(fila('TOTAL', '', '', '', '',
                monto(p.facturado), monto(p.cobrado),
                monto(p.facturado - p.cobrado), monto(p.utilidad)));
    l.push('');

    // ── el renglón por renglón, que es con lo que se analiza ──
    l.push(fila('DETALLE DE LO VENDIDO'));
    l.push(fila('Fecha', 'Pedido', 'Cliente', 'Producto', 'Unidad', 'Cantidad',
                'Precio unitario', 'Total', 'Costo unitario', 'Utilidad'));

    p.ventas.forEach(v => {
      store.donde('venta_items', 'venta_id', v.id).forEach(it => {
        const prod = store.uno('productos', it.producto_id) || { nombre: '—', unidad: '' };
        const consumos = store.donde('consumos', 'venta_item_id', it.id);
        // Una línea puede salir de varios lotes con costos distintos: se abre
        // una fila por lote, que es donde está la utilidad de verdad.
        if (!consumos.length) {
          l.push(fila(fecha(v.fecha), v.numero || '',
                      nombre('clientes', v.cliente_id), prod.nombre,
                      UNIDAD[prod.unidad] || prod.unidad, cantidad(it.cantidad),
                      monto(it.precio_unit), monto(it.cantidad * it.precio_unit),
                      '', 'sin entregar'));
          return;
        }
        consumos.forEach(c => {
          const util = store.kg(c.cantidad) *
            (store.peso(it.precio_unit) - store.peso(c.costo_unit));
          l.push(fila(fecha(v.fecha), v.numero || '',
                      nombre('clientes', v.cliente_id), prod.nombre,
                      UNIDAD[prod.unidad] || prod.unidad, cantidad(c.cantidad),
                      monto(it.precio_unit),
                      monto(store.kg(c.cantidad) * store.peso(it.precio_unit)),
                      monto(c.costo_unit), monto(util)));
        });
      });
    });
    l.push('');

    // ── compras ──
    l.push(fila('COMPRAS'));
    l.push(fila('Fecha', 'Pedido', 'Proveedor', 'Total', 'Pagado', 'Saldo'));
    p.compras.forEach(c => {
      const total = store.totalCompra(c.id);
      const pagado = store.pagado(c.id);
      l.push(fila(fecha(c.fecha), c.numero || '',
                  nombre('proveedores', c.proveedor_id),
                  monto(total), monto(pagado), monto(total - pagado)));
    });
    l.push(fila('TOTAL', '', '', monto(p.comprado), monto(p.pagado),
                monto(p.comprado - p.pagado)));
    l.push('');

    // ── caja ──
    l.push(fila('MOVIMIENTOS DE CAJA'));
    l.push(fila('Fecha', 'Tipo', 'Medio', 'Monto', 'Pedido', 'Nota'));
    const TIPO = { apertura: 'Capital ingresado', cobro: 'Cobro a cliente',
                   pago: 'Pago a proveedor', retiro: 'Retiro' };
    p.movimientos.forEach(m => {
      const pedido = m.venta_id ? (store.uno('ventas', m.venta_id) || {}).numero
                   : m.compra_id ? (store.uno('compras', m.compra_id) || {}).numero
                   : '';
      l.push(fila(fecha(m.fecha), TIPO[m.tipo] || m.tipo, MEDIO[m.medio] || m.medio,
                  monto(m.monto), pedido || '', m.nota || ''));
    });

    return '﻿' + l.join('\r\n') + '\r\n';
  }

  function nombreArchivo(desde, hasta) {
    const corto = f => String(f || '').slice(0, 10) || 'inicio';
    return 'Orange-Market_' + corto(desde) + '_a_' + (corto(hasta) || 'hoy') + '.csv';
  }

  async function descargar(desde, hasta) {
    const texto = armar(desde, hasta);
    const nombreCsv = nombreArchivo(desde, hasta);

    // Para COMPARTIR, el tipo real: así el celular ofrece Excel, Drive o
    // WhatsApp como destino. En el celular es la mejor vía — el informe sale
    // sin pasar por la carpeta de descargas.
    const archivo = new File([texto], nombreCsv, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo] });
        return 'compartido';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelado';
      }
    }

    // Para DESCARGAR, tipo binario a propósito. Con text/csv o text/plain hay
    // navegadores que abren el archivo en una pestaña en vez de guardarlo,
    // aunque se les pida descargar — y el informe se pierde. Probado: con
    // text/csv no se guardaba nada. Excel igual lo abre por la extensión.
    const blob = new Blob([texto], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreCsv;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'descargado';
  }

  window.OM = window.OM || {};
  window.OM.exportar = { armar, descargar, nombreArchivo };
})();
