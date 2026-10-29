/* Orange Market · resumen financiero
 *
 * Responde una sola pregunta: dónde está la plata del negocio ahora mismo.
 * Son cinco bolsas y ninguna se guarda calculada:
 *
 *   efectivo + cuenta + lo que te deben + el stock − lo que debés = capital
 *
 * La utilidad va ANTES de gastos distintos al producto: el costo de algo es lo
 * que le pagaste al proveedor por eso, y nada más. Flete, hielo y empaque no
 * entran en este número.
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

  let periodo = 'mes';

  function rango() {
    const h = ui.hoy();
    if (periodo === 'hoy') return { desde: h, hasta: h, texto: 'hoy' };
    if (periodo === 'mes') return { desde: h.slice(0, 8) + '01', hasta: h, texto: 'este mes' };
    return { desde: null, hasta: null, texto: 'desde el principio' };
  }

  const nombreCliente = id => (store.uno('clientes', id) || { nombre: '—' }).nombre;
  const nombreProveedor = id => (store.uno('proveedores', id) || { nombre: '—' }).nombre;

  const movimientosCapital = () => store.todos('movimientos')
    .filter(m => m.tipo === 'apertura' || m.tipo === 'retiro')
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) ||
                    String(b.updated_at).localeCompare(String(a.updated_at)));

  /* ── ingresar capital y retirar ───────────────────────────────────── */

  function ingresarCapital() {
    const hayApertura = store.todos('movimientos').some(m => m.tipo === 'apertura');
    ui.formulario({
      titulo: hayApertura ? 'Ingresar capital' : 'Cargar saldo inicial',
      campos: [
        { nombre: 'monto', etiqueta: 'Monto', tipo: 'numero', min: 0, paso: '1', requerido: true,
          ayuda: hayApertura ? '' : 'Con cuánta plata arranca el negocio en esta bolsa.' },
        { nombre: 'medio', etiqueta: '¿Dónde está?', tipo: 'select', opciones: MEDIOS },
        { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' },
        { nombre: 'nota',  etiqueta: 'Nota' }
      ],
      valores: { medio: 'efectivo', fecha: ui.hoy(), nota: hayApertura ? '' : 'Saldo inicial' },
      textoGuardar: 'Registrar',
      alGuardar: datos => {
        store.guardar('movimientos', {
          tipo: 'apertura',
          medio: datos.medio,
          monto: datos.monto,
          fecha: datos.fecha || ui.hoy(),
          venta_id: null,
          compra_id: null,
          nota: datos.nota
        });
        ui.aviso('Capital registrado');
      }
    });
  }

  function retirar() {
    const caja = store.disponible();
    ui.formulario({
      titulo: 'Retirar ganancia',
      campos: [
        { nombre: 'monto', etiqueta: 'Monto', tipo: 'numero', min: 0, paso: '1', requerido: true },
        { nombre: 'medio', etiqueta: '¿De dónde lo sacás?', tipo: 'select', opciones: MEDIOS,
          ayuda: `Hay ${fmt.pesos(caja.efectivo)} en efectivo y
                  ${fmt.pesos(caja.transferencia)} en la cuenta.` },
        { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'fecha' },
        { nombre: 'nota',  etiqueta: 'Para qué' }
      ],
      valores: { medio: 'efectivo', fecha: ui.hoy() },
      textoGuardar: 'Retirar',
      alGuardar: datos => {
        store.guardar('movimientos', {
          tipo: 'retiro',
          medio: datos.medio,
          monto: datos.monto,
          fecha: datos.fecha || ui.hoy(),
          venta_id: null,
          compra_id: null,
          nota: datos.nota
        });
        ui.aviso('Retiro registrado');
      }
    });
  }

  /* ── detalles ─────────────────────────────────────────────────────── */

  function detalleCobrar() {
    return {
      titulo: 'Cuentas por cobrar',
      html() {
        const r = store.porCobrar();
        const filas = r.detalle.map(d => `
          <button class="fila" data-venta="${d.venta_id}">
            <div class="fila__cuerpo">
              <div class="fila__titulo">${esc(nombreCliente(d.cliente_id))}</div>
              <div class="fila__detalle ${d.vencido ? 'mal' : ''}">
                Pedido ${d.numero || 's/n'} · ${fmt.dias(d.dias)}${d.vencido ? ' · vencido' : ''}
              </div>
            </div>
            <div class="fila__valor monto ${d.vencido ? 'mal' : 'aviso'}">${fmt.pesos(d.saldo)}</div>
          </button>`).join('');

        return `
          <div class="rejilla">
            <div class="tarjeta">
              <div class="tarjeta__titulo">Al día</div>
              <div class="monto" style="font-size:22px">${fmt.pesos(r.alDia)}</div>
            </div>
            <div class="tarjeta">
              <div class="tarjeta__titulo">Vencido</div>
              <div class="monto mal" style="font-size:22px">${fmt.pesos(r.vencido)}</div>
            </div>
          </div>
          <div class="tarjeta__titulo" style="margin:18px 0 8px">Del más viejo al más nuevo</div>
          ${filas || ui.vacio('✅', 'Nadie te debe nada.')}`;
      },
      listo(cont) {
        cont.querySelectorAll('[data-venta]').forEach(b => {
          b.onclick = () => ui.abrir(OM.ventas.factura(store.uno('ventas', b.dataset.venta)));
        });
      }
    };
  }

  function detallePagar() {
    return {
      titulo: 'Cuentas por pagar',
      html() {
        const r = store.porPagar();
        const filas = r.detalle.map(d => `
          <button class="fila" data-compra="${d.compra_id}">
            <div class="fila__cuerpo">
              <div class="fila__titulo">${esc(nombreProveedor(d.proveedor_id))}</div>
              <div class="fila__detalle">Pedido ${d.numero || 's/n'} · ${fmt.fecha(d.fecha)}</div>
            </div>
            <div class="fila__valor monto aviso">${fmt.pesos(d.saldo)}</div>
          </button>`).join('');

        return `
          <div class="tarjeta">
            <div class="tarjeta__titulo">Total que debés</div>
            <div style="font-size:28px;font-weight:700;color:var(--alerta)">${fmt.pesos(r.total)}</div>
          </div>
          ${filas || ui.vacio('✅', 'No le debés nada a nadie.')}`;
      },
      listo(cont) {
        cont.querySelectorAll('[data-compra]').forEach(b => {
          b.onclick = () => ui.abrir(OM.compras.detalle(store.uno('compras', b.dataset.compra)));
        });
      }
    };
  }

  function detalleCapital() {
    return {
      titulo: 'Capital y retiros',
      html() {
        const movs = movimientosCapital();
        const retirado = movs.filter(m => m.tipo === 'retiro')
          .reduce((s, m) => s + store.peso(m.monto), 0);
        const puesto = movs.filter(m => m.tipo === 'apertura')
          .reduce((s, m) => s + store.peso(m.monto), 0);

        const filas = movs.map(m => {
          const esRetiro = m.tipo === 'retiro';
          return `
            <div class="fila" style="cursor:default">
              <div class="fila__cuerpo">
                <div class="fila__titulo">${esRetiro ? 'Retiro' : 'Capital ingresado'}</div>
                <div class="fila__detalle">
                  ${esc(m.medio)} · ${fmt.fecha(m.fecha)}${m.nota ? ' · ' + esc(m.nota) : ''}
                </div>
              </div>
              <div class="fila__valor monto ${esRetiro ? 'mal' : 'ok'}">
                ${esRetiro ? '−' : '+'} ${fmt.pesos(m.monto)}
              </div>
            </div>`;
        }).join('');

        // Lo primero que hay que ver acá es cuánto hay AHORA, no cuánto se
        // puso alguna vez: es el número contra el que se decide un retiro.
        const caja = store.disponible();
        const debes = store.porPagar().total;

        return `
          <div class="tarjeta">
            <div class="tarjeta__titulo">Disponible ahora</div>
            <div style="font-size:30px;font-weight:700;color:${caja.total < 0 ? 'var(--mal)' : 'var(--marca)'}">
              ${fmt.pesos(caja.total)}
            </div>
            <div class="previa__pie" style="border-top:1px solid var(--linea);margin-top:10px">
              <span class="tenue">En efectivo</span>
              <span class="monto ${caja.efectivo < 0 ? 'mal' : ''}">${fmt.pesos(caja.efectivo)}</span>
            </div>
            <div class="previa__pie">
              <span class="tenue">En la cuenta</span>
              <span class="monto ${caja.transferencia < 0 ? 'mal' : ''}">${fmt.pesos(caja.transferencia)}</span>
            </div>
            ${debes > 0 ? `
              <div class="aviso" style="margin-top:12px;font-size:14px">
                Ojo: de esa plata, ${fmt.pesos(debes)} ya están comprometidos con
                proveedores. Libre quedarían ${fmt.pesos(caja.total - debes)}.
              </div>` : ''}
          </div>

          <div class="rejilla">
            <div class="tarjeta">
              <div class="tarjeta__titulo">Capital puesto</div>
              <div class="monto ok" style="font-size:22px">${fmt.pesos(puesto)}</div>
            </div>
            <div class="tarjeta">
              <div class="tarjeta__titulo">Retirado</div>
              <div class="monto mal" style="font-size:22px">${fmt.pesos(retirado)}</div>
            </div>
          </div>

          <div style="display:flex;gap:10px;margin:16px 0">
            <button class="boton" style="flex:1" id="ingresar">+ Capital</button>
            <button class="boton boton--fantasma" style="flex:1" id="retirar">Retirar</button>
          </div>

          ${filas || ui.vacio('💵', 'Todavía no hay movimientos de capital.')}`;
      },
      listo(cont) {
        cont.querySelector('#ingresar').onclick = ingresarCapital;
        cont.querySelector('#retirar').onclick = retirar;
      }
    };
  }

  /* ── pantalla ─────────────────────────────────────────────────────── */

  ui.pantalla('resumen', {
    titulo: 'Resumen',
    html() {
      const r = store.resumen();
      const p = rango();
      const utilidad = store.utilidad(p.desde, p.hasta);
      const hayApertura = store.todos('movimientos').some(m => m.tipo === 'apertura');

      const boton = (id, texto) => `
        <button class="periodo ${periodo === id ? 'periodo--activo' : ''}" data-periodo="${id}">
          ${texto}
        </button>`;

      return `
        <div class="tarjeta">
          <div class="tarjeta__titulo">Capital total del negocio</div>
          <div style="font-size:34px;font-weight:700;color:var(--marca)">${fmt.pesos(r.capital)}</div>
          <div class="tenue">efectivo + cuenta + por cobrar + stock − por pagar</div>
        </div>

        <div class="tarjeta__titulo" style="margin:18px 0 8px">Disponible para invertir</div>
        <div class="rejilla">
          <div class="tarjeta">
            <div class="tarjeta__titulo">Efectivo</div>
            <div class="monto ${r.efectivo < 0 ? 'mal' : ''}" style="font-size:24px">
              ${fmt.pesos(r.efectivo)}
            </div>
          </div>
          <div class="tarjeta">
            <div class="tarjeta__titulo">En cuenta</div>
            <div class="monto ${r.transferencia < 0 ? 'mal' : ''}" style="font-size:24px">
              ${fmt.pesos(r.transferencia)}
            </div>
          </div>
        </div>

        ${!hayApertura ? `
          <div class="tarjeta" style="border-color:rgba(255,181,61,.4)">
            <div class="aviso">Todavía no cargaste el saldo inicial.</div>
            <div class="tenue" style="margin:6px 0 12px">
              Hasta que lo cargues, el disponible solo refleja lo que entró y salió por la app.
            </div>
            <button class="boton boton--bloque" id="inicial">Cargar saldo inicial</button>
          </div>` : ''}

        <div class="tarjeta__titulo" style="margin:18px 0 8px">Dónde está el resto</div>

        <button class="fila" id="cobrar">
          <div class="fila__cuerpo">
            <div class="fila__titulo">Te deben</div>
            <div class="fila__detalle ${r.porCobrar.vencido > 0 ? 'mal' : ''}">
              ${r.porCobrar.vencido > 0
                ? fmt.pesos(r.porCobrar.vencido) + ' vencido'
                : 'nada vencido'}
            </div>
          </div>
          <div class="fila__valor monto">${fmt.pesos(r.porCobrar.total)}</div>
        </button>

        <button class="fila" id="stock">
          <div class="fila__cuerpo">
            <div class="fila__titulo">Stock de productos</div>
            <div class="fila__detalle">valorado a lo que te costó</div>
          </div>
          <div class="fila__valor monto">${fmt.pesos(r.valorStock)}</div>
        </button>

        <button class="fila" id="pagar">
          <div class="fila__cuerpo">
            <div class="fila__titulo">Debés a proveedores</div>
            <div class="fila__detalle">se resta del capital</div>
          </div>
          <div class="fila__valor monto ${r.porPagar.total > 0 ? 'aviso' : ''}">
            − ${fmt.pesos(r.porPagar.total)}
          </div>
        </button>

        <div class="tarjeta" style="margin-top:18px">
          <div class="tarjeta__titulo">Utilidad ${esc(p.texto)}</div>
          <div class="monto ok" style="font-size:28px">${fmt.pesos(utilidad)}</div>
          <div class="tenue" style="margin-bottom:12px">
            Antes de gastos distintos al producto. Solo cuenta lo entregado.
          </div>
          <div class="periodos">
            ${boton('hoy', 'Hoy')}${boton('mes', 'Este mes')}${boton('todo', 'Todo')}
          </div>
        </div>

        <button class="boton boton--bloque" id="capital" style="margin-top:16px">
          Capital y retiros
        </button>`;
    },

    listo(cont) {
      cont.querySelector('#cobrar').onclick = () => ui.abrir(detalleCobrar());
      cont.querySelector('#pagar').onclick  = () => ui.abrir(detallePagar());
      cont.querySelector('#stock').onclick  = () => ui.ir('inventario');
      cont.querySelector('#capital').onclick = () => ui.abrir(detalleCapital());

      const inicial = cont.querySelector('#inicial');
      if (inicial) inicial.onclick = ingresarCapital;

      cont.querySelectorAll('[data-periodo]').forEach(b => {
        b.onclick = () => { periodo = b.dataset.periodo; ui.render(); };
      });
    }
  });

  OM.resumen = { ingresarCapital, retirar };
})();
