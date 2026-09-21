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

  // Cobro del traslado a domicilio, por tramos de distancia. Se aplica el
  // primer tramo cuyo tope no se supera; más allá del último se cotiza.
  //
  // Aquí NO va la fórmula interna con que se fijaron estos montos: todo lo
  // que se escriba en este archivo queda a la vista de cualquiera que abra
  // el código de la página.
  traslado: {
    tramos: [
      { hastaKm: 12.5,  cobro: 100 },
      { hastaKm: 18.75, cobro: 150 },
      { hastaKm: 25,    cobro: 200 }
    ]
  },

  // Precio del servicio cuando se presta a domicilio. «Ambas» se suma,
  // no lleva precio combinado.
  serviciosDomicilio: {
    'Consulta dermatológica': 400,
    'Prueba de alergias': 1100
  },

  // Dirección del Apps Script que consulta el calendario y guarda las
  // reservas. Es la vía recomendada: corre dentro de la cuenta de Google
  // de la clínica, así que el calendario NO necesita ser público.
  // Ver integracion/google-apps-script.gs y el README.
  reservas: {
    endpoint: 'https://script.google.com/macros/s/AKfycbzj9OhlESf9KHK1z-JoudWXhbpxcYs0bTZ798lFnfoga5pCATHB1pRmmqeIn-dE5a-o0w/exec'
  },

  // Alternativa sin Apps Script: leer un calendario público con una clave
  // de API. Solo se usa si no hay endpoint configurado arriba.
  googleCalendar: {
    apiKey: '',
    calendarId: ''
  },

  // Con cuánta anticipación se puede reservar, en días.
  diasParaReservar: 90,

  // Horario de atención. 0 = domingo … 6 = sábado. null = cerrado.
  horario: {
    0: null,
    1: [8, 16], 2: [8, 16], 3: [8, 16], 4: [8, 16], 5: [8, 16],
    6: [8, 15]
  }
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];


/**
 * Abre WhatsApp con el mensaje ya escrito.
 *
 * Algunos navegadores —y cualquier página incrustada en un iframe, como
 * una vista previa— bloquean window.open y devuelven null. En ese caso no
 * se pierde la solicitud: se muestra un enlace para que la persona lo
 * pulse ella misma, que es un clic directo y nunca se bloquea.
 */
function abrirWhatsApp(url, referencia) {
  let ventana = null;
  try {
    ventana = window.open(url, '_blank', 'noopener');
  } catch (e) {
    ventana = null;
  }
  if (ventana) return true;

  mostrarEnlaceManual(url, referencia);
  return false;
}

