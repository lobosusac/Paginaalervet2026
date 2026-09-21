# Alervet — sitio web

Rediseño del sitio de **Alervet**, clínica veterinaria en Ciudad de Guatemala
especializada en alergias y enfermedades de la piel en perros y gatos.

Reemplaza el sitio actual hecho en Wix.

## Cómo está hecho

HTML, CSS y JavaScript, sin frameworks ni pasos de compilación. Se abre
directamente en el navegador y se puede publicar en cualquier alojamiento
estático gratuito.

```
index.html                  Portada
servicios.html              Consulta general, consulta de piel y prueba de alergias
inmunoterapia.html          Explicación del tratamiento y solicitud de vacuna
servicio-a-domicilio.html   Cobertura, formulario corto y condiciones
nosotros.html               Historia y formación de la Dra. González
assets/css/styles.css       Toda la hoja de estilos (paleta y tipografía arriba del archivo)
assets/js/main.js           Menú, indicador de horario y enlaces de WhatsApp
assets/img/                 Imágenes
                            inmunoterapia-pieza-completa.webp es la pieza
                            gráfica original, con titular y botón. No se usa
                            en el sitio; se guarda para redes sociales
```

## Verlo en tu computadora

Abrir `index.html` con doble clic. Para que todo funcione igual que en
producción conviene levantar un servidor local:

```bash
python3 -m http.server 8000
# luego abrir http://localhost:8000
```

## Editar los datos de contacto

Todo está en un solo lugar: al inicio de `assets/js/main.js`, en `CONFIG`.

```js
const CONFIG = {
  whatsapp: '50234819108',   // número de WhatsApp, con código de país y sin signos
  telefono: '3481 9108',
  calendario: '',            // enlace de reservas de Google Calendar
  ...
};
```

El horario también se define ahí. El sitio calcula solo si está abierto o
cerrado, así que no hay que actualizarlo a mano nunca.

## Cómo funcionan los formularios

No hay servidor todavía. Los formularios arman un mensaje de WhatsApp con los
datos que la persona escribió y abren la conversación con la clínica. Así no se
pierde ninguna solicitud mientras se decide el alojamiento definitivo.

Si más adelante se quiere recibir los formularios por correo, se puede conectar
un servicio como Formspree o Web3Forms sin cambiar el diseño.

## Reservas en línea con Google Calendar

La portada tiene una sección «Horarios disponibles»: el cliente elige día,
toca un bloque de hora libre, llena sus datos y recibe el mensaje «Un asesor
te contactará a la brevedad». Al mismo tiempo, la solicitud aparece como
evento en el calendario de la clínica y llega un aviso por correo y por
WhatsApp.

Eso necesita algo que corra del lado del servidor, porque un sitio estático
no puede escribir en un calendario ni mandar mensajes. Ese papel lo hace
`integracion/google-apps-script.gs`, que corre **dentro de la cuenta de
Google de la clínica**. Así el calendario nunca tiene que ser público.

### Instalación

