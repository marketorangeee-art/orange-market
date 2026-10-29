/* Orange Market · venta, asignación de lotes y factura
 *
 * La venta tiene dos momentos y es a propósito:
 *
 *   1. Armar el pedido — qué productos, cuántos y a qué precio. El precio no
 *      sale de ninguna fórmula: se digita, porque depende del cliente y del
 *      día.
 *   2. Asignar los lotes — de qué pedido y de qué proveedor sale cada kilo, y
 *      a qué lo compraste. Acá se ve si alcanza el stock y cuánto se gana de
 *      verdad, antes de generar la factura.
 *
 * El segundo paso lo hace pantallaAsignacion(), que también sirve para
 * completar después una entrega que quedó corta.
 */
(function () {
  'use strict';

  const store = OM.store;
  const ui = OM.ui;
  const { fmt, esc } = ui;

  const borrador = {
    cliente_id: null,
    fecha: ui.hoy(),
    items: [],
    vendedor: '',
    medio_pago: 'efectivo'
  };

  const MEDIOS = [
    { valor: 'efectivo',      texto: 'Efectivo' },
    { valor: 'transferencia', texto: 'Transferencia' }
  ];

  function nuevoVendedor() {
    ui.formulario({
      titulo: 'Nuevo vendedor',
      campos: [{ nombre: 'nombre', etiqueta: 'Nombre', requerido: true, autofoco: true }],
      textoGuardar: 'Crear',
      alGuardar: datos => {
        const repetido = store.todos('vendedores')
          .some(v => v.nombre.toLowerCase() === datos.nombre.toLowerCase());
        if (repetido) return 'Ya existe un vendedor con ese nombre.';
        store.guardar('vendedores', { nombre: datos.nombre });
        borrador.vendedor = datos.nombre;
      }
    });
  }

  const limpiar = () => {
    borrador.cliente_id = null;
    borrador.fecha = ui.hoy();
    borrador.items = [];
    borrador.medio_pago = 'efectivo';
    // el vendedor NO se limpia: en un turno lo normal es que siga siendo el
    // mismo, y volver a elegirlo en cada venta es un estorbo
  };

  const producto = id => store.uno('productos', id) || { nombre: '—', unidad: '' };
  const proveedor = id => (store.uno('proveedores', id) || { nombre: '—' }).nombre;

  /* ── ayudas para poner el precio ──────────────────────────────────── */

  // A este cliente, este producto, la última vez. Es el dato que de verdad se
  // consulta al poner un precio, y nadie se acuerda de memoria.
  function ultimoPrecio(cliente_id, producto_id) {
    if (!cliente_id) return null;
    const ventas = store.donde('ventas', 'cliente_id', cliente_id)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) ||
                      (b.numero || 0) - (a.numero || 0));
    for (const v of ventas) {
      const it = store.donde('venta_items', 'venta_id', v.id)
        .find(i => i.producto_id === producto_id);
      if (it) return { precio: store.peso(it.precio_unit), fecha: v.fecha };
    }
    return null;
  }

  const costoProximo = producto_id => {
    const l = store.lotesDe(producto_id, true)[0];
    return l ? l.costo_unit : null;
  };

  /* ── armar el pedido ──────────────────────────────────────────────── */

  // La venta anterior a este cliente, completa. Es lo que de verdad se
  // consulta al poner un precio y lo que nadie se acuerda de memoria.
  function ultimaVenta(cliente_id) {
    if (!cliente_id) return null;
    return store.donde('ventas', 'cliente_id', cliente_id)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) ||
                      (b.numero || 0) - (a.numero || 0))[0] || null;
  }

  function agregarItem() {
    OM.productos.elegir(p => pedirCantidad(p));
  }

  function pedirCantidad(p, precioSugerido) {
    {
      const anterior = ultimoPrecio(borrador.cliente_id, p.id);
      const costo = costoProximo(p.id);
      const hay = store.stock(p.id);

      const ayuda = [
        anterior ? `La última vez (${fmt.fecha(anterior.fecha)}) se lo vendiste a
                    <b class="ok">${fmt.pesos(anterior.precio)}</b>.` : '',
        costo != null ? `El lote más viejo te costó <b>${fmt.pesos(costo)}</b>.` : '',
        `Hay ${fmt.cant(hay, p.unidad)} en stock.`
      ].filter(Boolean).join('<br>');

      ui.formulario({
        titulo: p.nombre,
        campos: [
          { nombre: 'cantidad', etiqueta: 'Cantidad en ' + fmt.plural(p.unidad),
            tipo: 'numero', paso: '0.01', requerido: true, autofoco: true },
          { nombre: 'precio_unit', etiqueta: 'Precio de venta por ' + fmt.unidad(p.unidad),
            tipo: 'numero', paso: '1', requerido: true, ayuda: ayuda }
        ],
        valores: {
          precio_unit: precioSugerido != null ? precioSugerido
                     : anterior ? anterior.precio : ''
        },
        textoGuardar: 'Agregar',
        alGuardar: datos => {
          borrador.items.push({
            producto_id: p.id,
            cantidad: store.kg(datos.cantidad),
            precio_unit: store.peso(datos.precio_unit),
            reparto: []
          });
        }
      });
    }
  }

  /* ── asignación de lotes ──────────────────────────────────────────── */

  // Propone el reparto desde el lote más viejo, teniendo en cuenta lo que ya
  // se llevaron las otras líneas del mismo pedido.
  function proponer(lineas) {
    const tomado = {};
    lineas.forEach(l => {
      const r = store.repartir(l.producto_id, l.cantidad, tomado);
      l.reparto = r.reparto.map(x => ({ lote_id: x.lote_id, cantidad: x.cantidad }));
      l.reparto.forEach(x => { tomado[x.lote_id] = (tomado[x.lote_id] || 0) + x.cantidad; });
    });
  }

  const asignado = linea =>
    store.kg(linea.reparto.reduce((s, r) => s + store.kg(r.cantidad), 0));

  const faltante = linea => store.kg(Math.max(0, linea.cantidad - asignado(linea)));

  const utilidadLinea = linea =>
    store.peso(linea.reparto.reduce((s, r) => {
      const lote = store.lotes().find(l => l.id === r.lote_id);
      return s + store.kg(r.cantidad) * (linea.precio_unit - (lote ? lote.costo_unit : 0));
    }, 0));

  function pantallaAsignacion(opciones) {
    const lineas = opciones.lineas;
    proponer(lineas);

    const tomadoPorOtras = (i, lote_id) =>
      lineas.reduce((s, l, j) => {
        if (j === i) return s;
        const r = l.reparto.find(x => x.lote_id === lote_id);
        return s + (r ? store.kg(r.cantidad) : 0);
      }, 0);

    const totalPedido = () =>
      store.peso(lineas.reduce((s, l) => s + l.cantidad * l.precio_unit, 0));

    return {
      titulo: opciones.titulo,
      html() {
        const tarjetas = lineas.map((linea, i) => {
          const p = producto(linea.producto_id);
          const lotes = store.lotesDe(linea.producto_id, true);

          const filasLote = lotes.map(l => {
            const puesto = linea.reparto.find(r => r.lote_id === l.id);
            const libre = store.kg(l.restante - tomadoPorOtras(i, l.id));
            return `
              <div class="lote">
                <div class="lote__datos">
                  <div class="lote__titulo">
                    Pedido ${l.pedido || 's/n'} · ${esc(proveedor(l.proveedor_id))}
                  </div>
                  <div class="fila__detalle">
                    ${fmt.fecha(l.fecha)} · costo ${fmt.pesos(l.costo_unit)} ·
                    hay <span id="disp-${i}-${l.id}">${fmt.cant(libre, p.unidad)}</span>
                  </div>
                </div>
                <input type="text" inputmode="decimal"
                       class="lote__cant" data-linea="${i}" data-lote="${l.id}"
                       value="${puesto ? puesto.cantidad : 0}">
              </div>`;
          }).join('');

          return `
            <div class="tarjeta">
              <div class="fila__titulo" style="font-size:17px">
                ${esc(p.nombre)} · ${fmt.cant(linea.cantidad, p.unidad)}
              </div>

              ${opciones.editarPrecio ? `
                <label class="campo" style="margin:12px 0 6px">
                  <span class="campo__etiqueta">Precio de venta por ${fmt.unidad(p.unidad)}</span>
                  <input type="text" inputmode="numeric"
                         class="precio" data-linea="${i}" value="${linea.precio_unit}">
                </label>`
                : `<div class="tenue" style="margin:4px 0 12px">
                     Facturado a ${fmt.pesos(linea.precio_unit)} por ${fmt.unidad(p.unidad)}
                   </div>`}

              <div class="tarjeta__titulo" style="margin:14px 0 6px">De qué lote sale</div>
              ${filasLote || '<p class="mal" style="margin-bottom:8px">Sin existencias de este producto.</p>'}

              <div class="resumen-linea">
                <div id="asig-${i}"></div>
                <div id="util-${i}" class="tenue"></div>
              </div>
              <div id="falta-${i}"></div>
            </div>`;
        }).join('');

        return `
          ${tarjetas}
          <div class="tarjeta">
            <div class="tarjeta__titulo">${opciones.editarPrecio ? 'Total a cobrar' : 'Total del pedido'}</div>
            <div id="total" style="font-size:26px;font-weight:700;color:var(--marca)"></div>
            <div id="utilidad" class="tenue"></div>
          </div>
          <button class="boton boton--bloque" id="confirmar">${esc(opciones.textoConfirmar)}</button>`;
      },

      listo(cont) {
        // Se repinta a mano y no con render(), para no perder el foco ni el
        // cursor mientras se está escribiendo una cantidad.
        function refrescar() {
          lineas.forEach((linea, i) => {
            const p = producto(linea.producto_id);
            const falta = faltante(linea);
            const puesto = asignado(linea);

            cont.querySelector('#asig-' + i).innerHTML =
              `Asignado <b>${fmt.cant(puesto, p.unidad)}</b> de ${fmt.cant(linea.cantidad, p.unidad)}`;

            cont.querySelector('#util-' + i).textContent =
              'Utilidad ' + fmt.pesos(utilidadLinea(linea));

            cont.querySelector('#falta-' + i).innerHTML = falta > 0
              ? `<div class="aviso" style="margin-top:8px">
                   ⚠ No hay stock para ${fmt.cant(falta, p.unidad)}. Se factura igual
                   y queda pendiente de entrega.
                 </div>`
              : '';

            store.lotesDe(linea.producto_id, true).forEach(l => {
              const d = cont.querySelector('#disp-' + i + '-' + l.id);
              if (d) d.textContent = fmt.cant(store.kg(l.restante - tomadoPorOtras(i, l.id)), p.unidad);
            });
          });

          cont.querySelector('#total').textContent = fmt.pesos(totalPedido());
          cont.querySelector('#utilidad').textContent =
            'Utilidad del pedido ' + fmt.pesos(
              lineas.reduce((s, l) => s + utilidadLinea(l), 0));
        }

        cont.querySelectorAll('.lote__cant').forEach(input => {
          input.oninput = () => {
            const i = Number(input.dataset.linea);
            const lote_id = input.dataset.lote;
            const linea = lineas[i];
            const lote = store.lotes().find(l => l.id === lote_id);
            const tope = store.kg(lote.restante - tomadoPorOtras(i, lote_id));

            let v = store.kg(ui.aDecimal(input.value));
            if (v < 0) v = 0;
            if (v > tope) { v = tope; input.value = v; }

            const r = linea.reparto.find(x => x.lote_id === lote_id);
            if (r) r.cantidad = v; else linea.reparto.push({ lote_id, cantidad: v });
            linea.reparto = linea.reparto.filter(x => x.cantidad > 0);
            refrescar();
          };
        });

        cont.querySelectorAll('.precio').forEach(input => {
          input.oninput = () => {
            lineas[Number(input.dataset.linea)].precio_unit = store.peso(ui.aEntero(input.value));
            refrescar();
          };
        });

        cont.querySelector('#confirmar').onclick = () => opciones.alConfirmar(lineas);
        refrescar();
      }
    };
  }

  /* ── confirmar la venta ───────────────────────────────────────────── */

  function facturar(lineas) {
    const venta = store.guardar('ventas', {
      cliente_id: borrador.cliente_id,
      fecha: borrador.fecha,
      // copia, no referencia: la factura entregada no puede cambiar porque
      // después se renombre o se dé de baja a esa persona
      vendedor: borrador.vendedor,
      medio_pago: borrador.medio_pago,
      nota: '',
      numero: store.siguienteNumero('ventas')
    });

    lineas.forEach(linea => {
      const item = store.guardar('venta_items', {
        venta_id: venta.id,
        producto_id: linea.producto_id,
        cantidad: linea.cantidad,
        precio_unit: linea.precio_unit
      });
      guardarConsumos(item.id, linea.reparto);
    });

    const cliente = store.uno('clientes', borrador.cliente_id);
    limpiar();

    ui.volver();
    ui.abrir(factura(venta));
    OM.clientes.registrarCobro(venta, '¿Te paga ahora?',
      cliente && cliente.condicion === 'contado' ? store.totalVenta(venta.id) : 0);
  }

  function guardarConsumos(venta_item_id, reparto) {
    reparto.filter(r => r.cantidad > 0).forEach(r => {
      const lote = store.lotes().find(l => l.id === r.lote_id);
      store.guardar('consumos', {
        venta_item_id: venta_item_id,
        lote_id: r.lote_id,
        cantidad: store.kg(r.cantidad),
        costo_unit: lote ? lote.costo_unit : 0   // copia: congela el costo
      });
    });
  }

  /* ── completar una entrega que quedó corta ────────────────────────── */

  function completarEntrega(venta) {
    const lineas = store.donde('venta_items', 'venta_id', venta.id)
      .map(it => ({
        venta_item_id: it.id,
        producto_id: it.producto_id,
        cantidad: store.kg(it.cantidad - store.cubierto(it.id)),
        precio_unit: store.peso(it.precio_unit),
        reparto: []
      }))
      .filter(l => l.cantidad > 0);

    if (!lineas.length) return ui.aviso('Este pedido ya está entregado completo');

    ui.abrir(pantallaAsignacion({
      titulo: 'Completar entrega',
      lineas: lineas,
      editarPrecio: false,
      textoConfirmar: 'Confirmar entrega',
      alConfirmar: ls => {
        ls.forEach(l => guardarConsumos(l.venta_item_id, l.reparto));
        ui.volver();
        ui.aviso('Entrega actualizada');
      }
    }));
  }

  /* ── factura ──────────────────────────────────────────────────────── */

  function textoFactura(venta) {
    const cliente = store.uno('clientes', venta.cliente_id) || { nombre: '—' };
    const lineas = store.donde('venta_items', 'venta_id', venta.id).map(it => {
      const p = producto(it.producto_id);
      return `${p.nombre}  ${fmt.cant(it.cantidad, p.unidad)} x ${fmt.pesos(it.precio_unit)} = ${fmt.pesos(it.cantidad * it.precio_unit)}`;
    });

    const total = store.totalVenta(venta.id);
    const abonado = store.cobrado(venta.id);
    const saldo = store.saldoVenta(venta.id);
    const falta = store.faltanteVenta(venta.id);

    const pendientes = store.donde('venta_items', 'venta_id', venta.id)
      .map(it => ({ it, f: store.kg(it.cantidad - store.cubierto(it.id)) }))
      .filter(x => x.f > 0)
      .map(x => `${producto(x.it.producto_id).nombre}: ${fmt.cant(x.f, producto(x.it.producto_id).unidad)}`);

    return [
      'ORANGE MARKET',
      'Pedido ' + (venta.numero || 's/n') + ' · ' + fmt.fecha(venta.fecha),
      'Cliente: ' + cliente.nombre,
      '',
      ...lineas,
      '',
      'TOTAL: ' + fmt.pesos(total),
      abonado > 0 ? 'Abonado: ' + fmt.pesos(abonado) : '',
      saldo > 0 ? 'SALDO: ' + fmt.pesos(saldo) : 'PAGADO',
      falta > 0 ? '\nPendiente de entrega:\n' + pendientes.join('\n') : ''
    ].filter(l => l !== '').join('\n');
  }

  // Anular no borra: marca. El producto vuelve solo a sus lotes porque el
  // stock se deriva de los consumos vivos, y la plata vuelve porque el
  // disponible se deriva de los movimientos vivos. Queda el rastro.
  function anularVenta(venta) {
    const items = store.donde('venta_items', 'venta_id', venta.id);
    const cobros = store.donde('movimientos', 'venta_id', venta.id);
    const total = store.totalVenta(venta.id);
    const cobrado = store.cobrado(venta.id);

    const vuelve = items.reduce((s, it) => s + store.cubierto(it.id), 0);

    const detalle = [
      'Son ' + fmt.pesos(total) + '.',
      vuelve > 0 ? 'El producto entregado vuelve a los lotes de donde salió.' : '',
      cobrado > 0 ? 'Se revierten ' + fmt.pesos(cobrado) + ' ya cobrados.' : '',
      'Queda marcado como anulado, no se borra: el rastro se conserva.'
    ].filter(Boolean).join(' ');

    ui.confirmar('Anular el pedido ' + (venta.numero || 's/n'), detalle, () => {
      items.forEach(it => {
        store.donde('consumos', 'venta_item_id', it.id)
          .forEach(c => store.anular('consumos', c.id));
        store.anular('venta_items', it.id);
      });
      cobros.forEach(m => store.anular('movimientos', m.id));
      store.anular('ventas', venta.id);
      ui.volver();
      ui.aviso('Pedido anulado');
    }, 'Anular el pedido');
  }

  function factura(venta) {
    return {
      titulo: 'Pedido ' + (venta.numero || 's/n'),
      html() {
        const cliente = store.uno('clientes', venta.cliente_id) || { nombre: '—' };
        const items = store.donde('venta_items', 'venta_id', venta.id);
        const total = store.totalVenta(venta.id);
        const abonado = store.cobrado(venta.id);
        const saldo = store.saldoVenta(venta.id);
        const falta = store.faltanteVenta(venta.id);

        const filas = items.map(it => {
          const p = producto(it.producto_id);
          const entregado = store.cubierto(it.id);
          const pendiente = store.kg(it.cantidad - entregado);
          return `
            <div class="fila" style="cursor:default">
              <div class="fila__cuerpo">
                <div class="fila__titulo">${esc(p.nombre)}</div>
                <div class="fila__detalle">
                  ${fmt.cant(it.cantidad, p.unidad)} × ${fmt.pesos(it.precio_unit)}
                  ${pendiente > 0
                    ? `<span class="aviso">· faltan ${fmt.cant(pendiente, p.unidad)}</span>`
                    : ''}
                </div>
              </div>
              <div class="fila__valor monto">${fmt.pesos(it.cantidad * it.precio_unit)}</div>
            </div>`;
        }).join('');

        const utilidad = store.peso(items.reduce((s, it) =>
          s + store.donde('consumos', 'venta_item_id', it.id).reduce((t, c) =>
            t + store.kg(c.cantidad) * (store.peso(it.precio_unit) - store.peso(c.costo_unit)), 0), 0));

        const cobros = store.donde('movimientos', 'venta_id', venta.id)
          .filter(m => m.tipo === 'cobro');

        return `
          <div class="tarjeta">
            <div class="tarjeta__titulo">${esc(cliente.nombre)} · ${fmt.fecha(venta.fecha)}</div>
            <div style="font-size:28px;font-weight:700">${fmt.pesos(total)}</div>
            <div class="${saldo > 0 ? 'aviso' : 'ok'}">
              ${saldo > 0 ? 'Debe ' + fmt.pesos(saldo) + ' · ' + fmt.dias(store.diasDesde(venta.fecha))
                          : 'Pagado completo'}
            </div>
            ${falta > 0 ? '<div class="aviso" style="margin-top:8px">⚠ Entrega incompleta.</div>' : ''}
          </div>

          ${filas}

          <div class="tarjeta" style="margin-top:12px">
            <div class="tarjeta__titulo">Utilidad de este pedido</div>
            <div class="monto ok" style="font-size:22px">${fmt.pesos(utilidad)}</div>
            ${falta > 0 ? '<div class="tenue">Solo cuenta lo entregado.</div>' : ''}
          </div>

          ${cobros.length ? `
            <div class="tarjeta__titulo" style="margin:18px 0 8px">Abonos</div>
            ${cobros.map(c => `
              <div class="fila" style="cursor:default">
                <div class="fila__cuerpo">
                  <div class="fila__titulo">${fmt.pesos(c.monto)}</div>
                  <div class="fila__detalle">${esc(c.medio)} · ${fmt.fecha(c.fecha)}</div>
                </div>
              </div>`).join('')}` : ''}

          <button class="boton boton--bloque" id="compartir" style="margin-top:18px">
            Enviar factura por WhatsApp
          </button>
          <button class="boton boton--fantasma boton--bloque" id="ver" style="margin-top:10px">
            Ver la factura
          </button>
          ${saldo > 0 ? '<button class="boton boton--fantasma boton--bloque" id="abonar" style="margin-top:10px">Registrar abono</button>' : ''}
          ${falta > 0 ? '<button class="boton boton--fantasma boton--bloque" id="completar" style="margin-top:10px">Completar entrega</button>' : ''}

          <button class="boton boton--peligro boton--bloque" id="anular"
                  style="margin-top:28px">Anular este pedido</button>`;
      },

      listo(cont) {
        const boton = cont.querySelector('#compartir');
        boton.onclick = async () => {
          boton.disabled = true;
          boton.textContent = 'Armando el PDF…';
          try {
            const salida = await OM.factura.compartir(venta);
            if (salida === 'descargado') ui.aviso('Factura descargada');
          } catch (e) {
            // Que no se quede sin poder mandar nada: si el PDF falla, va el
            // mismo contenido como texto.
            ui.aviso('No se pudo armar el PDF, va como texto');
            const texto = textoFactura(venta);
            if (navigator.share) navigator.share({ text: texto }).catch(() => {});
            else window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
          }
          boton.disabled = false;
          boton.textContent = 'Enviar factura por WhatsApp';
        };

        cont.querySelector('#ver').onclick = () =>
          OM.factura.verEnPantalla(venta).catch(() => ui.aviso('No se pudo abrir la factura'));
        const abonar = cont.querySelector('#abonar');
        if (abonar) abonar.onclick = () => OM.clientes.registrarCobro(venta);
        const completar = cont.querySelector('#completar');
        if (completar) completar.onclick = () => completarEntrega(venta);

        cont.querySelector('#anular').onclick = () => anularVenta(venta);
      }
    };
  }

  /* ── pantalla ─────────────────────────────────────────────────────── */

  ui.pantalla('venta', {
    titulo: 'Venta',
    html() {
      const cliente = borrador.cliente_id ? store.uno('clientes', borrador.cliente_id) : null;

      const items = borrador.items.map((it, i) => {
        const p = producto(it.producto_id);
        return `
          <div class="fila" style="cursor:default">
            <div class="fila__cuerpo">
              <div class="fila__titulo">${esc(p.nombre)}</div>
              <div class="fila__detalle">
                ${fmt.cant(it.cantidad, p.unidad)} × ${fmt.pesos(it.precio_unit)}
              </div>
            </div>
            <div class="fila__valor monto">${fmt.pesos(it.cantidad * it.precio_unit)}</div>
            <button class="boton boton--peligro" data-quitar="${i}"
                    style="min-height:36px;padding:0 10px">✕</button>
          </div>`;
      }).join('');

      const total = borrador.items.reduce((s, it) => s + it.cantidad * it.precio_unit, 0);

      const recientes = store.todos('ventas')
        .sort((a, b) => (b.numero || 0) - (a.numero || 0))
        .slice(0, 5)
        .map(v => {
          const c = store.uno('clientes', v.cliente_id) || { nombre: '—' };
          const saldo = store.saldoVenta(v.id);
          return `
            <button class="fila" data-venta="${v.id}">
              <div class="fila__cuerpo">
                <div class="fila__titulo">
                  Pedido ${v.numero || 's/n'} · ${esc(c.nombre)}
                  ${store.faltanteVenta(v.id) > 0 ? '<span class="aviso">⚠</span>' : ''}
                </div>
                <div class="fila__detalle">${fmt.fecha(v.fecha)}</div>
              </div>
              <div class="fila__valor">
                <div class="monto">${fmt.pesos(store.totalVenta(v.id))}</div>
                <div class="fila__detalle ${saldo > 0 ? 'aviso' : 'ok'}">
                  ${saldo > 0 ? 'debe' : 'pagado'}
                </div>
              </div>
            </button>`;
        }).join('');

      const vendedores = store.todos('vendedores')
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
      if (!borrador.vendedor && vendedores.length) borrador.vendedor = vendedores[0].nombre;

      const tarjetaDatos = `
        <div class="tarjeta">
          <label class="campo">
            <span class="campo__etiqueta">Vendedor</span>
            <div style="display:flex;gap:8px">
              <select id="vendedor" style="flex:1">
                ${vendedores.length ? '' : '<option value="">sin vendedores todavía</option>'}
                ${vendedores.map(v => `
                  <option value="${esc(v.nombre)}" ${v.nombre === borrador.vendedor ? 'selected' : ''}>
                    ${esc(v.nombre)}
                  </option>`).join('')}
              </select>
              <button class="boton boton--fantasma" id="nuevo-vendedor"
                      style="min-height:48px;padding:0 18px" title="Agregar vendedor">+</button>
            </div>
          </label>
          <label class="campo" style="margin-bottom:0">
            <span class="campo__etiqueta">Método de pago</span>
            <select id="medio">
              ${MEDIOS.map(m => `
                <option value="${m.valor}" ${m.valor === borrador.medio_pago ? 'selected' : ''}>
                  ${m.texto}
                </option>`).join('')}
            </select>
          </label>
        </div>`;

      // Lo que se le vendió la vez pasada, a la vista mientras se arma el
      // pedido. Es la referencia real para poner el precio de hoy.
      const previa = ultimaVenta(borrador.cliente_id);
      let panelPrevia = '';

      if (cliente && previa) {
        const renglones = store.donde('venta_items', 'venta_id', previa.id).map(it => {
          const p = producto(it.producto_id);
          return `
            <button class="previa__fila" data-repetir="${it.producto_id}"
                    data-precio="${store.peso(it.precio_unit)}">
              <span class="previa__nombre">${esc(p.nombre)}</span>
              <span class="previa__cant tenue">${fmt.cant(it.cantidad, p.unidad)}</span>
              <span class="previa__precio monto">${fmt.pesos(it.precio_unit)}</span>
            </button>`;
        }).join('');

        panelPrevia = `
          <div class="tarjeta">
            <div class="tarjeta__titulo">
              Última venta · pedido ${previa.numero || 's/n'} · ${fmt.fecha(previa.fecha)}
            </div>
            ${renglones}
            <div class="previa__pie">
              <span class="tenue">Total</span>
              <span class="monto">${fmt.pesos(store.totalVenta(previa.id))}</span>
            </div>
            <div class="tenue" style="font-size:13px;margin-top:10px">
              Tocá un renglón para venderle lo mismo al mismo precio.
            </div>
          </div>`;
      } else if (cliente) {
        panelPrevia = `
          <div class="tarjeta">
            <div class="tenue">Primera venta a ${esc(cliente.nombre)}.</div>
          </div>`;
      }

      return `
        <button class="fila" id="cliente">
          <div class="fila__cuerpo">
            <div class="fila__detalle">Cliente</div>
            <div class="fila__titulo">${cliente ? esc(cliente.nombre) : 'Tocá para elegir'}</div>
          </div>
          <div class="fila__valor tenue">›</div>
        </button>

        ${tarjetaDatos}

        ${panelPrevia}

        <button class="boton boton--fantasma boton--bloque" id="agregar"
                style="margin:12px 0">+ Agregar producto</button>

        ${items}

        ${borrador.items.length ? `
          <div class="tarjeta" style="margin-top:12px">
            <div class="tarjeta__titulo">Total</div>
            <div style="font-size:26px;font-weight:700;color:var(--marca)">${fmt.pesos(total)}</div>
          </div>
          <button class="boton boton--bloque" id="revisar">Revisar y facturar</button>`
          : ui.vacio('🧾', 'Elegí el cliente y agregá productos.')}

        ${recientes ? `
          <div class="tarjeta__titulo" style="margin:24px 0 8px">Últimos pedidos</div>
          ${recientes}` : ''}`;
    },

    listo(cont) {
      cont.querySelector('#cliente').onclick = () =>
        OM.clientes.elegir(c => { borrador.cliente_id = c.id; ui.render(); });

      cont.querySelector('#vendedor').onchange = e => { borrador.vendedor = e.target.value; };
      cont.querySelector('#medio').onchange = e => { borrador.medio_pago = e.target.value; };
      cont.querySelector('#nuevo-vendedor').onclick = nuevoVendedor;

      cont.querySelector('#agregar').onclick = () => {
        if (!borrador.cliente_id) return ui.aviso('Elegí primero el cliente');
        agregarItem();
      };

      const revisar = cont.querySelector('#revisar');
      if (revisar) revisar.onclick = () => {
        if (!borrador.cliente_id) return ui.aviso('Elegí primero el cliente');
        ui.abrir(pantallaAsignacion({
          titulo: 'Revisar y facturar',
          lineas: borrador.items,
          editarPrecio: true,
          textoConfirmar: 'Confirmar y facturar',
          alConfirmar: facturar
        }));
      };

      cont.querySelectorAll('[data-quitar]').forEach(b => {
        b.onclick = () => { borrador.items.splice(Number(b.dataset.quitar), 1); ui.render(); };
      });

      cont.querySelectorAll('[data-repetir]').forEach(b => {
        b.onclick = () => pedirCantidad(store.uno('productos', b.dataset.repetir),
                                        Number(b.dataset.precio));
      });

      cont.querySelectorAll('[data-venta]').forEach(b => {
        b.onclick = () => ui.abrir(factura(store.uno('ventas', b.dataset.venta)));
      });
    }
  });

  OM.ventas = { factura, textoFactura, completarEntrega };
})();