/** Deja a la vista un enlace pulsable cuando la ventana fue bloqueada. */
function mostrarEnlaceManual(url, referencia) {
  const ancla = referencia || document.body;
  let caja = ancla.querySelector?.('.wa-manual')
    || (ancla.nextElementSibling?.classList?.contains('wa-manual') ? ancla.nextElementSibling : null);

  if (!caja) {
    caja = document.createElement('div');
    caja.className = 'wa-manual';
    ancla.insertAdjacentElement('afterend', caja);
  }

  caja.innerHTML =
    `<p>Tu navegador bloqueó la ventana de WhatsApp. Pulsa aquí para abrirla:</p>
     <a class="btn btn-wa" target="_blank" rel="noopener">
       <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2z"/></svg>
       Abrir WhatsApp con tu solicitud
     </a>`;
  caja.querySelector('a').href = url;
  caja.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

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
  // Vía preferida: el Apps Script devuelve solo las horas ocupadas,
  // nunca los detalles de los eventos.
  if (CONFIG.reservas.endpoint) {
    const url = CONFIG.reservas.endpoint
      + '?accion=disponibilidad&fecha=' + fechaISO(fecha);

    let r;
    try {
      r = await fetch(url);
    } catch (e) {
      // Ni siquiera hubo respuesta: sin conexión, o el navegador bloqueó
      // la petición a otro dominio.
      throw new Error('SIN_RESPUESTA');
    }
    if (!r.ok) throw new Error('HTTP_' + r.status);

    const texto = await r.text();
    try {
      return new Set(JSON.parse(texto).ocupadas || []);
    } catch (e) {
      // Llegó algo que no es JSON: casi siempre la pantalla de inicio de
      // sesión de Google, porque la app web no está abierta a cualquiera.
      throw new Error('NO_ES_JSON');
    }
  }

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

/**
 * Traduce el fallo a algo que le sirva a quien mantiene el sitio.
 * Los tres casos distinguen problemas muy distintos, y confundirlos
 * hace perder horas.
 */
function explicarFallo(e) {
  const clave = e && e.message;
  if (clave === 'NO_ES_JSON') {
    return 'El calendario respondió algo inesperado: probablemente la app web no está abierta a cualquier usuario.';
  }
  if (clave === 'SIN_RESPUESTA') {
    return 'No se pudo contactar al calendario.';
  }
  if (clave && clave.startsWith('HTTP_')) {
    return 'El calendario respondió con un error ' + clave.slice(5) + '.';
  }
  return 'No pudimos consultar el calendario en este momento.';
}

/** "2026-09-22" en hora local, no en UTC (toISOString corre el día). */
function fechaISO(f) {
  const mes = String(f.getMonth() + 1).padStart(2, '0');
  const dia = String(f.getDate()).padStart(2, '0');
  return `${f.getFullYear()}-${mes}-${dia}`;
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
      elemento = document.createElement('button');
      elemento.type = 'button';
      elemento.addEventListener('click', () => abrirReserva(fecha, h));
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

/** Primer día con atención a partir de una fecha, o null si no hay. */
function primerDiaAbierto(desde = new Date(), limite = 30) {
  const f = new Date(desde);
  f.setHours(0, 0, 0, 0);
  for (let i = 0; i < limite; i++) {
    const bloques = bloquesDe(f);
    if (bloques.length) {
      // Si es hoy y ya cerró, se pasa al siguiente.
      const ultimo = new Date(f);
      ultimo.setHours(bloques[bloques.length - 1], 0, 0, 0);
      if (ultimo > new Date()) return f;
    }
    f.setDate(f.getDate() + 1);
  }
  return null;
}

/** Monta el calendario y la rejilla de bloques. */
function iniciarAgenda(raiz) {
  const grilla   = raiz.querySelector('[data-dias]');
  const rejilla  = raiz.querySelector('[data-slots]');
  const aviso    = raiz.querySelector('[data-aviso]');
  const titulo   = raiz.querySelector('[data-mes-titulo]');
  const anterior = raiz.querySelector('[data-mes-ant]');
  const siguiente= raiz.querySelector('[data-mes-sig]');
  if (!grilla || !rejilla) return;

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const tope = new Date(hoy);
  tope.setDate(tope.getDate() + CONFIG.diasParaReservar);

  let seleccion = primerDiaAbierto(hoy);
  let mes = new Date(seleccion || hoy);
  mes.setDate(1);

  const mostrar = async (fecha) => {
    seleccion = fecha;
    pintarMes();

    let ocupadas = null;
    let mensaje = 'Estos son nuestros bloques de atención. Toca uno y te confirmamos si está libre.';
    let error = false;

    try {
      ocupadas = await horasOcupadas(fecha);
      if (ocupadas) mensaje = 'Disponibilidad tomada de nuestro calendario. Toca un bloque libre para reservar.';
    } catch (e) {
      mensaje = explicarFallo(e) + ' Mientras tanto, escríbenos por WhatsApp y te confirmamos la disponibilidad.';
      error = true;
      console.error('[Alervet] Falló la consulta de disponibilidad:', e);
    }

    pintarBloques(rejilla, fecha, ocupadas);
    if (aviso) {
      aviso.textContent = mensaje;
      aviso.classList.toggle('error', error);
    }
  };

  function pintarMes() {
    const año = mes.getFullYear(), m = mes.getMonth();
    if (titulo) {
      const nombre = mes.toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
      titulo.textContent = nombre.charAt(0).toUpperCase() + nombre.slice(1);
    }

    // La semana arranca en lunes: domingo (0) pasa a ser el séptimo día.
    const primero = new Date(año, m, 1);
    const hueco = (primero.getDay() + 6) % 7;
    const ultimoDia = new Date(año, m + 1, 0).getDate();

    grilla.textContent = '';
    for (let i = 0; i < hueco; i++) {
      grilla.appendChild(document.createElement('span'));
    }

    for (let d = 1; d <= ultimoDia; d++) {
      const fecha = new Date(año, m, d);
      const abierto = bloquesDe(fecha).length > 0;
      const pasado  = fecha < hoy || (fecha.getTime() === hoy.getTime() && !primerDiaAbierto(hoy));
      const lejano  = fecha > tope;
      const usable  = abierto && !pasado && !lejano;

      const celda = document.createElement('button');
      celda.type = 'button';
      celda.className = 'cal-dia';
      celda.textContent = String(d);
      celda.setAttribute('aria-label', fechaLarga(fecha));

      if (fecha.getTime() === hoy.getTime()) celda.classList.add('es-hoy');

      if (!usable) {
        celda.disabled = true;
        celda.classList.add(abierto ? 'no-disponible' : 'cerrado');
        if (!abierto) celda.title = 'No atendemos este día';
      } else {
        if (seleccion && fecha.getTime() === seleccion.getTime()) {
          celda.classList.add('elegido');
          celda.setAttribute('aria-current', 'date');
        }
        celda.addEventListener('click', () => mostrar(fecha));
      }
      grilla.appendChild(celda);
    }

    if (anterior) anterior.disabled = (año === hoy.getFullYear() && m === hoy.getMonth());
    if (siguiente) siguiente.disabled = new Date(año, m + 1, 1) > tope;
  }

  const cambiarMes = (paso) => {
    mes = new Date(mes.getFullYear(), mes.getMonth() + paso, 1);
    pintarMes();
  };
  anterior?.addEventListener('click', () => cambiarMes(-1));
  siguiente?.addEventListener('click', () => cambiarMes(1));

  if (seleccion) mostrar(seleccion);
  else pintarMes();
}


/* ── Ventana de reserva ─────────────────────────────────────
   Recoge los datos del paciente y los envía al Apps Script,
   que crea el evento en el calendario y avisa a la clínica.
   Si no hay endpoint configurado, cae a WhatsApp para no
   perder la solicitud.
   --------------------------------------------------------- */

let reservaActual = null;   // { fecha, hora }

function abrirReserva(fecha, hora) {
  const dlg = document.getElementById('reserva');
  if (!dlg) return;

  reservaActual = { fecha, hora };

  dlg.querySelector('[data-cuando]').textContent =
    `${fechaLarga(fecha)} · ${formatHora(hora)} a ${formatHora(hora + 1)}`;

  // Volver al estado inicial por si se reabre tras una reserva.
  dlg.querySelector('[data-paso-form]').hidden = false;
  dlg.querySelector('[data-paso-ok]').hidden = true;
  dlg.querySelector('.reserva-pie').hidden = false;
  dlg.querySelector('[data-error]').hidden = true;
  dlg.querySelector('form').reset();

  dlg.showModal();
}

/** Arma el texto que se manda por WhatsApp o va en el evento. */
function resumenReserva(datos, fecha, hora) {
  return [
    `Solicitud de cita · ${fechaLarga(fecha)} de ${formatHora(hora)} a ${formatHora(hora + 1)}`,
    `Tutor: ${datos.tutor}`,
    `Teléfono: ${datos.telefono}`,
    `Mascota: ${datos.mascota}`,
    `Raza: ${datos.raza}`,
    `Edad: ${datos.edad}`,
    `Consulta: ${datos.consulta}`,
    datos.motivo ? `Motivo: ${datos.motivo}` : ''
  ].filter(Boolean).join('\n');
}

function iniciarReserva() {
  const dlg = document.getElementById('reserva');
  if (!dlg) return;

  const form   = dlg.querySelector('form');
  const error  = dlg.querySelector('[data-error]');
  const enviar = dlg.querySelector('[data-enviar]');

  dlg.querySelectorAll('[data-cerrar]').forEach(b => {
    b.addEventListener('click', () => dlg.close());
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity() || !reservaActual) return;

    const { fecha, hora } = reservaActual;
    const datos = Object.fromEntries(
      [...new FormData(form).entries()].map(([k, v]) => [k, String(v).trim()])
    );

    error.hidden = true;
    enviar.setAttribute('aria-busy', 'true');
    const textoBoton = enviar.textContent;
    enviar.textContent = 'Enviando…';

    try {
      if (CONFIG.reservas.endpoint) {
        const inicio = new Date(fecha);
        inicio.setHours(hora, 0, 0, 0);

        let r;
        try {
          r = await fetch(CONFIG.reservas.endpoint, {
            method: 'POST',
            // text/plain evita la petición previa de CORS, que Apps Script
            // no sabe responder. El cuerpo sigue siendo JSON.
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              accion: 'reservar',
              inicio: inicio.toISOString(),
              duracionMin: 60,
              ...datos
            })
          });
        } catch (fallo) {
          console.error('[Alervet] No hubo respuesta del calendario:', fallo);
          throw new Error('SIN_RESPUESTA');
        }

        const respuesta = await r.json().catch(() => ({}));
        if (!r.ok || respuesta.ok === false) {
          console.error('[Alervet] El calendario rechazó la reserva:', r.status, respuesta);
          const fallo = new Error(respuesta.mensaje || 'No se pudo guardar la reserva.');
          // El servidor sabe por qué falló («esa hora acaba de ocuparse»),
          // y eso le dice al cliente qué hacer. Lo marcamos para mostrarlo tal cual.
          fallo.delServidor = Boolean(respuesta.mensaje);
          throw fallo;
        }
      } else {
        // Sin servidor configurado: la solicitud viaja por WhatsApp.
        abrirWhatsApp(waLink(resumenReserva(datos, fecha, hora)), form);
      }

      // Confirmación
      dlg.querySelector('[data-paso-form]').hidden = true;
      dlg.querySelector('.reserva-pie').hidden = true;
      const ok = dlg.querySelector('[data-paso-ok]');
      ok.querySelector('[data-resumen]').innerHTML =
        `<b>${datos.mascota}</b> · ${datos.consulta}<br>` +
        `${fechaLarga(fecha)}<br>` +
        `${formatHora(hora)} a ${formatHora(hora + 1)}`;
      ok.hidden = false;

    } catch (err) {
      error.textContent = err && err.delServidor
        ? err.message
        : 'No pudimos enviar tu solicitud. Intenta de nuevo o escríbenos por WhatsApp.';
      error.hidden = false;
    } finally {
      enviar.removeAttribute('aria-busy');
      enviar.textContent = textoBoton;
    }
  });
}


