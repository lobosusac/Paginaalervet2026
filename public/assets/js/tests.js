/* ──────────────────────────────────────────────────────────
   Autoevaluaciones
   ----------------------------------------------------------
   Dos tests que comparten el mismo motor: una pregunta por
   pantalla, y al final un resultado con el siguiente paso y
   un mensaje de WhatsApp ya escrito.

   Cada página marca cuál le toca con data-test="piel" o
   data-test="alergias" en el contenedor.

   Usa waLink() y abrirWhatsApp() de main.js, que ya resuelven
   el caso de que WhatsApp no abra solo.
   ────────────────────────────────────────────────────────── */

const DIAS_SUSPENSION = 10;
const DIAS_SIN_BANO   = 3;

const FARMACOS_SUSPENDER =
  'Prednisona, prednisolona, dexametasona, omegas 3-6-9, loratadina, ' +
  'desloratadina, difenhidramina, ebastina, fexofenadina, cetirizina, ' +
  'levocetirizina, mizolastina o rupatadina.';

const SI_NO = [
  { etiqueta: 'Sí', valor: 'si' },
  { etiqueta: 'No', valor: 'no', apagado: true }
];

/* ─── Test de piel ──────────────────────────────────────── */
const PASOS_PIEL = [
  { id:'rascado', texto:'¿Se rasca, se muerde o se lame con frecuencia?',
    pista:'Más de lo normal, o tanto que te llama la atención.',
    senal:'Se rasca, se muerde o se lame con frecuencia', opciones:SI_NO },
  { id:'patas', texto:'¿Se lame o mordisquea las patas?',
    pista:'A veces queda el pelo manchado de café o rojizo entre los dedos.',
    senal:'Se lame o mordisquea las patas', opciones:SI_NO },
  { id:'piel', texto:'¿Tiene la piel roja, con granitos o irritada?',
    pista:'Revisa panza, axilas, ingles y la base de la cola.',
    senal:'Piel roja, con granitos o irritada', opciones:SI_NO },
  { id:'pelo', texto:'¿Se le cae el pelo por zonas, o tiene áreas sin pelo?',
    pista:'Parches o claros donde el pelo no vuelve a salir.',
    senal:'Caída de pelo por zonas', opciones:SI_NO },
  { id:'olor', texto:'¿Tiene mal olor en la piel o en las orejas, aunque la bañes?',
    pista:'Un olor que regresa a los pocos días del baño.',
    senal:'Mal olor en piel u orejas que regresa', opciones:SI_NO },
  { id:'oidos', texto:'¿Ha tenido infección de oídos más de dos veces en el último año?',
    pista:'Se sacude la cabeza, se rasca las orejas o le huelen mal.',
    senal:'Infecciones de oído repetidas', opciones:SI_NO },
  { id:'epoca', texto:'¿Los síntomas empeoran en alguna época del año?',
    pista:'Por ejemplo en época seca, en lluvias, o cuando hay más polvo.',
    senal:'Los síntomas empeoran en cierta época del año', opciones:SI_NO },
  { id:'recaida', texto:'¿Ya recibió tratamiento y la comezón volvió al suspenderlo?',
    pista:'Mejoró unos días y después regresó igual o peor.',
    senal:'La comezón regresó al suspender el tratamiento',
    recurrencia:true, opciones:SI_NO }
];

/**
 * Cuenta las siete señales de piel. La octava —que la comezón regrese al
 * suspender el tratamiento— no suma una señal más: cambia el consejo,
 * porque apunta a que se trató el síntoma y no la causa.
 */
