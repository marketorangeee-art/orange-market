/* Orange Market · inventario y catálogo de productos
 *
 * El inventario no es una tabla: es la suma de lo que queda vivo en cada lote.
 * Por eso el detalle de un producto puede decir en qué pedido y de qué
 * proveedor está cada kilo.
 */
(function () {
  'use strict';

  const store = OM.store;
  const ui = OM.ui;
  const { fmt, esc } = ui;

  const UNIDADES = [
    { valor: 'kilo_neto', texto: 'Kilo neto (sin hielo ni glaseo)' },
    { valor: 'kilo',      texto: 'Kilo' },
    { valor: 'libra',     texto: 'Libra' },
    { valor: 'unidad',    texto: 'Unidad' }
  ];

  const nombreProveedor = id => {
    const p = store.uno('proveedores', id);
    return p ? p.nombre : 'proveedor borrado';
  };

  /* ── crear y editar producto ──────────────────────────────────────── */

  function crear(alTerminar) {
    ui.formulario({
      titulo: 'Nuevo producto',
      campos: [
        { nombre: 'nombre', etiqueta: 'Nombre del producto', requerido: true,
          sugerencia: 'Salmón, camarón tigre…' },
        { nombre: 'unidad', etiqueta: 'Unidad', tipo: 'select', opciones: UNIDADES }
      ],
      valores: { unidad: 'kilo' },
      textoGuardar: 'Crear',
      alGuardar: datos => {
        const repetido = store.todos('productos')
          .some(p => p.nombre.toLowerCase() === datos.nombre.toLowerCase());
        if (repetido) return 'Ya existe un producto con ese nombre.';

        const producto = store.guardar('productos', {
          nombre: datos.nombre, unidad: datos.unidad
        });
        if (alTerminar) alTerminar(producto);
      }
    });
  }

  function editar(producto) {
    ui.formulario({
      titulo: 'Editar producto',
      campos: [
        { nombre: 'nombre', etiqueta: 'Nombre del producto', requerido: true },
        { nombre: 'unidad', etiqueta: 'Unidad', tipo: 'select', opciones: UNIDADES }
      ],
      valores: producto,
      alGuardar: datos => {
        producto.nombre = datos.nombre;
        producto.unidad = datos.unidad;
        store.guardar('productos', producto);
      }
    });
  }

  // Un producto que ya se compró o se vendió no se borra: sus lotes y sus
  // ventas quedarían sin nombre y el historial dejaría de poder leerse.
  function eliminar(producto) {
    const compras = store.donde('compra_items', 'producto_id', producto.id).length;
    const ventas = store.donde('venta_items', 'producto_id', producto.id).length;

    if (compras || ventas) {
      const partes = [];
      if (compras) partes.push(compras + (compras === 1 ? ' compra' : ' compras'));
      if (ventas) partes.push(ventas + (ventas === 1 ? ' venta' : ' ventas'));
      return ui.hoja({
        titulo: 'No se puede eliminar',
        cuerpo: `
          <p>${esc(producto.nombre)} aparece en ${partes.join(' y ')}.
             Borrarlo dejaría ese historial sin nombre.</p>
          <p class="tenue" style="margin-top:10px">
            Si no lo vas a usar más, dejalo: sin existencias no estorba, queda
            al final del inventario.
          </p>`,
        acciones: [{ texto: 'Entendido', clase: 'boton', alClic: c => c() }]
      });
    }

    ui.confirmar('Eliminar ' + producto.nombre,
      'Nunca se compró ni se vendió, así que no se pierde ningún historial.',
      () => {
        store.anular('productos', producto.id);
        ui.volver();
        ui.aviso('Producto eliminado');
      }, 'Eliminar');
  }

  // Selector reutilizable: lo usa la compra y lo va a usar la venta. Deja crear
  // el producto ahí mismo, porque en medio de cargar una compra nadie quiere
  // irse a otra pestaña.
  function elegir(alElegir) {
    const productos = store.todos('productos')
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    const lista = productos.map(p => `
      <button class="fila" data-producto="${p.id}">
        <div class="fila__cuerpo">
          <div class="fila__titulo">${esc(p.nombre)}</div>
          <div class="fila__detalle">${fmt.cant(store.stock(p.id), p.unidad)} en stock</div>
        </div>
      </button>`).join('');

    const { cerrar } = ui.hoja({
      titulo: 'Elegir producto',
      cuerpo: `<input id="buscar" placeholder="Buscar…"
                 style="width:100%;min-height:44px;padding:10px 14px;margin-bottom:12px;
                        background:var(--fondo);border:1px solid var(--linea);
                        border-radius:var(--radio);color:var(--texto);font:inherit">
               <div id="lista">${lista || ui.vacio('📦', 'Todavía no hay productos.')}</div>`,
      acciones: [
        { texto: 'Cancelar', alClic: c => c() },
        { texto: '+ Producto nuevo', clase: 'boton',
          alClic: c => { c(); crear(p => alElegir(p)); } }
      ],
      listo: (velo, cerrarHoja) => {
        const buscar = velo.querySelector('#buscar');
        buscar.oninput = () => {
          const q = buscar.value.toLowerCase();
          velo.querySelectorAll('[data-producto]').forEach(b => {
            const p = store.uno('productos', b.dataset.producto);
            b.style.display = p.nombre.toLowerCase().includes(q) ? '' : 'none';
          });
        };
        velo.querySelectorAll('[data-producto]').forEach(b => {
          b.onclick = () => {
            cerrarHoja();
            alElegir(store.uno('productos', b.dataset.producto));
          };
        });
      }
    });
    return cerrar;
  }

  /* ── detalle de un producto ───────────────────────────────────────── */

  function detalle(producto) {
    return {
      titulo: producto.nombre,
      html() {
        const lotes = store.lotesDe(producto.id, true);
        const total = store.stock(producto.id);
        const valor = lotes.reduce((s, l) => s + l.restante * l.costo_unit, 0);

        const filas = lotes.map(l => `
          <div class="fila" style="cursor:default">
            <div class="fila__cuerpo">
              <div class="fila__titulo">${fmt.cant(l.restante, producto.unidad)}</div>
              <div class="fila__detalle">
                Pedido ${l.pedido || '—'} · ${esc(nombreProveedor(l.proveedor_id))} · ${fmt.fecha(l.fecha)}
              </div>
            </div>
            <div class="fila__valor">
              <div class="monto">${fmt.pesos(l.costo_unit)}</div>
              <div class="fila__detalle">por ${fmt.unidad(producto.unidad)}</div>
            </div>
          </div>`).join('');

        const gastados = store.lotesDe(producto.id, false).filter(l => l.restante <= 0);

        return `
          <div class="tarjeta">
            <div class="tarjeta__titulo">En existencia</div>
            <div style="font-size:30px;font-weight:700;color:var(--marca)">
              ${fmt.cant(total, producto.unidad)}
            </div>
            <div class="tenue">${fmt.pesos(valor)} a costo</div>
          </div>

          <div class="tarjeta__titulo" style="margin:18px 0 8px">
            De dónde salió cada ${fmt.unidad(producto.unidad)}
          </div>
          ${filas || ui.vacio('📭', 'Sin existencias. Registrá una compra.')}

          ${gastados.length ? `
            <div class="tarjeta__titulo" style="margin:18px 0 8px">Lotes agotados</div>
            ${gastados.map(l => `
              <div class="fila tenue" style="cursor:default;opacity:.65">
                <div class="fila__cuerpo">
                  <div class="fila__titulo">${fmt.cant(l.cantidad, producto.unidad)} · agotado</div>
                  <div class="fila__detalle">Pedido ${l.pedido || '—'} · ${esc(nombreProveedor(l.proveedor_id))} · ${fmt.fecha(l.fecha)}</div>
                </div>
                <div class="fila__valor monto">${fmt.pesos(l.costo_unit)}</div>
              </div>`).join('')}` : ''}

          <button class="boton boton--fantasma boton--bloque" id="editar"
                  style="margin-top:18px">Editar producto</button>
          <button class="boton boton--peligro boton--bloque" id="eliminar"
                  style="margin-top:10px">Eliminar producto</button>`;
      },
      listo(cont) {
        cont.querySelector('#editar').onclick = () => editar(producto);
        cont.querySelector('#eliminar').onclick = () => eliminar(producto);
      }
    };
  }

  /* ── pantalla ─────────────────────────────────────────────────────── */

  ui.pantalla('inventario', {
    titulo: 'Inventario',
    html() {
      const productos = store.todos('productos')
        .map(p => ({ p, stock: store.stock(p.id) }))
        .sort((a, b) => (b.stock > 0) - (a.stock > 0) || a.p.nombre.localeCompare(b.p.nombre));

      const filas = productos.map(({ p, stock }) => {
        const valor = store.lotesDe(p.id, true)
          .reduce((s, l) => s + l.restante * l.costo_unit, 0);
        return `
          <button class="fila" data-ver="${p.id}">
            <div class="fila__cuerpo">
              <div class="fila__titulo">${esc(p.nombre)}</div>
              <div class="fila__detalle ${stock > 0 ? '' : 'mal'}">
                ${stock > 0 ? fmt.pesos(valor) + ' a costo' : 'sin existencias'}
              </div>
            </div>
            <div class="fila__valor">
              <div class="monto ${stock > 0 ? '' : 'tenue'}">${fmt.cant(stock, p.unidad)}</div>
            </div>
          </button>`;
      }).join('');

      return `
        <div class="tarjeta">
          <div class="tarjeta__titulo">Valor del inventario</div>
          <div style="font-size:30px;font-weight:700;color:var(--marca)">
            ${fmt.pesos(store.valorStock())}
          </div>
          <div class="tenue">${(n => n === 1 ? '1 producto con existencias'
                                             : n + ' productos con existencias')
                               (productos.filter(x => x.stock > 0).length)}</div>
        </div>

        <button class="boton boton--bloque" id="nuevo" style="margin-bottom:16px">
          + Producto nuevo
        </button>

        ${filas || ui.vacio('📦', 'Todavía no hay productos. Creá el primero.')}`;
    },
    listo(cont) {
      cont.querySelector('#nuevo').onclick = () => crear();
      cont.querySelectorAll('[data-ver]').forEach(b => {
        b.onclick = () => ui.abrir(detalle(store.uno('productos', b.dataset.ver)));
      });
    }
  });

  OM.productos = { crear, editar, eliminar, elegir, UNIDADES };
})();
