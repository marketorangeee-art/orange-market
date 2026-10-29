/* Orange Market · proveedores y compras
 *
 * Las compras NUNCA se resumen. Cada pedido se ve aparte con su fecha y su
 * precio, porque el mismo proveedor puede vender el mismo producto a otro
 * precio mañana y esa diferencia es la que hay que poder mirar después.
 */
(function () {
  'use strict';

  const store = OM.store;
  const ui = OM.ui;
  const { fmt, esc } = ui;

  const MEDIOS = [
    { valor: 'efectivo',      texto: 'Efectivo' },
    { valor: 'transferencia', texto: 'Transferencia' }
  ];

  const comprasDe = proveedor_id =>
    store.donde('compras', 'proveedor_id', proveedor_id)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) ||
                      (b.numero || 0) - (a.numero || 0));

  const nombreProducto = id => {
    const p = store.uno('productos', id);
    return p ? p.nombre : 'producto borrado';
  };

  const unidadDe = id => {
    const p = store.uno('productos', id);
    return p ? p.unidad : '';
  };

  /* ── proveedor ────────────────────────────────────────────────────── */

  function crearProveedor() {
    ui.formulario({
      titulo: 'Nuevo proveedor',
      campos: [
        { nombre: 'nombre',   etiqueta: 'Nombre', requerido: true },
        { nombre: 'telefono', etiqueta: 'Teléfono' },
        { nombre: 'nota',     etiqueta: 'Nota', tipo: 'area' }
      ],
      textoGuardar: 'Crear',
      alGuardar: datos => { store.guardar('proveedores', datos); }
    });
  }

  function editarProveedor(proveedor) {
    ui.formulario({
      titulo: 'Editar proveedor',
      campos: [
        { nombre: 'nombre',   etiqueta: 'Nombre', requerido: true },
        { nombre: 'telefono', etiqueta: 'Teléfono' },
        { nombre: 'nota',     etiqueta: 'Nota', tipo: 'area' }
      ],
      valores: proveedor,
      alGuardar: datos => {
        Object.assign(proveedor, datos);
        store.guardar('proveedores', proveedor);
      }
    });
  }

  // Un proveedor con compras no se borra: esas compras son los lotes de donde
  // salió el producto, y sin proveedor el inventario deja de poder rastrearse.
  function eliminarProveedor(proveedor) {
    const compras = comprasDe(proveedor.id);

    if (compras.length) {
      const debe = compras.reduce((s, c) => s + store.saldoCompra(c.id), 0);
      return ui.hoja({
        titulo: 'No se puede eliminar',
        cuerpo: `
          <p>${esc(proveedor.nombre)} tiene ${compras.length}
             pedido${compras.length === 1 ? '' : 's'} registrado${compras.length === 1 ? '' : 's'}.
             De esos pedidos salió el producto que hay en inventario: sin el
             proveedor no se podría rastrear de dónde vino cada kilo.</p>
          ${debe > 0
            ? `<p class="aviso" style="margin-top:10px">Además le debés ${fmt.pesos(debe)}.</p>`
            : ''}
          <p class="tenue" style="margin-top:10px">
            Si los pedidos fueron un error, anulá cada uno desde su detalle y
            después volvé acá.
          </p>`,
        acciones: [{ texto: 'Entendido', clase: 'boton', alClic: c => c() }]
      });
    }

    ui.confirmar('Eliminar a ' + proveedor.nombre,
      'No tiene pedidos registrados, así que no se pierde ningún historial.',
      () => {
        store.anular('proveedores', proveedor.id);
        ui.volver();
        ui.aviso('Proveedor eliminado');
      }, 'Eliminar');
  }

  // Anular una compra devuelve el producto: deja de existir el lote. Por eso
  // no se puede anular si ya se vendió algo de ahí — ese producto salió del
  // local y la venta quedaría apuntando a un lote que nunca existió.
  function anularCompra(compra) {
    const lotes = store.lotes().filter(l => l.compra_id === compra.id);
    const vendido = lotes.filter(l => l.vendido > 0);

    if (vendido.length) {
      return ui.hoja({
        titulo: 'No se puede anular',
        cuerpo: `
          <p>De este pedido ya se vendió producto:</p>
          ${vendido.map(l => `
            <div class="previa__pie">
              <span>${esc(nombreProducto(l.producto_id))}</span>
              <span class="monto">${fmt.cant(l.vendido, unidadDe(l.producto_id))}</span>
            </div>`).join('')}
          <p class="tenue" style="margin-top:12px">
            Anularlo dejaría esas ventas apuntando a un lote inexistente.
            Anulá primero las ventas que sacaron de acá.
          </p>`,
        acciones: [{ texto: 'Entendido', clase: 'boton', alClic: c => c() }]
      });
    }

    const total = store.totalCompra(compra.id);
    const pagado = store.pagado(compra.id);

    const detalle = [
      'Son ' + fmt.pesos(total) + '.',
      'El producto que entró deja de estar en inventario.',
      pagado > 0 ? 'Se revierten ' + fmt.pesos(pagado) + ' ya pagados.' : '',
      'Queda marcado como anulado, no se borra.'
    ].filter(Boolean).join(' ');

    ui.confirmar('Anular el pedido ' + (compra.numero || 's/n'), detalle, () => {
      store.donde('compra_items', 'compra_id', compra.id)
        .forEach(li => store.anular('compra_items', li.id));
      store.donde('movimientos', 'compra_id', compra.id)
        .forEach(m => store.anular('movimientos', m.id));
      store.anular('compras', compra.id);
      ui.volver();
      ui.aviso('Pedido anulado');
    }, 'Anular el pedido');
  }

  /* ── pago a una compra ────────────────────────────────────────────── */

  // Se pregunta siempre, al crear la compra y cada vez que se vuelva a abonar:
  // cuánto y de qué bolsa sale. Sin eso el dinero disponible no cuadra.
  function registrarPago(compra, titulo, montoSugerido) {
    const saldo = store.saldoCompra(compra.id);
    ui.formulario({
      titulo: titulo || 'Registrar pago',
      campos: [
        { nombre: 'monto', etiqueta: 'Monto (0 si todavía no pagás nada)',
          tipo: 'numero', min: 0, paso: '1' },
        { nombre: 'medio', etiqueta: '¿De dónde sale?', tipo: 'select', opciones: MEDIOS },
        { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' }
      ],
      valores: {
        monto: montoSugerido == null ? saldo : montoSugerido,
        medio: 'efectivo',
        fecha: ui.hoy()
      },
      textoGuardar: 'Registrar',
      alGuardar: datos => {
        if (datos.monto < 0) return 'El monto no puede ser negativo.';
        if (datos.monto > saldo) {
          return 'Ese pago supera el saldo de la compra, que es ' + fmt.pesos(saldo) + '.';
        }
        if (datos.monto === 0) return;   // no pagó nada: no hay movimiento que guardar

        store.guardar('movimientos', {
          tipo: 'pago',
          medio: datos.medio,
          monto: datos.monto,
          fecha: datos.fecha || ui.hoy(),
          compra_id: compra.id,
          venta_id: null,
          nota: ''
        });
        ui.aviso('Pago registrado');
      }
    });
  }

  /* ── nueva compra ─────────────────────────────────────────────────── */

  function nuevaCompra(proveedor) {
    const borrador = { fecha: ui.hoy(), condicion: 'contado', items: [] };

    const total = () =>
      borrador.items.reduce((s, it) => s + it.cantidad * it.costo_unit, 0);

    function agregarItem() {
      OM.productos.elegir(producto => {
        ui.formulario({
          titulo: producto.nombre,
          campos: [
            { nombre: 'cantidad', etiqueta: 'Cantidad en ' + fmt.plural(producto.unidad),
              tipo: 'numero', paso: '0.01', requerido: true, autofoco: true },
            { nombre: 'costo_unit', etiqueta: 'Costo por ' + fmt.unidad(producto.unidad),
              tipo: 'numero', paso: '1', requerido: true }
          ],
          textoGuardar: 'Agregar',
          alGuardar: datos => {
            borrador.items.push({
              producto_id: producto.id,
              cantidad: store.kg(datos.cantidad),
              costo_unit: store.peso(datos.costo_unit)
            });
          }
        });
      });
    }

    function guardar() {
      if (!borrador.items.length) return ui.aviso('Agregá al menos un producto');

      const compra = store.guardar('compras', {
        proveedor_id: proveedor.id,
        fecha: borrador.fecha,
        condicion: borrador.condicion,
        nota: '',
        numero: store.siguienteNumero('compras')
      });

      borrador.items.forEach(it => {
        store.guardar('compra_items', {
          compra_id: compra.id,
          producto_id: it.producto_id,
          cantidad: it.cantidad,
          costo_unit: it.costo_unit
        });
      });

      ui.volver();
      registrarPago(compra, '¿Pagaste esta compra?',
                    borrador.condicion === 'contado' ? store.totalCompra(compra.id) : 0);
    }

    return {
      titulo: 'Compra a ' + proveedor.nombre,
      html() {
        const filas = borrador.items.map((it, i) => `
          <div class="fila" style="cursor:default">
            <div class="fila__cuerpo">
              <div class="fila__titulo">${esc(nombreProducto(it.producto_id))}</div>
              <div class="fila__detalle">
                ${fmt.cant(it.cantidad, unidadDe(it.producto_id))} × ${fmt.pesos(it.costo_unit)}
              </div>
            </div>
            <div class="fila__valor">
              <div class="monto">${fmt.pesos(it.cantidad * it.costo_unit)}</div>
            </div>
            <button class="boton boton--peligro" data-quitar="${i}"
                    style="min-height:36px;padding:0 10px">✕</button>
          </div>`).join('');

        return `
          <div class="tarjeta">
            <label class="campo">
              <span class="campo__etiqueta">Fecha</span>
              <input type="date" id="fecha" value="${borrador.fecha}">
            </label>
            <label class="campo" style="margin-bottom:0">
              <span class="campo__etiqueta">¿Cómo la vas a pagar?</span>
              <select id="condicion">
                <option value="contado" ${borrador.condicion === 'contado' ? 'selected' : ''}>De contado</option>
                <option value="credito" ${borrador.condicion === 'credito' ? 'selected' : ''}>A crédito</option>
              </select>
            </label>
          </div>

          <button class="boton boton--fantasma boton--bloque" id="agregar"
                  style="margin-bottom:12px">+ Agregar producto</button>

          ${filas || ui.vacio('🧾', 'Todavía no agregaste productos.')}

          <div class="tarjeta" style="margin-top:12px">
            <div class="tarjeta__titulo">Total de la compra</div>
            <div style="font-size:26px;font-weight:700;color:var(--marca)">${fmt.pesos(total())}</div>
          </div>

          <button class="boton boton--bloque" id="guardar"
                  ${borrador.items.length ? '' : 'disabled'}>Guardar compra</button>`;
      },
      listo(cont) {
        cont.querySelector('#fecha').onchange = e => { borrador.fecha = e.target.value; };
        cont.querySelector('#condicion').onchange = e => { borrador.condicion = e.target.value; };
        cont.querySelector('#agregar').onclick = agregarItem;
        cont.querySelector('#guardar').onclick = guardar;
        cont.querySelectorAll('[data-quitar]').forEach(b => {
          b.onclick = () => { borrador.items.splice(Number(b.dataset.quitar), 1); ui.render(); };
        });
      }
    };
  }

  /* ── detalle de una compra ────────────────────────────────────────── */

  function detalleCompra(compra, proveedor) {
    proveedor = proveedor || store.uno('proveedores', compra.proveedor_id) || { nombre: '—' };
    return {
      titulo: 'Pedido ' + (compra.numero || 's/n'),
      html() {
        const lotes = store.lotes().filter(l => l.compra_id === compra.id);
        const total = store.totalCompra(compra.id);
        const pagado = store.pagado(compra.id);
        const saldo = store.saldoCompra(compra.id);

        const filas = lotes.map(l => {
          const unidad = unidadDe(l.producto_id);
          const agotado = l.restante <= 0;
          return `
            <div class="fila" style="cursor:default">
              <div class="fila__cuerpo">
                <div class="fila__titulo">${esc(nombreProducto(l.producto_id))}</div>
                <div class="fila__detalle">
                  Entraron ${fmt.cant(l.cantidad, unidad)} × ${fmt.pesos(l.costo_unit)}
                </div>
              </div>
              <div class="fila__valor">
                <span class="pildora ${agotado ? 'pildora--mal' : ''}">
                  ${agotado ? 'agotado' : 'quedan ' + fmt.cant(l.restante, unidad)}
                </span>
              </div>
            </div>`;
        }).join('');

        const pagos = store.donde('movimientos', 'compra_id', compra.id)
          .filter(m => m.tipo === 'pago')
          .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

        return `
          <div class="tarjeta">
            <div class="tarjeta__titulo">${esc(proveedor.nombre)} · ${fmt.fecha(compra.fecha)}</div>
            <div style="font-size:26px;font-weight:700">${fmt.pesos(total)}</div>
            <div class="${saldo > 0 ? 'aviso' : 'ok'}">
              ${saldo > 0 ? 'Debés ' + fmt.pesos(saldo) : 'Pagada completa'}
              ${pagado > 0 && saldo > 0 ? ' · abonado ' + fmt.pesos(pagado) : ''}
            </div>
          </div>

          <div class="tarjeta__titulo" style="margin:18px 0 8px">Qué entró en este pedido</div>
          ${filas}

          <div class="tarjeta__titulo" style="margin:18px 0 8px">Pagos</div>
          ${pagos.length ? pagos.map(p => `
            <div class="fila" style="cursor:default">
              <div class="fila__cuerpo">
                <div class="fila__titulo">${fmt.pesos(p.monto)}</div>
                <div class="fila__detalle">${esc(p.medio)} · ${fmt.fecha(p.fecha)}</div>
              </div>
            </div>`).join('')
            : '<p class="tenue" style="padding:0 2px 8px">Sin pagos todavía.</p>'}

          ${saldo > 0 ? `<button class="boton boton--bloque" id="pagar">Registrar pago</button>` : ''}

          <button class="boton boton--peligro boton--bloque" id="anular"
                  style="margin-top:28px">Anular este pedido</button>`;
      },
      listo(cont) {
        const b = cont.querySelector('#pagar');
        if (b) b.onclick = () => registrarPago(compra);
        cont.querySelector('#anular').onclick = () => anularCompra(compra);
      }
    };
  }

  /* ── detalle de un proveedor ──────────────────────────────────────── */

  function detalleProveedor(proveedor) {
    return {
      titulo: proveedor.nombre,
      html() {
        const compras = comprasDe(proveedor.id);
        const debe = compras.reduce((s, c) => s + store.saldoCompra(c.id), 0);

        const filas = compras.map(c => {
          const saldo = store.saldoCompra(c.id);
          const cuantos = store.donde('compra_items', 'compra_id', c.id).length;
          return `
            <button class="fila" data-compra="${c.id}">
              <div class="fila__cuerpo">
                <div class="fila__titulo">Pedido ${c.numero || 's/n'} · ${fmt.fecha(c.fecha)}</div>
                <div class="fila__detalle">${cuantos} producto${cuantos === 1 ? '' : 's'}</div>
              </div>
              <div class="fila__valor">
                <div class="monto">${fmt.pesos(store.totalCompra(c.id))}</div>
                <div class="fila__detalle ${saldo > 0 ? 'aviso' : 'ok'}">
                  ${saldo > 0 ? 'debés ' + fmt.pesos(saldo) : 'pagada'}
                </div>
              </div>
            </button>`;
        }).join('');

        return `
          <div class="tarjeta">
            <div class="tarjeta__titulo">Le debés a ${esc(proveedor.nombre)}</div>
            <div style="font-size:26px;font-weight:700;color:${debe > 0 ? 'var(--alerta)' : 'var(--ok)'}">
              ${fmt.pesos(debe)}
            </div>
            ${proveedor.telefono ? `<div class="tenue">${esc(proveedor.telefono)}</div>` : ''}
            ${proveedor.nota ? `<div class="tenue">${esc(proveedor.nota)}</div>` : ''}
          </div>

          <button class="boton boton--bloque" id="nueva" style="margin-bottom:16px">
            + Nueva compra
          </button>

          <div class="tarjeta__titulo" style="margin:0 0 8px">
            Compras (${compras.length})
          </div>
          ${filas || ui.vacio('🧾', 'Todavía no le comprás nada a este proveedor.')}

          <button class="boton boton--fantasma boton--bloque" id="editar"
                  style="margin-top:18px">Editar proveedor</button>
          <button class="boton boton--peligro boton--bloque" id="eliminar"
                  style="margin-top:10px">Eliminar proveedor</button>`;
      },
      listo(cont) {
        cont.querySelector('#nueva').onclick = () => ui.abrir(nuevaCompra(proveedor));
        cont.querySelector('#editar').onclick = () => editarProveedor(proveedor);
        cont.querySelector('#eliminar').onclick = () => eliminarProveedor(proveedor);
        cont.querySelectorAll('[data-compra]').forEach(b => {
          b.onclick = () => ui.abrir(
            detalleCompra(store.uno('compras', b.dataset.compra), proveedor));
        });
      }
    };
  }

  /* ── pantalla ─────────────────────────────────────────────────────── */

  ui.pantalla('proveedores', {
    titulo: 'Proveedores',
    html() {
      const proveedores = store.todos('proveedores')
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

      const filas = proveedores.map(p => {
        const compras = comprasDe(p.id);
        const debe = compras.reduce((s, c) => s + store.saldoCompra(c.id), 0);
        return `
          <button class="fila" data-ver="${p.id}">
            <div class="fila__cuerpo">
              <div class="fila__titulo">${esc(p.nombre)}</div>
              <div class="fila__detalle">${compras.length} compra${compras.length === 1 ? '' : 's'}</div>
            </div>
            <div class="fila__valor">
              ${debe > 0
                ? `<div class="monto aviso">${fmt.pesos(debe)}</div>
                   <div class="fila__detalle">pendiente</div>`
                : '<span class="pildora">al día</span>'}
            </div>
          </button>`;
      }).join('');

      const porPagar = store.porPagar().total;

      return `
        <div class="tarjeta">
          <div class="tarjeta__titulo">Total que debés a proveedores</div>
          <div style="font-size:30px;font-weight:700;color:${porPagar > 0 ? 'var(--alerta)' : 'var(--ok)'}">
            ${fmt.pesos(porPagar)}
          </div>
        </div>

        <button class="boton boton--bloque" id="nuevo" style="margin-bottom:16px">
          + Proveedor nuevo
        </button>

        ${filas || ui.vacio('🚚', 'Todavía no hay proveedores. Creá el primero.')}`;
    },
    listo(cont) {
      cont.querySelector('#nuevo').onclick = crearProveedor;
      cont.querySelectorAll('[data-ver]').forEach(b => {
        b.onclick = () => ui.abrir(detalleProveedor(store.uno('proveedores', b.dataset.ver)));
      });
    }
  });

  OM.compras = { detalle: detalleCompra, registrarPago, nuevaCompra,
                 anular: anularCompra, eliminarProveedor };
})();