function evaluarPiel(r) {
  const senales = PASOS_PIEL
    .filter(p => !p.recurrencia && r[p.id] === 'si')
    .map(p => p.senal);
  const recaida = r.recaida === 'si';
  const n = senales.length;

  if (n === 0 && !recaida) {
    return {
      nivel:'bien', sello:'Sin señales de alarma',
      titulo:'No marcaste señales de problema de piel',
      lede:'Por lo que respondiste, no aparecen los signos que buscamos en una consulta dermatológica. Eso es buena noticia.',
      senales, recaida,
      pasos:[
        'Si algo te preocupa igual, una consulta general resuelve la duda y cuesta menos.',
        'Si más adelante aparece comezón, enrojecimiento o mal olor, vuelve a hacer el test.'
      ],
      precio:'Q125', precioNota:'Consulta general en clínica',
      siguiente:null
    };
  }

  if (n >= 3) {
    return {
      nivel:'alto', sello:'Varias señales',
      titulo:'Son varias señales a la vez',
      lede:'Cuando aparecen juntas, lo más probable es que haya una causa de fondo y no un problema pasajero. Mientras no se identifique, los síntomas tienden a regresar.',
      senales, recaida,
      pasos:[
        'Agenda una consulta dermatológica lo antes que puedas.',
        'No la bañes con nada nuevo ni le des medicamento por tu cuenta antes de la cita.',
        'Si está en tratamiento, trae las últimas recetas.'
      ],
      precio:'Q275', precioNota:'Consulta dermatológica en clínica',
      siguiente:'panel'
    };
  }

  return {
    nivel:'espera', sello:'Conviene revisarla',
    titulo:'Hay señales que vale la pena revisar',
    lede:'Lo que marcaste puede deberse a una alergia, pero también a una infección, a hongos o a parásitos. Se parecen entre sí y solo se distinguen revisando a la mascota.',
    senales, recaida,
    pasos:[
      'Agenda una consulta dermatológica para identificar qué lo está causando.',
      'No la bañes con nada nuevo ni le des medicamento por tu cuenta antes de la cita.',
      'Si está en tratamiento, trae las últimas recetas.'
    ],
    precio:'Q275', precioNota:'Consulta dermatológica en clínica',
    siguiente:recaida ? 'panel' : null
  };
}

function mensajePiel(res) {
  const l = ['Hola, hice el test de piel en su página.', ''];
  l.push('Resultado: ' + res.titulo + '.');
  if (res.senales.length) {
    l.push('', 'Esto fue lo que marqué:');
    res.senales.forEach(s => l.push('• ' + s));
  }
  if (res.recaida) l.push('', 'La comezón regresó al suspender el tratamiento.');
  l.push('', '¿Me ayudan a agendar?');
  return l.join('\n');
}

/* ─── Test del panel de alergias ────────────────────────── */
const PASOS_PANEL = [
  { id:'atopia', texto:'¿Un veterinario ya le diagnosticó dermatitis atópica?',
    pista:'Es el requisito de entrada: el panel busca a qué es alérgica una mascota que ya se sabe alérgica.',
    opciones:[
      { etiqueta:'Sí, ya tiene el diagnóstico', valor:'si' },
      { etiqueta:'No', valor:'no', apagado:true },
      { etiqueta:'No estoy seguro', valor:'duda', apagado:true }
    ] },
  { id:'infeccion', texto:'¿Tiene en este momento heridas, piel inflamada o infección?',
    pista:'Si la piel está lastimada, la prueba puede salir alterada.',
    opciones:SI_NO },
  { id:'medicamento', texto:'¿Está tomando alguno de estos medicamentos?',
    pista:'Son los que hay que suspender 10 días antes.',
    farmacos:FARMACOS_SUSPENDER, opciones:SI_NO },
  { id:'suspendido', texto:'¿Ya se lo suspendieron?',
    pista:'Si ya lo suspendiste, dinos desde cuándo y calculamos la fecha.',
    si:r => r.medicamento === 'si',
    opciones:[
      { etiqueta:'Sí, ya lo suspendimos', valor:'si' },
      { etiqueta:'No, lo sigue tomando', valor:'no', apagado:true }
    ] },
  { id:'fecha', texto:'¿Cuándo fue la última dosis?',
    pista:'Con esa fecha calculamos desde qué día el panel es confiable.',
    si:r => r.suspendido === 'si', tipo:'fecha' },
  { id:'apoquel', texto:'¿Está tomando Apoquel (oclacitinib) o Numelvi?',
    pista:'Preguntamos porque estos dos no hay que suspenderlos.',
    opciones:SI_NO },
  { id:'bano', texto:'¿La bañaste en los últimos días, o piensas bañarla antes de la cita?',
    pista:'No debe bañarse los 3 días previos a la prueba.',
    opciones:SI_NO }
];

