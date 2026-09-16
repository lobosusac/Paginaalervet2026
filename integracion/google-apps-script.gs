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
  CORREO_AVISO: 'lobos.usac@gmail.com',

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

    const fecha = parsearFecha(e.parameter.fecha);
    if (!fecha) return responder({ ok: false, mensaje: 'Fecha no válida.' });

    return responder({ ok: true, fecha: e.parameter.fecha, ocupadas: horasOcupadas(fecha) });
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

/** "2026-09-22" → Date a medianoche local. Devuelve null si no calza. */
function parsearFecha(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto || '')) return null;
  const [a, m, d] = texto.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  return isNaN(f) ? null : f;
}

/** Horas (0–23) que toca algún evento ese día. */
function horasOcupadas(fecha) {
  const desde = new Date(fecha); desde.setHours(0, 0, 0, 0);
  const hasta = new Date(fecha); hasta.setHours(23, 59, 59, 999);

  const ocupadas = [];
  const eventos = calendario().getEvents(desde, hasta);

  for (let h = 0; h < 24; h++) {
    const a = new Date(fecha); a.setHours(h, 0, 0, 0);
    const b = new Date(fecha); b.setHours(h + 1, 0, 0, 0);

    const chocan = eventos.some(function (ev) {
      if (ev.isAllDayEvent()) return true;
      return ev.getStartTime() < b && ev.getEndTime() > a;
    });
    if (chocan) ocupadas.push(h);
  }
  return ocupadas;
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
