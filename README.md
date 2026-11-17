# Turboincidencias 3000

> Un analizador de incidencias TI escondido dentro de un monitor CRT de 1998.

**Demo:** https://lockerdocx.github.io/Turboincidencias3000/

Port web de [`incidencias_basico.py`](#el-script-original) (Python + rich + ElementTree)
a HTML, CSS y JavaScript puros. Carga tu `incidencies.xml`, limpia el ruido y
explora los datos dentro de un escritorio retro con ventanas arrastrables,
fósforo ámbar y un tubo que se inclina siguiendo el cursor.

No hay backend, ni cuentas, ni analítica: **el XML se procesa en tu navegador y
no se envía a ningún sitio**.

---

## Qué hace

- **Parsea XML tolerante**: detecta las etiquetas aunque el XML use otros nombres
  (`fecha` / `date` / `data` / `marca_temporal`, `prioridad` / `priority`,
  `técnico` / `agent`…), admite espacios de nombres, `Modelo` repetido y archivos
  con un único registro.
- **Reproduce el criterio del script original**:
  - descarta fechas vacías, imposibles (`31/02/2025`) o futuras;
  - descarta registros sin información en tipo, equipo, clases o prioridad;
  - deduce la marca del equipo: primer `<Modelo>` para portátiles, segundo para
    sobremesas.
- **Filtros de verdad**:
  - combinaciones de un clic (válidas, todo, críticas abiertas, sin resolver,
    portátiles, sobremesas, hardware, red, últimos 30 días, este año,
    resoluciones lentas, fin de semana, duplicados, datos problemáticos);
  - facetas múltiples por tipo, equipo, clase, prioridad, estado, marca,
    técnico y ubicación;
  - rango de fechas con atajos (7 / 30 / 90 días, 12 meses);
  - calidad del dato conmutables (fechas inválidas, futuras, registros vacíos,
    duplicados);
  - reglas avanzadas con `Y` / `O` (contiene, es igual, mayor/menor que,
    antes/después, últimos N días, día de la semana, vacío…);
  - búsqueda libre en todos los campos y filtros guardados en el navegador.
- **Análisis**: KPIs, evolución mensual, reparto por prioridad, día de la semana,
  tablas con porcentaje y barras de píxeles, mapa de calor tipo × prioridad,
  técnicos, ubicaciones y tabla de registros ordenable y paginada.
- **Detalle de cada incidencia** con valores normalizados, valores originales
  del XML y avisos de calidad.
- **Informe** equivalente a la salida de consola del script (filtrado, documento,
  árbol XML y las cinco tablas) con copia al portapapeles e impresión a PDF.
- **Exportación** CSV, JSON, TXT y HTML.
- **Escritorio retro**: ventanas arrastrables, minimizar/maximizar, barra de
  tareas, reloj, sonido sintetizado con WebAudio, secuencia de arranque del BIOS,
  temas de fósforo (ámbar, verde, azul, hueso), scanlines regulables y modo
  pantalla plana.
- **3D y sensación de profundidad**: monitor con inclinación según el cursor y
  arrastrable (vuelve solo), paralaje de pared, polvo y mesa, reflejo del cristal
  que sigue al puntero, sombras, polvo en el haz de luz, teclado con teclas que
  se iluminan y apagado/encendido del tubo.
- **Secretos del chasis**: degauss al pulsar la placa o hacer doble clic en el
  marco, LED que cambia el fósforo, salvapantallas de estrellas tras un minuto,
  código Konami y clics en el teclado y el ratón de la mesa.

## Cómo usarlo

1. Abre la [demo](https://lockerdocx.github.io/Turboincidencias3000/).
2. Arrastra tu `incidencies.xml` a cualquier parte de la pantalla o pulsa
   **Cargar XML**.
3. Usa las combinaciones de un clic y afina con facetas, fechas o reglas.
4. Exporta el resultado desde **Exportar** o copia el **Informe**.

La demo incluye `data/incidencies-demo.xml`: 826 incidencias con fechas
imposibles, registros futuros, campos vacíos, modelos ausentes y duplicados,
pensadas para probar todos los filtros.

### Formato esperado

Cualquier XML con una raíz y un registro por incidencia funciona:

```xml
<Incidencies>
  <Incidencia>
    <ID>INC-2026-0001</ID>
    <Tipo_de_incidencia>Hardware</Tipo_de_incidencia>
    <Tipo_de_equipo>Portátil</Tipo_de_equipo>
    <Clases>Pantalla</Clases>
    <Prioridad>Alta</Prioridad>
    <Estado>En curso</Estado>
    <Fecha_de_incidencia>13/10/2026</Fecha_de_incidencia>
    <Modelo>ThinkPad T14 Gen 4</Modelo>
    <Modelo>OptiPlex 7090</Modelo>
    <Tecnico>M. Varga</Tecnico>
    <Ubicacion>Barcelona · Seu</Ubicacion>
    <Horas_resolucion>12</Horas_resolucion>
    <Descripcion>La pantalla parpadea.</Descripcion>
  </Incidencia>
</Incidencies>
```

El campo de fecha puede llamarse `Fecha`, `Date`, `Data`, `Marca_temporal`,
`Created_at`… y admite ISO, `dd/mm/aaaa`, `dd-mm-aaaa`, `13 oct 2025` o ISO con
hora.

## Atajos

| Tecla | Acción |
| --- | --- |
| `A` / `D` / `S` / `I` | Análisis · Datos · Filtros · Informe |
| `R` / `E` | Registro · Exportar |
| `F` | Alternar inclinación 3D / pantalla plana |
| `Esc` | Cerrar la ventana activa (o saltar el arranque) |
| `↑` / `↓` | Registro anterior / siguiente en el detalle |

## Desarrollo local

No hay build ni dependencias. Sólo necesitas servir la carpeta por HTTP
(`fetch` no funciona con `file://`):

```bash
npm run dev          # python3 -m http.server 4173 --bind 0.0.0.0
# o
npx serve .
```

Regenerar el dataset de demostración:

```bash
npm run gen:demo
```

Comprobaciones estáticas (sintaxis, recursos, iconos, vistas y dataset):

```bash
npm run check
```

## Estructura

```
index.html                escritorio, monitor y capas CRT
css/base.css              habitación, monitor 3D, teclado, polvo
css/os.css                sistema operativo: raíl, home, barra de tareas
css/windows.css           ventanas arrastrables
css/widgets.css           tablas, filtros, KPIs, formularios
css/views.css             facetas, informe, log, detalle, container queries
css/responsive.css        móvil, tablet (raíl horizontal), impresión
js/app.js                 arranque, estado, atajos, exportación
js/parser.js              parser XML tolerante + calidad del dato
js/filters.js             facetas, presets y reglas
js/stats.js               agregaciones y tendencias
js/views.js               contenido de cada ventana
js/components.js          piezas HTML reutilizables
js/charts.js              timeline, donut y barras en canvas
js/windows.js             gestor de ventanas
js/icons.js               iconos de píxel en SVG
js/sound.js               sonido sintetizado (WebAudio)
js/easter.js              degauss, salvapantallas, Konami y teclado físico
assets/fonts/*.woff2      tipografías autoalojadas (latin + latin-ext)
data/incidencies-demo.xml dataset de ejemplo
tools/gen-demo.js         generador del dataset
tools/check.js            comprobaciones estáticas
.github/workflows/pages.yml despliegue en GitHub Pages
```

## Despliegue

El workflow `.github/workflows/pages.yml` publica el contenido del repositorio
en GitHub Pages en cada push a `main` (y a la rama de desarrollo). Para activarlo
en un fork: **Settings → Pages → Source: GitHub Actions**.

## El script original

Esta web es la evolución de `incidencias_basico.py`: un script de consola que
filtraba incidencias y pintaba tablas con `rich`. La lógica se ha portado a
JavaScript (mismos criterios de fecha, información y marca) y se ha ampliado con
facetas, reglas, presets, exportación y un escritorio retro.

## Créditos

- Estética inspirada en el template *Nostalgia Computer* de Framer.
- Tipografías: Silkscreen, Pixelify Sans e IBM Plex Mono, autoalojadas en
  `assets/fonts` (sin peticiones a Google Fonts).
- Sin frameworks, sin dependencias de runtime, sin cookies.
