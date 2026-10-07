// Conexión con Supabase. Hay DOS ambientes y el sitio elige solo según la dirección web:
//   - Producción (datos reales): solo en las direcciones de la lista PROD_HOSTS.
//   - Pruebas (datos de mentira): cualquier otra dirección (vistas previas de Vercel, localhost, etc.).
// Si algún día se agrega un dominio propio para producción, hay que añadirlo a PROD_HOSTS.
// Las claves "anon" son PÚBLICAS por diseño: la seguridad real está en las reglas de la base de datos.
// Nunca pongas aquí la clave "service_role".
(function () {
  var PROD_HOSTS = ["registro-upf-sitio.vercel.app"];
  var PROD = {
    url: "https://iqawizophgmftcqomzns.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxYXdpem9waGdtZnRjcW9tem5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNzExMjQsImV4cCI6MjEwNjk0NzEyNH0.kuODOA7iYpFQoMpQ5p5M-4g_ebOvzsP2mcfzEjw8p6w"
  };
  var DEV = {
    url: "https://mqiqqbguwrynopulcvsp.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xaXFxYmd1d3J5bm9wdWxjdnNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzODIxNTEsImV4cCI6MjEwNjk1ODE1MX0.XnM1TD6XwCeECprHdiAclCnqVTUs36UJ5qkB5PvRHxs"
  };
  var esProd = PROD_HOSTS.indexOf(window.location.hostname) >= 0;
  var cfg = esProd ? PROD : DEV;
  window.UPF_CONFIG = { url: cfg.url, key: cfg.key, ambiente: esProd ? "produccion" : "pruebas" };
  if (!esProd) {
    document.addEventListener("DOMContentLoaded", function () {
      var b = document.createElement("div");
      b.setAttribute("role", "note");
      b.textContent = "AMBIENTE DE PRUEBAS · los datos no son reales";
      b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#fff4d6;color:#5c3b00;border-top:2px solid #c98a00;font:600 13px/1.2 system-ui,sans-serif;text-align:center;padding:6px 8px;";
      document.body.appendChild(b);
      document.body.style.paddingBottom = "34px";
    });
  }
})();
