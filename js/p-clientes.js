/* Orange Market · clientes y cobros
 *
 * Dos cosas distintas se miran acá y conviene no confundirlas:
 *   · la DEUDA — cuánta plata debe y hace cuántos días
 *   · la ENTREGA INCOMPLETA — producto que se facturó pero todavía no se
 *     despachó, porque no había stock al momento de la venta
 * Un cliente puede estar al día y aun así tener producto pendiente de entrega.
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

  const CONDICIONES = [
    { valor: 'contado', texto: 'De contado' },
    { valor: 'credito', texto: 'A crédito' }
  ];

  const ventasDe = cliente_id =>
    store.donde('ventas', 'cliente_id', cliente_id)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) ||
                      (b.numero || 0) - (a.numero || 0));

  const deudaDe = cliente_id =>
    ventasDe(cliente_id).reduce((s, v) => s + store.saldoVenta(v.id), 0);

  const tienePendiente = cliente_id =>
    ventasDe(cliente_id).some(v => store.faltanteVenta(v.id) > 0);

  const tieneVencida = cliente_id =>
    ventasDe(cliente_id).some(v => store.vencida(v));

  /* ── crear y editar ───────────────────────────────────────────────── */

  const CAMPOS = [
    { nombre: 'nombre',     etiqueta: 'Nombre', requerido: true },
    { nombre: 'telefono',   etiqueta: 'Teléfono' },
    { nombre: 'condicion',  etiqueta: '¿Cómo le vendés?', tipo: 'select', opciones: CONDICIONES },
    { nombre: 'dias_plazo', etiqueta: 'Días de plazo', tipo: 'numero', min: 0, paso: '1',
      ayuda: 'Solo si le vendés a crédito. Pasado ese plazo la deuda se pinta en rojo.' },
    { nombre: 'nota',       etiqueta: 'Nota', tipo: 'area' }
  ];

  const normalizar = datos => {
    if (datos.condicion !== 'credito') datos.dias_plazo = 0;
    return datos;
  };

  function crear(alTerminar) {
    ui.formulario({
      titulo: 'Nuevo cliente',
      campos: CAMPOS,
      valores: { condicion: 'contado', dias_plazo: 0 },
      textoGuardar: 'Crear',
      alGuardar: datos => {
        const cliente = store.guardar('clientes', normalizar(datos));
        if (alTerminar) alTerminar(cliente);
      }
    });
  }

  function editar(cliente) {
    ui.formulario({
      titulo: 'Editar cliente',
      campos: CAMPOS,
      valores: cliente,
      alGuardar: datos => {
        Object.assign(cliente, normalizar(datos));
        store.guardar('clientes', cliente);
      }
    });
  }

  // Un cliente con pedidos no se borra: esos pedidos quedarían sin dueño y el
  // historial dejaría de poder leerse. Primero se anulan los pedidos, que es
  // una decisión distinta y más visible.
  function eliminar(cliente) {
    const ventas = ventasDe(cliente.id);

    if (ventas.length) {
      const debe = deudaDe(cliente.id);
      return ui.hoja({
        titulo: 'No se puede eliminar',
        cuerpo: `
          <p>${esc(cliente.nombre)} tiene ${ventas.length}
             pedido${ventas.length === 1 ? '' : 's'} registrado${ventas.length === 1 ? '' : 's'}.
             Borrarlo dejaría ese historial sin dueño.</p>
          ${debe > 0
            ? `<p class="aviso" style="margin-top:10px">Además te debe ${fmt.pesos(debe)}.</p>`
            : ''}
          <p class="tenue" style="margin-top:10px">
            Si los pedidos fueron un error, anulá cada uno desde su factura y
            después volvé acá.
          </p>`,
        acciones: [{ texto: 'Entendido', clase: 'boton', alClic: c => c() }]
      });
    }

    ui.confirmar('Eliminar a ' + cliente.nombre,
      'No tiene pedidos registrados, así que no se pierde ningún historial.',
      () => {
        store.anular('clientes', cliente.id);
        ui.volver();
        ui.aviso('Cliente eliminado');
      }, 'Eliminar');
  }

  function elegir(alElegir) {
    const clientes = store.todos('clientes').sort((a, b) => a.nombre.localeCompare(b.nombre));

    const lista = clientes.map(c => `
      <button class="fila" data-cliente="${c.id}">
        <div class="fila__cuerpo">
          <div class="fila__titulo">${esc(c.nombre)}</div>
          <div class="fila__detalle">
            ${c.condicion === 'credito' ? 'crédito a ' + (c.dias_plazo || 0) + ' días' : 'de contado'}
          </div>
        </div>
      </button>`).join('');

    ui.hoja({
      titulo: 'Elegir cliente',
      cuerpo: `<input id="buscar" placeholder="Buscar…"
                 style="width:100%;min-height:44px;padding:10px 14px;margin-bottom:12px;
                        background:var(--fondo);border:1px solid var(--linea);
                        border-radius:var(--radio);color:var(--texto);font:inherit">
               <div>${lista || ui.vacio('👤', 'Todavía no hay clientes.')}</div>`,
      acciones: [
        { texto: 'Cancelar', alClic: c => c() },
        { texto: '+ Cliente nuevo', clase: 'boton', alClic: c => { c(); crear(alElegir); } }
      ],
      listo: (velo, cerrar) => {
        const buscar = velo.querySelector('#buscar');
        buscar.oninput = () => {
          const q = buscar.value.toLowerCase();
          velo.querySelectorAll('[data-cliente]').forEach(b => {
            const c = store.uno('clientes', b.dataset.cliente);
            b.style.display = c.nombre.toLowerCase().includes(q) ? '' : 'none';
          });
        };
        velo.querySelectorAll('[data-cliente]').forEach(b => {
          b.onclick = () => { cerrar(); alElegir(store.uno('clientes', b.dataset.cliente)); };
        });
      }
    });
  }

  /* ── cobro ────────────────────────────────────────────────────────── */

  function registrarCobro(venta, titulo, montoSugerido) {
    const saldo = store.saldoVenta(venta.id);
    ui.formulario({
      titulo: titulo || 'Registrar abono',
      campos: [
        { nombre: 'monto', etiqueta: 'Monto', tipo: 'numero', min: 0, paso: '1',
          ayuda: 'Dejalo en 0 si todavía no te paga nada.' },
        { nombre: 'medio', etiqueta: '¿Cómo te paga?', tipo: 'select', opciones: MEDIOS },
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
          return 'Ese abono supera el saldo del pedido, que es ' + fmt.pesos(saldo) + '.';
        }
        if (datos.monto === 0) return;

        store.guardar('movimientos', {
          tipo: 'cobro',
          medio: datos.medio,
          monto: datos.monto,
          fecha: datos.fecha || ui.hoy(),
          venta_id: venta.id,
          compra_id: null,
          nota: ''
        });
        ui.aviso('Abono registrado');
      }
    });
  }

  /* ── detalle del cliente ──────────────────────────────────────────── */

  function detalle(cliente) {
    return {
      titulo: cliente.nombre,
      html() {
        const ventas = ventasDe(cliente.id);
        const debe = deudaDe(cliente.id);

        const filas = ventas.map(v => {
          const saldo = store.saldoVenta(v.id);
          const falta = store.faltanteVenta(v.id);
          const dias = store.diasDesde(v.fecha);
          const vencida = store.vencida(v);

          return `
            <button class="fila" data-venta="${v.id}">
              <div class="fila__cuerpo">
                <div class="fila__titulo">
                  Pedido ${v.numero || 's/n'} · ${fmt.fecha(v.fecha)}
                  ${falta > 0 ? '<span class="pildora pildora--aviso">⚠ incompleto</span>' : ''}
                </div>
                <div class="fila__detalle ${vencida ? 'mal' : ''}">
                  ${saldo > 0 ? 'debe ' + fmt.pesos(saldo) + ' · ' + fmt.dias(dias)
                              : 'pagado'}
                </div>
              </div>
              <div class="fila__valor">
                <div class="monto">${fmt.pesos(store.totalVenta(v.id))}</div>
              </div>
            </button>`;
        }).join('');

        const plazo = cliente.condicion === 'credito'
          ? 'Crédito a ' + (cliente.dias_plazo || 0) + ' días'
          : 'De contado';

        return `
          <div class="tarjeta">
            <div class="tarjeta__titulo">Te debe</div>
            <div style="font-size:30px;font-weight:700;color:${debe > 0 ? 'var(--alerta)' : 'var(--ok)'}">
              ${fmt.pesos(debe)}
            </div>
            <div class="tenue">${plazo}${cliente.telefono ? ' · ' + esc(cliente.telefono) : ''}</div>
            ${tienePendiente(cliente.id)
              ? '<div class="aviso" style="margin-top:8px">⚠ Tiene producto pendiente de entrega.</div>' : ''}
            ${cliente.nota ? `<div class="tenue" style="margin-top:6px">${esc(cliente.nota)}</div>` : ''}
          </div>

          <div class="tarjeta__titulo" style="margin:18px 0 8px">
            Despachos (${ventas.length})
          </div>
          ${filas || ui.vacio('🧾', 'Todavía no le vendés nada a este cliente.')}

          <button class="boton boton--fantasma boton--bloque" id="editar"
                  style="margin-top:18px">Editar cliente</button>
          <button class="boton boton--peligro boton--bloque" id="eliminar"
                  style="margin-top:10px">Eliminar cliente</button>`;
      },
      listo(cont) {
        cont.querySelector('#editar').onclick = () => editar(cliente);
        cont.querySelector('#eliminar').onclick = () => eliminar(cliente);
        cont.querySelectorAll('[data-venta]').forEach(b => {
          b.onclick = () => ui.abrir(OM.ventas.factura(store.uno('ventas', b.dataset.venta)));
        });
      }
    };
  }

  /* ── pantalla ─────────────────────────────────────────────────────── */

  ui.pantalla('clientes', {
    titulo: 'Clientes',
    html() {
      const clientes = store.todos('clientes')
        .map(c => ({ c, debe: deudaDe(c.id) }))
        .sort((a, b) => b.debe - a.debe || a.c.nombre.localeCompare(b.c.nombre));

      const filas = clientes.map(({ c, debe }) => {
        const pendiente = tienePendiente(c.id);
        const vencida = tieneVencida(c.id);
        return `
          <button class="fila" data-ver="${c.id}">
            <div class="fila__cuerpo">
              <div class="fila__titulo">
                ${pendiente ? '<span class="aviso" title="Entrega incompleta">⚠</span> ' : ''}${esc(c.nombre)}
              </div>
              <div class="fila__detalle">
                ${c.condicion === 'credito' ? 'crédito a ' + (c.dias_plazo || 0) + ' días' : 'de contado'}
                ${pendiente ? ' · entrega incompleta' : ''}
              </div>
            </div>
            <div class="fila__valor">
              ${debe > 0
                ? `<div class="monto ${vencida ? 'mal' : 'aviso'}">${fmt.pesos(debe)}</div>
                   <div class="fila__detalle">${vencida ? 'vencido' : 'al día'}</div>`
                : '<span class="pildora">sin deuda</span>'}
            </div>
          </button>`;
      }).join('');

      const cobrar = store.porCobrar();

      return `
        <div class="tarjeta">
          <div class="tarjeta__titulo">Total por cobrar</div>
          <div style="font-size:30px;font-weight:700;color:${cobrar.total > 0 ? 'var(--alerta)' : 'var(--ok)'}">
            ${fmt.pesos(cobrar.total)}
          </div>
          ${cobrar.vencido > 0
            ? `<div class="mal">${fmt.pesos(cobrar.vencido)} vencido · ${fmt.pesos(cobrar.alDia)} al día</div>`
            : '<div class="tenue">nada vencido</div>'}
        </div>

        <button class="boton boton--bloque" id="nuevo" style="margin-bottom:16px">
          + Cliente nuevo
        </button>

        ${filas || ui.vacio('👤', 'Todavía no hay clientes. Creá el primero.')}`;
    },
    listo(cont) {
      cont.querySelector('#nuevo').onclick = () => crear();
      cont.querySelectorAll('[data-ver]').forEach(b => {
        b.onclick = () => ui.abrir(detalle(store.uno('clientes', b.dataset.ver)));
      });
    }
  });

  OM.clientes = { crear, editar, eliminar, elegir, detalle, registrarCobro,
                  ventasDe, deudaDe };
})();
