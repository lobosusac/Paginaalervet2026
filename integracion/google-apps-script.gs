/**
 * Alervet — puente entre el sitio web y Google Calendar
 * ---------------------------------------------------------------
 * Este archivo NO se publica en el sitio. Se pega en Google Apps
 * Script (script.google.com) y se implementa como aplicación web.
 *
 * Hace dos cosas:
 *   1. Le dice al sitio qué horas están ocupadas, SIN revelar de
 *      qué son los eventos. Por eso el calendario puede seguir
 *      siendo privado.
 *   2. Guarda las solicitudes de cita como eventos y avisa a la
 *      clínica por correo y por WhatsApp.
 *
 * Las instrucciones de instalación están en el README del proyecto.
 */

const AJUSTES = {
  // Vacío = el calendario principal de la cuenta que instala el script.
  CALENDARIO: '',

  // Correo donde llegan los avisos de cada solicitud.
  // Admite varios separados por comas:
  //   'recepcionalervet@gmail.com, lobos.usac@gmail.com'
  CORREO_AVISO: 'recepcionalervet@gmail.com',

  // Aviso por WhatsApp. Debe ser una URL con {texto} donde va el
  // mensaje. Si se deja vacío, solo se avisa por correo.
  // Ejemplo con CallMeBot:
  // 'https://api.callmebot.com/whatsapp.php?phone=50234819108&apikey=TU_CLAVE&text={texto}'
  WHATSAPP_URL: '',

  // Dominios autorizados a reservar. Vacío = cualquiera.
  ORIGEN_PERMITIDO: '',

  // Máximo de solicitudes por número de teléfono al día.
  TOPE_POR_TELEFONO: 3
};

/** Devuelve las horas ocupadas de un día. */
function doGet(e) {
  try {
    const accion = (e.parameter.accion || '').trim();

    if (accion === 'conteo') return responder(conteoAtenciones());

    if (accion !== 'disponibilidad') return responder({ ok: false, mensaje: 'Acción no válida.' });

    const fecha = (e.parameter.fecha || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return responder({ ok: false, mensaje: 'Fecha no válida.' });

    return responder({ ok: true, fecha: fecha, ocupadas: horasOcupadas(fecha) });
  } catch (err) {
    return responder({ ok: false, mensaje: String(err) });
  }
}

/** Recibe una solicitud de cita y la guarda en el calendario. */
function doPost(e) {
  try {
    const datos = JSON.parse(e.postData.contents);
    if (datos.accion !== 'reservar') return responder({ ok: false, mensaje: 'Acción no válida.' });

    // ── Validación ──
    const obligatorios = ['inicio', 'tutor', 'telefono', 'mascota', 'raza', 'edad', 'consulta'];
    for (const campo of obligatorios) {
      if (!datos[campo] || !String(datos[campo]).trim()) {
        return responder({ ok: false, mensaje: 'Faltan datos: ' + campo });
      }
    }

    const inicio = new Date(datos.inicio);
    if (isNaN(inicio)) return responder({ ok: false, mensaje: 'Fecha no válida.' });
    if (inicio < new Date()) return responder({ ok: false, mensaje: 'Esa hora ya pasó.' });

    const duracion = Math.min(Number(datos.duracionMin) || 60, 180);
    const fin = new Date(inicio.getTime() + duracion * 60000);

    // ── Freno a los envíos repetidos ──
    if (excedeTope(datos.telefono)) {
      return responder({ ok: false, mensaje: 'Ya tienes varias solicitudes hoy. Escríbenos por WhatsApp.' });
    }

    // ── Nadie más tomó la hora mientras llenaba el formulario ──
    const cal = calendario();
    if (cal.getEvents(inicio, fin).length > 0) {
      return responder({ ok: false, mensaje: 'Esa hora acaba de ocuparse. Elige otra, por favor.' });
    }

    const resumen = [
      'Tutor: ' + datos.tutor,
      'Teléfono: ' + datos.telefono,
      datos.correo ? 'Correo: ' + datos.correo : '',
      'Mascota: ' + datos.mascota,
      'Raza: ' + datos.raza,
      'Edad: ' + datos.edad,
      'Consulta: ' + datos.consulta,
      datos.motivo ? 'Motivo: ' + datos.motivo : '',
      '',
      'Solicitud enviada desde el sitio web. Pendiente de confirmar.'
    ].filter(String).join('\n');

    // El correo es opcional. Si viene y tiene forma de correo, se invita a
    // la persona para que la cita le caiga en su propio calendario.
    //
    // OJO: el invitado ve la descripción del evento, y la sigue viendo si
    // cambia después. En este evento no se escribe nada que el cliente no
    // deba leer; las notas internas van en la ficha, no en el calendario.
    const correo = String(datos.correo || '').trim();
    const invitar = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo);

    const opciones = { description: resumen };
    if (invitar) {
      opciones.guests = correo;
      opciones.sendInvites = true;
    }

    const evento = cal.createEvent(
      'Por confirmar · ' + datos.mascota + ' (' + datos.tutor + ')',
      inicio, fin,
      opciones
    );

    // El invitado no reenvía la cita ni la modifica: es su copia, no la agenda.
    if (invitar) {
      try {
        evento.setGuestsCanInviteOthers(false);
        evento.setGuestsCanModify(false);
        evento.setGuestsCanSeeGuests(false);
      } catch (err) {}
    }

    // Amarillo, para distinguir lo no confirmado de un vistazo.
    try { evento.setColor(CalendarApp.EventColor.YELLOW); } catch (err) {}

    registrar(datos.telefono);
    avisar(datos, inicio, resumen);

    return responder({ ok: true, id: evento.getId() });
  } catch (err) {
    return responder({ ok: false, mensaje: String(err) });
  }
}