1. Entrar a [script.google.com](https://script.google.com) con la cuenta de
   la clínica y crear un proyecto nuevo.
2. Pegar el contenido de `integracion/google-apps-script.gs`.
3. Ajustar el bloque `AJUSTES` del inicio: correo de aviso y, si se quiere,
   la URL de WhatsApp.
4. **Implementar › Nueva implementación › Aplicación web**, con:
   - *Ejecutar como:* yo (la cuenta de la clínica)
   - *Quién tiene acceso:* cualquier usuario
5. Autorizar los permisos que pide (calendario y envío de correo).
6. Copiar la URL que termina en `/exec` y ponerla en `CONFIG.reservas.endpoint`,
   dentro de `assets/js/main.js`.

Después de cada cambio en el script hay que crear una **implementación nueva**;
guardar no basta.

### Qué hace el script

- **Disponibilidad:** devuelve solo la lista de horas ocupadas, nunca los
  detalles de los eventos. El calendario sigue privado.
- **Reserva:** valida los datos, comprueba que la hora siga libre (por si
  alguien la tomó mientras se llenaba el formulario), crea el evento titulado
  «Por confirmar · Mascota (Tutor)» en color amarillo, y avisa.
- **Freno a envíos repetidos:** máximo tres solicitudes por teléfono al día.

### El aviso por WhatsApp

`MailApp` manda el correo sin configurar nada. WhatsApp no tiene forma
oficial y gratuita de recibir un mensaje desde un script, así que hay que
elegir:

| Opción | Costo | A tener en cuenta |
|---|---|---|
| **Solo correo** | Gratis | Ya funciona. Google Calendar además avisa al teléfono cuando entra el evento |
| **CallMeBot** | Gratis | Los datos del paciente pasan por un tercero ajeno a la clínica |
| **WhatsApp Cloud API** (Meta) | Gratis dentro de límites | Es la vía oficial. Requiere cuenta de Meta Business y configurar plantillas |

La opción por correo ya cubre el caso: cuando el evento entra al calendario,
la app de Google Calendar del teléfono da la notificación al instante.

Si se elige CallMeBot o Cloud API, se pega la URL en `AJUSTES.WHATSAPP_URL`
usando `{texto}` donde va el mensaje.

### Sin el script configurado

El sitio funciona igual: los bloques de hora dicen «Consultar» en lugar de
«Disponible», y al reservar la solicitud se envía por WhatsApp con todos los
datos ya escritos. No se pierde ninguna cita.

## Cobro del traslado a domicilio

La página de servicio a domicilio tiene una calculadora: el cliente escribe
cuántos kilómetros hay de la clínica a su casa y ve el traslado estimado.
Los tramos se editan en `CONFIG.traslado.tramos`, dentro de
`assets/js/main.js`.

| Distancia | Traslado |
|---|---|
| Hasta 12.5 km | Q100 |
| Hasta 18.75 km | Q150 |
| Hasta 25 km | Q200 |
| Más de 25 km | Se cotiza con el cliente |

Al elegir el servicio, la calculadora suma su precio y muestra el total:
Q400 la consulta dermatológica, Q1,100 la prueba de alergias y Q1,500 las
dos en la misma visita. Se editan en `CONFIG.serviciosDomicilio`; «Ambas»
se calcula sumando, no lleva precio combinado propio.

Estos topes salen de la regla interna de la clínica. Los ejemplos originales
dejaban tres huecos sin cubrir —entre otros, un domicilio a 10 km no caía en
ningún tramo—, así que se cerraron redondeando hacia arriba al siguiente
escalón.

### La fórmula interna no va en el código

Todo lo que se escriba en `main.js` queda a la vista de cualquiera que abra
el código de la página. Por eso el archivo guarda **solo el resultado**
—kilómetros y monto—, nunca el multiplicador por kilómetro ni el criterio
con que se fijaron.

Aun así, quien se tome el trabajo puede deducir una proporción a partir de
los tres topes. Si eso importa, la calculadora puede moverse al Apps Script:
el navegador manda los kilómetros y recibe el monto, sin que nada del
criterio salga del servidor. Son unas pocas líneas más en
`integracion/google-apps-script.gs`.

## Pendientes antes de publicar

Están marcados en el código como `TODO Alervet`:

- [ ] Confirmar la dirección exacta de la clínica
- [ ] **Instalar el Apps Script** (ver la sección anterior) y pegar su URL en
      `CONFIG.reservas.endpoint`. Mientras tanto los bloques dicen «Consultar»
      y las reservas salen por WhatsApp
- [ ] **Decidir el canal de aviso de WhatsApp** (correo, CallMeBot o Cloud API)
- [ ] **Confirmar los tramos de traslado.** Se cerraron los huecos que traían
      los ejemplos originales; ver «Cobro del traslado» más abajo
- [ ] Correo electrónico de contacto
- [x] ~~Logo en alta resolución~~ — `assets/img/logo-alervet.webp`, 1254 × 1254
- [x] ~~Foto de portada~~ — `assets/img/portada.webp`
- [x] ~~Retrato de la Dra. González~~ — `assets/img/dra-gonzalez.png`
- [ ] **Retrato en mayor resolución.** El archivo actual mide 338 × 372 px y
      el sitio lo muestra a 441 × 551, así que se amplía y pierde nitidez en
      pantallas modernas. Con el original se ve mucho mejor
- [x] ~~Vial de inmunoterapia~~ — `assets/img/inmunoterapia.webp`
- [x] ~~Foto de la clínica~~ — `assets/img/clinica.webp`
- [ ] **Mapa de Google Business.** La sección de ubicación muestra por ahora
      la foto de la fachada; el mapa puede ir debajo cuando esté el enlace
      incrustado
- [ ] Verificar el principio activo de «Numelvi» — el sitio actual dice
      «Atinvicitiniv» y hay que confirmar la ortografía correcta
- [ ] Confirmar si se sigue ofreciendo cirugía de tejidos blandos
- [ ] Confirmar zonas de cobertura del servicio a domicilio
- [ ] Confirmar que los precios siguen vigentes

## Decisiones tomadas

- **Consulta general: solo en clínica.** Ese servicio no se presta a
  domicilio, así que su tarjeta no ofrece esa opción.
- **Consulta dermatológica: dos modalidades.** Q275 en clínica y Q400 a
  domicilio, cada una con sus propios botones de agendar.
- **En la portada, las tarjetas muestran solo el precio de clínica.** Así el
  botón «Ver horarios disponibles» no queda ambiguo, porque la agenda solo
  tiene horarios de clínica. El domicilio se enlaza a su propia página, que
  es donde están la cobertura y las condiciones.
- **El cobro a domicilio se explica como fórmula, no como advertencia.**
  «Costo adicional según la zona» le sonaba al cliente a cobro discrecional.
  Ahora se desglosa en servicio más traslado por tramos de kilómetros, con
  un ejemplo y la promesa de confirmar el total antes de agendar.
- **Las tarjetas van en orden de especialidad:** dermatológica, alergias y
  después general. Es lo que distingue a la clínica de una veterinaria
  general.
- **Horario: lunes a viernes de 8:00 a 16:00 y sábados de 8:00 a 15:00.**
  Se define en `CONFIG.horario` y alimenta la tabla de horarios, el
  indicador de abierto/cerrado, los bloques de disponibilidad y los datos
  estructurados para Google.
- **Teléfono principal: 3481 9108.** Es el único número que aparece en el
  sitio. El 4120 9477 que mostraba la página de domicilio ya no se usa.

- **ReuPets se eliminó por completo** del sitio: sucursal cerrada.
- **El número de cuenta bancaria ya no aparece publicado.** Se envía por
  WhatsApp al confirmar la visita, para evitar que alguien se haga pasar por
  la clínica.
- **El formulario de servicio a domicilio pasó de más de 20 campos a 6.**
  La foto del DPI y la del domicilio ya no se piden por la web.
- **La condición de residenciales con perímetro cerrado se muestra antes del
  formulario**, para no hacer llenar todo a quien no está en zona de cobertura.