/* ── Calculadora del traslado a domicilio ───────────────────
   El cliente escribe cuántos kilómetros hay de la clínica a su
   casa y ve al instante cuánto costaría el traslado.
   --------------------------------------------------------- */

/**
 * Cobro del traslado para una distancia dada.
 * `cobro` es null cuando la distancia supera el último tramo: ahí
 * no se publica precio, se cotiza con el cliente.
 */
function calcularTraslado(km) {
  if (!(km > 0)) return null;
  const tramo = CONFIG.traslado.tramos.find(t => km <= t.hastaKm);
  return { km, cobro: tramo ? tramo.cobro : null };
}

/** Q1,100 en lugar de Q1100. */
function quetzales(n) {
  return 'Q' + n.toLocaleString('es-GT');
}

/**
 * Líneas de cobro del servicio elegido. «Ambas» devuelve una por cada
 * consulta, para que el cliente vea de dónde sale cada monto en lugar
 * de un total agregado.
 */
function lineasServicio(nombre) {
  const precios = CONFIG.serviciosDomicilio;
  if (!nombre) return [];
  if (nombre === 'Ambas') {
    return Object.entries(precios).map(([etiqueta, monto]) => ({ etiqueta, monto }));
  }
  return precios[nombre] ? [{ etiqueta: nombre, monto: precios[nombre] }] : [];
}

