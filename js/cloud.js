/* Orange Market · sesión y sincronización con Supabase
 *
 * Local primero, siempre. Todo se escribe en el equipo y se marca _dirty;
 * este archivo sube lo pendiente y baja lo nuevo cuando hay señal. Si no hay
 * internet, o si el servidor no está configurado, la app funciona completa y
 * guarda todo para subirlo después.
 *
 * Sin configurar (js/config.js vacío) corre en modo local, sin login.
 */
(function () {
  'use strict';

  const store = OM.store;
  const cfg = (OM.config && OM.config.supabase) || {};

  // Versión exacta y fija: una actualización del SDK no puede romper la app
  // de un día para otro sin que nadie la haya tocado.
  // Desde la 2.49 entiende las claves publicables (sb_publishable_…), que son
  // las que entrega Supabase en los proyectos nuevos.
  const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js';

  const MARCA_CERO = '1970-01-01T00:00:00Z';
  const CADA = 20000;

  let sb = null;
  let sesion = null;
  let perfil = null;
  let estado = 'local';        // local · sin-sesion · sincronizando · listo · sin-senal
  let ultimoError = '';
  let rechazadas = [];
  let enMarcha = false;

  const configurado = () => !!(cfg.url && cfg.anon);
  const marca = tabla => localStorage.getItem('om.sync.' + tabla) || MARCA_CERO;

  /* ── arranque ─────────────────────────────────────────────────────── */

  function cargarSDK() {
    return new Promise((bien, mal) => {
      if (window.supabase) return bien();
      const s = document.createElement('script');
      s.src = SDK;
      s.onload = bien;
      s.onerror = () => mal(new Error('No se pudo cargar el SDK de Supabase'));
      document.head.appendChild(s);
    });
  }

  async function iniciar() {
    if (!configurado()) {
      estado = 'local';
      return arrancarApp();
    }

    try {
      await cargarSDK();
      sb = window.supabase.createClient(cfg.url, cfg.anon, {
        auth: { persistSession: true, autoRefreshToken: true }
      });

      const { data } = await sb.auth.getSession();
      sesion = data.session;

      if (!sesion) {
        estado = 'sin-sesion';
        return pantallaLogin();
      }
      await arrancarConectado();

    } catch (e) {
      // Sin señal: si ya se entró alguna vez en este equipo, se sigue
      // trabajando con lo que hay. Si nunca se entró, no hay nada que mostrar.
      ultimoError = e.message;
      estado = 'sin-senal';
      if (localStorage.getItem('om.entro')) arrancarApp();
      else pantallaLogin(true);
    }
  }

  async function arrancarConectado() {
    localStorage.setItem('om.entro', '1');
    await leerPerfil();
    arrancarApp();
    sincronizar();
    setInterval(sincronizar, CADA);
    escucharCambios();
    window.addEventListener('online', sincronizar);
  }

  function arrancarApp() {
    document.getElementById('nav').style.display = '';
    OM.ui.arrancar();
    pintarEstado();
  }

  async function leerPerfil() {
    const { data } = await sb.from('perfiles').select('*').eq('id', sesion.user.id).maybeSingle();
    perfil = data;
  }

  /* ── login ────────────────────────────────────────────────────────── */

  function pantallaLogin(sinSenal) {
    document.getElementById('nav').style.display = 'none';
    const cont = document.getElementById('contenido');
    cont.innerHTML = `
      <div style="max-width:380px;margin:8vh auto 0">
        <img src="assets/logo.png" alt="Orange Market"
             style="width:100%;max-width:260px;display:block;margin:0 auto 28px">

        ${sinSenal ? `
          <div class="tarjeta" style="border-color:rgba(255,181,61,.4)">
            <div class="aviso">No hay conexión con el servidor.</div>
            <div class="tenue" style="margin-top:6px">
              Conectate a internet para entrar la primera vez. Después la app
              funciona sin señal.
            </div>
          </div>` : ''}

        <form id="entrar">
          <label class="campo">
            <span class="campo__etiqueta">Correo</span>
            <input type="email" name="correo" autocomplete="username" required>
          </label>
          <label class="campo">
            <span class="campo__etiqueta">Contraseña</span>
            <input type="password" name="clave" autocomplete="current-password" required>
          </label>
          <div class="mal" id="error" hidden style="margin-bottom:12px"></div>
          <button class="boton boton--bloque" type="submit">Entrar</button>
        </form>
      </div>`;

    const form = cont.querySelector('#entrar');
    const error = cont.querySelector('#error');

    form.onsubmit = async e => {
      e.preventDefault();
      const boton = form.querySelector('button');
      boton.disabled = true;
      boton.textContent = 'Entrando…';
      error.hidden = true;

      try {
        const { data, error: fallo } = await sb.auth.signInWithPassword({
          email: form.elements.correo.value.trim(),
          password: form.elements.clave.value
        });
        if (fallo) throw fallo;
        sesion = data.session;
        await arrancarConectado();
      } catch (e2) {
        error.textContent = explicar(e2);
        error.hidden = false;
        boton.disabled = false;
        boton.textContent = 'Entrar';
      }
    };
  }

  // Un mensaje de error sirve si dice qué pasó y qué hacer. "Failed to fetch"
  // no es ninguna de las dos.
  function explicar(e) {
    const m = (e && e.message) || String(e);
    if (/Failed to fetch|NetworkError|network/i.test(m)) {
      return 'No hay conexión con el servidor. Revisá el internet e intentá de nuevo.';
    }
    if (/Invalid login credentials/i.test(m)) {
      return 'Ese correo y esa contraseña no coinciden.';
    }
    if (/Email not confirmed/i.test(m)) {
      return 'Esa cuenta todavía no está confirmada. Confirmala desde el correo.';
    }
    if (/rate limit|too many/i.test(m)) {
      return 'Demasiados intentos seguidos. Esperá un minuto y volvé a probar.';
    }
    return 'No se pudo entrar: ' + m;
  }

  function salir() {
    const pendientes = contarPendientes();
    const aviso = pendientes
      ? 'Hay ' + pendientes + ' cambios sin subir. Quedan guardados en este equipo, ' +
        'pero conviene sincronizar antes de salir.'
      : 'Vas a volver a la pantalla de entrada.';

    OM.ui.confirmar('Cerrar sesión', aviso, async () => {
      // Los datos locales NO se borran: si quedó una venta sin subir, se sube
      // cuando alguien vuelva a entrar en este mismo equipo.
      await sb.auth.signOut();
      sesion = null;
      perfil = null;
      estado = 'sin-sesion';
      pantallaLogin();
    }, 'Cerrar sesión');
  }

  /* ── sincronización ───────────────────────────────────────────────── */

  const sinInternos = fila => {
    const copia = Object.assign({}, fila);
    delete copia._dirty;
    delete copia.updated_at;   // lo pone el servidor, para que la marca de agua
    return copia;              // no dependa de la hora del celular
  };

  const contarPendientes = () =>
    store.TABLAS.reduce((n, t) => n + store.sucias(t).length, 0);

  async function sincronizar() {
    if (!sb || !sesion || enMarcha) return;
    enMarcha = true;
    estado = 'sincronizando';
    pintarEstado();

    try {
      rechazadas = [];
      await subir();
      await bajar();
      await leerPerfil();
      estado = 'listo';
      ultimoError = '';

      // Si el dueño desactivó esta cuenta, el servidor deja de aceptar todo.
      // Mejor decirlo de frente que dejar la app fallando en silencio.
      if (perfil && perfil.activo === false) {
        OM.ui.aviso('Tu acceso fue desactivado');
        estado = 'sin-sesion';
      }
    } catch (e) {
      estado = 'sin-senal';
      ultimoError = e.message || String(e);
    }

    enMarcha = false;
    pintarEstado();
    OM.ui.render();
  }

  async function subir() {
    // Una tabla a la vez pero todas en paralelo: si una falla, las demás suben.
    await Promise.all(store.TABLAS.map(async tabla => {
      const sucias = store.sucias(tabla);
      if (!sucias.length) return;

      const { data, error } = await sb.from(tabla)
        .upsert(sucias.map(sinInternos)).select();

      if (error) return subirUnaPorUna(tabla, sucias);

      store.limpiar(tabla, data.map(f => f.id));
      store.recibir(tabla, data);     // trae el número que asignó el servidor
    }));
  }

  // Cuando el bloque entero es rechazado, casi siempre es UNA fila mala. Subir
  // de a una salva las demás y deja dicho cuál es la que falla.
  async function subirUnaPorUna(tabla, filas) {
    for (const fila of filas) {
      const { data, error } = await sb.from(tabla).upsert(sinInternos(fila)).select();
      if (error) {
        rechazadas.push({ tabla, id: fila.id, motivo: error.message });
      } else {
        store.limpiar(tabla, [fila.id]);
        store.recibir(tabla, data);
      }
    }
  }

  async function bajar() {
    for (const tabla of store.TABLAS) {
      const { data, error } = await sb.from(tabla)
        .select('*')
        .gt('updated_at', marca(tabla))
        .order('updated_at', { ascending: true })
        .limit(1000);

      if (error) throw error;
      if (!data.length) continue;

      store.recibir(tabla, data);
      localStorage.setItem('om.sync.' + tabla, data[data.length - 1].updated_at);
    }
  }

  let pendienteDeSincronizar = null;
  function escucharCambios() {
    sb.channel('om')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        clearTimeout(pendienteDeSincronizar);
        pendienteDeSincronizar = setTimeout(sincronizar, 1200);
      })
      .subscribe();
  }

  /* ── estado visible y diagnóstico ─────────────────────────────────── */

  const SEMAFORO = {
    local:         { color: 'var(--texto-2)', texto: 'Local' },
    'sin-sesion':  { color: 'var(--mal)',     texto: 'Sin sesión' },
    sincronizando: { color: 'var(--marca)',   texto: 'Sincronizando' },
    listo:         { color: 'var(--ok)',      texto: 'Al día' },
    'sin-senal':   { color: 'var(--alerta)',  texto: 'Sin señal' }
  };

  function pintarEstado() {
    const caja = document.getElementById('cabecera-derecha');
    if (!caja) return;
    const s = SEMAFORO[estado] || SEMAFORO.local;
    const pendientes = contarPendientes();

    caja.innerHTML = `
      <button id="conexion" class="conexion" title="${s.texto}">
        <span class="conexion__punto" style="background:${s.color}"></span>
        ${pendientes ? `<span class="conexion__n">${pendientes}</span>` : ''}
      </button>`;
    caja.querySelector('#conexion').onclick = revisar;
  }

  // La pantalla que evita adivinar cuando algo falla: dice cómo ve el servidor
  // a este equipo y qué filas rechazó, con el motivo exacto.
  function revisar() {
    const s = SEMAFORO[estado] || SEMAFORO.local;
    const pendientes = store.TABLAS
      .map(t => ({ t, n: store.sucias(t).length }))
      .filter(x => x.n);

    const linea = (k, v) => `<div style="display:flex;justify-content:space-between;gap:12px;
      padding:7px 0;border-bottom:1px solid var(--linea)">
      <span class="tenue">${k}</span><span>${v}</span></div>`;

    const cuerpo = `
      ${linea('Estado', s.texto)}
      ${linea('Servidor', configurado() ? 'configurado' : 'sin configurar')}
      ${linea('Usuario', sesion ? OM.ui.esc(sesion.user.email) : '—')}
      ${linea('Perfil', perfil ? (perfil.activo ? 'activo' : 'DESACTIVADO') : '—')}
      ${linea('Versión', OM.ui.VERSION)}
      ${linea('Sin subir', contarPendientes() || 'nada')}
      ${pendientes.length
        ? `<div class="tenue" style="margin-top:10px">
             ${pendientes.map(x => x.t + ': ' + x.n).join(' · ')}</div>`
        : ''}
      ${ultimoError
        ? `<div class="mal" style="margin-top:12px">${OM.ui.esc(ultimoError)}</div>` : ''}
      ${rechazadas.length
        ? `<div class="mal" style="margin-top:12px">
             Filas rechazadas:<br>${rechazadas.map(r =>
               OM.ui.esc(r.tabla + ' · ' + r.motivo)).join('<br>')}</div>` : ''}
      ${!configurado()
        ? `<div class="tenue" style="margin-top:12px">
             Los datos viven solo en este equipo. Para compartirlos con otro
             celular o PC, hay que llenar <b>js/config.js</b>.</div>` : ''}`;

    const acciones = [{ texto: 'Cerrar', alClic: c => c() }];

    if (sb && sesion) {
      acciones.push({ texto: 'Sincronizar', clase: 'boton',
        alClic: c => { c(); sincronizar(); } });
    }

    const { cerrar } = OM.ui.hoja({ titulo: 'Conexión', cuerpo, acciones });

    const extra = document.createElement('div');
    extra.style.cssText = 'display:flex;gap:10px;margin-top:10px';
    if (sb && sesion) {
      const b = document.createElement('button');
      b.className = 'boton boton--fantasma';
      b.style.flex = '1';
      b.textContent = 'Cerrar sesión';
      b.onclick = () => { cerrar(); salir(); };
      extra.appendChild(b);
    }
    const borrar = document.createElement('button');
    borrar.className = 'boton boton--peligro';
    borrar.style.flex = '1';
    borrar.textContent = 'Borrar datos locales';
    borrar.onclick = () => {
      cerrar();
      OM.ui.confirmar('Borrar datos locales',
        'Se borra todo lo que hay en ESTE equipo, incluido lo que todavía no se ' +
        'haya subido. Lo que ya esté en el servidor se vuelve a bajar solo. ' +
        'Sirve para limpiar datos de prueba antes de empezar en serio.',
        () => {
          store.TABLAS.forEach(t => {
            localStorage.removeItem('om.' + t);
            localStorage.removeItem('om.sync.' + t);
          });
          location.reload();
        }, 'Borrar todo');
    };
    extra.appendChild(borrar);
    document.querySelector('.hoja__acciones').insertAdjacentElement('beforebegin', extra);
  }

  window.OM = window.OM || {};
  window.OM.cloud = { iniciar, sincronizar, revisar, salir, estado: () => estado };
})();
