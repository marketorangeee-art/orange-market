/* Orange Market · la factura en PDF
 *
 * Reproduce la factura de papel del negocio: logo y datos arriba, el bloque
 * del cliente, la tabla de productos, el total grande y el pie con la cuenta
 * bancaria.
 *
 * El PDF se arma en el celular, sin servidor, y se entrega por el menú de
 * compartir del teléfono — que es por donde sale WhatsApp. En un PC sin ese
 * menú, se descarga.
 *
 * La librería vive en js/vendor/ y no en un CDN, para que la factura se pueda
 * generar sin señal. Se carga solo cuando hace falta: son 420 KB y no tienen
 * por qué pesar en cada apertura de la app.
 */
(function () {
  'use strict';

  const store = OM.store;
  const negocio = (OM.config && OM.config.negocio) || {};

  const nf0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
  const pesos = n => '$ ' + nf0.format(Math.round(Number(n) || 0));

  const UNIDAD = { kilo: 'KG', kilo_neto: 'KG NETO', libra: 'LB', unidad: 'UND' };
  const MESES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

  const fechaLarga = f => {
    const p = String(f).slice(0, 10).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  };

  const producto = id => store.uno('productos', id) || { nombre: '—', unidad: '' };

  /* ── carga perezosa ───────────────────────────────────────────────── */

  function cargarLibreria() {
    if (window.jspdf) return Promise.resolve();
    return new Promise((bien, mal) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/jspdf.umd.min.js';
      s.onload = bien;
      s.onerror = () => mal(new Error('No se pudo cargar el generador de PDF'));
      document.head.appendChild(s);
    });
  }

  // El logo entra como JPEG sobre blanco y a 440px de ancho, que es de sobra
  // para imprimirlo a 52mm. Metido como PNG con transparencia y a tamaño
  // completo, el solo logo se llevaba 450 KB de la factura: un archivo que
  // alguien tiene que bajar con datos del celular.
  let logo = null;
  function cargarLogo() {
    if (logo !== null) return Promise.resolve(logo);
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const ancho = Math.min(440, img.naturalWidth);
        const alto = Math.round(ancho * img.naturalHeight / img.naturalWidth);
        const lienzo = document.createElement('canvas');
        lienzo.width = ancho;
        lienzo.height = alto;
        const g = lienzo.getContext('2d');
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, ancho, alto);
        g.drawImage(img, 0, 0, ancho, alto);
        logo = {
          datos: lienzo.toDataURL('image/jpeg', 0.9),
          razon: img.naturalHeight / img.naturalWidth
        };
        resolve(logo);
      };
      img.onerror = () => { logo = false; resolve(false); };
      img.src = 'assets/logo.png';
    });
  }

  /* ── el documento ─────────────────────────────────────────────────── */

  const M = 12;                 // margen
  const ANCHO = 210;            // ancho de página, en milímetros
  const DER = ANCHO - M;

  // Columnas de la tabla. El total a la derecha del todo, que es donde lo
  // busca el ojo.
  const COL = { desc: M, unidad: 96, cant: 124, unit: 162, total: DER };

  async function armar(venta) {
    await cargarLibreria();
    const marca = await cargarLogo();

    const cliente = store.uno('clientes', venta.cliente_id) || { nombre: '—' };
    const items = store.donde('venta_items', 'venta_id', venta.id);
    const total = store.totalVenta(venta.id);
    const abonado = store.cobrado(venta.id);
    const saldo = store.saldoVenta(venta.id);
    const falta = store.faltanteVenta(venta.id);

    const pendientes = items
      .map(it => ({ it, f: store.kg(it.cantidad - store.cubierto(it.id)) }))
      .filter(x => x.f > 0);

    // Alto a la medida del contenido: una factura de dos renglones no tiene
    // por qué ocupar una hoja entera en el teléfono de nadie. Los sumandos
    // siguen, en orden, los mismos saltos que hace el dibujo de abajo.
    const alto = 16 + 28 + 8 + (5 * 6.4) + 4 + 7 + 3 + 6
               + items.length * 8
               + 3 + 12
               + (abonado > 0 ? 14 : 0)
               + (pendientes.length ? 5 + pendientes.length * 5 + 3 : 0)
               + 7 + (negocio.pie || []).length * 5.5
               + 8;

    // ⚠ jsPDF no respeta el orden de format: con orientación vertical toma la
    //   medida MENOR como ancho. Una factura corta salía de 142mm de ancho
    //   mientras el dibujo llegaba hasta los 198, así que toda la columna de
    //   totales caía fuera de la hoja. Se elige la orientación para que el
    //   ancho sea siempre ANCHO.
    const doc = new window.jspdf.jsPDF({
      orientation: alto <= ANCHO ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [ANCHO, alto]
    });
    const gris = () => doc.setDrawColor(200, 200, 200);
    const negro = () => doc.setTextColor(0, 0, 0);

    let y = M + 4;

    /* cabecera */
    if (marca) {
      const ancho = 52;
      doc.addImage(marca.datos, 'JPEG', M, y - 2, ancho, ancho * marca.razon);
    }

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold').setFontSize(17);
    doc.text(negocio.nombre || 'ORANGE MARKET', DER, y + 5, { align: 'right' });

    doc.setFont('helvetica', 'normal').setFontSize(9.5);
    if (negocio.telefono) doc.text('Teléfono: ' + negocio.telefono, DER, y + 12, { align: 'right' });
    if (negocio.whatsapp) doc.text('Whatsapp: ' + negocio.whatsapp, DER, y + 17.5, { align: 'right' });

    y += 28;
    gris(); doc.line(M, y, DER, y);
    y += 8;

    /* bloque del cliente */
    const dato = (etiqueta, valor) => {
      doc.setFont('helvetica', 'bold').setFontSize(10);
      doc.text(etiqueta, M, y);
      doc.text(String(valor || '—'), DER, y, { align: 'right' });
      y += 6.4;
    };

    dato('Cliente', cliente.nombre);
    dato('Fecha de transacción', fechaLarga(venta.fecha));
    dato('Vendedor', venta.vendedor);
    dato('Método de pago', venta.medio_pago === 'transferencia' ? 'Transferencia' : 'Efectivo');
    dato('Estado', saldo > 0 ? (abonado > 0 ? 'Abono parcial' : 'Deuda') : 'Pagado');

    y += 4;
    gris(); doc.line(M, y, DER, y);
    y += 7;

    /* tabla */
    doc.setFont('helvetica', 'bold').setFontSize(9);
    doc.text('Descripción', COL.desc, y);
    doc.text('Unidad', COL.unidad, y, { align: 'center' });
    doc.text('Cantidad', COL.cant, y, { align: 'center' });
    doc.text('Vr. Unitario Venta', COL.unit, y, { align: 'right' });
    doc.text('Vr. Total Venta', COL.total, y, { align: 'right' });

    y += 3;
    gris(); doc.line(M, y, DER, y);
    y += 6;

    doc.setFontSize(10);
    items.forEach(it => {
      const p = producto(it.producto_id);
      doc.setFont('helvetica', 'bold');
      doc.text(String(p.nombre).toUpperCase(), COL.desc, y);
      doc.setFont('helvetica', 'normal');
      doc.text(UNIDAD[p.unidad] || '', COL.unidad, y, { align: 'center' });
      doc.text(nf2.format(it.cantidad), COL.cant, y, { align: 'center' });
      doc.text(pesos(it.precio_unit), COL.unit, y, { align: 'right' });
      doc.text(pesos(it.cantidad * it.precio_unit), COL.total, y, { align: 'right' });
      y += 8;
    });

    gris(); doc.line(M, y - 3, DER, y - 3);
    y += 3;

    /* total */
    doc.setFont('helvetica', 'bold').setFontSize(17);
    doc.text('Total Venta', M, y + 3);
    doc.text(pesos(total), DER, y + 3, { align: 'right' });
    y += 12;

    if (abonado > 0) {
      doc.setFont('helvetica', 'normal').setFontSize(10);
      doc.text('Abonado', M, y);
      doc.text(pesos(abonado), DER, y, { align: 'right' });
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Saldo pendiente', M, y);
      doc.text(pesos(saldo), DER, y, { align: 'right' });
      y += 8;
    }

    // Lo que se facturó pero todavía no se entregó. No está en la factura de
    // papel, pero si no se dice acá no se dice en ninguna parte.
    if (pendientes.length) {
      doc.setFont('helvetica', 'bold').setFontSize(9.5);
      doc.setTextColor(190, 110, 0);
      doc.text('Pendiente de entrega:', M, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      pendientes.forEach(x => {
        const p = producto(x.it.producto_id);
        doc.text('· ' + p.nombre + ': ' + nf2.format(x.f) + ' ' + (UNIDAD[p.unidad] || ''), M + 2, y);
        y += 5;
      });
      negro();
      y += 3;
    }

    /* pie */
    gris(); doc.line(M, y, DER, y);
    y += 7;
    doc.setFont('helvetica', 'bold').setFontSize(9.5);
    doc.setTextColor(8, 150, 155);
    (negocio.pie || []).forEach(linea => {
      doc.text(linea, ANCHO / 2, y, { align: 'center' });
      y += 5.5;
    });

    return doc;
  }

  const nombreArchivo = venta => {
    const cliente = store.uno('clientes', venta.cliente_id) || { nombre: 'cliente' };
    const limpio = cliente.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-');
    return 'Pedido-' + (venta.numero || 'sn') + '-' + limpio + '.pdf';
  };

  /* ── entregarla ───────────────────────────────────────────────────── */

  async function compartir(venta) {
    const doc = await armar(venta);
    const blob = doc.output('blob');
    const archivo = new File([blob], nombreArchivo(venta), { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo] });
        return 'compartido';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelado';
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = archivo.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'descargado';
  }

  async function verEnPantalla(venta) {
    const doc = await armar(venta);
    window.open(URL.createObjectURL(doc.output('blob')), '_blank');
  }

  window.OM = window.OM || {};
  window.OM.factura = { armar, compartir, verEnPantalla, nombreArchivo };
})();
