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

## Pendientes antes de publicar

Están marcados en el código como `TODO Alervet`:

- [ ] Confirmar la dirección exacta de la clínica
- [ ] Correo electrónico de contacto
- [ ] Logo en alta resolución, de preferencia vectorial (.svg, .ai o .pdf)
- [ ] Fotos reales: clínica, retrato de la Dra. González, vial de inmunoterapia
- [ ] Mapa de Google Business para la sección de ubicación
- [ ] Verificar el principio activo de «Numelvi» — el sitio actual dice
      «Atinvicitiniv» y hay que confirmar la ortografía correcta
- [ ] Confirmar si se sigue ofreciendo cirugía de tejidos blandos
- [ ] Confirmar zonas de cobertura del servicio a domicilio
- [ ] Confirmar que los precios siguen vigentes

## Decisiones tomadas

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
