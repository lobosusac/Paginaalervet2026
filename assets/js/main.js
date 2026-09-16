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

  // Horario de atención. 0 = domingo … 6 = sábado. null = cerrado.
  horario: {
    0: null,
    1: [9, 17], 2: [9, 17], 3: [9, 17], 4: [9, 17], 5: [9, 17],
    6: [8, 15]
  }
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Arma un enlace de WhatsApp con un mensaje ya escrito. */
function waLink(mensaje) {
  return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(mensaje)}`;
}

/** Convierte 17 → "5:00 pm", 9 → "9:00 am". */
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

  /* ── Año en el pie ───────────────────────────────────────── */
  document.querySelectorAll('[data-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
  });
});
