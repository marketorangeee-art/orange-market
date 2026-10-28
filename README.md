# Orange Market

Sistema de inventario, compras y ventas para un negocio que compra producto a
varios proveedores y lo revende a precio variable.

PWA de archivos estáticos: sin build, sin dependencias. Se instala en el
celular y en el escritorio del PC desde el navegador, y funciona sin internet.

El diseño de los datos y las reglas del negocio están en [MODELO.md](MODELO.md).

---

## 1. Archivos

```
index.html              cáscara y arranque
css/style.css           tema (celular y escritorio en una sola hoja)
js/store.js             datos y reglas de negocio
js/config.js            A QUÉ SERVIDOR SE CONECTA ← lo único que cambia por cliente
js/cloud.js             sesión y sincronización con Supabase
js/ui.js                cáscara, navegación y piezas compartidas
js/p-venta.js           venta, asignación de lotes y factura
js/p-inventario.js      productos e inventario por lote
js/p-proveedores.js     proveedores, compras y pagos
js/p-clientes.js        clientes, cobros y alertas
js/p-resumen.js         resumen financiero, capital y retiros
supabase/schema.sql     esquema, políticas y triggers
sw.js                   service worker
```

Cada pantalla se registra con `OM.ui.pantalla(id, …)` y no sabe nada de las
demás. `render()` repinta todo en cada cambio: el volumen de un día de trabajo
es chico y así ninguna pantalla queda desfasada del dato real.

---

## 2. Conectar el servidor

**Un cliente, una base.** Cada negocio tiene su propio proyecto de Supabase.
Nunca se comparte una base entre dos clientes: ni los datos, ni los usuarios,
ni los respaldos.

1. Crear el proyecto en [supabase.com](https://supabase.com) (plan free sirve).
2. **Authentication → Providers → Email: apagar "Enable Signups".**
   Los perfiles nacen activos; si el registro queda abierto, cualquiera entra.
3. SQL Editor → pegar y correr `supabase/schema.sql` completo.
4. Authentication → Users → **Add user** para cada persona que va a usarla
   (correo y contraseña). No hay registro desde la app, a propósito.
5. Copiar de **Project Settings → Data API**:
   - *Project URL* → `js/config.js` → `url`
   - clave *anon public* → `js/config.js` → `anon`

La clave `anon` es pública y va en el código: sola no sirve, porque las
políticas exigen una sesión válida. La que **nunca** se pone ahí es la
`service_role`, que salta todas las reglas.

Con `config.js` vacío la app funciona igual, pero los datos viven solo en ese
equipo.

### Quitarle el acceso a alguien

Table Editor → `perfiles` → `activo = false`. Se corta aunque tenga la sesión
abierta: `habilitado()` se cruza con todas las políticas. La app lo detecta en
la siguiente sincronización y avisa.

---

## 3. Cómo sincroniza

Todo se escribe primero en `localStorage` y se marca `_dirty`. Cada 20 segundos
—y además cuando el canal realtime avisa de un cambio— se sube lo pendiente y
se baja lo nuevo.

- `subir()` manda las filas `_dirty`, **una tabla a la vez, todas en paralelo**.
  Si una falla, las demás siguen. Si un bloque entero es rechazado, se reintenta
  **fila por fila** y se informa cuál falla y por qué.
- `bajar()` trae por marca de agua: `updated_at > om.sync.<tabla>`.
- **`updated_at` lo pone el servidor**, con un trigger. Un celular con la hora
  mal puesta escribiría una marca falsa y la sincronización se saltaría filas
  para siempre.
- **Los consecutivos también los asigna el servidor.** La app pone uno
  provisional para que el pedido tenga nombre desde el primer momento; si dos
  equipos sin señal inventan el mismo, el servidor desempata y la app lo
  corrige al bajar.
- Al bajar, **gana el servidor**, salvo que la fila local tenga cambios sin
  subir: esa se conserva, para no perder una venta hecha sin señal.

Cerrar sesión **no borra** los datos del equipo. Si quedó algo sin subir, sube
cuando alguien vuelva a entrar ahí.

---

## 4. Publicar un cambio

```bash
git add -A && git commit -m "..." && git push origin main
```

El push dispara el flujo `.github/workflows/pages.yml`, que publica en
**https://marketorangeee-art.github.io/orange-market/**. Cada publicación deja
su registro en la pestaña **Actions**: ahí se mira cuando algo no sale.

Pages se activa **una sola vez**, a mano, en *Settings → Pages → Source:
GitHub Actions*. El flujo intentó encenderlo solo y GitHub se lo negó con
`Resource not accessible by integration`: por defecto el token de un flujo es
de solo lectura, y crear un sitio de Pages es escritura. En un repositorio
nuevo, hay que acordarse de ese clic.

Y **en cada cambio de JS, CSS o imágenes**, las dos cosas:

1. Subir `VERSION` en `js/ui.js`
2. Subir `CACHE` en `sw.js`

Sin eso los equipos pueden quedarse con la versión vieja y no hay forma de
saber cuál están corriendo. La versión que corre cada equipo se ve en el botón
de conexión de la cabecera.

El service worker pide el código propio **a la red primero**, con el caché como
respaldo, para que una corrección llegue en la primera apertura.

Pide con `cache: 'no-cache'`, que obliga a revalidar contra el servidor. Sin
eso, `fetch()` usa la caché HTTP del navegador por debajo y puede devolver una
copia vieja sin que el service worker se entere — y "a la red primero" deja de
garantizar nada. Ya pasó una vez, con un cambio de CSS que no llegaba.

---

## 5. Instalar

**PC (Chrome o Edge):** el ícono de instalar en la barra de direcciones. Queda
con ventana propia, ícono en el escritorio y en el menú de inicio.

**Android:** menú → Instalar aplicación.

**iPhone: solo desde Safari.** Compartir → Agregar a inicio. Desde Chrome no
existe la opción.

---

## 6. Cuando algo falla

El botón de conexión de la cabecera abre el diagnóstico: estado, usuario, si el
perfil está activo, versión que corre ese equipo, cuántas filas hay sin subir y
de qué tablas, el último error y **qué filas rechazó el servidor con el motivo
exacto**.

Eso distingue de un vistazo una sesión vencida, de un acceso desactivado, de un
dato malo en una fila.

Ahí mismo está **Borrar datos locales**, para limpiar datos de prueba antes de
empezar en serio: borra lo de ese equipo y vuelve a bajar del servidor.

---

## 7. Convenciones

**Idioma:** todo en español — identificadores, comentarios y textos. Voseo.

**JavaScript** sin módulos ni build. Cada archivo es un IIFE que cuelga de
`window.OM`. La única dependencia es el SDK de Supabase, por CDN y con versión
fija, y solo se carga si hay servidor configurado.

**Nada se guarda calculado.** Stock, restante, saldos y utilidad se derivan
siempre de las filas base.

**Nadie borra.** Anular marca `deleted = true` y queda el rastro.

**Comentarios:** explican *por qué*, nunca *qué*.

**Mensajes de error al usuario:** dicen qué pasó y qué hacer. Nunca "Error".

**CSS:** variables en `:root`, nada táctil por debajo de 44 px.
