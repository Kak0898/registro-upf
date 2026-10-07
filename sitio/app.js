/* Registro diario de complejos fronterizos — interfaz (JavaScript simple, sin dependencias) */
(function () {
  "use strict";
  var S = { u: null, catalogo: [], estados: [], motivos: [], hoy: "", horaLimite: "08:55", configurado: true, pestana: "hoy" };
  var app = document.getElementById("app");

  // ---------- utilidades ----------
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") el.className = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else if (k === "checked") el.checked = !!v;
      else if (k === "disabled") el.disabled = !!v;
      else el.setAttribute(k, v === true ? "" : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  function api(accion, opts) {
    opts = opts || {};
    var url = "api.php?a=" + accion + (opts.query ? "&" + opts.query : "");
    var init = { credentials: "same-origin", headers: { "X-Requested-With": "rd" } };
    if (opts.body) { init.method = "POST"; init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return { error: "Respuesta inesperada del servidor." }; }).then(function (j) {
        if (r.status === 401 && S.u) { S.u = null; cargarEstado(); }
        if (j.error) throw new Error(j.error);
        return j;
      });
    });
  }
  function post(accion, body) { return api(accion, { body: body || {} }); }
  function fFecha(iso) { return iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : ""; }
  function fHoraMin(ts) { return ts ? ts.slice(8, 10) + "/" + ts.slice(5, 7) + "/" + ts.slice(0, 4) + " " + ts.slice(11, 16) : ""; }
  function sumaDias(iso, n) { var d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  // Hora actual en Chile continental (America/Santiago), sin depender de la zona del dispositivo.
  function ahoraChile() {
    try {
      var p = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
      return { fecha: p.year + "-" + p.month + "-" + p.day, min: (+p.hour) * 60 + (+p.minute), hhmm: p.hour + ":" + p.minute };
    } catch (e) { var d = new Date(); return { fecha: S.hoy, min: d.getHours() * 60 + d.getMinutes(), hhmm: ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) }; }
  }
  function aMin(hhmm) { var m = /^(\d{2}):(\d{2})$/.exec(hhmm || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function duracion(min) { var h = Math.floor(min / 60), m = min % 60; return (h ? h + " h " : "") + m + " min"; }
  // Evalúa si un registro llegó dentro del plazo (usa la hora en que se guardó por primera vez).
  function plazoDe(r, fecha) {
    var lim = aMin(S.horaLimite), ya = ahoraChile();
    if (!r) {
      if (fecha === ya.fecha && ya.min <= lim) return { tono: "none", txt: "– Pendiente (hasta " + S.horaLimite + ")" };
      return { tono: "warn", txt: "! Sin reporte" };
    }
    var cr = r.creado || ""; if (!cr) return { tono: "none", txt: "– Sin dato de hora" };
    if (cr.slice(0, 10) === fecha && aMin(cr.slice(11, 16)) <= lim) return { tono: "ok", txt: "✓ A tiempo (" + cr.slice(11, 16) + ")" };
    return { tono: "warn", txt: "! Fuera de plazo (" + (cr.slice(0, 10) === fecha ? cr.slice(11, 16) : fFecha(cr.slice(0, 10))) + ")" };
  }
  function nombreComplejo(c) { return String(c.complejo).replace(/\s+/g, " "); }
  function porCid(cid) { return S.catalogo.filter(function (c) { return c.cid === cid; })[0]; }
  function pill(estado) {
    var m = { "Habilitado": ["ok", "✓"], "Habilitado con Restricción": ["warn", "!"], "No Habilitado": ["crit", "✕"], "Alerta": ["alert", "▲"] }[estado];
    return m ? h("span", { class: "pill " + m[0] }, m[1] + " " + estado) : h("span", { class: "pill none" }, "– Sin registro");
  }
  // Acepta "830", "8:30", "08.30" y devuelve "08:30"; devuelve el texto tal cual si no se entiende.
  function normHora(v) {
    v = String(v || "").trim(); if (!v) return "";
    var m = v.match(/^(\d{1,2})[:.h]?(\d{2})$/);
    if (!m) return null;
    var hh = +m[1], mm = +m[2];
    if (hh > 23 || mm > 59) return null;
    return ("0" + hh).slice(-2) + ":" + ("0" + mm).slice(-2);
  }
  function mensaje(tipo, txt) { return h("div", { class: "msg " + tipo, role: tipo === "error" ? "alert" : "status" }, txt); }
  function campo(label, input, hint, id) {
    return h("div", { class: "field" }, h("label", { for: id }, label), input, hint ? h("div", { class: "hint" }, hint) : null);
  }
  function irA(url) { if (window.__descargarDemo) window.__descargarDemo(url); else window.location.href = url; }
  function descargar(nombre, texto, tipo) {
    if (window.__guardarDemo) { window.__guardarDemo(nombre, "\ufeff" + texto); return; }
    var blob = new Blob(["﻿" + texto], { type: tipo || "text/csv;charset=utf-8" });
    var a = h("a", { href: URL.createObjectURL(blob), download: nombre });
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- arranque ----------
  function cargarEstado() {
    return api("estado").then(function (j) {
      S.u = j.usuario; S.catalogo = j.catalogo; S.estados = j.estados; S.motivos = j.motivos; S.hoy = j.hoy; S.horaLimite = j.hora_limite || "08:55"; S.configurado = j.configurado;
      render();
    }).catch(function (e) { app.innerHTML = ""; app.appendChild(h("div", { class: "page" }, mensaje("error", "No se pudo conectar con el servidor: " + e.message))); });
  }

  function render() {
    app.innerHTML = "";
    if (!S.configurado) return app.appendChild(vistaConfigurar());
    if (!S.u) return app.appendChild(vistaLogin());
    if (S.u.cambiar) return app.appendChild(vistaCambiarClave(true));
    app.appendChild(barra());
    if (S.u.rol === "admin") vistaAdmin(); else vistaCoordinador();
  }

  function barra() {
    var rol = S.u.rol === "admin" ? "Administrador" : "Coordinador";
    var c = S.u.complejo ? porCid(S.u.complejo) : null;
    return h("header", { class: "topbar" },
      h("div", { class: "brand" }, h("div", { class: "brand-mark" }, "UPF"), h("div", null, "Registro diario de complejos fronterizos")),
      h("div", { class: "spacer" }),
      h("div", { class: "who" }, h("b", null, S.u.nombre), rol + (c ? " · " + nombreComplejo(c) : "")),
      h("button", { class: "btn sec small", onclick: function () { post("salir").then(function () { S.u = null; render(); }); } }, "Cerrar sesión"));
  }

  // ---------- acceso ----------
  function vistaLogin() {
    var err = h("div");
    var u = h("input", { type: "text", id: "lu", autocomplete: "username", autocapitalize: "none", spellcheck: "false", required: true });
    var p = h("input", { type: "password", id: "lp", autocomplete: "current-password", required: true });
    var b = h("button", { class: "btn", type: "submit" }, "Ingresar");
    var f = h("form", { onsubmit: function (ev) {
      ev.preventDefault(); err.innerHTML = ""; b.disabled = true;
      post("entrar", { usuario: u.value, clave: p.value }).then(cargarEstado).catch(function (e) { err.appendChild(mensaje("error", e.message)); b.disabled = false; p.value = ""; p.focus(); });
    } }, err, campo("Usuario", u, null, "lu"), campo("Contraseña", p, null, "lp"), h("div", { class: "row" }, b));
    return h("div", { class: "page" }, h("div", { class: "card centrada" },
      h("div", { class: "brand", style: "margin-bottom:14px" }, h("div", { class: "brand-mark" }, "UPF"), h("div", null, "Registro diario de complejos fronterizos")),
      h("h1", { style: "margin-bottom:6px" }, "Ingresar"),
      h("p", { class: "muted small" }, "Cada coordinador entra con el usuario y la contraseña que le entregó el administrador."), f));
  }

  function vistaConfigurar() {
    var err = h("div");
    var n = h("input", { type: "text", id: "cn", required: true, autocomplete: "name" });
    var u = h("input", { type: "text", id: "cu", required: true, autocapitalize: "none", value: "admin" });
    var p = h("input", { type: "password", id: "cp", required: true, autocomplete: "new-password" });
    var b = h("button", { class: "btn", type: "submit" }, "Crear cuenta y entrar");
    var f = h("form", { onsubmit: function (ev) {
      ev.preventDefault(); err.innerHTML = ""; b.disabled = true;
      post("configurar", { nombre: n.value, usuario: u.value, clave: p.value }).then(cargarEstado).catch(function (e) { err.appendChild(mensaje("error", e.message)); b.disabled = false; });
    } }, err, campo("Tu nombre", n, null, "cn"), campo("Usuario", u, "Letras sin tilde, números, punto o guion.", "cu"), campo("Contraseña", p, "Mínimo 8 caracteres. Guárdala en un lugar seguro.", "cp"), h("div", { class: "row" }, b));
    return h("div", { class: "page" }, h("div", { class: "card centrada" },
      h("h1", { style: "margin-bottom:6px" }, "Primera configuración"),
      h("p", { class: "muted small" }, "Crea la cuenta del administrador. Después podrás crear una cuenta para cada paso fronterizo."), f));
  }

  function vistaCambiarClave(obligatorio) {
    var err = h("div");
    var a = h("input", { type: "password", id: "ca", required: true, autocomplete: "current-password" });
    var n = h("input", { type: "password", id: "cn1", required: true, autocomplete: "new-password" });
    var n2 = h("input", { type: "password", id: "cn2", required: true, autocomplete: "new-password" });
    var nom = h("input", { type: "text", id: "cnom", autocomplete: "name", value: "" });
    var b = h("button", { class: "btn", type: "submit" }, "Guardar contraseña");
    var f = h("form", { onsubmit: function (ev) {
      ev.preventDefault(); err.innerHTML = "";
      if (n.value !== n2.value) { err.appendChild(mensaje("error", "Las dos contraseñas nuevas no coinciden.")); return; }
      b.disabled = true;
      post("cambiar_clave", { actual: a.value, nueva: n.value, nombre: obligatorio ? nom.value : "" }).then(function () {
        if (obligatorio) return cargarEstado();
        a.value = n.value = n2.value = ""; err.appendChild(mensaje("ok", "Contraseña actualizada.")); b.disabled = false;
      }).catch(function (e) { err.appendChild(mensaje("error", e.message)); b.disabled = false; });
    } }, err,
      obligatorio ? campo("Tu nombre (quedará como responsable de tus registros)", nom, "Por ejemplo: María Pérez. Opcional.", "cnom") : null,
      campo(obligatorio ? "Contraseña entregada por el administrador" : "Contraseña actual", a, null, "ca"),
      campo("Contraseña nueva", n, "Mínimo 8 caracteres.", "cn1"), campo("Repite la contraseña nueva", n2, null, "cn2"),
      h("div", { class: "row" }, b, obligatorio ? h("button", { type: "button", class: "btn sec", onclick: function () { post("salir").then(function () { S.u = null; render(); }); } }, "Cerrar sesión") : null));
    var caja = h("div", { class: obligatorio ? "card centrada" : "card", style: obligatorio ? "" : "max-width:480px" },
      h("h1", { style: "margin-bottom:6px" }, obligatorio ? "Crea tu contraseña personal" : "Cambiar contraseña"),
      obligatorio ? h("p", { class: "muted small" }, "Es tu primer ingreso (o el administrador restableció tu clave). Elige una contraseña que solo tú conozcas.") : null, f);
    return obligatorio ? h("div", { class: "page" }, caja) : caja;
  }

  // ---------- formulario de registro (usado por coordinador y por administrador) ----------
  function formRegistro(opts) {
    // opts: {complejo (cid), fecha, minFecha, onGuardado, selectorFecha: bool}
    var cx = opts.complejo, c = porCid(cx);
    var cont = h("div");
    var fecha = opts.fecha;
    var estado = "", prefill = null;

    var inpFecha = h("input", { type: "date", id: "rf-fecha", value: fecha, max: S.hoy, min: opts.minFecha || null, required: true });
    var estadoInputs = {};
    var segEstado = h("div", { class: "seg", role: "radiogroup", "aria-label": "Estado de operación" });
    S.estados.forEach(function (e) {
      var r = h("input", { type: "radio", name: "rf-estado", value: e, onchange: function () { estado = e; alAmbiarEstado(); } });
      estadoInputs[e] = r;
      segEstado.appendChild(h("label", null, r, pillTexto(e)));
    });
    function pillTexto(e) { return ({ "Habilitado": "✓ ", "Habilitado con Restricción": "! ", "No Habilitado": "✕ ", "Alerta": "▲ " }[e] || "") + e; }
    var selMotivo = h("select", { id: "rf-motivo" }, h("option", { value: "" }, "— Sin motivo —"), S.motivos.map(function (m) { return h("option", { value: m }, m); }));
    var motivoHint = h("div", { class: "hint" });
    function selFlujo(id) { return h("select", { id: id }, h("option", { value: "" }, "Elige…"), S.estados.map(function (e) { return h("option", { value: e }, e); })); }
    var selCarga = selFlujo("rf-carga"), selBuses = selFlujo("rf-buses"), selMen = selFlujo("rf-men");
    function hora(id) {
      var i = h("input", { type: "text", id: id, inputmode: "numeric", placeholder: "HH:MM", maxlength: 5, autocomplete: "off", pattern: "([01][0-9]|2[0-3]):[0-5][0-9]" });
      i.addEventListener("blur", function () { var n = normHora(i.value); if (n !== null) i.value = n; });
      return i;
    }
    var tAp = hora("rf-ap"), tCi = hora("rf-ci"), tCi2 = hora("rf-ci2"), tCs = hora("rf-cs");
    var obs = h("textarea", { id: "rf-obs", maxlength: 1000 });
    var aviso = h("div"), err = h("div");
    var btn = h("button", { class: "btn", type: "submit" }, "Guardar registro");

    function alAmbiarEstado() {
      var cerrado = estado === "No Habilitado";
      motivoHint.textContent = cerrado ? "Obligatorio cuando el complejo no está habilitado." : "Opcional. Indícalo si hay una restricción o alerta.";
      if (cerrado || estado === "Habilitado") { selCarga.value = selBuses.value = selMen.value = estado; }
    }

    function llenar(r) {
      estado = r ? r.estado : ""; Object.keys(estadoInputs).forEach(function (k) { estadoInputs[k].checked = (k === estado); });
      selMotivo.value = r ? r.motivo : ""; selCarga.value = r ? r.carga : ""; selBuses.value = r ? r.buses : ""; selMen.value = r ? r.menores : "";
      tAp.value = r ? r.apertura : ""; tCi.value = r ? r.cierre_ingreso : ""; tCi2.value = r ? r.cierre : ""; tCs.value = r ? r.cierre_salida : "";
      obs.value = r ? r.obs : "";
      alAmbiarEstado();
      if (r) { selCarga.value = r.carga; selBuses.value = r.buses; selMen.value = r.menores; }
    }

    function cargarFecha() {
      aviso.innerHTML = ""; err.innerHTML = "";
      fecha = inpFecha.value;
      if (!fecha) return;
      api("registros", { query: "desde=" + sumaDias(fecha, -60) + "&hasta=" + fecha + "&complejo=" + encodeURIComponent(cx) }).then(function (j) {
        var prop = j.registros.filter(function (r) { return r.fecha === fecha; })[0];
        if (prop) {
          llenar(prop);
          aviso.appendChild(mensaje("ok", "Ya existe un registro para el " + fFecha(fecha) + " (guardado por " + prop.actualizado_por + " el " + fHoraMin(prop.actualizado) + "). Puedes corregirlo y guardar de nuevo."));
        } else {
          var previo = j.registros.filter(function (r) { return r.fecha < fecha; })[0];
          llenar(null);
          if (previo) {
            tAp.value = previo.apertura; tCi.value = previo.cierre_ingreso; tCi2.value = previo.cierre; tCs.value = previo.cierre_salida;
            aviso.appendChild(mensaje("aviso", "Aún no hay registro para el " + fFecha(fecha) + ". Los horarios se copiaron del " + fFecha(previo.fecha) + ": revísalos antes de guardar."));
          } else aviso.appendChild(mensaje("aviso", "Aún no hay registro para el " + fFecha(fecha) + "."));
        }
      }).catch(function (e) { err.appendChild(mensaje("error", e.message)); });
    }
    inpFecha.addEventListener("change", cargarFecha);

    var form = h("form", { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); err.innerHTML = "";
      var falta = [];
      if (!inpFecha.value) falta.push("la fecha");
      if (!estado) falta.push("el estado de operación");
      if (estado === "No Habilitado" && !selMotivo.value) falta.push("el motivo de no habilitación");
      if (!selCarga.value) falta.push("el estado del transporte de carga");
      if (!selBuses.value) falta.push("el estado de buses");
      if (!selMen.value) falta.push("el estado de vehículos menores");
      var horasMal = [];
      [[tAp, "horario de apertura"], [tCi, "cierre para ingreso a Chile"], [tCi2, "horario de cierre"], [tCs, "cierre para salida de Chile"]].forEach(function (x) {
        var n = normHora(x[0].value); if (n === null) horasMal.push(x[1]); else x[0].value = n;
      });
      if (horasMal.length) falta.push("una hora válida en formato 24 horas, por ejemplo 08:30 (" + horasMal.join(", ") + ")");
      if (falta.length) { err.appendChild(mensaje("error", "Falta completar: " + falta.join(", ") + ".")); err.scrollIntoView({ block: "nearest" }); return; }
      btn.disabled = true; btn.textContent = "Guardando…";
      post("guardar", { complejo: cx, fecha: inpFecha.value, estado: estado, motivo: selMotivo.value, carga: selCarga.value, buses: selBuses.value, menores: selMen.value,
        apertura: tAp.value, cierre_ingreso: tCi.value, cierre: tCi2.value, cierre_salida: tCs.value, obs: obs.value }).then(function (j) {
        btn.disabled = false; btn.textContent = "Guardar registro";
        err.appendChild(mensaje("ok", (j.actualizado ? "Registro actualizado" : "Registro guardado") + " correctamente (" + fFecha(inpFecha.value) + ")."));
        if (opts.onGuardado) opts.onGuardado();
      }).catch(function (e) { btn.disabled = false; btn.textContent = "Guardar registro"; err.appendChild(mensaje("error", e.message)); });
    } },
      aviso, err,
      opts.selectorFecha === false ? null : campo("Fecha operacional", inpFecha, "Formato día/mes/año. Por defecto es hoy.", "rf-fecha"),
      h("div", { class: "field" }, h("div", { class: "legend", id: "rf-est-l" }, "Estado de operación"), segEstado),
      campo("Motivo de no habilitación", selMotivo, null, "rf-motivo"), motivoHint,
      h("div", { class: "card", style: "margin-top:14px" }, h("h3", null, "Estado por tipo de transporte"),
        h("div", { class: "grid4" }, campo("Transporte de carga", selCarga, null, "rf-carga"), campo("Buses", selBuses, null, "rf-buses"), campo("Vehículos menores", selMen, null, "rf-men"))),
      h("div", { class: "card" }, h("h3", null, "Horarios (formato 24 horas, por ejemplo 08:30 o 18:00)"),
        h("div", { class: "grid4" }, campo("Horario de apertura", tAp, null, "rf-ap"), campo("Cierre para ingreso a Chile", tCi, "Déjalo vacío si no aplica.", "rf-ci"),
          campo("Horario de cierre", tCi2, null, "rf-ci2"), campo("Cierre para salida de Chile", tCs, "Déjalo vacío si no aplica.", "rf-cs"))),
      campo("Observaciones", obs, "Por ejemplo: horario diferenciado por tipo de transporte, contingencias, restricciones.", "rf-obs"),
      h("div", { class: "row" }, btn));
    cont.appendChild(form);
    // si el administrador edita un día concreto, cargamos ese día; si no, el que corresponda
    cargarFecha();
    return cont;
  }

  // ---------- coordinador ----------
  function vistaCoordinador() {
    var c = porCid(S.u.complejo);
    var historial = h("div"), plazo = h("div", { "aria-live": "polite" }), hoyReg = null, tick = null;
    function pintarPlazo() {
      var ya = ahoraChile(), lim = aMin(S.horaLimite); plazo.innerHTML = "";
      var f = fFecha(S.hoy), cont;
      if (hoyReg) {
        var pz = plazoDe(hoyReg, S.hoy);
        cont = h("div", { class: "plazo " + (pz.tono === "ok" ? "ok" : "aviso") }, h("div", { class: "plazo-t" }, "✓ Reporte de hoy enviado"),
          h("div", null, "Estado informado: ", pill(hoyReg.estado), " · guardado a las " + (hoyReg.actualizado || "").slice(11, 16) + (pz.tono === "ok" ? ", dentro del plazo." : ", después del plazo de las " + S.horaLimite + ".")),
          h("div", { class: "small muted" }, "Si cambia la situación durante el día, corrígelo abajo y vuelve a guardar."));
      } else if (ya.min <= lim) {
        cont = h("div", { class: "plazo pend" }, h("div", { class: "plazo-t" }, "⏰ Reporte de hoy pendiente"),
          h("div", null, "Debes informar hasta las ", h("b", null, S.horaLimite), " si el complejo está abierto, con restricción o cerrado. Faltan ", h("b", null, duracion(lim - ya.min)), "."));
      } else {
        cont = h("div", { class: "plazo atras" }, h("div", { class: "plazo-t" }, "! Reporte atrasado"),
          h("div", null, "El plazo de hoy era las ", h("b", null, S.horaLimite), " y todavía no registras el estado del complejo. Complétalo ahora."));
      }
      plazo.appendChild(cont);
    }
    tick = setInterval(function () { if (!document.body.contains(plazo)) { clearInterval(tick); return; } pintarPlazo(); }, 30000);
    var cuerpo = h("div", { class: "page" },
      h("div", { class: "page-head" }, h("div", null, h("h1", null, nombreComplejo(c)), h("div", { class: "muted" }, c.region + " · " + (c.pais || "País limítrofe sin definir") + " · " + c.tipo + " · ID " + c.id))),
      plazo,
      h("div", { class: "card" }, h("h2", null, "Registro diario"),
        formRegistro({ complejo: c.cid, fecha: S.hoy, minFecha: sumaDias(S.hoy, -7), onGuardado: cargarHistorial })),
      h("div", { class: "card" }, h("h2", null, "Mis últimos registros"), historial),
      h("details", { class: "card" }, h("summary", { style: "cursor:pointer;font-weight:600" }, "Cambiar mi contraseña"), h("div", { style: "margin-top:12px" }, vistaCambiarClave(false))));
    app.appendChild(cuerpo);
    function cargarHistorial() {
      api("registros", { query: "desde=" + sumaDias(S.hoy, -30) + "&hasta=" + S.hoy }).then(function (j) {
        hoyReg = j.registros.filter(function (r) { return r.fecha === S.hoy; })[0] || null; pintarPlazo();
        historial.innerHTML = "";
        if (!j.registros.length) { historial.appendChild(h("p", { class: "muted" }, "Todavía no has guardado registros.")); return; }
        historial.appendChild(h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, ["Fecha", "Estado", "Motivo", "Carga", "Buses", "V. menores", "Horario", "Plazo", "Guardado"].map(function (t) { return h("th", null, t); }))),
          h("tbody", null, j.registros.map(function (r) {
            var pz = plazoDe(r, r.fecha);
            return h("tr", null, h("td", { class: "nowrap" }, fFecha(r.fecha)), h("td", null, pill(r.estado)), h("td", null, r.motivo || "—"), h("td", null, r.carga), h("td", null, r.buses), h("td", null, r.menores),
              h("td", { class: "nowrap" }, (r.apertura || "—") + " a " + (r.cierre || "—")), h("td", null, h("span", { class: "pill " + pz.tono }, pz.txt)), h("td", { class: "nowrap small" }, fHoraMin(r.actualizado)));
          })))));
      }).catch(function (e) { historial.appendChild(mensaje("error", e.message)); });
    }
    pintarPlazo(); cargarHistorial();
  }

  // ---------- administrador ----------
  var PESTANAS = [["hoy", "Resumen del día"], ["registros", "Registros"], ["cuentas", "Cuentas de coordinadores"], ["excel", "Exportar a Excel"], ["config", "Configuración"], ["cuenta", "Mi cuenta"]];
  function vistaAdmin() {
    var tabs = h("div", { class: "tabs", role: "tablist" }, PESTANAS.map(function (p) {
      return h("button", { class: "tab", role: "tab", "aria-selected": String(S.pestana === p[0]), onclick: function () { S.pestana = p[0]; render(); } }, p[1]);
    }));
    app.appendChild(tabs);
    var page = h("div", { class: "page" });
    app.appendChild(page);
    ({ hoy: adminHoy, registros: adminRegistros, cuentas: adminCuentas, excel: adminExcel, config: adminConfig, cuenta: function (p) { p.appendChild(h("h1", { style: "margin-bottom:14px" }, "Mi cuenta")); p.appendChild(vistaCambiarClave(false)); } })[S.pestana](page);
  }

  function modalEditar(cx, fecha, alCerrar) {
    var c = porCid(cx);
    var velo = h("div", { class: "velo", onclick: function (ev) { if (ev.target === velo) cerrar(); } });
    function cerrar() { velo.remove(); if (alCerrar) alCerrar(); }
    velo.appendChild(h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": "Registro de " + nombreComplejo(c) },
      h("div", { class: "row", style: "justify-content:space-between;margin-bottom:12px" }, h("h2", null, nombreComplejo(c) + " — " + c.region), h("button", { class: "btn sec small", onclick: cerrar }, "Cerrar")),
      formRegistro({ complejo: cx, fecha: fecha })));
    document.body.appendChild(velo);
  }

  function adminHoy(page) {
    var fecha = S.fechaResumen || S.hoy;
    var cuerpo = h("div");
    var inp = h("input", { type: "date", id: "ah-f", value: fecha, max: S.hoy, onchange: function () { S.fechaResumen = inp.value || S.hoy; render(); } });
    page.appendChild(h("div", { class: "page-head" }, h("div", null, h("h1", null, "Resumen del día"), h("div", { class: "muted" }, "Estado de los " + S.catalogo.length + " complejos fronterizos.")),
      h("div", { style: "min-width:200px" }, campo("Fecha", inp, null, "ah-f"))));
    page.appendChild(cuerpo);
    api("registros", { query: "desde=" + fecha + "&hasta=" + fecha }).then(function (j) {
      var mapa = {}; j.registros.forEach(function (r) { mapa[r.complejo] = r; });
      var cuenta = { "Habilitado": 0, "Habilitado con Restricción": 0, "No Habilitado": 0, "Alerta": 0, sin: 0 };
      S.catalogo.forEach(function (c) { var r = mapa[c.cid]; if (r) cuenta[r.estado]++; else cuenta.sin++; });
      var fEstado = h("select", { id: "ah-e", onchange: pintar }, h("option", { value: "" }, "Todos los estados"), S.estados.map(function (e) { return h("option", { value: e }, e); }), h("option", { value: "sin" }, "Sin registro"));
      var regs = []; S.catalogo.forEach(function (c) { if (regs.indexOf(c.region) < 0) regs.push(c.region); });
      var fReg = h("select", { id: "ah-r", onchange: pintar }, h("option", { value: "" }, "Todas las regiones"), regs.map(function (r) { return h("option", { value: r }, r); }));
      var tabla = h("div");
      cuerpo.appendChild(h("div", { class: "kpis" }, [["Habilitados", cuenta["Habilitado"]], ["Con restricción", cuenta["Habilitado con Restricción"]], ["No habilitados", cuenta["No Habilitado"]], ["En alerta", cuenta["Alerta"]], ["Sin registro", cuenta.sin]].map(function (k) { return h("div", { class: "kpi" }, h("b", null, k[1]), k[0]); })));
      cuerpo.appendChild(h("div", { class: "filtros" }, campo("Estado", fEstado, null, "ah-e"), campo("Región", fReg, null, "ah-r")));
      cuerpo.appendChild(tabla);
      function pintar() {
        tabla.innerHTML = "";
        var filas = S.catalogo.filter(function (c) {
          var r = mapa[c.cid];
          if (fReg.value && c.region !== fReg.value) return false;
          if (fEstado.value === "sin") return !r;
          if (fEstado.value) return r && r.estado === fEstado.value;
          return true;
        });
        tabla.appendChild(h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, ["Región", "Complejo", "Estado", "Plazo (" + S.horaLimite + ")", "Motivo", "Carga / Buses / V. menores", "Horario", "Última actualización", ""].map(function (t) { return h("th", null, t); }))),
          h("tbody", null, filas.map(function (c) {
            var r = mapa[c.cid];
            return h("tr", null, h("td", null, c.region.replace(/^Región (de la |de los |del |de )?/, "")), h("td", null, h("b", null, nombreComplejo(c))),
              h("td", null, pill(r && r.estado)), h("td", null, (function () { var pz = plazoDe(r, fecha); return h("span", { class: "pill " + pz.tono }, pz.txt); })()), h("td", null, r && r.motivo || "—"),
              h("td", null, r ? r.carga + " / " + r.buses + " / " + r.menores : "—"),
              h("td", { class: "nowrap" }, r ? (r.apertura || "—") + " a " + (r.cierre || "—") : "—"),
              h("td", { class: "small" }, r ? fHoraMin(r.actualizado) + " · " + r.actualizado_por : "Pendiente"),
              h("td", null, h("button", { class: "btn sec small", onclick: function () { modalEditar(c.cid, fecha, render); } }, r ? "Ver / editar" : "Registrar")));
          })))));
        if (!filas.length) tabla.appendChild(h("p", { class: "muted" }, "Ningún complejo coincide con los filtros."));
      }
      pintar();
    }).catch(function (e) { cuerpo.appendChild(mensaje("error", e.message)); });
  }

  function adminRegistros(page) {
    var desde = S.fDesde || sumaDias(S.hoy, -7), hasta = S.fHasta || S.hoy, cx = S.fComplejo || "";
    var iD = h("input", { type: "date", id: "ar-d", value: desde, max: S.hoy }), iH = h("input", { type: "date", id: "ar-h", value: hasta, max: S.hoy });
    var iC = h("select", { id: "ar-c" }, h("option", { value: "" }, "Todos los complejos"), S.catalogo.map(function (c) { return h("option", { value: c.cid, selected: c.cid === cx ? "selected" : null }, nombreComplejo(c)); }));
    var res = h("div");
    function buscar() { S.fDesde = iD.value; S.fHasta = iH.value; S.fComplejo = iC.value; cargar(); }
    function cargar() {
      res.innerHTML = "";
      api("registros", { query: "desde=" + iD.value + "&hasta=" + iH.value + (iC.value ? "&complejo=" + encodeURIComponent(iC.value) : "") }).then(function (j) {
        res.appendChild(h("p", { class: "muted small" }, j.registros.length + " registro(s)" + (j.registros.length >= 5000 ? " (se muestran los primeros 5.000; acota el rango de fechas)" : "") + "."));
        if (!j.registros.length) return;
        res.appendChild(h("div", { class: "table-wrap" }, h("table", null,
          h("thead", null, h("tr", null, ["Fecha", "Complejo", "Estado", "Motivo", "Carga", "Buses", "V. menores", "Horario", "Guardado por", ""].map(function (t) { return h("th", null, t); }))),
          h("tbody", null, j.registros.map(function (r) {
            var c = porCid(r.complejo);
            return h("tr", null, h("td", { class: "nowrap" }, fFecha(r.fecha)), h("td", null, c ? nombreComplejo(c) : r.complejo), h("td", null, pill(r.estado)), h("td", null, r.motivo || "—"), h("td", null, r.carga), h("td", null, r.buses), h("td", null, r.menores),
              h("td", { class: "nowrap" }, (r.apertura || "—") + " a " + (r.cierre || "—")), h("td", { class: "small" }, r.actualizado_por + " · " + fHoraMin(r.actualizado)),
              h("td", null, h("button", { class: "btn sec small", onclick: function () { modalEditar(r.complejo, r.fecha, cargar); } }, "Editar")));
          })))));
      }).catch(function (e) { res.appendChild(mensaje("error", e.message)); });
    }
    page.appendChild(h("div", { class: "page-head" }, h("h1", null, "Registros")));
    page.appendChild(h("div", { class: "filtros" }, campo("Desde", iD, null, "ar-d"), campo("Hasta", iH, null, "ar-h"), campo("Complejo", iC, null, "ar-c"), h("div", { class: "field", style: "justify-content:flex-end" }, h("button", { class: "btn", onclick: buscar }, "Buscar"))));
    page.appendChild(res);
    cargar();
  }

  function claveAleatoria() {
    var a = "abcdefghjkmnpqrstuvwxyz23456789", o = "", v = new Uint32Array(10);
    (window.crypto || window.msCrypto).getRandomValues(v);
    for (var i = 0; i < 10; i++) { o += a[v[i] % a.length]; if (i === 4) o += "-"; }
    return o;
  }
  function modalSimple(titulo, contenido) {
    var velo = h("div", { class: "velo", onclick: function (ev) { if (ev.target === velo) velo.remove(); } });
    var m = h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": titulo, style: "max-width:560px" },
      h("div", { class: "row", style: "justify-content:space-between;margin-bottom:12px" }, h("h2", null, titulo), h("button", { class: "btn sec small", onclick: function () { velo.remove(); } }, "Cerrar")), contenido(function () { velo.remove(); }));
    velo.appendChild(m); document.body.appendChild(velo);
    var primero = m.querySelector("input,select"); if (primero) primero.focus();
  }
  function campoClave(id, valor) {
    var i = h("input", { type: "text", id: id, autocomplete: "off", value: valor || "", class: "credenciales", spellcheck: "false" });
    var fila = h("div", { class: "row", style: "flex-wrap:nowrap" }, i, h("button", { type: "button", class: "btn sec small", onclick: function () { i.value = claveAleatoria(); } }, "Generar"));
    return { input: i, nodo: h("div", { class: "field" }, h("label", { for: id }, "Contraseña temporal"), fila, h("div", { class: "hint" }, "Mínimo 8 caracteres. En su primer ingreso, el coordinador deberá crear su propia contraseña.")) };
  }

  function adminCuentas(page) {
    var cred = h("div"), cuerpo = h("div");
    var optsComplejo = function (sel) { return S.catalogo.map(function (c) { return h("option", { value: c.cid, selected: c.cid === sel ? "selected" : null }, nombreComplejo(c) + " — " + c.region.replace(/^Región (de la |de los |del |de )?/, "")); }); };

    function formCuenta(cuenta, complejoInicial, alGuardar, nuevoAdmin) { // cuenta null = crear
      var esAdmin = nuevoAdmin || (cuenta && cuenta.rol === "admin");
      return function (cerrar) {
        var err = h("div");
        var nom = h("input", { type: "text", id: "fc-n", value: cuenta ? cuenta.nombre : "", autocomplete: "off", maxlength: 80 });
        var cx = h("select", { id: "fc-c" }, h("option", { value: "" }, "— Elige el complejo —"), optsComplejo(cuenta ? cuenta.complejo : complejoInicial));
        var usu = h("input", { type: "text", id: "fc-u", value: cuenta ? cuenta.usuario : "", autocapitalize: "none", autocomplete: "off", spellcheck: "false" });
        var tocoUsuario = !!cuenta;
        usu.addEventListener("input", function () { tocoUsuario = true; });
        cx.addEventListener("change", function () { if (!tocoUsuario) usu.value = cx.value; });
        if (!cuenta && complejoInicial) usu.value = complejoInicial;
        if (esAdmin) cx.value = "";
        var ck = cuenta ? null : campoClave("fc-k", claveAleatoria());
        var btn = h("button", { class: "btn", type: "submit" }, cuenta ? "Guardar cambios" : "Crear cuenta");
        return h("form", { onsubmit: function (ev) {
          ev.preventDefault(); err.innerHTML = ""; btn.disabled = true;
          var body = { nombre: nom.value, complejo: cx.value, usuario: usu.value };
          if (cuenta) body.id = cuenta.id; else body.clave = ck.input.value;
          post(cuenta ? "editar_cuenta" : (esAdmin ? "crear_admin" : "crear_cuenta"), body).then(function (r) {
            cerrar(); alGuardar(r);
          }).catch(function (e) { err.appendChild(mensaje("error", e.message)); btn.disabled = false; });
        } }, err,
          campo(esAdmin ? "Nombre del administrador" : "Nombre del coordinador", nom, "Quedará como responsable de los cambios que guarde.", "fc-n"),
          esAdmin ? null : campo("Complejo fronterizo", cx, null, "fc-c"),
          campo("Usuario", usu, "Con el que ingresará. Letras sin tilde, números, punto o guion.", "fc-u"),
          ck ? ck.nodo : null, h("div", { class: "row" }, btn));
      };
    }

    page.appendChild(h("div", { class: "page-head" }, h("div", null, h("h1", null, "Cuentas de coordinadores"), h("div", { class: "muted" }, "Crea, edita, desactiva o elimina las cuentas. Cada coordinador solo ve y registra su complejo; los administradores ven todo.")),
      h("div", { class: "row" },
        h("button", { class: "btn sec", onclick: function () { modalSimple("Nuevo administrador", formCuenta(null, "", function (r) { mostrarCreds([r.cuenta], "Administrador creado"); cargar(); }, true)); } }, "Nuevo administrador"),
        h("button", { class: "btn", onclick: function () { modalSimple("Nueva cuenta de coordinador", formCuenta(null, "", function (r) { mostrarCreds([r.cuenta], "Cuenta creada"); cargar(); })); } }, "Nueva cuenta"),
        h("button", { class: "btn sec", onclick: function () { if (!confirm("Se crearán cuentas con contraseña temporal para todos los complejos que aún no tienen ninguna. ¿Continuar?")) return; post("crear_todas").then(function (j) { mostrarCreds(j.cuentas, "Cuentas creadas"); cargar(); }).catch(function (e) { alert(e.message); }); } }, "Crear cuentas faltantes"))));
    page.appendChild(cred); page.appendChild(cuerpo);

    function mostrarCreds(lista, titulo) {
      cred.innerHTML = "";
      if (!lista.length) { cred.appendChild(mensaje("aviso", "No había cuentas pendientes de crear.")); return; }
      var csv = "Complejo;Nombre;Usuario;Contraseña temporal\n" + lista.map(function (x) { return [x.nombre_complejo, x.nombre || "", x.usuario, x.clave].join(";"); }).join("\n");
      cred.appendChild(h("div", { class: "card info" }, h("h2", null, titulo),
        h("div", { class: "msg aviso" }, "Entrega estos datos al coordinador ahora: por seguridad la contraseña temporal no se vuelve a mostrar (si se pierde, puedes asignar otra). En su primer ingreso deberá crear su propia contraseña."),
        h("div", { class: "table-wrap", style: "background:#fff;margin-bottom:12px" }, h("table", null, h("thead", null, h("tr", null, ["Complejo", "Usuario", "Contraseña temporal"].map(function (t) { return h("th", null, t); }))),
          h("tbody", null, lista.map(function (x) { return h("tr", null, h("td", null, x.nombre_complejo), h("td", { class: "credenciales" }, x.usuario), h("td", { class: "credenciales" }, x.clave)); })))),
        h("div", { class: "row no-print" }, h("button", { class: "btn", onclick: function () { descargar("credenciales-coordinadores.csv", csv); } }, "Descargar lista (CSV)"), h("button", { class: "btn sec", onclick: function () { window.print(); } }, "Imprimir"), h("button", { class: "btn sec", onclick: function () { cred.innerHTML = ""; } }, "Ocultar"))));
      cred.scrollIntoView({ block: "nearest" });
    }

    function nuevaClave(x) {
      modalSimple("Contraseña temporal para " + x.usuario, function (cerrar) {
        var err = h("div"), ck = campoClave("fk", claveAleatoria());
        var btn = h("button", { class: "btn", type: "submit" }, "Asignar contraseña temporal");
        return h("form", { onsubmit: function (ev) {
          ev.preventDefault(); err.innerHTML = ""; btn.disabled = true;
          post("restablecer", { id: x.id, clave: ck.input.value }).then(function (r) {
            cerrar(); var c = x.complejo ? porCid(x.complejo) : null;
            mostrarCreds([{ nombre_complejo: c ? nombreComplejo(c) : "Administrador", nombre: x.nombre, usuario: r.usuario, clave: r.clave }], "Contraseña temporal asignada"); cargar();
          }).catch(function (e) { err.appendChild(mensaje("error", e.message)); btn.disabled = false; });
        } }, err, h("p", { class: "muted small" }, "La contraseña actual de " + x.nombre + " dejará de servir y deberá crear una nueva al ingresar."), ck.nodo, h("div", { class: "row" }, btn));
      });
    }

    function cargar() {
      api("cuentas").then(function (j) {
        cuerpo.innerHTML = "";
        var coords = j.cuentas.filter(function (x) { return x.rol === "coordinador"; });
        var con = {}; coords.forEach(function (x) { con[x.complejo] = true; });
        var sin = S.catalogo.filter(function (c) { return !con[c.cid]; });
        cuerpo.appendChild(h("p", { class: "muted small" }, coords.length + " cuenta(s) de coordinador · " + sin.length + " complejo(s) sin cuenta."));
        if (coords.length) cuerpo.appendChild(h("div", { class: "table-wrap", style: "margin-bottom:20px" }, h("table", null,
          h("thead", null, h("tr", null, ["Coordinador", "Usuario", "Complejo", "Situación", "Acciones"].map(function (t) { return h("th", null, t); }))),
          h("tbody", null, coords.map(function (x) {
            var c = porCid(x.complejo);
            var sit = !x.activo ? h("span", { class: "pill crit" }, "✕ Desactivada") : x.cambiar ? h("span", { class: "pill warn" }, "! Pendiente de primer ingreso") : h("span", { class: "pill ok" }, "✓ Activa");
            return h("tr", null, h("td", null, h("b", null, x.nombre)), h("td", { class: "credenciales" }, x.usuario), h("td", null, c ? nombreComplejo(c) : x.complejo), h("td", null, sit),
              h("td", null, h("div", { class: "row" },
                h("button", { class: "btn sec small", onclick: function () { modalSimple("Editar cuenta", formCuenta(x, "", function () { cargar(); })); } }, "Editar"),
                h("button", { class: "btn sec small", onclick: function () { nuevaClave(x); } }, "Contraseña temporal"),
                h("button", { class: x.activo ? "btn peligro small" : "btn sec small", onclick: function () { post("activar", { id: x.id, activo: !x.activo }).then(cargar).catch(function (e) { alert(e.message); }); } }, x.activo ? "Desactivar" : "Activar"),
                h("button", { class: "btn peligro small", onclick: function () { if (!confirm("¿Eliminar la cuenta de " + x.nombre + " (" + x.usuario + ")? Sus registros anteriores se conservan, pero ya no podrá ingresar.")) return; post("eliminar_cuenta", { id: x.id }).then(cargar).catch(function (e) { alert(e.message); }); } }, "Eliminar"))));
          })))));
        var admins = j.cuentas.filter(function (x) { return x.rol === "admin"; });
        if (admins.length) {
          cuerpo.appendChild(h("h2", { style: "margin-bottom:10px" }, "Administradores"));
          cuerpo.appendChild(h("div", { class: "table-wrap", style: "margin-bottom:20px" }, h("table", null,
            h("thead", null, h("tr", null, ["Administrador", "Usuario", "Situación", "Acciones"].map(function (t) { return h("th", null, t); }))),
            h("tbody", null, admins.map(function (x) {
              var yoMismo = x.id === S.u.id;
              var sit = !x.activo ? h("span", { class: "pill crit" }, "✕ Desactivada") : x.cambiar ? h("span", { class: "pill warn" }, "! Pendiente de primer ingreso") : h("span", { class: "pill ok" }, "✓ Activa");
              return h("tr", null, h("td", null, h("b", null, x.nombre), yoMismo ? " (tú)" : ""), h("td", { class: "credenciales" }, x.usuario), h("td", null, sit),
                h("td", null, yoMismo ? h("span", { class: "muted small" }, "Tu contraseña se cambia en “Mi cuenta”") : h("div", { class: "row" },
                  h("button", { class: "btn sec small", onclick: function () { modalSimple("Editar administrador", formCuenta(x, "", function () { cargar(); })); } }, "Editar"),
                  h("button", { class: "btn sec small", onclick: function () { nuevaClave(x); } }, "Contraseña temporal"),
                  h("button", { class: x.activo ? "btn peligro small" : "btn sec small", onclick: function () { post("activar", { id: x.id, activo: !x.activo }).then(cargar).catch(function (e) { alert(e.message); }); } }, x.activo ? "Desactivar" : "Activar"),
                  h("button", { class: "btn peligro small", onclick: function () { if (!confirm("¿Eliminar la cuenta de administrador de " + x.nombre + " (" + x.usuario + ")?")) return; post("eliminar_cuenta", { id: x.id }).then(cargar).catch(function (e) { alert(e.message); }); } }, "Eliminar"))));
            })))));
        }
        if (sin.length) {
          cuerpo.appendChild(h("h2", { style: "margin-bottom:10px" }, "Complejos sin cuenta"));
          cuerpo.appendChild(h("div", { class: "table-wrap" }, h("table", null, h("thead", null, h("tr", null, ["Complejo", "Región", ""].map(function (t) { return h("th", null, t); }))),
            h("tbody", null, sin.map(function (c) {
              return h("tr", null, h("td", null, h("b", null, nombreComplejo(c))), h("td", null, c.region), h("td", null, h("button", { class: "btn small", onclick: function () { modalSimple("Nueva cuenta de coordinador", formCuenta(null, c.cid, function (r) { mostrarCreds([r.cuenta], "Cuenta creada"); cargar(); })); } }, "Crear cuenta")));
            })))));
        }
      }).catch(function (e) { cuerpo.appendChild(mensaje("error", e.message)); });
    }
    cargar();
  }

  function adminConfig(page) {
    var err = h("div");
    var hl = h("input", { type: "text", id: "cf-h", value: S.horaLimite, inputmode: "numeric", placeholder: "HH:MM", maxlength: 5, pattern: "([01][0-9]|2[0-3]):[0-5][0-9]" });
    var btn = h("button", { class: "btn", type: "submit" }, "Guardar");
    page.appendChild(h("div", { class: "page-head" }, h("h1", null, "Configuración")));
    page.appendChild(h("div", { class: "card", style: "max-width:560px" }, h("h2", null, "Hora límite del reporte diario"),
      h("p", { class: "muted" }, "Cada coordinador ve en su pantalla hasta qué hora debe informar si el complejo está abierto, con restricción o cerrado. Pasada esa hora, el reporte aparece como atrasado, y la hora sale en el pie “HORARIO REPORTE” del Resumen Diario en Excel."),
      h("form", { onsubmit: function (ev) {
        ev.preventDefault(); err.innerHTML = ""; var v = (hl.value || "").trim(); var m = /^(\d{1,2})[:.]?(\d{2})$/.exec(v);
        if (m) v = ("0" + m[1]).slice(-2) + ":" + m[2];
        btn.disabled = true;
        post("guardar_config", { hora_limite: v }).then(function (j) { S.horaLimite = j.hora_limite; hl.value = j.hora_limite; err.appendChild(mensaje("ok", "Hora límite guardada: " + j.hora_limite + ".")); btn.disabled = false; })
          .catch(function (e) { err.appendChild(mensaje("error", e.message)); btn.disabled = false; });
      } }, err, campo("Hora límite (formato 24 horas, hora de Chile)", hl, "Por ejemplo 08:55. Aplica todos los días.", "cf-h"), h("div", { class: "row" }, btn))));
  }

  function adminExcel(page) {
    var anio = S.hoy.slice(0, 4);
    // 1) Resumen Diario (un día)
    var iF = h("input", { type: "date", id: "ae-f", value: S.eFecha || S.hoy, max: S.hoy });
    var infoF = h("div");
    function actualizarF() {
      S.eFecha = iF.value; infoF.innerHTML = "";
      if (!iF.value) return;
      api("registros", { query: "desde=" + iF.value + "&hasta=" + iF.value }).then(function (j) {
        var falta = S.catalogo.length - j.registros.length;
        infoF.appendChild(falta > 0 ? mensaje("aviso", "El " + fFecha(iF.value) + " hay " + j.registros.length + " de " + S.catalogo.length + " complejos con registro. Los " + falta + " restantes saldrán con el estado en blanco.") : mensaje("ok", "Los " + S.catalogo.length + " complejos tienen registro el " + fFecha(iF.value) + "."));
      }).catch(function (e) { infoF.appendChild(mensaje("error", e.message)); });
    }
    iF.addEventListener("change", actualizarF);
    page.appendChild(h("div", { class: "page-head" }, h("h1", null, "Exportar a Excel")));
    page.appendChild(h("div", { class: "card", style: "max-width:760px" },
      h("h2", null, "Resumen Diario"),
      h("p", null, "Descarga la hoja “Resumen Diario” del día elegido, igual a la del Excel original: título con la fecha, región, complejo, país limítrofe, tipo de habilitación, estado de operación, motivo de no habilitación y el pie “HORARIO REPORTE”."),
      h("div", { style: "max-width:260px" }, campo("Fecha del resumen", iF, null, "ae-f")), infoF,
      h("div", { class: "row" }, h("button", { class: "btn", onclick: function () { if (!iF.value) return; irA("api.php?a=exportar_resumen&fecha=" + iF.value); } }, "Descargar Resumen Diario"))));

    // 2) Registro por período (hoja de estado de operación)
    var iD = h("input", { type: "date", id: "ae-d", value: S.eDesde || anio + "-01-01", max: S.hoy }), iH = h("input", { type: "date", id: "ae-h", value: S.eHasta || S.hoy, max: S.hoy });
    var info = h("div");
    function actualizar() {
      S.eDesde = iD.value; S.eHasta = iH.value; info.innerHTML = "";
      if (!iD.value || !iH.value || iD.value > iH.value) { info.appendChild(mensaje("error", "Revisa las fechas: “desde” debe ser anterior o igual a “hasta”.")); return; }
      api("registros", { query: "desde=" + iD.value + "&hasta=" + iH.value }).then(function (j) {
        info.appendChild(h("p", { class: "muted" }, "El archivo incluirá " + j.registros.length + " fila(s), una por complejo y día registrado."));
      }).catch(function (e) { info.appendChild(mensaje("error", e.message)); });
    }
    iD.addEventListener("change", actualizar); iH.addEventListener("change", actualizar);
    page.appendChild(h("div", { class: "card", style: "max-width:760px" },
      h("h2", null, "Registro anual (por período)"),
      h("p", null, "Descarga el registro día a día de todos los complejos con el formato de la hoja “Estado de Operación” del registro anual (20 columnas)."),
      h("div", { class: "grid2" }, campo("Desde", iD, null, "ae-d"), campo("Hasta", iH, null, "ae-h")), info,
      h("div", { class: "row" }, h("button", { class: "btn sec", onclick: function () {
        if (!iD.value || !iH.value || iD.value > iH.value) return;
        irA("api.php?a=exportar&desde=" + iD.value + "&hasta=" + iH.value);
      } }, "Descargar registro del período"))));
    actualizarF(); actualizar();
  }

  cargarEstado();
})();
