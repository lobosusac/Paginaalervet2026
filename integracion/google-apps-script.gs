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
      'Mascota: ' + datos.mascota,
      'Raza: ' + datos.raza,
      'Edad: ' + datos.edad,
      'Consulta: ' + datos.consulta,
      datos.motivo ? 'Motivo: ' + datos.motivo : '',
      '',
      'Solicitud enviada desde el sitio web. Pendiente de confirmar.'
    ].filter(String).join('\n');

    const evento = cal.createEvent(
      'Por confirmar · ' + datos.mascota + ' (' + datos.tutor + ')',
      inicio, fin,
      { description: resumen }
    );

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