function iniciarCalculadora(raiz) {
  const campo  = raiz.querySelector('[data-km]');
  const salida = raiz.querySelector('[data-resultado]');
  if (!campo || !salida) return;

  // El selector de servicio puede estar dentro de la calculadora o, en el
  // formulario, ser el campo «¿Qué visita necesitas?».
  const form = raiz.closest('form');
  const selector = raiz.querySelector('[data-servicio]')
    || (form && form.querySelector('[name="visita"]'));

  const fila = (etiqueta, monto, clase = '') =>
    `<div class="${clase}"><span>${etiqueta}</span><b>${quetzales(monto)}</b></div>`;

  const pintar = () => {
    const km = parseFloat(campo.value.replace(',', '.'));
    const r = calcularTraslado(km);
    const servicios = selector ? lineasServicio(selector.value) : [];

    if (!r) {
      salida.hidden = true;
      return;
    }

    if (!r.cobro) {
      salida.innerHTML =
        `<p class="calc-cotiza"><b>Nos comunicaremos contigo para darte un precio exacto.</b></p>
         <p class="calc-nota">Tu domicilio está fuera de los tramos publicados, así que lo cotizamos caso por caso.</p>`;
    } else if (servicios.length) {
      const total = servicios.reduce((suma, l) => suma + l.monto, r.cobro);
      salida.innerHTML =
        `<div class="calc-desglose">
           ${servicios.map(l => fila(l.etiqueta, l.monto)).join('')}
           ${fila('Traslado estimado', r.cobro)}
           ${fila('Total estimado', total, 'calc-suma')}
         </div>
         <p class="calc-nota">Es un estimado. Te confirmamos el total exacto por WhatsApp antes de agendar.</p>`;
    } else {
      salida.innerHTML =
        `<div class="calc-desglose">${fila('Traslado estimado', r.cobro)}</div>
         <p class="calc-nota">Elige el servicio para ver el total. Es un estimado: te confirmamos el monto exacto por WhatsApp antes de agendar.</p>`;
    }

    salida.hidden = false;
    sincronizar(campo.value);
  };

  campo.addEventListener('input', pintar);
  if (selector) selector.addEventListener('change', pintar);
  raiz._pintar = pintar;
}

/** Mantiene iguales las dos calculadoras de la página. */
function sincronizar(valor) {
  document.querySelectorAll('[data-km]').forEach(otro => {
    if (otro.value !== valor) {
      otro.value = valor;
      const raiz = otro.closest('[data-calc]');
      if (raiz && raiz._pintar) raiz._pintar();
    }
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

      abrirWhatsApp(waLink(lineas.join('\n')), form);
    });
  });

  /* ── Calculadora del traslado ────────────────────────────── */
  document.querySelectorAll('[data-calc]').forEach(iniciarCalculadora);

  /* ── Disponibilidad y reservas ───────────────────────────── */
  iniciarReserva();
  document.querySelectorAll('[data-agenda]').forEach(iniciarAgenda);

  /* ── Año en el pie ───────────────────────────────────────── */
  document.querySelectorAll('[data-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });
});
