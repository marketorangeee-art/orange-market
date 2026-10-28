/* Orange Market · a qué servidor se conecta
 *
 * ESTE ES EL ÚNICO ARCHIVO QUE CAMBIA ENTRE UN CLIENTE Y OTRO.
 * Cada negocio tiene su propio proyecto de Supabase: su base, sus usuarios y
 * sus respaldos. Nunca se comparte una base entre dos clientes.
 *
 * Los dos valores salen de Supabase → Project Settings → Data API:
 *   url  = Project URL
 *   anon = la clave "anon public"
 *
 * La clave anon es pública y va en el código sin problema: sola no sirve para
 * nada, porque las políticas del servidor exigen una sesión válida.
 * La que NUNCA se pone acá es la "service_role": esa salta todas las reglas.
 *
 * Con los dos campos vacíos la app funciona igual, pero solo en este equipo.
 */
window.OM = window.OM || {};

window.OM.config = {
  negocio: 'Orange Market',
  supabase: {
    url:  '',
    anon: ''
  }
};