/* ── Apoyo ─────────────────────────────────────────────────── */

function calendario() {
  return AJUSTES.CALENDARIO
    ? CalendarApp.getCalendarById(AJUSTES.CALENDARIO)
    : CalendarApp.getDefaultCalendar();
}

/**
 * Zona horaria de la clínica. Se toma del calendario, NO de la
 * configuración del proyecto de Apps Script.
 *
 * Si esas dos no coinciden, las horas salen corridas: un evento de las
 * 12:00 en Guatemala se reporta como las 18:00 si el proyecto quedó en
 * UTC, y como el sitio solo muestra de 8 a 16, ese bloque aparece libre.
 */
function zona() {
  return calendario().getTimeZone();
}

/** Instante exacto en que empieza ese día en la clínica. */
function inicioDelDia(fecha) {
  return Utilities.parseDate(fecha + ' 00:00:00', zona(), 'yyyy-MM-dd HH:mm:ss');
}

/** Horas (0–23) que toca algún evento ese día, en hora de la clínica. */
function horasOcupadas(fecha) {
  const HORA = 3600 * 1000;
  const arranque = inicioDelDia(fecha);
  const cierre = new Date(arranque.getTime() + 24 * HORA);

  const eventos = calendario().getEvents(arranque, cierre);
  const ocupadas = [];

  for (let h = 0; h < 24; h++) {
    const a = new Date(arranque.getTime() + h * HORA);
    const b = new Date(a.getTime() + HORA);

    const chocan = eventos.some(function (ev) {
      if (ev.isAllDayEvent()) return true;
      return ev.getStartTime() < b && ev.getEndTime() > a;
    });
    if (chocan) ocupadas.push(h);
  }
  return ocupadas;
}

/**
 * Revisión. Se ejecuta desde el editor, con el botón Ejecutar, y el
 * resultado sale en el registro (Ver → Registro de ejecución).
 * Dice qué calendario está leyendo, en qué zona, y qué eventos ve hoy.
 */
function diagnostico() {
  const hoy = Utilities.formatDate(new Date(), zona(), 'yyyy-MM-dd');

  Logger.log('Calendario que lee:  ' + calendario().getName());
  Logger.log('Zona del calendario: ' + zona());
  Logger.log('Zona del proyecto:   ' + Session.getScriptTimeZone());
  Logger.log('');
  Logger.log('Eventos de hoy (' + hoy + '):');

  const arranque = inicioDelDia(hoy);
  const eventos = calendario().getEvents(arranque, new Date(arranque.getTime() + 86400000));

  if (!eventos.length) {
    Logger.log('  (ninguno — si sí tenés citas hoy, el script está leyendo OTRO calendario)');
  } else {
    eventos.forEach(function (ev) {
      Logger.log('  · ' + Utilities.formatDate(ev.getStartTime(), zona(), 'HH:mm')
        + '–' + Utilities.formatDate(ev.getEndTime(), zona(), 'HH:mm')
        + '   ' + ev.getTitle());
    });
  }

  Logger.log('');
  Logger.log('Horas que el sitio marcará ocupadas: ' + JSON.stringify(horasOcupadas(hoy)));
}

/** Avisa a la clínica por correo y, si está configurado, por WhatsApp. */
function avisar(datos, inicio, resumen) {
  const cuando = Utilities.formatDate(
    inicio, calendario().getTimeZone(), "EEEE d 'de' MMMM 'a las' h:mm a"
  );

  if (AJUSTES.CORREO_AVISO) {
    try {
      MailApp.sendEmail(
        AJUSTES.CORREO_AVISO,
        'Nueva solicitud de cita · ' + datos.mascota,
        cuando + '\n\n' + resumen
      );
    } catch (err) {}
  }

  if (AJUSTES.WHATSAPP_URL) {
    try {
      const texto = 'Nueva solicitud de cita\n' + cuando + '\n\n' + resumen;
      UrlFetchApp.fetch(
        AJUSTES.WHATSAPP_URL.replace('{texto}', encodeURIComponent(texto)),
        { muteHttpExceptions: true }
      );
    } catch (err) {}
  }
}

/* ── Tope de solicitudes por teléfono ──────────────────────── */

function claveTope(telefono) {
  const hoy = Utilities.formatDate(new Date(), calendario().getTimeZone(), 'yyyy-MM-dd');
  return 'tope_' + hoy + '_' + String(telefono).replace(/\D/g, '');
}

