/* Orange Market · cáscara, navegación y piezas compartidas
 *
 * Cada pantalla se registra con OM.ui.pantalla(id, { titulo, html, listo }) y
 * no sabe nada de las demás. render() repinta todo el contenido en cada cambio:
 * el volumen de un día de trabajo es chico y así ninguna pantalla queda
 * desfasada del dato real.
 */
(function () {
  'use strict';

  const VERSION = '1.0';
  const store = OM.store;

  /* ── formato ──────────────────────────────────────────────────────── */

  const nf0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const ABREV = { kilo: 'kg', libra: 'lb', unidad: 'un' };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmt = {
    pesos: n => '$ ' + nf0.format(Math.round(Number(n) || 0)),
    cant:  (n, u) => nf1.format(Number(n) || 0) + (u ? ' ' + (ABREV[u] || u) : ''),
    unidad: u => ABREV[u] || u,
    fecha: f => {
      if (!f) return '';
      const p = String(f).slice(0, 10).split('-');
      const anio = Number(p[0]), mes = Number(p[1]), dia = Number(p[2]);
      const esteAnio = new Date().getFullYear();
      return dia + ' ' + MESES[mes - 1] + (anio === esteAnio ? '' : ' ' + anio);
    },
    dias: n => n <= 0 ? 'hoy' : n === 1 ? 'hace 1 día' : 'hace ' + n + ' días'
  };

  const hoy = () => {
    const d = new Date();
    const dos = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
  };

  /* ── navegación ───────────────────────────────────────────────────── */

  const ICONOS = {
    venta:       '<path d="M3 4h2.2l2.3 11.1a1.8 1.8 0 0 0 1.8 1.4h7.9a1.8 1.8 0 0 0 1.8-1.4L20.5 8H6"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
    proveedores: '<path d="M3 16.5V6h10.5v10.5M13.5 9.5H18l3 3v4h-2.5"/><circle cx="7" cy="17.5" r="2"/><circle cx="16.5" cy="17.5" r="2"/>',
    inventario:  '<path d="M12 3 3 7.8v8.4L12 21l9-4.8V7.8L12 3z"/><path d="M3 7.8 12 12.6l9-4.8M12 12.6V21"/>',
    clientes:    '<circle cx="9.2" cy="8" r="3.2"/><path d="M3.5 19.5a5.7 5.7 0 0 1 11.4 0"/><path d="M15.8 5.2a3.2 3.2 0 0 1 0 5.6M17 19.5a5.7 5.7 0 0 0-1.6-4"/>',
    resumen:     '<path d="M4 20V11M9.3 20V5M14.7 20v-6M20 20V8"/>'
  };

  const PESTANAS = [
    { id: 'venta',       texto: 'Venta' },
    { id: 'proveedores', texto: 'Proveedores' },
    { id: 'inventario',  texto: 'Inventario' },
    { id: 'clientes',    texto: 'Clientes' },
    { id: 'resumen',     texto: 'Resumen' }
  ];

  const pantallas = {};
  let actual = 'inventario';
  let pila = [];          // pantallas de detalle abiertas encima de la pestaña

  function pantalla(id, def) { pantallas[id] = def; }

  function ir(id) {
    actual = id;
    pila = [];
    render();
    document.getElementById('contenido').scrollTo(0, 0);
  }

  // Abre un detalle encima de la pestaña actual. El botón atrás de la cabecera
  // lo cierra; no se toca la pestaña de abajo.
  function abrir(def) {
    pila.push(def);
    render();
  }

  function volver() {
    pila.pop();
    render();
  }

  /* ── pintado ──────────────────────────────────────────────────────── */

  function render() {
    const vista = pila.length ? pila[pila.length - 1] : pantallas[actual];
    const contenido = document.getElementById('contenido');

    if (!vista) {
      contenido.innerHTML = vacio('🛠️', 'Todavía no está lista esta pestaña.');
    } else {
      contenido.innerHTML = vista.html();
      if (vista.listo) vista.listo(contenido);
    }

    pintarCabecera(vista);
    pintarNav();
  }

  function pintarCabecera(vista) {
    const titulo = vista && vista.titulo ? vista.titulo : '';
    const logo = document.querySelector('.cabecera__logo');
    const derecha = document.getElementById('cabecera-derecha');
    const cabecera = document.querySelector('.cabecera');

    let atras = document.getElementById('atras');
    if (pila.length) {
      if (!atras) {
        atras = document.createElement('button');
        atras.id = 'atras';
        atras.className = 'boton boton--fantasma';
        atras.style.cssText = 'min-height:36px;padding:0 12px';
        atras.textContent = '‹ Atrás';
        atras.onclick = volver;
        cabecera.insertBefore(atras, logo);
      }
      logo.style.display = 'none';
    } else {
      if (atras) atras.remove();
      logo.style.display = '';
    }

    let t = document.getElementById('titulo');
    if (!t) {
      t = document.createElement('span');
      t.id = 'titulo';
      t.className = 'cabecera__titulo';
      cabecera.insertBefore(t, derecha);
    }
    t.textContent = titulo;
  }

  function pintarNav() {
    const nav = document.getElementById('nav');
    nav.innerHTML = PESTANAS.map(p => `
      <button class="nav__item ${p.id === actual ? 'nav__item--activo' : ''}" data-ir="${p.id}">
        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">${ICONOS[p.id]}</svg>
        <span>${p.texto}</span>
      </button>`).join('');
    nav.querySelectorAll('[data-ir]').forEach(b => {
      b.onclick = () => ir(b.dataset.ir);
    });
  }

  /* ── piezas sueltas ───────────────────────────────────────────────── */

  const vacio = (icono, texto) =>
    `<div class="vacio"><div class="vacio__icono">${icono}</div>${esc(texto)}</div>`;

  function aviso(texto, clase) {
    const n = document.createElement('div');
    n.className = 'flotante ' + (clase || '');
    n.textContent = texto;
    document.body.appendChild(n);
    setTimeout(() => n.classList.add('flotante--fuera'), 2200);
    setTimeout(() => n.remove(), 2600);
  }

  function hoja(opciones) {
    const velo = document.createElement('div');
    velo.className = 'velo';
    velo.innerHTML = `<div class="hoja">
      <div class="hoja__titulo">${esc(opciones.titulo)}</div>
      <div class="hoja__cuerpo">${opciones.cuerpo || ''}</div>
      <div class="hoja__acciones"></div>
    </div>`;

    const cerrar = () => velo.remove();
    velo.onclick = e => { if (e.target === velo) cerrar(); };

    const acciones = velo.querySelector('.hoja__acciones');
    (opciones.acciones || []).forEach(a => {
      const b = document.createElement('button');
      b.className = 'boton ' + (a.clase || 'boton--fantasma');
      b.textContent = a.texto;
      b.onclick = () => a.alClic(cerrar, velo);
      acciones.appendChild(b);
    });

    document.body.appendChild(velo);
    if (opciones.listo) opciones.listo(velo, cerrar);
    return { velo, cerrar };
  }

  // Formulario armado desde una lista de campos. Lo usan todas las pantallas,
  // así que un arreglo de estilo o de validación se hace una sola vez.
  function formulario(opciones) {
    const valores = Object.assign({}, opciones.valores || {});

    const campoHtml = c => {
      const v = valores[c.nombre] == null ? '' : valores[c.nombre];
      let control;
      if (c.tipo === 'select') {
        control = `<select name="${c.nombre}">` + (c.opciones || []).map(o =>
          `<option value="${esc(o.valor)}" ${String(o.valor) === String(v) ? 'selected' : ''}>${esc(o.texto)}</option>`
        ).join('') + '</select>';
      } else if (c.tipo === 'area') {
        control = `<textarea name="${c.nombre}" rows="2">${esc(v)}</textarea>`;
      } else {
        const extra = c.tipo === 'numero'
          ? ` inputmode="decimal" step="${c.paso || 'any'}"${c.min != null ? ' min="' + c.min + '"' : ''}`
          : '';
        const tipo = c.tipo === 'numero' ? 'number' : c.tipo === 'fecha' ? 'date' : 'text';
        control = `<input type="${tipo}" name="${c.nombre}" value="${esc(v)}"${extra}
                     ${c.autofoco ? 'autofocus' : ''} ${c.sugerencia ? 'placeholder="' + esc(c.sugerencia) + '"' : ''}>`;
      }
      return `<label class="campo">
                <span class="campo__etiqueta">${esc(c.etiqueta)}</span>${control}
                ${c.ayuda ? `<span class="campo__ayuda">${c.ayuda}</span>` : ''}
              </label>`;
    };

    const cuerpo = `<form id="form-hoja">
        ${(opciones.campos || []).map(campoHtml).join('')}
        <div class="campo__error mal" id="form-error" hidden></div>
      </form>`;

    return hoja({
      titulo: opciones.titulo,
      cuerpo: cuerpo,
      acciones: [
        { texto: 'Cancelar', alClic: cerrar => cerrar() },
        {
          texto: opciones.textoGuardar || 'Guardar',
          clase: 'boton',
          alClic: (cerrar, velo) => {
            const form = velo.querySelector('#form-hoja');
            const datos = {};
            (opciones.campos || []).forEach(c => {
              const el = form.elements[c.nombre];
              datos[c.nombre] = c.tipo === 'numero' ? Number(el.value) : el.value.trim();
            });

            const faltante = (opciones.campos || []).find(c =>
              c.requerido && (datos[c.nombre] === '' || datos[c.nombre] == null ||
                             (c.tipo === 'numero' && !(datos[c.nombre] > 0))));
            if (faltante) return mostrarError(velo, 'Falta ' + faltante.etiqueta.toLowerCase() + '.');

            const problema = opciones.alGuardar(datos);
            if (problema) return mostrarError(velo, problema);
            cerrar();
            render();
          }
        }
      ],
      listo: velo => {
        const primero = velo.querySelector('input, select, textarea');
        if (primero) setTimeout(() => primero.focus(), 50);
      }
    });
  }

  function mostrarError(velo, texto) {
    const e = velo.querySelector('#form-error');
    e.textContent = texto;
    e.hidden = false;
  }

  function confirmar(titulo, texto, alAceptar, textoBoton) {
    hoja({
      titulo: titulo,
      cuerpo: `<p class="tenue">${esc(texto)}</p>`,
      acciones: [
        { texto: 'Cancelar', alClic: cerrar => cerrar() },
        { texto: textoBoton || 'Confirmar', clase: 'boton boton--peligro',
          alClic: cerrar => { cerrar(); alAceptar(); render(); } }
      ]
    });
  }

  /* ── arranque ─────────────────────────────────────────────────────── */

  function arrancar() {
    render();
  }

  window.OM = window.OM || {};
  window.OM.ui = {
    VERSION, arrancar, pantalla, ir, abrir, volver, render,
    fmt, esc, hoy, vacio, aviso, hoja, formulario, confirmar
  };
})();
