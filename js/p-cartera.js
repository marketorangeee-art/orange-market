/* Orange Market · calendario de recuperación de cartera
 *
 * Muestra en qué día debería entrar cada peso que está pendiente de cobro: la
 * fecha del pedido más el plazo que tiene ese cliente. Al de contado le tocaba
 * el mismo día.
 *
 * Sirve para dos cosas distintas y las dos importan: ver lo que ya se venció
 * (rojo, hacia atrás en el calendario) y saber qué se espera esta semana
 * (adelante), que es con lo que se planea una compra.
 */
(function () {
  'use strict';

  const store = OM.store;
  const ui = OM.ui;
  const { fmt, esc } = ui;

  const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // Todo en UTC: con la hora local, un Date del día 1 a medianoche se corre al
  // mes anterior según la zona horaria.
  const diasEnMes = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate();
  const columnaDe = (a, m, d) => (new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7;
  const comoTexto = (a, m, d) =>
    a + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');

  const nombreCliente = id => (store.uno('clientes', id) || { nombre: '—' }).nombre;

  /* ── el detalle de un día ─────────────────────────────────────────── */

  function verDia(fecha, cobros) {
    const total = cobros.reduce((s, c) => s + c.saldo, 0);
    const hoy = ui.hoy();

    const filas = cobros.map(c => `
      <button class="fila" data-venta="${c.venta_id}">
        <div class="fila__cuerpo">
          <div class="fila__titulo">${esc(nombreCliente(c.cliente_id))}</div>
          <div class="fila__detalle">
            Pedido ${c.numero || 's/n'} · vendido el ${fmt.fecha(c.fecha_venta)}
            ${c.plazo ? ' · ' + c.plazo + ' días de plazo' : ' · de contado'}
          </div>
        </div>
        <div class="fila__valor monto ${fecha < hoy ? 'mal' : ''}">${fmt.pesos(c.saldo)}</div>
      </button>`).join('');

    ui.hoja({
      titulo: fmt.fecha(fecha) + (fecha < hoy ? ' · vencido' : ''),
      cuerpo: `
        <div class="previa__pie" style="border-bottom:1px solid var(--linea);padding-bottom:10px">
          <span class="tenue">${cobros.length} pedido${cobros.length === 1 ? '' : 's'}</span>
          <span class="monto" style="font-size:18px">${fmt.pesos(total)}</span>
        </div>
        ${filas}`,
      acciones: [{ texto: 'Cerrar', clase: 'boton', alClic: c => c() }],
      listo: (velo, cerrar) => {
        velo.querySelectorAll('[data-venta]').forEach(b => {
          b.onclick = () => {
            cerrar();
            ui.abrir(OM.ventas.factura(store.uno('ventas', b.dataset.venta)));
          };
        });
      }
    });
  }

  /* ── la pantalla ──────────────────────────────────────────────────── */

  function calendario() {
    const partes = ui.hoy().split('-');
    let ano = Number(partes[0]);
    let mes = Number(partes[1]);

    return {
      titulo: 'Cobros esperados',
      html() {
        const hoy = ui.hoy();
        const cobros = store.cobrosEsperados();

        // Agrupados por el día en que deberían pagar.
        const porDia = {};
        cobros.forEach(c => {
          (porDia[c.fecha_pago] = porDia[c.fecha_pago] || []).push(c);
        });

        const total = cobros.reduce((s, c) => s + c.saldo, 0);
        const vencido = cobros.filter(c => c.fecha_pago < hoy)
          .reduce((s, c) => s + c.saldo, 0);

        const cuantos = diasEnMes(ano, mes);
        const huecos = columnaDe(ano, mes, 1);

        const celdas = [];
        for (let i = 0; i < huecos; i++) celdas.push('<div class="dia dia--vacio"></div>');

        let delMes = 0;
        for (let d = 1; d <= cuantos; d++) {
          const fecha = comoTexto(ano, mes, d);
          const delDia = porDia[fecha] || [];
          const monto = delDia.reduce((s, c) => s + c.saldo, 0);
          delMes += monto;

          const clases = ['dia'];
          if (fecha === hoy) clases.push('dia--hoy');
          if (monto > 0) clases.push(fecha < hoy ? 'dia--vencido' : 'dia--espera');

          celdas.push(`
            <${monto > 0 ? 'button' : 'div'} class="${clases.join(' ')}"
              ${monto > 0 ? 'data-dia="' + fecha + '"' : ''}>
              <span class="dia__numero">${d}</span>
              ${monto > 0 ? `<span class="dia__monto">${Math.round(monto / 1000)}k</span>` : ''}
            </${monto > 0 ? 'button' : 'div'}>`);
        }

        return `
          <div class="tarjeta">
            <div class="tarjeta__titulo">Pendiente de cobro</div>
            <div style="font-size:30px;font-weight:700;color:${total > 0 ? 'var(--alerta)' : 'var(--ok)'}">
              ${fmt.pesos(total)}
            </div>
            ${vencido > 0
              ? `<div class="mal">${fmt.pesos(vencido)} ya vencido</div>`
              : '<div class="ok">nada vencido</div>'}
          </div>

          <div class="tarjeta">
            <div class="mes">
              <button class="mes__paso" id="antes">‹</button>
              <div class="mes__nombre">${MESES[mes - 1]} ${ano}</div>
              <button class="mes__paso" id="despues">›</button>
            </div>

            <div class="semana">${DIAS.map(d => `<span>${d}</span>`).join('')}</div>
            <div class="calendario">${celdas.join('')}</div>

            <div class="previa__pie" style="border-top:1px solid var(--linea);margin-top:12px">
              <span class="tenue">Esperado en ${MESES[mes - 1]}</span>
              <span class="monto">${fmt.pesos(delMes)}</span>
            </div>
          </div>

          <div class="tenue" style="font-size:13px;padding:0 2px">
            Los días con monto se pueden tocar. En rojo, lo que ya se pasó de la
            fecha; en celeste, lo que todavía no. Las cifras del calendario van
            en miles.
          </div>

          ${total === 0 ? ui.vacio('✅', 'Nadie te debe nada.') : ''}`;
      },

      listo(cont) {
        cont.querySelector('#antes').onclick = () => {
          mes--; if (mes < 1) { mes = 12; ano--; }
          ui.render();
        };
        cont.querySelector('#despues').onclick = () => {
          mes++; if (mes > 12) { mes = 1; ano++; }
          ui.render();
        };

        const porDia = {};
        store.cobrosEsperados().forEach(c => {
          (porDia[c.fecha_pago] = porDia[c.fecha_pago] || []).push(c);
        });

        cont.querySelectorAll('[data-dia]').forEach(b => {
          b.onclick = () => verDia(b.dataset.dia, porDia[b.dataset.dia] || []);
        });
      }
    };
  }

  window.OM = window.OM || {};
  window.OM.cartera = { calendario };
})();