function excedeTope(telefono) {
  const props = PropertiesService.getScriptProperties();
  return Number(props.getProperty(claveTope(telefono)) || 0) >= AJUSTES.TOPE_POR_TELEFONO;
}

function registrar(telefono) {
  const props = PropertiesService.getScriptProperties();
  const clave = claveTope(telefono);
  props.setProperty(clave, String(Number(props.getProperty(clave) || 0) + 1));
}

function responder(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}


/* ══════════════════════════════════════════════════════════
   Conteo de atenciones
   ----------------------------------------------------------
   El sitio muestra cuántas consultas lleva la clínica. En vez de
   un número escrito a mano que envejece, se cuenta del calendario.

   No se recorren los tres años en cada visita: BASE trae el conteo
   ya hecho hasta su fecha, y aquí solo se suman los días nuevos.
   Así la consulta mira días y no años.

   Se cuenta hasta el cierre de AYER. Las citas de hoy todavía
   pueden cancelarse o cambiar de tipo, y un contador que baja
   deja peor impresión que uno que sube un día después.

   Las citas se han escrito de dos formas con los años: antes con
   el nombre completo («Consulta Dermatologica») y ahora con
   códigos («CD»). Se reconocen las dos.

   Si el servicio se volvió a prestar, cuenta como ese servicio: una
   cita escrita «Reconsulta prueba de Alergia» es una prueba que se
   hizo por segunda vez, no un control. El control dermatológico es
   la reconsulta que no fue ni prueba ni consulta general.
   ══════════════════════════════════════════════════════════ */

const BASE = {
  hasta: '2026-11-11',   // conteo ya verificado hasta el cierre de este día
  cd:  928,              // consultas dermatológicas
  rcd: 551,              // reconsultas de seguimiento
  pa:  429,              // pruebas de alergia
  cg:  173               // consultas generales
};

/** Horas que se guarda el resultado antes de volver a contar. */
const CACHE_CONTEO_MIN = 180;

function conteoAtenciones() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('conteo');
  if (guardado) return JSON.parse(guardado);

  const zona = calendario().getTimeZone();
  const hoy = new Date();
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  ayer.setDate(ayer.getDate() - 1);           // último día cerrado

  const desde = new Date(BASE.hasta + 'T00:00:00');
  desde.setDate(desde.getDate() + 1);          // el día siguiente a la base

  const suma = { cd: BASE.cd, rcd: BASE.rcd, pa: BASE.pa, cg: BASE.cg };

  if (desde <= ayer) {
    const fin = new Date(ayer.getTime() + 24 * 3600 * 1000);
    calendario().getEvents(desde, fin).forEach(function (ev) {
      const t = normalizar(ev.getTitle());
      const esRe = /(^|[^A-Z])RCD([^A-Z]|$)|RE\s*-?\s*CONSULTA/.test(t);
      const esPA = /(^|[^A-Z])PA([^A-Z]|$)|PRUEBA\s+DE\s+ALERGIA|PANEL\s+DE\s+ALERGIA/.test(t);
      const esCG = /(^|[^A-Z])CG([^A-Z]|$)|CONSULTA\s+GENERAL/.test(t);
      const esCD = /(^|[^A-Z])CD([^A-Z]|$)|CONSULTA\s+DERMATOLOG/.test(t);

      if (esPA) suma.pa++;
      if (esCG) suma.cg++;
      // Si el servicio se volvió a prestar, cuenta como ese servicio: una
      // prueba de alergia repetida es una prueba, no un control. El control
      // dermatológico es la reconsulta que no fue ninguna de las dos.
      if (esRe && !esPA && !esCG) suma.rcd++;
      if (esCD && !esRe) suma.cd++;
    });
  }

  const salida = {
    ok: true,
    cd: suma.cd, rcd: suma.rcd, pa: suma.pa, cg: suma.cg,
    hasta: Utilities.formatDate(ayer, zona, 'yyyy-MM-dd')
  };
  cache.put('conteo', JSON.stringify(salida), CACHE_CONTEO_MIN * 60);
  return salida;
}

/** Mayúsculas y sin tildes, para comparar títulos escritos de cualquier forma. */
function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}


/**
 * Para probar el conteo desde el editor, sin publicar nada.
 *
 * Seleccionar «probarConteo» en la lista de funciones, darle a
 * Ejecutar, y mirar el registro de abajo. Debe imprimir los cuatro
 * números y hasta qué día cuentan.
 *
 * Borra primero el resultado guardado, para que cuente de verdad y
 * no devuelva el de hace un rato.
 */
function probarConteo() {
  CacheService.getScriptCache().remove('conteo');
  const r = conteoAtenciones();
  Logger.log('Consultas dermatológicas : %s', r.cd);
  Logger.log('Reconsultas              : %s', r.rcd);
  Logger.log('Pruebas de alergia       : %s', r.pa);
  Logger.log('Consultas generales      : %s', r.cg);
  Logger.log('Contado hasta            : %s', r.hasta);
  Logger.log('');
  Logger.log('Si estos números son menores que los de la página, el');
  Logger.log('calendario que lee el script no es el de recepción.');
  return r;
}
