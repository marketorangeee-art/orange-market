/* Orange Market · a qué servidor se conecta
 *
 * ESTE ES EL ÚNICO ARCHIVO QUE CAMBIA ENTRE UN CLIENTE Y OTRO.
 * Cada negocio tiene su propio proyecto de Supabase: su base, sus usuarios y
 * sus respaldos. Nunca se comparte una base entre dos clientes.
 *
 * Los dos valores salen de Supabase → Project Settings:
 *   url  = General → Project ID, como https://<id>.supabase.co
 *   anon = API Keys → la clave publicable
 *
 * Esta clave es PÚBLICA por diseño y va en el código sin problema: sola no
 * sirve para nada, porque todas las políticas del servidor exigen una sesión
 * iniciada. Probado: una consulta con esta clave y sin sesión devuelve una
 * lista vacía, no los datos.
 *
 * La que NUNCA se pone acá es la secreta (service_role / sb_secret): esa salta
 * todas las reglas.
 *
 * Con los dos campos vacíos la app funciona igual, pero solo en este equipo.
 */
window.OM = window.OM || {};

window.OM.config = {
  // Lo que sale impreso en la factura que se manda por WhatsApp.
  negocio: {
    nombre:   'ORANGE MARKET',
    telefono: '3104957102',
    whatsapp: '3505443081',
    pie: [
      'Favor consignar a la cuenta de ahorros Bancolombia 005-000022-63',
      'A nombre de Orangel Romero Cantillo'
    ]
  },

  supabase: {
    url:  'https://nxblaxoixqzpnlqfwejo.supabase.co',
    anon: 'sb_publishable_Tg0vHwo-pvmCe9xu5kdbUQ_zdzThSQ_'
  }
};
