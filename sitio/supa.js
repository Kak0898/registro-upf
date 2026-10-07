/* Conexión con Supabase: reemplaza al servidor (api.php) hablando directamente con la base de datos.
   La aplicación (app.js) no cambia: sigue pidiendo "api.php?a=..." y este archivo lo traduce.
   Necesita config.js con la dirección del proyecto y su clave pública (anon / publishable). */
(function () {
  "use strict";
  var CFG = window.UPF_CONFIG || {};
  var DATA = JSON.parse(document.getElementById("catalogo-json").textContent);
  var CAT = {}; DATA.catalogo.forEach(function (c) { CAT[c.cid] = c; });
  var ORDEN = DATA.catalogo.map(function (c) { return c.cid; });
  var DOMINIO = "@upf-registro.local";
  var horaLimite = "08:55";
  var realFetch = window.fetch.bind(window);
  var SKEY = "upf-sesion-v1", ses = null;

  function Err(msg, code) { this.msg = msg; this.code = code || 400; }
  function fail(m, c) { throw new Err(m, c); }
  function hora12(h) { var m = /^(\d{2}):(\d{2})$/.exec(h || ""); if (!m) return "08:55 AM"; var H = +m[1], ap = H >= 12 ? "PM" : "AM"; H = H % 12 || 12; return ("0" + H).slice(-2) + ":" + m[2] + " " + ap; }
  function chileHoy() {
    try { var p = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; }); return p.year + "-" + p.month + "-" + p.day; }
    catch (e) { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  }
  function aviso(t) { var b = document.getElementById("aviso-global"); if (b) { b.textContent = t; b.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(function () { b.hidden = true; }, 6000); } }

  // ---------- Excel (mismo diseño que la versión PHP) ----------
  function esc(s) { return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function col(i) { var s = ""; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - m - 1) / 26); } return s; }
  function XS(fonts, fills, borders, numFmts) {
    var xfs = [], idx = {};
    return { get: function (font, fill, border, fmt, h, v, wrap) {
      var k = [font, fill, border, fmt, h, v, wrap ? 1 : 0].join("|");
      if (!idx[k]) { idx[k] = xfs.length + 1; xfs.push('<xf numFmtId="' + fmt + '" fontId="' + font + '" fillId="' + fill + '" borderId="' + border + '" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="' + h + '" vertical="' + v + '"' + (wrap ? ' wrapText="1"' : "") + "/></xf>"); }
      return idx[k];
    }, xml: function () {
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + (numFmts || "") + '<fonts count="' + fonts.length + '">' + fonts.join("") + '</fonts><fills count="' + fills.length + '">' + fills.join("") + '</fills><borders count="' + borders.length + '">' + borders.join("") + '</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' + (xfs.length + 1) + '"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + xfs.join("") + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    } };
  }
  var F = function (b, sz, rgb) { return "<font>" + (b ? "<b/>" : "") + '<sz val="' + sz + '"/><color rgb="' + rgb + '"/><name val="Calibri"/></font>'; };
  var FL = function (rgb) { return '<fill><patternFill patternType="solid"><fgColor rgb="' + rgb + '"/><bgColor rgb="' + rgb + '"/></patternFill></fill>'; };
  var BD = function (l, r, t, b) { return '<border><left style="' + l + '"><color rgb="FF000000"/></left><right style="' + r + '"><color rgb="FF000000"/></right><top style="' + t + '"><color rgb="FF000000"/></top><bottom style="' + b + '"><color rgb="FF000000"/></bottom><diagonal/></border>'; };
  var NOFILL = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  var NOB = "<border><left/><right/><top/><bottom/><diagonal/></border>";
  function cel(ref, s, v) { return (v === "" || v === null || v === undefined) ? '<c r="' + ref + '" s="' + s + '"/>' : '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + "</t></is></c>"; }
  var CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>@@<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  var REL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  function empaquetar(wb, rels, sheets, styles, extraCT) {
    var z = new JSZip();
    z.file("[Content_Types].xml", CT.replace("@@", extraCT || ""));
    z.file("_rels/.rels", REL); z.file("xl/_rels/workbook.xml.rels", rels); z.file("xl/workbook.xml", wb); z.file("xl/styles.xml", styles);
    sheets.forEach(function (x, i) { z.file("xl/worksheets/sheet" + (i + 1) + ".xml", x); });
    return z.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  }
  function xlsxResumen(fecha, porC) {
    var st = XS([F(0, 11, "FF000000"), F(1, 11, "FFFFFFFF"), F(1, 12, "FF000000"), F(0, 12, "FF000000"), F(1, 12, "FFFF0000"), F(1, 11, "FF000000")], NOFILL.concat([FL("FF4F6128"), FL("FFD8D8D8"), FL("FFC2D69B"), FL("FFF2F2F2"), FL("FFBFBFBF")]), [NOB, BD("thin", "thin", "thin", "thin"), BD("medium", "medium", "medium", "medium")]);
    var p = fecha.split("-"), titulo = "COMPLEJOS FRONTERIZOS NO HABILITADOS\n" + p[2] + "-" + p[1] + "-" + p[0];
    var sT = st.get(1, 2, 0, 0, "center", "center", true), sH = st.get(2, 3, 1, 0, "center", "center");
    var rows = '<row r="2">' + cel("A2", sT, titulo) + ["B", "C", "D", "E", "F"].map(function (L) { return '<c r="' + L + '2" s="' + sT + '"/>'; }).join("") + "</row>";
    rows += '<row r="3">' + ["A", "B", "C", "D", "E", "F"].map(function (L) { return '<c r="' + L + '3" s="' + sT + '"/>'; }).join("") + "</row>";
    rows += '<row r="4" ht="17.25" customHeight="1">' + ["REGIÓN", "COMPLEJO FRONTERIZO", "PAÍS LIMÍTROFE", "TIPO DE HABILITACIÓN", "ESTADO DE OPERACIÓN", "MOTIVO DE NO HABILITACIÓN"].map(function (t, i) { return cel(col(i + 1) + "4", sH, t); }).join("") + "</row>";
    var n = 4, ant = null, verde = false;
    ORDEN.forEach(function (cid) {
      var c = CAT[cid]; n++;
      if (c.region !== ant) { verde = !verde; ant = c.region; }
      var fb = verde ? 4 : 5, r = porC[cid], est = r ? r.estado : "";
      rows += '<row r="' + n + '" ht="15.75" customHeight="1">' + cel("A" + n, st.get(2, fb, 1, 0, "left", "center"), c.region) + cel("B" + n, st.get(3, fb, 1, 0, "left", "center"), c.complejo) + cel("C" + n, st.get(3, fb, 1, 0, "left", "center"), c.pais) + cel("D" + n, st.get(3, fb, 1, 0, "left", "center"), c.tipo) + cel("E" + n, st.get(est === "No Habilitado" ? 4 : 2, 5, 1, 0, "left", "center"), est) + cel("F" + n, st.get(3, fb, 1, 0, "left", "center"), r ? r.motivo : "") + "</row>";
    });
    var p1 = n + 1, p2 = n + 2, sP = st.get(5, 6, 2, 0, "center", "center", true);
    rows += '<row r="' + p1 + '" ht="15.75" customHeight="1">' + cel("A" + p1, sP, "HORARIO REPORTE\n" + hora12(horaLimite)) + '<c r="B' + p1 + '" s="' + sP + '"/></row><row r="' + p2 + '" ht="15.75" customHeight="1"><c r="A' + p2 + '" s="' + sP + '"/><c r="B' + p2 + '" s="' + sP + '"/></row>';
    var cols = [34, 54.57, 18, 23.29, 27.57, 50.29].map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join("");
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" tabSelected="1"/></sheetViews><sheetFormatPr defaultColWidth="14.43" defaultRowHeight="15.0" customHeight="1"/><cols>' + cols + "</cols><sheetData>" + rows + '</sheetData><mergeCells count="2"><mergeCell ref="A2:F3"/><mergeCell ref="A' + p1 + ":B" + p2 + '"/></mergeCells><pageMargins left="0.25" right="0.25" top="0.75" bottom="0.75" header="0" footer="0"/><pageSetup orientation="landscape"/></worksheet>';
    var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Resumen Diario" sheetId="1" r:id="rId1"/></sheets></workbook>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    return empaquetar(wb, rels, [sheet], st.xml());
  }
  function xlsxPeriodo(filas, nombreHoja) {
    var st = XS([F(0, 11, "FF000000"), F(1, 12, "FF000000"), F(0, 12, "FF000000"), F(1, 12, "FFC00000"), F(0, 11, "FF000000")], NOFILL.concat([FL("FFD8D8D8"), FL("FFC4D79B"), FL("FFC2D69B"), FL("FFF2F2F2")]), [NOB, BD("medium", "medium", "medium", "medium"), BD("medium", "medium", "thin", "thin")], '<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="h:mm"/></numFmts>');
    var sHdr = st.get(1, 2, 1, 0, "center", "center", true), sDate = st.get(4, 3, 2, 164, "right", "bottom");
    var rows = '<row r="1">' + DATA.encabezados.map(function (h, i) { return cel(col(i + 1) + "1", sHdr, h); }).join("") + "</row>";
    var n = 1;
    filas.forEach(function (f) {
      n++; var c = CAT[f.r.complejo], r = f.r, band = [4, 5][n % 2], rojo = r.estado === "No Habilitado" || r.estado === "Habilitado con Restricción";
      var sNB = st.get(1, band, 2, 0, "left", "bottom"), sT = st.get(2, band, 2, 0, "left", "bottom"), sE = st.get(rojo ? 3 : 1, band, 2, 0, "left", "bottom"), sHr = st.get(2, band, 2, 165, "left", "bottom");
      var serie = Math.floor(Date.UTC(+f.r.fecha.slice(0, 4), +f.r.fecha.slice(5, 7) - 1, +f.r.fecha.slice(8, 10)) / 86400000) + 25569;
      var row = '<row r="' + n + '"><c r="A' + n + '" s="' + sDate + '"><v>' + serie + "</v></c>" + cel("B" + n, sNB, c.region) + cel("C" + n, sT, c.delegacion) + '<c r="D' + n + '" s="' + sT + '"><v>' + c.id + "</v></c>" + cel("E" + n, sT, c.ubicacion) + cel("F" + n, sT, c.paso) + cel("G" + n, sNB, c.region) + cel("H" + n, sT, c.complejo) + cel("I" + n, sT, c.pais) + cel("J" + n, sT, c.tipo) + cel("K" + n, sE, r.estado) + cel("L" + n, sT, r.motivo) + cel("M" + n, sT, r.carga) + cel("N" + n, sT, r.buses) + cel("O" + n, sT, r.menores);
      [["P", "apertura"], ["Q", "cierre_ingreso"], ["R", "cierre"], ["S", "cierre_salida"]].forEach(function (p) {
        var m = /^(\d{1,2}):(\d{2})$/.exec(r[p[1]] || ""); row += m ? '<c r="' + p[0] + n + '" s="' + sHr + '"><v>' + ((+m[1] * 60 + +m[2]) / 1440) + "</v></c>" : '<c r="' + p[0] + n + '" s="' + sHr + '"/>';
      });
      rows += row + cel("T" + n, sT, r.obs) + "</row>";
    });
    var ult = Math.max(2, n), anchos = [11, 48.43, 49.14, 5.57, 22.86, 26.86, 49, 34.14, 17.57, 23.29, 27.57, 50.29, 26.14, 26.14, 26.14, 24.71, 31.43, 21.29, 31.14, 196.43];
    var cols = anchos.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"' + ([2, 14, 15].indexOf(i + 1) >= 0 ? ' hidden="1"' : "") + "/>"; }).join("");
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><tabColor rgb="FFD6E3BC"/><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" tabSelected="1"/></sheetViews><sheetFormatPr defaultColWidth="14.43" defaultRowHeight="15.0" customHeight="1"/><cols>' + cols + "</cols><sheetData>" + rows + '</sheetData><autoFilter ref="F1:F' + ult + '"/><dataValidations count="2"><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="L2:L' + ult + '"><formula1>Listas!$B$1:$B$' + DATA.motivos.length + '</formula1></dataValidation><dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="K2:K' + ult + " M2:O" + ult + '"><formula1>' + esc('"' + DATA.estados.join(",") + '"') + '</formula1></dataValidation></dataValidations><printOptions horizontalCentered="1" verticalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.75" bottom="0.75" header="0" footer="0"/><pageSetup paperSize="9" orientation="portrait"/></worksheet>';
    var lr = DATA.motivos.map(function (m, i) { return '<row r="' + (i + 1) + '"><c r="B' + (i + 1) + '" t="inlineStr"><is><t>' + esc(m) + "</t></is></c></row>"; }).join("");
    var sheet2 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + lr + "</sheetData></worksheet>";
    var nom = esc(nombreHoja.slice(0, 31));
    var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + nom + '" sheetId="1" r:id="rId1"/><sheet name="Listas" sheetId="2" state="hidden" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'' + nom + "'!$F$1:$F$" + ult + "</definedName></definedNames></workbook>";
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    return empaquetar(wb, rels, [sheet, sheet2], st.xml(), '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
  }

  // ---------- Descargas ----------
  function bajar(nombre, datos) {
    var tipo = /\.xlsx$/.test(nombre) ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv;charset=utf-8";
    var blob = new Blob([datos], { type: tipo }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }
  window.__guardarDemo = function (nombre, texto) { bajar(nombre, texto); };
  window.__descargarDemo = function (url) {
    var q = new URLSearchParams(url.split("?")[1]), a = q.get("a");
    var tarea;
    if (a === "exportar_resumen") {
      var f = q.get("fecha");
      tarea = traerRegistros(f, f, "").then(function (regs) { var porC = {}; regs.forEach(function (r) { porC[r.complejo] = r; }); return xlsxResumen(f, porC); })
        .then(function (u8) { bajar("Resumen_Diario_" + f + ".xlsx", u8); });
    } else {
      var de = q.get("desde"), ha = q.get("hasta"), meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      tarea = traerRegistros(de, ha, "").then(function (regs) {
        var filas = regs.filter(function (r) { return CAT[r.complejo]; }).map(function (r) { return { r: r, o: ORDEN.indexOf(r.complejo) }; }).sort(function (x, y) { return x.r.fecha < y.r.fecha ? -1 : x.r.fecha > y.r.fecha ? 1 : x.o - y.o; });
        return xlsxPeriodo(filas, "Estado de Operación-" + meses[+de.slice(5, 7) - 1] + "." + de.slice(0, 4));
      }).then(function (u8) { bajar("Registro_diario_Estado_de_Operacion_" + de + "_a_" + ha + ".xlsx", u8); });
    }
    tarea.catch(function (e) { aviso(e && e.msg ? e.msg : "No se pudo generar el archivo."); });
  };

  // ---------- Conexión con Supabase ----------
  function guardarSes() { try { if (ses) localStorage.setItem(SKEY, JSON.stringify(ses)); else localStorage.removeItem(SKEY); } catch (e) {} }
  try { var s0 = localStorage.getItem(SKEY); if (s0) ses = JSON.parse(s0); } catch (e) { ses = null; }
  function listo() { return CFG.url && CFG.key && /^https?:\/\//.test(CFG.url); }
  function base(p) { return CFG.url.replace(/\/+$/, "") + p; }
  function cab(auth) { return { apikey: CFG.key, "Content-Type": "application/json", Authorization: "Bearer " + (auth && ses ? ses.access : CFG.key) }; }
  function conexion(e) { return new Err("No se pudo conectar con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.", 503); }

  function tomarSesion(j) {
    ses = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, uid: j.user && j.user.id };
    guardarSes();
  }
  function refrescar() {
    if (!ses || !ses.refresh) return Promise.reject(new Err("Tu sesión expiró. Vuelve a ingresar.", 401));
    return realFetch(base("/auth/v1/token?grant_type=refresh_token"), { method: "POST", headers: cab(false), body: JSON.stringify({ refresh_token: ses.refresh }) })
      .catch(function () { throw conexion(); })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.access_token) { ses = null; guardarSes(); throw new Err("Tu sesión expiró. Vuelve a ingresar.", 401); } tomarSesion(j); }); });
  }
  function conSesion() {
    if (!ses) return Promise.resolve();
    if (ses.exp - Date.now() < 60000) return refrescar();
    return Promise.resolve();
  }
  function traducir(r, j) {
    var msg = (j && (j.message || j.msg || j.error_description || j.error)) || "Error inesperado del servidor.";
    if (r.status === 401 || /JWT/i.test(msg)) return new Err("Tu sesión expiró. Vuelve a ingresar.", 401);
    if (/^Tu sesi/.test(msg)) return new Err(msg, 401);
    if (/^No tienes permiso/.test(msg)) return new Err(msg, 403);
    if (r.status === 403 || /permission denied|row-level/i.test(msg)) return new Err("No tienes permiso para esta acción.", 403);
    if (/Could not find the function|schema cache|relation .* does not exist/i.test(msg)) return new Err("La base de datos aún no está instalada en Supabase (falta ejecutar instalar.sql).", 500);
    return new Err(msg, r.status >= 500 ? 500 : 400);
  }
  function llamar(ruta, init, auth) {
    return conSesion().then(function () {
      init.headers = Object.assign(cab(auth), init.headers || {});
      return realFetch(base(ruta), init).catch(function () { throw conexion(); });
    }).then(function (r) {
      if (r.status === 204) return { r: r, j: null };
      return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {} return { r: r, j: j }; });
    }).then(function (x) { if (!x.r.ok) throw traducir(x.r, x.j); return x; });
  }
  function rpc(nombre, args, auth) { return llamar("/rest/v1/rpc/" + nombre, { method: "POST", body: JSON.stringify(args || {}) }, auth !== false).then(function (x) { return x.j; }); }
  function leerTabla(ruta, auth) { return llamar("/rest/v1/" + ruta, { method: "GET" }, auth !== false).then(function (x) { return x.j || []; }); }

  function traerRegistros(de, ha, cx) {
    var out = [], paso = 1000;
    function pag(off) {
      var ruta = "registros?select=*&fecha=gte." + de + "&fecha=lte." + ha + (cx ? "&complejo=eq." + encodeURIComponent(cx) : "") + "&order=fecha.desc,complejo.asc&limit=" + paso + "&offset=" + off;
      return leerTabla(ruta).then(function (f) { out = out.concat(f); return f.length === paso ? pag(off + paso) : out; });
    }
    return pag(0);
  }
  function miPerfil() {
    if (!ses || !ses.uid) return Promise.resolve(null);
    return leerTabla("perfiles?select=id,usuario,nombre,rol,complejo,activo,cambiar&id=eq." + ses.uid).then(function (f) { return f[0] || null; })
      .catch(function (e) { if (e.code === 401) { ses = null; guardarSes(); return null; } throw e; });
  }
  function exigirPerfil(roles) {
    return miPerfil().then(function (p) {
      if (!p || !p.activo) { ses = null; guardarSes(); fail("Tu sesión expiró. Vuelve a ingresar.", 401); }
      if (roles && roles.indexOf(p.rol) < 0) fail("No tienes permiso para esta acción.", 403);
      return p;
    });
  }
  function validarClave(c, usuario) { if (c.length < 8) return "La contraseña debe tener al menos 8 caracteres."; if (c.toLowerCase() === usuario.toLowerCase()) return "La contraseña no puede ser igual al usuario."; return null; }
  function ingresar(usuario, clave) {
    return realFetch(base("/auth/v1/token?grant_type=password"), { method: "POST", headers: cab(false), body: JSON.stringify({ email: usuario + DOMINIO, password: clave }) })
      .catch(function () { throw conexion(); })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var m = String(j.error_code || "") + " " + String(j.msg || j.message || "");
          if (r.status === 429 || /over_request_rate_limit|rate limit/i.test(m)) fail("Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", 429);
          if (/banned/i.test(m)) fail("Esta cuenta está desactivada. Contacta al administrador.", 401);
          if (r.status >= 500) fail("El servidor no respondió bien. Inténtalo de nuevo en un momento.", 500);
          fail("Usuario o contraseña incorrectos.", 401);
        }
        tomarSesion(j); return j;
      }); });
  }
  function perfilPublico(p) { return { id: p.id, usuario: p.usuario, nombre: p.nombre, rol: p.rol, complejo: p.complejo, cambiar: !!p.cambiar }; }

  function manejar(accion, query, body) {
    if (!listo()) return Promise.reject(new Err("Falta conectar la plataforma con Supabase (revisa el archivo config.js).", 500));
    switch (accion) {
      case "estado":
        return rpc("upf_estado", {}, false).then(function (e) {
          horaLimite = e.hora_limite || "08:55";
          return miPerfil().then(function (p) {
            if (p && !p.activo) { ses = null; guardarSes(); p = null; }
            return { configurado: !!e.configurado, hoy: e.hoy || chileHoy(), usuario: p ? perfilPublico(p) : null, catalogo: p ? DATA.catalogo : [], estados: DATA.estados, motivos: DATA.motivos, hora_limite: horaLimite };
          });
        }).catch(function (e) { if (e.code === 401) { ses = null; guardarSes(); return { configurado: true, hoy: chileHoy(), usuario: null, catalogo: [], estados: DATA.estados, motivos: DATA.motivos, hora_limite: horaLimite }; } throw e; });
      case "configurar": {
        var us = String(body.usuario || "").trim().toLowerCase(), cl = String(body.clave || "");
        return rpc("upf_configurar", { p_usuario: us, p_nombre: body.nombre || "", p_clave: cl }, false).then(function () { return ingresar(us, cl); }).then(function () { return { ok: true }; });
      }
      case "entrar": {
        var uu = String(body.usuario || "").trim().toLowerCase();
        return ingresar(uu, String(body.clave || "")).then(function () { return miPerfil(); }).then(function (p) {
          if (!p || !p.activo) { ses = null; guardarSes(); fail("Esta cuenta está desactivada. Contacta al administrador.", 401); }
          return { ok: true };
        });
      }
      case "salir": {
        var t = ses && ses.access; ses = null; guardarSes();
        if (t) realFetch(base("/auth/v1/logout"), { method: "POST", headers: { apikey: CFG.key, Authorization: "Bearer " + t } }).catch(function () {});
        return Promise.resolve({ ok: true });
      }
      case "cambiar_clave":
        return exigirPerfil().then(function (p) {
          var nv = String(body.nueva || ""), er = validarClave(nv, p.usuario); if (er) fail(er);
          var act = String(body.actual || "");
          if (nv === act) fail("La nueva contraseña debe ser distinta de la actual.");
          return ingresar(p.usuario, act).catch(function (e) { if (e.code === 401) fail("La contraseña actual no es correcta."); throw e; })
            .then(function () { return llamar("/auth/v1/user", { method: "PUT", body: JSON.stringify({ password: nv }) }, true); })
            .then(function () { return rpc("upf_clave_cambiada", { p_nombre: String(body.nombre || "") }); })
            .then(function () { return { ok: true }; });
        });
      case "registros":
        return exigirPerfil().then(function (p) {
          if (p.cambiar) fail("Debes cambiar tu contraseña antes de continuar.", 403);
          var hoy = chileHoy(), cx = p.rol === "coordinador" ? p.complejo : (query.get("complejo") || "");
          return traerRegistros(query.get("desde") || hoy, query.get("hasta") || hoy, cx).then(function (r) { return { registros: r }; });
        });
      case "guardar":
        return exigirPerfil(["coordinador", "admin"]).then(function () { return rpc("upf_guardar_registro", { p: body }); });
      case "cuentas":
        return exigirPerfil(["admin"]).then(function () { return leerTabla("perfiles?select=id,usuario,nombre,rol,complejo,cambiar,activo&order=usuario.asc"); })
          .then(function (f) { return { cuentas: f.map(function (z) { return { id: z.id, usuario: z.usuario, nombre: z.nombre, rol: z.rol, complejo: z.complejo, cambiar: z.cambiar ? 1 : 0, activo: z.activo ? 1 : 0 }; }) }; });
      case "crear_cuenta":
        return rpc("upf_crear_cuenta", { p_usuario: body.usuario || "", p_nombre: body.nombre || "", p_rol: "coordinador", p_complejo: String(body.complejo || ""), p_clave: body.clave || "", p_varios: true }).then(function (c) { return { ok: true, cuenta: c }; });
      case "crear_admin":
        return rpc("upf_crear_cuenta", { p_usuario: body.usuario || "", p_nombre: body.nombre || "", p_rol: "admin", p_complejo: null, p_clave: body.clave || "", p_varios: true }).then(function (c) { return { ok: true, cuenta: c }; });
      case "crear_todas":
        return rpc("upf_crear_todas", {}).then(function (c) { return { ok: true, cuentas: c }; });
      case "restablecer":
        return rpc("upf_restablecer", { p_id: body.id, p_clave: body.clave || "" }).then(function (c) { return { ok: true, usuario: c.usuario, clave: c.clave }; });
      case "editar_cuenta":
        return rpc("upf_editar", { p_id: body.id, p_usuario: body.usuario || "", p_nombre: body.nombre || "", p_complejo: body.complejo || null }).then(function () { return { ok: true }; });
      case "eliminar_cuenta":
        return rpc("upf_eliminar", { p_id: body.id }).then(function () { return { ok: true }; });
      case "activar":
        return rpc("upf_activar", { p_id: body.id, p_activo: !!body.activo }).then(function () { return { ok: true }; });
      case "bitacora":
        return exigirPerfil(["admin"]).then(function () {
          var de = (query.get("desde") || "2000-01-01"), ha = (query.get("hasta") || "2999-12-31");
          return leerTabla("bitacora?select=id,fecha,actor_usuario,accion,objeto,detalle&fecha=gte." + de + "&fecha=lte." + ha + " 23:59:59&order=id.desc&limit=2000");
        }).then(function (f) { return { eventos: f }; });
      case "guardar_config":
        return rpc("upf_guardar_config", { p_hora: String(body.hora_limite || "").trim() }).then(function () { horaLimite = String(body.hora_limite).trim(); return { ok: true, hora_limite: horaLimite }; });
    }
    return Promise.reject(new Err("Acción no encontrada.", 404));
  }

  window.fetch = function (url, init) {
    init = init || {};
    var m = /api\.php\?a=([a-z_]+)(?:&(.*))?$/.exec(String(url));
    if (!m) return realFetch(url, init);
    var body = {}; try { body = init.body ? JSON.parse(init.body) : {}; } catch (e) {}
    return manejar(m[1], new URLSearchParams(m[2] || ""), body).then(
      function (out) { return { status: 200, json: function () { return Promise.resolve(out); } }; },
      function (e) {
        var st = 500, out = { error: "Error interno. Inténtalo de nuevo." };
        if (e instanceof Err) { st = e.code; out = { error: e.msg }; }
        return { status: st, json: function () { return Promise.resolve(out); } };
      });
  };
})();
