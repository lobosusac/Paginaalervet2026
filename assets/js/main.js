/* ============================================================
   Alervet — comportamiento del sitio
   ------------------------------------------------------------
   Los datos de contacto y el horario se editan aquí, en CONFIG.
   No hace falta tocar ningún HTML.
   ============================================================ */

const CONFIG = {
  whatsapp: '50234819108',            // Con código de país (502) y sin espacios
  telefono: '3481 9108',              // Número principal
  correo: '',                         // TODO Alervet: falta el correo de contacto

  // Enlace público para reservar cita (Google Calendar / página de citas).
  // Mientras esté vacío, los botones de calendario quedan desactivados.
  calendario: '',                     // TODO Alervet: pegar el enlace de reservas

  // Lectura de disponibilidad desde Google Calendar.
  // Requiere que el calendario sea público. Mientras esté sin configurar,
  // los bloques de hora se muestran como «consultar», nunca como libres:
  // prometer una hora que ya está tomada es peor que no prometer nada.
  googleCalendar: {
    apiKey: '',                       // TODO Alervet: clave de API restringida por dominio
    calendarId: ''                    // TODO Alervet: ID del calendario público
  },

  // Horario de atención. 0 = domingo … 6 = sábado. null = cerrado.
  horario: {
    0: null,
    1: [8, 16], 2: [8, 16], 3: [8, 16], 4: [8, 16], 5: [8, 16],
    6: [8, 15]
  }
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Arma un enlace de WhatsApp con un mensaje ya escrito. */
function waLink(mensaje) {
  return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(mensaje)}`;
}

/** Convierte 16 → "4:00 pm", 8 → "8:00 am". */
function formatHora(h) {
  const suf = h >= 12 ? 'pm' : 'am';
  const doce = h % 12 === 0 ? 12 : h % 12;
  return `${doce}:00 ${suf}`;
}

/**
 * Calcula si la clínica está abierta ahora mismo y devuelve el texto
 * que se muestra en el indicador.
 */
function estadoActual(ahora = new Date()) {
  const dia = ahora.getDay();
  const hora = ahora.getHours() + ahora.getMinutes() / 60;
  const hoy = CONFIG.horario[dia];

  if (hoy && hora >= hoy[0] && hora < hoy[1]) {
    return { abierto: true, texto: `Abierto ahora — cerramos a las ${formatHora(hoy[1])}` };
  }

  // Si hoy todavía no abre, ese es el próximo turno.
  if (hoy && hora < hoy[0]) {
    return { abierto: false, texto: `Cerrado — hoy abrimos a las ${formatHora(hoy[0])}` };
  }

  // Si no, buscamos el siguiente día con horario.
  for (let i = 1; i <= 7; i++) {
    const d = (dia + i) % 7;
    const turno = CONFIG.horario[d];
    if (turno) {
      const cuando = i === 1 ? 'mañana' : `el ${DIAS[d]}`;
      return { abierto: false, texto: `Cerrado — abrimos ${cuando} a las ${formatHora(turno[0])}` };
    }
  }
  return { abierto: false, texto: 'Cerrado' };
}


/* ── Disponibilidad por bloques de hora ─────────────────────
   La rejilla muestra el horario de atención partido en bloques
   de una hora. Si hay un calendario configurado, marca como
   ocupados los que ya tienen una cita.
   --------------------------------------------------------- */

/** Devuelve los próximos días en que la clínica abre. */
function proximosDias(cantidad = 7, desde = new Date()) {
  const dias = [];
  const base = new Date(desde);
  base.setHours(0, 0, 0, 0);
  for (let i = 0; dias.length < cantidad && i < 30; i++) {
    const f = new Date(base);
    f.setDate(base.getDate() + i);
    const bloques = bloquesDe(f);
    if (!bloques.length) continue;

    // Si hoy ya cerró, no tiene sentido ofrecerlo: el primer día
    // que se muestra pasa a ser el siguiente con atención.
    if (i === 0) {
      const ultimo = new Date(f);
      ultimo.setHours(bloques[bloques.length - 1], 0, 0, 0);
      if (ultimo <= desde) continue;
    }
    dias.push(f);
  }
  return dias;
}

/** Bloques de una hora que cubren el horario de ese día. */
function bloquesDe(fecha) {
  const turno = CONFIG.horario[fecha.getDay()];
  if (!turno) return [];
  const bloques = [];
  for (let h = turno[0]; h < turno[1]; h++) bloques.push(h);
  return bloques;
}

/**
 * Horas ya ocupadas según Google Calendar.
 * Devuelve null cuando no hay calendario configurado, para que la
 * interfaz sepa que no puede afirmar disponibilidad.
 */
async function horasOcupadas(fecha) {
  const { apiKey, calendarId } = CONFIG.googleCalendar;
  if (!apiKey || !calendarId) return null;

  const inicio = new Date(fecha); inicio.setHours(0, 0, 0, 0);
  const fin = new Date(fecha); fin.setHours(23, 59, 59, 999);

  const url = 'https://www.googleapis.com/calendar/v3/calendars/'
    + encodeURIComponent(calendarId) + '/events'
    + '?key=' + encodeURIComponent(apiKey)
    + '&timeMin=' + inicio.toISOString()
    + '&timeMax=' + fin.toISOString()
    + '&singleEvents=true&orderBy=startTime&maxResults=250';

  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error('Google Calendar respondió ' + respuesta.status);

  const bloques = bloquesDe(fecha);
  const ocupadas = new Set();

  for (const evento of (await respuesta.json()).items || []) {
    if (evento.status === 'cancelled') continue;
    if (evento.transparency === 'transparent') continue;  // marcado como "disponible"

    // Un evento de día completo bloquea la jornada entera.
    if (evento.start && evento.start.date) {
      bloques.forEach(h => ocupadas.add(h));
      continue;
    }
    if (!evento.start || !evento.start.dateTime) continue;

    const desde = new Date(evento.start.dateTime);
    const hasta = new Date(evento.end.dateTime);
    for (const h of bloques) {
      const a = new Date(fecha); a.setHours(h, 0, 0, 0);
      const b = new Date(fecha); b.setHours(h + 1, 0, 0, 0);
      if (desde < b && hasta > a) ocupadas.add(h);   // se solapan
    }
  }
  return ocupadas;
}

/** "lunes 22 de septiembre" — sin la coma que mete el formato local. */
function fechaLarga(f) {
  return f.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' })
          .replace(',', '');
}

/** Dibuja los bloques de un día en la rejilla. */
function pintarBloques(rejilla, fecha, ocupadas) {
  const ahora = new Date();
  const bloques = bloquesDe(fecha);
  rejilla.textContent = '';

  if (!bloques.length) {
    const cerrado = document.createElement('p');
    cerrado.className = 'agenda-cerrado';
    cerrado.textContent = 'Ese día no atendemos.';
    rejilla.appendChild(cerrado);
    return;
  }

  for (const h of bloques) {
    const inicio = new Date(fecha); inicio.setHours(h, 0, 0, 0);
    const rango = `${formatHora(h)} a ${formatHora(h + 1)}`;

    let clase, estado, elemento;
    if (inicio <= ahora) {
      clase = 'pasado'; estado = 'Ya pasó';
    } else if (ocupadas && ocupadas.has(h)) {
      clase = 'ocupado'; estado = 'No disponible';
    } else if (ocupadas) {
      clase = 'libre'; estado = 'Disponible';
    } else {
      clase = 'consultar'; estado = 'Consultar';
    }

    if (clase === 'libre' || clase === 'consultar') {
      elemento = document.createElement('a');
      elemento.href = waLink(
        `Hola, quiero agendar una cita el ${fechaLarga(fecha)} de ${rango}.`
      );
      elemento.target = '_blank';
      elemento.rel = 'noopener';
    } else {
      elemento = document.createElement('div');
      elemento.setAttribute('aria-disabled', 'true');
    }

    elemento.className = 'slot ' + clase;
    const hora = document.createElement('span');
    hora.className = 'hora';
    hora.textContent = rango;
    const txt = document.createElement('span');
    txt.className = 'estado';
    txt.textContent = estado;
    elemento.append(hora, txt);
    rejilla.appendChild(elemento);
  }
}

/** Monta el selector de días y la rejilla de bloques. */
function iniciarAgenda(raiz) {
  const tiraDias = raiz.querySelector('[data-dias]');
  const rejilla  = raiz.querySelector('[data-slots]');
  const aviso    = raiz.querySelector('[data-aviso]');
  if (!tiraDias || !rejilla) return;

  const dias = proximosDias(7);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

  const mostrar = async (fecha, boton) => {
    tiraDias.querySelectorAll('.dia').forEach(b => b.setAttribute('aria-selected', 'false'));
    boton.setAttribute('aria-selected', 'true');

    let ocupadas = null;
    let mensaje = 'Estos son nuestros bloques de atención. Escríbenos por WhatsApp y te confirmamos cuáles están libres.';
    let error = false;

    try {
      ocupadas = await horasOcupadas(fecha);
      if (ocupadas) mensaje = 'Disponibilidad tomada de nuestro calendario. Toca un bloque libre para agendarlo por WhatsApp.';
    } catch (e) {
      mensaje = 'No pudimos consultar el calendario en este momento. Escríbenos por WhatsApp y te confirmamos la disponibilidad.';
      error = true;
    }

    pintarBloques(rejilla, fecha, ocupadas);
    if (aviso) {
      aviso.textContent = mensaje;
      aviso.classList.toggle('error', error);
    }
  };

  dias.forEach((fecha, i) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'dia';
    boton.setAttribute('role', 'tab');
    boton.setAttribute('aria-selected', 'false');

    const dia = document.createElement('b');
    const esHoy = fecha.getTime() === hoy.getTime();
    dia.textContent = esHoy ? 'Hoy' : fecha.toLocaleDateString('es-GT', { weekday: 'short' }).replace('.', '');
    const num = document.createElement('i');
    num.textContent = String(fecha.getDate());
    boton.append(dia, num);

    boton.setAttribute('aria-label', fechaLarga(fecha));
    boton.addEventListener('click', () => mostrar(fecha, boton));
    tiraDias.appendChild(boton);

    if (i === 0) mostrar(fecha, boton);
  });
}

document.addEventListener('DOMContentLoaded', () => {

  /* ── Menú en celular ─────────────────────────────────────── */
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('site-nav');

  if (toggle && nav) {
    const esMovil = () => window.matchMedia('(max-width: 900px)').matches;

    const setMenu = (abierto) => {
      toggle.setAttribute('aria-expanded', String(abierto));
      nav.hidden = !abierto;
    };

    // El menú arranca cerrado en celular y siempre visible en escritorio.
    const sincronizar = () => setMenu(!esMovil());
    sincronizar();
    window.addEventListener('resize', sincronizar);

    toggle.addEventListener('click', () => {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });

    // Al tocar un enlace, el menú se cierra solo.
    nav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => { if (esMovil()) setMenu(false); });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && esMovil() && !nav.hidden) {
        setMenu(false);
        toggle.focus();
      }
    });
  }

  /* ── Indicador de abierto / cerrado ──────────────────────── */
  document.querySelectorAll('[data-status]').forEach(el => {
    const { abierto, texto } = estadoActual();
    el.textContent = texto;
    el.classList.add(abierto ? 'open' : 'shut');
  });

  /* ── Botones de Google Calendar ──────────────────────────── */
  document.querySelectorAll('[data-cal]').forEach(el => {
    if (CONFIG.calendario) {
      el.href = CONFIG.calendario;
      el.target = '_blank';
      el.rel = 'noopener';
    } else {
      // Sin enlace configurado el botón no debe navegar a ningún lado.
      el.setAttribute('aria-disabled', 'true');
      el.removeAttribute('href');
      el.title = 'Pendiente de configurar el enlace de reservas';
    }
  });

  /* ── Enlaces de WhatsApp ─────────────────────────────────── */
  document.querySelectorAll('[data-wa]').forEach(el => {
    el.href = waLink(el.dataset.wa || 'Hola, quiero agendar una cita para mi mascota.');
  });

  /* ── Formularios ─────────────────────────────────────────
     Sin servidor todavía: los datos se arman como un mensaje de
     WhatsApp para no perder ninguna solicitud mientras se decide
     el alojamiento definitivo.
     ------------------------------------------------------- */
  document.querySelectorAll('form[data-wa-form]').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;

      const datos = new FormData(form);
      const lineas = [form.dataset.waForm];

      for (const [campo, valor] of datos.entries()) {
        const texto = String(valor).trim();
        if (!texto) continue;
        const label = form.querySelector(`[name="${campo}"]`)
          ?.closest('.field')?.querySelector('label')?.textContent
          .replace('*', '').trim() || campo;
        lineas.push(`${label}: ${texto}`);
      }

      window.open(waLink(lineas.join('\n')), '_blank', 'noopener');
    });
  });

  /* ── Disponibilidad ──────────────────────────────────────── */
  document.querySelectorAll('[data-agenda]').forEach(iniciarAgenda);

  /* ── Año en el pie ───────────────────────────────────────── */
  document.querySelectorAll('[data-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });
});
