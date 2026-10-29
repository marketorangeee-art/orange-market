/* Orange Market · service worker
 *
 * El código propio se pide A LA RED PRIMERO, con el caché como respaldo. Así
 * una corrección llega en la primera apertura y no queda un celular corriendo
 * una versión vieja sin que nadie se entere.
 *
 * ⚠ Subir CACHE en cada cambio de JS o CSS, junto con OM.ui.VERSION.
 */
var CACHE = 'orange-v19';

var BASE = [
  './',
  'index.html',
  'guia.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/store.js',
  'js/config.js',
  'js/cloud.js',
  'js/ui.js',
  'js/p-inventario.js',
  'js/p-proveedores.js',
  'js/p-clientes.js',
  'js/p-venta.js',
  'js/p-resumen.js',
  'js/factura.js',
  'js/vendor/jspdf.umd.min.js',
  'js/vendor/supabase.umd.js',
  'assets/logo.png',
  'assets/icono-192.png',
  'assets/icono-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(BASE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (claves) {
        return Promise.all(claves.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== location.origin) return;   // Supabase nunca se cachea

  // cache: 'no-cache' obliga a revalidar contra el servidor. Sin esto, fetch()
  // usa la cache HTTP del navegador por debajo y puede devolver una copia
  // vieja sin que el service worker se entere: pedir "a la red primero" deja
  // de garantizar nada. Con revalidacion el servidor responde 304 si no
  // cambio, asi que no cuesta ancho de banda.
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(function (res) {
        var copia = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copia); });
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('index.html');
        });
      })
  );
});