function hoy() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function sumarDias(fecha, dias) {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}
function enLargo(fecha) {
  return fecha.toLocaleDateString('es-GT',
    { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}
/* El input entrega yyyy-mm-dd; se arma en hora local para que no se
   corra un día según el huso. */
function leerFecha(valor) {
  const [a, m, d] = valor.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function evaluarPanel(r) {
  const frenos = [];
  const pasos  = [];
  let desde = null, notaFecha = '';

  if (r.atopia === 'no') {
    frenos.push('sin-diagnostico');
    pasos.push('Empecemos por una consulta dermatológica. El panel busca a qué es alérgica una mascota que ya se sabe alérgica, así que primero hay que llegar a ese diagnóstico.');
  } else if (r.atopia === 'duda') {
    frenos.push('duda');
    pasos.push('Escríbenos y lo revisamos contigo antes de agendar. Si ya la vio otro veterinario, ten a mano las recetas o el diagnóstico que te dieron.');
  }

  if (r.infeccion === 'si') {
    frenos.push('infeccion');
    pasos.push('Primero hay que tratar las heridas o la infección, y eso se resuelve en una consulta dermatológica. Con la piel lastimada el panel puede salir alterado.');
  }

  if (r.medicamento === 'si') {
    if (r.suspendido === 'si' && r.fecha) {
      const ultima = leerFecha(r.fecha);
      const limite = sumarDias(ultima, DIAS_SUSPENSION);
      if (limite > hoy()) {
        desde = limite;
        notaFecha = 'Son ' + DIAS_SUSPENSION + ' días desde la última dosis, que fue el ' + enLargo(ultima) + '.';
      } else {
        pasos.push('Ya pasaron los ' + DIAS_SUSPENSION + ' días desde la última dosis, así que por ese lado no hay que esperar.');
      }
    } else {
      desde = sumarDias(hoy(), DIAS_SUSPENSION);
      notaFecha = 'Son ' + DIAS_SUSPENSION + ' días contados desde hoy. Si lo suspenden más tarde, la fecha se corre.';
      pasos.push('Habla con nosotros antes de suspender el medicamento. Una vez suspendido, hay que dejar pasar ' + DIAS_SUSPENSION + ' días.');
    }
  }

  if (r.bano === 'si') {
    pasos.push('No la bañes los ' + DIAS_SIN_BANO + ' días previos a la cita.');
  }

  const primeroConsulta = frenos.includes('sin-diagnostico') || frenos.includes('infeccion');
  let res;

  if (frenos.length) {
    res = {
      nivel:'alto', sello:'Falta un paso',
      titulo:'Todavía no, falta un paso antes',
      lede:frenos.length === 1
        ? 'Hay una cosa que resolver primero. No es un problema: es lo que hace que el resultado sea confiable.'
        : 'Hay un par de cosas que resolver primero. No es un problema: es lo que hace que el resultado sea confiable.'
    };
  } else if (desde) {
    res = {
      nivel:'espera', sello:'Hay que esperar',
      titulo:'Puede hacerse, pero no esta semana',
      lede:'Cumple con todo, salvo el tiempo de suspensión del medicamento. Esa es la única espera.'
    };
  } else {
    res = {
      nivel:'bien', sello:'Puede agendarse',
      titulo:'Cumple con todo para hacerse el panel',
      lede:'Por lo que nos contaste, no hay nada que esté alterando el resultado. Se puede agendar.'
    };
    pasos.unshift('Agenda tu cita cuando te quede bien. El resultado se entrega al finalizar la consulta.');
    if (r.bano !== 'si') pasos.push('Recuerda no bañarla los ' + DIAS_SIN_BANO + ' días previos.');
  }

  res.pasos = pasos;
  res.desde = desde;
  res.notaFecha = notaFecha;
  res.frenos = frenos;
  res.pasosTitulo = frenos.length ? 'Qué hay que resolver' : 'Qué sigue';
  res.precio = primeroConsulta ? 'Q275' : 'Q1,100';
  res.precioNota = primeroConsulta
    ? 'Consulta dermatológica · el paso previo al panel'
    : 'Panel intradérmico · resultado al finalizar la consulta';
  res.apoquel = r.apoquel === 'si';
  res.siguiente = primeroConsulta ? 'piel' : null;
  res.waEtiqueta = frenos.length ? 'Consultar por WhatsApp' : 'Agendar por WhatsApp';
  return res;
}

function mensajePanel(res, r) {
  const l = ['Hola, revisé en su página si mi mascota puede hacerse el panel de alergias.', ''];
  l.push('Resultado: ' + res.titulo + '.', '');
  l.push('Diagnóstico de dermatitis atópica: ' +
    (r.atopia === 'si' ? 'sí' : r.atopia === 'no' ? 'no' : 'no estoy seguro'));
  l.push('Heridas o infección en la piel: ' + (r.infeccion === 'si' ? 'sí' : 'no'));

  if (r.medicamento === 'si') {
    l.push(r.suspendido === 'si' && r.fecha
      ? 'Medicamento de la lista: sí, última dosis el ' + enLargo(leerFecha(r.fecha))
      : 'Medicamento de la lista: sí, lo sigue tomando');
  } else {
    l.push('Medicamento de la lista: no');
  }

  if (r.apoquel === 'si') l.push('Toma Apoquel o Numelvi: sí');
  if (res.desde) l.push('Fecha sugerida para agendar: a partir del ' + enLargo(res.desde));

  l.push('', '¿Me ayudan a agendar?');
  return l.join('\n');
}

/* ─── Motor común ───────────────────────────────────────── */
const TESTS = {
  piel:     { pasos:PASOS_PIEL,  evaluar:evaluarPiel,  mensaje:mensajePiel },
  alergias: { pasos:PASOS_PANEL, evaluar:evaluarPanel, mensaje:mensajePanel }
};

const TICK  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const CRUZ  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

function iniciarTest(raiz) {
  const cfg = TESTS[raiz.dataset.test];
  if (!cfg) return;

  const q  = sel => raiz.querySelector(sel);
  const respuestas = {};
  let historial = [];
  let actual = 0;

  const aplicables = () => cfg.pasos.filter(p => !p.si || p.si(respuestas));

  function pintar() {
    const lista = aplicables();
    const paso  = lista[actual];
    if (!paso) return terminar();

    q('[data-total]').textContent  = lista.length;
    q('[data-actual]').textContent = actual + 1;
    const pct = Math.round(actual / lista.length * 100);
    q('[data-barra]').style.width = pct + '%';
    q('[data-pct]').textContent   = pct + '%';

    q('[data-texto]').textContent = paso.texto;
    q('[data-pista]').textContent = paso.pista;

    const far = q('[data-farmacos]');
    far.hidden = !paso.farmacos;
    if (paso.farmacos) far.textContent = paso.farmacos;

    const caja = q('[data-opciones]');
    const campo = q('[data-campo-fecha]');
    caja.textContent = '';

    if (paso.tipo === 'fecha') {
      caja.hidden = true;
      campo.hidden = false;
      const inp = q('#ev-fecha');
      inp.max = hoy().toISOString().slice(0, 10);
      inp.min = sumarDias(hoy(), -120).toISOString().slice(0, 10);
      if (respuestas.fecha) inp.value = respuestas.fecha;
    } else {
      campo.hidden = true;
      caja.hidden = false;
      caja.className = 'ev-opciones ' + (paso.opciones.length > 2 ? 'una' : 'dos');
      paso.opciones.forEach(op => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ev-opcion' + (op.apagado ? ' no' : '');
        b.innerHTML = (op.apagado ? CRUZ : TICK) + '<span></span>';
        b.querySelector('span').textContent = op.etiqueta;
        b.addEventListener('click', () => avanzar(paso.id, op.valor));
        caja.append(b);
      });
    }

    q('[data-atras]').disabled = historial.length === 0;

    const marcadas = q('[data-marcadas]');
    if (marcadas) {
      const n = cfg.pasos.filter(p => respuestas[p.id] === 'si').length;
      marcadas.textContent = n === 0 ? 'Ninguna señal marcada'
        : n === 1 ? '1 señal marcada' : n + ' señales marcadas';
    }
  }

  function avanzar(id, valor) {
    historial.push(id);
    respuestas[id] = valor;
    if (actual + 1 >= aplicables().length) terminar();
    else { actual++; pintar(); }
  }

  function terminar() {
    const res = cfg.evaluar(respuestas);
    const texto = cfg.mensaje(res, respuestas);

    q('[data-sello]').className = 'ev-sello ' + res.nivel;
    q('[data-sello]').textContent = res.sello;
    q('[data-r-titulo]').textContent = res.titulo;
    q('[data-r-lede]').textContent = res.lede;

    const cajaF = q('[data-caja-fecha]');
    if (cajaF) {
      cajaF.hidden = !res.desde;
      if (res.desde) {
        q('[data-r-fecha]').textContent = enLargo(res.desde);
        q('[data-r-fecha-nota]').textContent = res.notaFecha;
      }
    }

    const senales = q('[data-bloque-senales]');
    if (senales) {
      senales.hidden = !(res.senales && res.senales.length);
      if (!senales.hidden) {
        const ul = q('[data-r-senales]');
        ul.textContent = '';
        res.senales.forEach(s => {
          const li = document.createElement('li');
          li.textContent = s;
          ul.append(li);
        });
      }
    }

    const tp = q('[data-pasos-titulo]');
    if (tp && res.pasosTitulo) tp.textContent = res.pasosTitulo;

    const ul = q('[data-r-pasos]');
    ul.textContent = '';
    res.pasos.forEach(p => {
      const li = document.createElement('li');
      li.textContent = p;
      ul.append(li);
    });

    const recaida = q('[data-nota-recaida]');
    if (recaida) recaida.hidden = !res.recaida;
    const apoquel = q('[data-nota-apoquel]');
    if (apoquel) apoquel.hidden = !res.apoquel;

    q('[data-r-precio]').textContent = res.precio;
    q('[data-r-precio-nota]').textContent = res.precioNota;

    // Enlace al otro test, cuando el resultado lo pide.
    raiz.querySelectorAll('[data-siguiente]').forEach(el => {
      el.hidden = el.dataset.siguiente !== res.siguiente;
    });

    const wa = q('[data-wa-resultado]');
    wa.href = waLink(texto);
    const etiqueta = wa.querySelector('[data-wa-etiqueta]');
    if (etiqueta && res.waEtiqueta) etiqueta.textContent = res.waEtiqueta;
    wa.onclick = e => { e.preventDefault(); abrirWhatsApp(waLink(texto), wa); };

    q('[data-mensaje]').textContent = texto;

    q('[data-paso-test]').hidden = true;
    q('[data-paso-resultado]').hidden = false;
    q('[data-paso-resultado]').scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function reiniciar() {
    Object.keys(respuestas).forEach(k => delete respuestas[k]);
    historial = [];
    actual = 0;
    q('[data-paso-resultado]').hidden = true;
    q('[data-paso-test]').hidden = false;
    pintar();
    raiz.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  q('[data-atras]').addEventListener('click', () => {
    if (!historial.length) return;
    delete respuestas[historial.pop()];
    actual = Math.max(0, actual - 1);
    pintar();
  });

  const btnFecha = q('[data-btn-fecha]');
  if (btnFecha) btnFecha.addEventListener('click', () => {
    const v = q('#ev-fecha').value;
    if (!v) { q('#ev-fecha').focus(); return; }
    avanzar('fecha', v);
  });

  raiz.querySelectorAll('[data-reiniciar]').forEach(b =>
    b.addEventListener('click', reiniciar));

  q('[data-copiar]').addEventListener('click', () => {
    const boton = q('[data-copiar]');
    const texto = q('[data-mensaje]').textContent;
    const ok = () => {
      boton.textContent = 'Copiado';
      setTimeout(() => boton.textContent = 'Copiar', 1800);
    };
    function seleccionar() {
      const rango = document.createRange();
      rango.selectNodeContents(q('[data-mensaje]'));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(rango);
      boton.textContent = 'Selecciona y copia';
      setTimeout(() => boton.textContent = 'Copiar', 2600);
    }
    try { navigator.clipboard.writeText(texto).then(ok, seleccionar); }
    catch (e) { seleccionar(); }
  });

  pintar();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-test]').forEach(iniciarTest);
});
