// @ts-nocheck
/* Motor del Verificador de correos de Dartpac (el mismo que usa el Radar). Generado desde verifier.js: no editar a mano. */
export function crearDPV() {

  /* =====================================================================
     MOTOR
     ===================================================================== */

  function words(s) { return new Set(s.trim().split(/\s+/)); }

  // Dominios comunes: base para detectar errores de tipeo. Nunca se "corrigen" a sí mismos.
  var COMMON = ("gmail.com googlemail.com hotmail.com hotmail.com.ar outlook.com outlook.com.ar outlook.es " +
    "live.com live.com.ar msn.com yahoo.com yahoo.com.ar ymail.com icloud.com me.com mac.com aol.com " +
    "protonmail.com proton.me fibertel.com.ar speedy.com.ar arnet.com.ar ciudad.com.ar uolsinectis.com.ar " +
    "sinectis.com.ar infovia.com.ar tutopia.com telecentro.com.ar gigared.com cpenet.com.ar coopenet.com.ar").split(" ");

  // Casillas gratuitas de correo web (incluye variantes reales de otros países).
  var FREE = words("gmail.com googlemail.com hotmail.com hotmail.com.ar outlook.com outlook.com.ar outlook.es " +
    "live.com live.com.ar msn.com yahoo.com yahoo.com.ar ymail.com icloud.com me.com mac.com aol.com " +
    "protonmail.com protonmail.ch proton.me pm.me hotmail.es hotmail.co.uk hotmail.fr hotmail.it hotmail.de hotmail.cl " +
    "hotmail.com.br live.com.mx live.cl live.co.uk live.fr outlook.cl outlook.com.br outlook.fr outlook.de " +
    "outlook.it yahoo.es yahoo.com.mx yahoo.com.br yahoo.co.uk yahoo.fr yahoo.de yahoo.it gmx.com gmx.net " +
    "gmx.es gmx.de mail.com email.com zoho.com zohomail.com yandex.com yandex.ru mail.ru inbox.ru " +
    "tutanota.com tuta.io fastmail.com hey.com qq.com 163.com 126.com");

  // Proveedores de internet argentinos antiguos.
  var OLD_ISP = words("speedy.com.ar arnet.com.ar ciudad.com.ar uolsinectis.com.ar sinectis.com.ar " +
    "infovia.com.ar tutopia.com fibertel.com.ar");

  // Dominios reales que nunca se tratan como error de tipeo (aunque se parezcan a uno común).
  var KNOWN = new Set(COMMON.concat(Array.from(FREE), ("hotmart.com cloud.com life.com love.com lime.com " +
    "line.me aon.com max.com msc.com ge.com").split(" ")));

  // Nombre del proveedor -> dominios correctos (solo nombres inconfundibles).
  var PROV = {
    gmail: ["gmail.com"], googlemail: ["googlemail.com"], hotmail: ["hotmail.com", "hotmail.com.ar"],
    outlook: ["outlook.com", "outlook.com.ar", "outlook.es"], yahoo: ["yahoo.com", "yahoo.com.ar"],
    ymail: ["ymail.com"], icloud: ["icloud.com"], protonmail: ["protonmail.com"],
    fibertel: ["fibertel.com.ar"], speedy: ["speedy.com.ar"], arnet: ["arnet.com.ar"],
    uolsinectis: ["uolsinectis.com.ar"], sinectis: ["sinectis.com.ar"], infovia: ["infovia.com.ar"],
    tutopia: ["tutopia.com"], telecentro: ["telecentro.com.ar"], gigared: ["gigared.com"],
    cpenet: ["cpenet.com.ar"], coopenet: ["coopenet.com.ar"]
  };
  // Proveedores con un único dominio válido: cualquier otra terminación es un error.
  var SINGLE = words("gmail googlemail icloud protonmail ymail");

  // Correos temporales / desechables (dominios exactos; también cubre subdominios).
  var DISPOSABLE = words(
    "mailinator.com mailinator.net mailinator.org mailinator2.com mailinater.com notmailinator.com " +
    "sogetthis.com spamherelots.com thisisnotmyrealemail.com binkmail.com bobmail.info devnullmail.com " +
    "letthemeatspam.com safetymail.info suremail.info tradermail.info zippymail.info mailnator.com " +
    "tmailinator.com mailin8r.com guerrillamail.com guerrillamail.net guerrillamail.org guerrillamail.biz " +
    "guerrillamail.de guerrillamail.info guerrillamailblock.com grr.la sharklasers.com spam4.me pokemail.net " +
    "10minutemail.com 10minutemail.net 10minutemail.co.uk 10minutemail.de 10minmail.com 20minutemail.com " +
    "zehnminutenmail.de minuteinbox.com yopmail.com yopmail.fr yopmail.net cool.fr.nf jetable.fr.nf " +
    "courriel.fr.nf moncourrier.fr.nf monemail.fr.nf monmail.fr.nf nospam.ze.tc nomail.xl.cx mega.zik.dj " +
    "speed.1s.fr yomail.info temp-mail.org temp-mail.io tempmail.net tempmailo.com tempmail.plus tempr.email " +
    "tempail.com tempinbox.com tempmailaddress.com tmpmail.org tmpmail.net tempemail.net tempymail.com " +
    "tempomail.fr trashmail.com trashmail.net trashmail.de trashmail.me trashmail.at trashmail.io " +
    "trashmail.ws trash-mail.com trashymail.com trashmailer.com trashdevil.com trashemail.de trash-me.com " +
    "mytrashmail.com mailmetrash.com getnada.com nada.email getairmail.com dispostable.com maildrop.cc " +
    "throwawaymail.com throwam.com fakeinbox.com mintemail.com mailnesia.com mailcatch.com mailnull.com " +
    "spamgourmet.com spamgourmet.net spamgourmet.org spambox.us spamfree24.org spam.la mohmal.com " +
    "emailondeck.com burnermail.io discard.email discardmail.com discardmail.de emailfake.com fakemail.net " +
    "fakemailgenerator.com armyspy.com cuvox.de dayrep.com einrot.com fleckens.hu gustr.com jourrapide.com " +
    "rhyta.com superrito.com teleworm.us mytemp.email mailexpire.com mailforspam.com meltmail.com " +
    "incognitomail.org jetable.org jetable.net harakirimail.com hidemail.de spamavert.com spambog.com " +
    "spambog.de spambog.ru spamday.com spamdecoy.net spaml.com spaml.de spamobox.com spamthis.co.uk " +
    "anonbox.net anonymbox.com deadaddress.com despam.it dodgeit.com dodgit.com dontreg.com e4ward.com " +
    "filzmail.com gishpuppy.com ieatspam.eu ieatspam.info kurzepost.de lortemail.dk mailbidon.com " +
    "mail-temporaire.fr mailhazard.com mailtemp.info nomail2me.com nospamfor.us nowmymail.com oneoffemail.com " +
    "onewaymail.com pookmail.com proxymail.eu quickinbox.com rcpt.at rmqkr.net selfdestructingmail.com " +
    "sendspamhere.com shieldedmail.com slopsbox.com sneakemail.com sofort-mail.de spamcero.com spamhole.com " +
    "spamify.com spaminator.de spamkill.info spammotel.com twinmail.de wegwerfmail.de wegwerfmail.net " +
    "wegwerfmail.org whyspam.me willselfdestruct.com wuzupmail.net zoemail.org mvrht.com mailpoof.com " +
    "inboxkitten.com crazymailing.com mail.tm dropmail.me 10mail.org emltmp.com moakt.com correotemporal.org " +
    "mail-temp.com spamcowboy.com boun.cr owlymail.com emailtemporanea.net emailtemporario.com.br " +
    "luxusmail.org mailsac.com inboxbear.com byom.de trbvm.com");
  // Marcas de servicios temporales: cubren cualquier terminación (guerrillamail.*, 10minutemail.*, …).
  var DISPOSABLE_BRAND = /^(?:mailinator\d*|guerrillamail\w*|10minutemail|10minmail|20minutemail|yopmail|tempmail\w*|temp-mail|trashmail\w*|trash-mail|throwawaymail|fakeinbox|getnada|dispostable|maildrop|mintemail|mailnesia|wegwerfmail|spamgourmet|spambog|discardmail|tempinbox|minuteinbox|burnermail|emailondeck|mohmal|sharklasers|mailcatch|mailsac)$/;

  // Direcciones de prueba o de relleno.
  var PH_DOMAINS = words("example.com example.org example.net example.edu ejemplo.com ejemplo.com.ar ejemplo.org " +
    "test.com test.com.ar test.net prueba.com prueba.com.ar pruebas.com dominio.com dominio.com.ar tudominio.com " +
    "tudominio.com.ar midominio.com midominio.com.ar sudominio.com tuempresa.com tuempresa.com.ar miempresa.com " +
    "miempresa.com.ar suempresa.com sin.com sin.com.ar sinmail.com sinemail.com sincorreo.com nomail.com " +
    "noemail.com nocorreo.com ninguno.com none.com null.com asdf.com asd.com qwerty.com");
  var PH_TLD = words("test example invalid localhost local");
  var PH_LOCAL = words("test testing tester prueba pruebas probando asdf asd asdasd asdfg qwerty xxx aaa noemail " +
    "no-email no_email no.email sinmail sin-mail sin_mail sin.mail sinemail sin-email sin_email sin.email nomail " +
    "no-mail no_mail sincorreo sin-correo sin_correo sin.correo nocorreo no-correo ninguno ninguna none null nil " +
    "nada notiene no-tiene no_tiene notengo fake falso ejemplo example sample dummy tuemail tucorreo tumail " +
    "tunombre nombre nombreapellido nombre.apellido usuario abc123 123 1234 12345 123456");
  // Dominios genéricos que solo se toman como relleno con una parte local también genérica.
  var SOFT_DOMAINS = words("email.com mail.com correo.com e-mail.com email.com.ar mail.com.ar correo.com.ar");
  var SOFT_LOCAL = words("email mail correo info contacto usuario user nombre apellido tu juan juanperez perez " +
    "pepe fulano mengano");

  // Casillas que no reciben respuestas.
  var NOREPLY = /^(?:no[._-]?reply|do[._-]?not[._-]?reply|dont[._-]?reply|no[._-]?responder|no[._-]?responda|no[._-]?respuesta|postmaster|mailer[._-]?daemon|abuse|webmaster|bounces?)(?:[._+-].*)?$/;

  // Casillas genéricas (válidas: muchas empresas solo publican ventas@ o info@).
  var ROLE = words("info informes informacion contacto contactos contact compras administracion admin facturacion " +
    "cobranzas rrhh recepcion consultas hola comercial pedidos gerencia soporte marketing prensa office oficina " +
    "mail email correo sales ventas comex exportaciones importaciones logistica clientes atencion " +
    "atencionalcliente atencionclientes reservas online tienda negocios mayoristas proveedores pagos tesoreria " +
    "contable contabilidad presupuestos cotizaciones secretaria recursoshumanos hello support help ayuda " +
    "administrativo");
  var ROLE_PRE = /^(?:ventas|contacto|administracion|compras|comercial|facturacion|cobranzas|recepcion|consultas|pedidos|gerencia|soporte|atencion|reservas)/;
  var ROLE_SUF = /(?:ventas|compras|administracion|pedidos|facturacion|cobranzas)$/;

  // Terminaciones: países (2 letras) y genéricas frecuentes (3+ letras).
  var CC = words("ac ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo bq br bs " +
    "bt bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg er es et eu " +
    "fi fj fk fm fo fr ga gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io " +
    "iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mg mh " +
    "mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl " +
    "pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sk sl sm sn so sr ss st su sv sx sy sz tc td " +
    "tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug uk us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw");
  var GTLD = words("com net org info biz edu gov mil int coop aero museum name pro mobi travel jobs tel asia cat " +
    "app dev page shop store online site tech xyz club top vip email company agency group global world life live " +
    "digital solutions services systems network cloud studio design media news blog website space fun today " +
    "center academy school bio eco energy farm wine pizza restaurant cafe bar hotel tours tienda ventas " +
    "marketing consulting partners ltd inc llc works team zone plus link click art bike build business care " +
    "cash city clothing coffee construction delivery direct engineering enterprises equipment estate events " +
    "exchange express fashion finance fit fitness florist foundation gallery games gift gold golf green guru " +
    "health healthcare help holdings house industries institute international kitchen land lat legal lighting " +
    "limited love luxury management market menu money moda ninja one organic photo photography pics pink place " +
    "plumbing press productions properties pub recipes red rentals repair report rest review rocks run sale " +
    "salon shoes show social software solar supplies supply support surf tax taxi tips tools town toys trade " +
    "training uno vacations ventures vet vin vision watch wiki win work");
  var AR_SLD = words("com net org gob gov int mil edu tur coop mutual musica senasa bet");

  // Errores de terminación (se aplican a cualquier dominio).
  var SUFFIX_FIX = [
    [/\.(?:con|cmo|comm|ocm|vom|xom|cpm|coom|copm|cim|comn)\.ar$/, ".com.ar"],
    [/\.com\.(?:ra|arg|arr|aar)$/, ".com.ar"],
    [/\.comar$/, ".com.ar"],
    [/\.ar\.com$/, ".com.ar"],
    [/\.com\.com$/, ".com"],
    [/\.(?:con|cmo|comm|ocm|vom|xom|cpm|coom|copm|cim|comn|om|cm)$/, ".com"],
    [/\.(?:nte|ent|nett)$/, ".net"],
    [/\.(?:ogr|rog|orgg)$/, ".org"]
  ];

  var T = {
    rol: "Casilla genérica: suele leerla otra persona",
    noreply: "Casilla que no recibe respuestas",
    gratuito: "Casilla gratuita: no es del dominio de la empresa",
    antiguo: "Proveedor de internet antiguo: muchas de esas casillas ya no existen y rebotan.",
    largo: "Dirección muy larga o llena de números: suele estar mal copiada o ser automática",
    desechable: "Correo temporal o desechable: deja de funcionar en poco tiempo",
    placeholder: "Dirección de prueba o de relleno: no es de una persona real",
    rebote: "Un envío anterior a esta dirección rebotó",
    baja: "Pidió no recibir más correos",
    duplicado: "La misma dirección está cargada en otra empresa",
    tldRaro: "Terminación de dominio poco común: revisá que esté bien escrita",
    tldNo: "Esa terminación de dominio no existe"
  };

  var ESTADOS = Object.freeze({
    valido: Object.freeze({ n: "Entregable" }),
    corregible: Object.freeze({ n: "Con error de tipeo" }),
    riesgoso: Object.freeze({ n: "Riesgoso" }),
    invalido: Object.freeze({ n: "Inválido" }),
    vacio: Object.freeze({ n: "Sin email" }),
    baja: Object.freeze({ n: "Pidió la baja" })
  });

  /* ---------- utilidades ---------- */

  // Distancia Damerau-Levenshtein (alineación óptima). Corta temprano si supera `max`.
  function osa(a, b, max) {
    var n = a.length, m = b.length, i, j;
    if (Math.abs(n - m) > max) return max + 1;
    var p2 = null, p = new Array(m + 1), c;
    for (j = 0; j <= m; j++) p[j] = j;
    for (i = 1; i <= n; i++) {
      c = new Array(m + 1); c[0] = i;
      var low = i;
      for (j = 1; j <= m; j++) {
        var v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
        c[j] = v; if (v < low) low = v;
      }
      if (low > max) return max + 1;
      p2 = p; p = c;
    }
    return p[m];
  }

  // Teclas vecinas en un teclado QWERTY (con ñ).
  var KEYPOS = (function () {
    var rows = ["1234567890", "qwertyuiop", "asdfghjklñ", "zxcvbnm"], off = [0, 0.5, 0.75, 1.25], pos = {};
    rows.forEach(function (r, ri) { for (var k = 0; k < r.length; k++) pos[r[k]] = [ri, k + off[ri]]; });
    return pos;
  })();
  function nearKeys(x, y) {
    var a = KEYPOS[x], b = KEYPOS[y];
    if (!a || !b || x === y) return false;
    var dr = Math.abs(a[0] - b[0]), dx = Math.abs(a[1] - b[1]);
    return (dr === 0 && dx <= 1.01) || (dr === 1 && dx <= 0.8);
  }
  // Para nombres cortos (live, aol…): solo letras invertidas o duplicadas cuentan como tipeo.
  function shortTypo(a, b) {
    var i;
    if (a.length === b.length) {
      for (i = 0; i < a.length - 1; i++) if (a[i] !== b[i]) return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
      return false;
    }
    if (a.length === b.length + 1) {
      for (i = 0; i < a.length; i++) if (a[i] !== b[i]) return a.slice(i + 1) === b.slice(i) && (a[i] === a[i - 1] || a[i] === a[i + 1]);
    }
    return false;
  }
  // Una sola edición que parece un dedo que se resbaló (para nombres de 5 a 7 letras).
  function typoEdit(a, b) {
    var i = 0;
    if (a.length === b.length) {
      while (i < a.length && a[i] === b[i]) i++;
      if (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) return true;
      return a.slice(i + 1) === b.slice(i + 1) && nearKeys(a[i], b[i]);
    }
    if (a.length === b.length - 1) return true;
    if (a.length === b.length + 1) {
      while (i < b.length && a[i] === b[i]) i++;
      if (a.slice(i + 1) !== b.slice(i)) return false;
      var x = a[i];
      return x === b[i - 1] || x === b[i] || nearKeys(x, b[i - 1]) || nearKeys(x, b[i]);
    }
    return false;
  }

  function normalizar(v) {
    var s = v == null ? "" : String(v);
    s = s.replace(/[​-‍⁠﻿]/g, "").replace(/ /g, " ").trim();
    var m = s.match(/<([^<>]*@[^<>]*)>/);
    if (m) s = m[1].trim();
    s = s.replace(/^[\s"'“”‘’«»`<>()\[\]{}]+/, "");
    if (/^mailto:/i.test(s)) s = s.replace(/^mailto:/i, "").replace(/\?.*$/, "");
    s = s.replace(/^[\s"'“”‘’«»`<>()\[\]{}]+/, "").replace(/[\s"'“”‘’«»`<>()\[\]{}.,;:]+$/, "");
    return s.toLowerCase();
  }

  function localError(l) {
    if (!l) return "Falta el nombre antes de la @";
    if (l.length > 64) return "El nombre antes de la @ es demasiado largo";
    var bad = l.replace(/[a-z0-9!#$%&'*+\/=?^_`{|}~.\-]/gi, "");
    if (bad) return "Tiene caracteres no permitidos: " + Array.from(new Set(Array.from(bad))).slice(0, 3).join(" ");
    if (l[0] === "." || l[l.length - 1] === "." || l.indexOf("..") > -1) return "Tiene puntos mal ubicados antes de la @";
    return "";
  }

  function domainError(d) {
    if (!d) return { k: "sintaxis", t: "Falta el dominio después de la @" };
    if (d.length > 253) return { k: "dominio", t: "El dominio es demasiado largo" };
    if (d.indexOf(".") < 0) return { k: "dominio", t: "Al dominio le falta la terminación (.com, .com.ar…)" };
    var labels = d.split(".");
    for (var i = 0; i < labels.length; i++) {
      var l = labels[i];
      if (!l) return { k: "dominio", t: "El dominio tiene puntos de más" };
      if (l.length > 63) return { k: "dominio", t: "Una parte del dominio es demasiado larga" };
      if (!/^[a-z0-9-]+$/.test(l)) return { k: "dominio", t: "El dominio tiene caracteres no permitidos" };
      if (l[0] === "-" || l[l.length - 1] === "-") return { k: "dominio", t: "El dominio no puede empezar ni terminar con guion" };
    }
    if (!/^[a-z]{2,24}$/.test(labels[labels.length - 1])) return { k: "tld", t: "La terminación del dominio no es válida" };
    return null;
  }

  function suffixFix(d) {
    for (var pass = 0; pass < 3; pass++) {
      var before = d;
      for (var i = 0; i < SUFFIX_FIX.length; i++) d = d.replace(SUFFIX_FIX[i][0], SUFFIX_FIX[i][1]);
      if (d === before) break;
    }
    return d;
  }

  function providerFix(d) {
    var i = d.indexOf(".");
    var name = i < 0 ? d : d.slice(0, i), suf = i < 0 ? "" : d.slice(i + 1);
    var list = Object.prototype.hasOwnProperty.call(PROV, name) ? PROV[name] : null;
    if (!list || KNOWN.has(d)) return "";
    if (SINGLE.has(name)) return list[0];
    var ar = list.filter(function (x) { return /\.com\.ar$/.test(x); })[0];
    var com = list.indexOf(name + ".com") > -1 ? name + ".com" : "";
    if (!suf) return com || ar || list[0];
    if (/^(?:ar|co\.ar|com\.ar\.ar)$/.test(suf)) return ar || com || list[0];
    if (suf === "com.ar" && !ar) return com || list[0];
    if (suf === "com" && ar && !com) return ar;
    if (suf === "co") return com || ar || list[0];
    return "";
  }

  function nearestCommon(d) {
    var max = d.length < 8 ? 1 : 2, dot = d.indexOf(".");
    var nd = dot < 0 ? d : d.slice(0, dot), sd = dot < 0 ? "" : d.slice(dot + 1);
    var best = "", bestD = 99, bestSame = false;
    for (var i = 0; i < COMMON.length; i++) {
      var c = COMMON[i];
      var dist = osa(d, c, max);
      if (dist > max) continue;
      var cd = c.indexOf("."), nc = c.slice(0, cd), sc = c.slice(cd + 1);
      if (dot > -1 && nd !== nc) {
        if (nc.length <= 4) { if (!shortTypo(nd, nc)) continue; }
        else if (nc.length <= 7) { if (osa(nd, nc, 1) !== 1 || !typoEdit(nd, nc)) continue; }
        else if (osa(nd, nc, 2) > 2) continue;
      }
      var same = sd === sc;
      if (dist < bestD || (dist === bestD && same && !bestSame)) { best = c; bestD = dist; bestSame = same; }
    }
    return best;
  }

  // Propone el dominio corregido, o "" si no hay una corrección confiable.
  function suggestDomain(domain, broken) {
    if (KNOWN.has(domain)) return "";
    var d = domain;
    if (broken) d = d.replace(/[,;:]+/g, ".").replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "");
    if (/^www\./.test(d) && d.split(".").length >= 3) d = d.slice(4);
    d = suffixFix(d);
    if (d !== domain && KNOWN.has(d)) return d;
    var p = providerFix(d);
    if (p) return p;
    var n = nearestCommon(d);
    if (n) return n;
    if (d !== domain && !domainError(d)) return d;
    return "";
  }

  function isDisposable(d) {
    if (DISPOSABLE.has(d)) return true;
    for (var i = d.indexOf("."); i > -1; i = d.indexOf(".", i + 1)) {
      var rest = d.slice(i + 1);
      if (rest.indexOf(".") > -1 && DISPOSABLE.has(rest)) return true;
    }
    var labels = d.split(".");
    labels.pop();
    return labels.some(function (l) { return DISPOSABLE_BRAND.test(l); });
  }

  function isPlaceholder(local, domain) {
    var lb = local.replace(/[._\-]?\d+$/, "");
    if (PH_LOCAL.has(local) || PH_LOCAL.has(lb) || /^(.)\1{2,}$/.test(local)) return true;
    if (PH_DOMAINS.has(domain)) return true;
    var labels = domain.split(".");
    if (PH_TLD.has(labels[labels.length - 1])) return true;
    if (labels.length <= 3 && /^(.)\1+$/.test(labels[0])) return true;
    if (SOFT_DOMAINS.has(domain) && SOFT_LOCAL.has(lb)) return true;
    return false;
  }

  function isRole(local) {
    var base = local.replace(/[._\-]?\d+$/, "");
    if (ROLE.has(base)) return true;
    var first = base.split(/[._+\-]/)[0];
    if (first !== base && ROLE.has(first)) return true;
    return ROLE_PRE.test(base) || ROLE_SUF.test(base);
  }

  function blank() {
    return { estado: "valido", motivos: [], sugerencia: "", flags: { rol: false, gratuito: false, desechable: false, tipeo: false, antiguo: false } };
  }

  function core(normal, noFix) {
    var R = blank();
    function bad(k, t) { R.estado = "invalido"; R.motivos.push({ k: k, t: t }); return R; }
    if (!normal) { R.estado = "vacio"; return R; }
    if (!noFix && /[\s,;\/|]/.test(normal)) {
      var mf = multiFix(normal);
      if (mf && mf.sug) {
        var r3 = core(mf.sug, true);
        R.estado = "corregible"; R.sugerencia = mf.sug; R.flags = r3.flags; R.flags.tipeo = true;
        R.motivos = [{ k: "sintaxis", t: (mf.many ? "Tiene más de una dirección" : "Sobra texto junto a la dirección") + ": ¿dejamos solo " + mf.sug + "?" }].concat(r3.motivos);
        return R;
      }
      if (mf) return bad("sintaxis", mf.many ? "Tiene más de una dirección y ninguna sirve" : "Sobra texto junto a la dirección");
    }
    if (/\s/.test(normal)) return bad("sintaxis", "Tiene espacios en el medio");
    var ats = normal.split("@").length - 1;
    if (ats === 0) return bad("sintaxis", "Falta la arroba (@)");
    if (ats > 1) return bad("sintaxis", "Tiene más de una arroba (@)");
    var at = normal.indexOf("@"), local = normal.slice(0, at), domain = normal.slice(at + 1);
    var le = localError(local);
    if (le) return bad("sintaxis", le);
    var de = domainError(domain);
    if (de) {
      var fixed = noFix || !domain ? "" : suggestDomain(domain, true);
      return fixed ? fromSuggestion(R, local, fixed) : bad(de.k, de.t);
    }
    if (isPlaceholder(local, domain)) return bad("placeholder", T.placeholder);
    if (NOREPLY.test(local)) { R.flags.rol = true; return bad("rol", T.noreply); }
    if (isDisposable(domain)) { R.flags.desechable = true; return bad("desechable", T.desechable); }
    if (!noFix) {
      var sug = suggestDomain(domain, false);
      if (sug && sug !== domain) return fromSuggestion(R, local, sug);
    }
    return classify(R, local, domain);
  }

  // Campo con dos direcciones ("a@x.com.ar; b@x.com.ar") o con una nota ("info@x.com.ar (ventas)").
  function multiFix(normal) {
    var stripped = normal.replace(/\([^()]*\)|\[[^\[\]]*\]/g, " ").replace(/\s[(\[][^()\[\]]*$/, " ");
    var parts = stripped.split(/[\s,;\/|]+/).map(function (t) { return t.replace(JUNK_HEAD, "").replace(JUNK_TAIL, ""); }).filter(Boolean);
    var mails = parts.filter(function (t) { return t.indexOf("@") > -1; });
    if (!(mails.length >= 2 || (mails.length === 1 && parts.length === 1 && stripped !== normal))) return null;
    for (var i = 0; i < mails.length; i++) {
      var r = core(mails[i], false);
      if (r.estado === "valido" || r.estado === "riesgoso") return { sug: mails[i], many: mails.length > 1 };
      if (r.estado === "corregible") return { sug: r.sugerencia, many: mails.length > 1 };
    }
    return { sug: "", many: mails.length > 1 };
  }

  function fromSuggestion(R, local, dom) {
    var r2 = core(local + "@" + dom, true);
    if (r2.estado === "invalido" || r2.estado === "vacio") return r2;
    R.estado = "corregible";
    R.sugerencia = local + "@" + dom;
    R.flags = r2.flags;
    R.flags.tipeo = true;
    R.motivos = [{ k: "tipeo", t: "Error de tipeo: ¿quisiste decir " + dom + "?" }].concat(r2.motivos);
    return R;
  }

  function classify(R, local, domain) {
    var risky = [], info = [];
    if (!KNOWN.has(domain)) {
      var labels = domain.split("."), tld = labels[labels.length - 1];
      if (tld.length === 2 && !CC.has(tld)) { R.estado = "invalido"; R.motivos.push({ k: "tld", t: T.tldNo }); return R; }
      if (tld.length > 2 && !GTLD.has(tld)) risky.push({ k: "tld", t: T.tldRaro });
      else if (tld === "ar" && labels.length >= 3 && !AR_SLD.has(labels[labels.length - 2])) risky.push({ k: "tld", t: T.tldRaro });
    }
    if (OLD_ISP.has(domain)) { R.flags.antiguo = true; risky.push({ k: "antiguo", t: T.antiguo }); }
    var digits = (local.match(/\d/g) || []).length;
    if (local.length > 40 || (digits >= 8 && digits / local.length > 0.6)) risky.push({ k: "largo", t: T.largo });
    if (isRole(local)) { R.flags.rol = true; info.push({ k: "rol", t: T.rol }); }
    if (FREE.has(domain)) { R.flags.gratuito = true; info.push({ k: "gratuito", t: T.gratuito }); }
    if (risky.length) R.estado = "riesgoso";
    R.motivos = risky.concat(info);
    return R;
  }

  var cache = new Map();
  function coreCached(normal) {
    var hit = cache.get(normal);
    if (hit) return hit;
    if (cache.size > 20000) cache.clear();
    hit = core(normal, false);
    cache.set(normal, hit);
    return hit;
  }

  function verificar(email) {
    var normal = normalizar(email);
    var c = coreCached(normal);
    return {
      email: email == null ? "" : String(email),
      normal: normal,
      estado: c.estado,
      motivos: c.motivos.map(function (m) { return { k: m.k, t: m.t }; }),
      sugerencia: c.sugerencia,
      flags: { rol: c.flags.rol, gratuito: c.flags.gratuito, desechable: c.flags.desechable, tipeo: c.flags.tipeo, antiguo: c.flags.antiguo }
    };
  }

  function enDuplicados(ds, n) {
    if (!ds || !n) return false;
    if (ds instanceof Map) return (ds.get(n) || 0) > 1;
    if (ds instanceof Set) return ds.has(n);
    if (Array.isArray(ds)) { var c = 0; for (var i = 0; i < ds.length; i++) if (normalizar(ds[i]) === n && ++c > 1) return true; return false; }
    if (typeof ds === "object") return (ds[n] || 0) > 1;
    return false;
  }

  function verificarProspecto(p, dupSet) {
    p = p || {};
    var r = verificar(p.email);
    if (r.estado === "vacio") return r;
    if (p.noContactar) { r.estado = "baja"; r.sugerencia = ""; r.motivos.unshift({ k: "baja", t: T.baja }); }
    else if (p.emailRebotado) { r.estado = "invalido"; r.sugerencia = ""; r.motivos.unshift({ k: "rebote", t: T.rebote }); }
    if (enDuplicados(dupSet, r.normal)) r.motivos.push({ k: "duplicado", t: T.duplicado });
    return r;
  }

  function duplicados(lista) {
    var seen = new Map(), dup = new Set();
    (lista || []).forEach(function (e) {
      var n = normalizar(e);
      if (!n) return;
      var c = (seen.get(n) || 0) + 1;
      seen.set(n, c);
      if (c === 2) dup.add(n);
    });
    return dup;
  }

  var RIESGO_K = words("antiguo largo tld");
  function sinPunto(t) { return String(t || "").replace(/\.$/, ""); }

  function puedeEnviar(p) {
    var res = verificarProspecto(p);
    var m0 = res.motivos[0] ? res.motivos[0].t : "";
    switch (res.estado) {
      case "vacio": return { nivel: "bloquear", motivo: "No tiene email cargado.", res: res };
      case "baja": return { nivel: "bloquear", motivo: "Pidió no recibir más correos.", res: res };
      case "corregible": return { nivel: "bloquear", motivo: "Revisá el email: ¿quisiste decir " + res.sugerencia + "?", res: res };
      case "invalido": return { nivel: "bloquear", motivo: "Email inválido. " + sinPunto(m0) + ".", res: res };
      case "riesgoso":
        var rk = res.motivos.filter(function (m) { return RIESGO_K.has(m.k); })[0];
        return { nivel: "advertir", motivo: sinPunto(rk ? rk.t : m0) + ".", res: res };
      default: return { nivel: "ok", motivo: "Sin problemas detectados.", res: res };
    }
  }

  var JUNK_HEAD = /^[\s"'“”‘’«»`<>()\[\]{}]+/, JUNK_TAIL = /[\s"'“”‘’«»`<>()\[\]{}.,;:!?]+$/;
  function extraer(texto) {
    var out = [];
    String(texto == null ? "" : texto).replace(/[​-‍⁠﻿]/g, "").split(/[\s,;]+/).forEach(function (tok) {
      if (tok.indexOf("@") < 0) return;
      var m = tok.match(/<([^<>]*@[^<>]*)>/);
      var t = (m ? m[1] : tok).replace(JUNK_HEAD, "");
      var wasMailto = /^mailto:/i.test(t);
      t = t.replace(/^(?:mailto|e-?mail|correo)\s*:/i, "");
      if (wasMailto) t = t.replace(/\?.*$/, "");
      t = t.replace(JUNK_HEAD, "").replace(JUNK_TAIL, "");
      if (!t || t.indexOf("@") < 0 || t[0] === "@") return;
      out.push(t);
    });
    return out;
  }

  return Object.freeze({
    verificar: verificar,
    verificarProspecto: verificarProspecto,
    duplicados: duplicados,
    puedeEnviar: puedeEnviar,
    extraer: extraer,
    ESTADOS: ESTADOS
  });
}
