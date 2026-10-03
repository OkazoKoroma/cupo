# Cupo

**Un widget de escritorio para Windows que te muestra cuánto llevas usado de tu plan de Claude y te avisa antes de pasarte.**

[English version](README.en.md)

![Cupo con dos cuentas a la vez](docs/captura-normal.png)

> Proyecto **no oficial**. No tiene relación con Anthropic. "Claude" es una marca de Anthropic.

## Qué hace

- **Tres barras siempre a la vista:** *Hoy* (contra un límite diario que te pones tú), la *sesión de 5 horas* y la *cuota semanal*.
- **Te avisa** (notificaciones de Windows) cuando te acercas al límite del día, cuando lo alcanzas y cuando se acaba o se reinicia la sesión de 5 horas.
- **Varias cuentas de Claude**, cada una con su nombre, sus límites y su historial. Cambias de cuenta con un clic, o las ves **todas a la vez** (vista "Cuentas", normal apilada o compacta con una línea por cuenta).
- **Tipo de plan** de cada cuenta (Pro, Max, Team…) junto a su nombre.
- **Ventana estirable:** arrastra los bordes para cambiar su forma; las letras no cambian de tamaño.
- **Vista completa:** historial de 7 días, desglose por producto (Claude Code, Chats, Cowork…), proyección ("a este ritmo llegarías al límite a las 18:40") y el resumen de todas tus cuentas juntas.
- **Límite distinto por día de la semana**, historial exportable a CSV (se abre en Excel).
- **A tu gusto:** tema claro / oscuro / automático, transparencia, tamaño de 70% a 160%, vista normal / compacta (una línea) / completa, disposición vertical u horizontal.
- **Español e inglés** (o el idioma de Windows).
- Queda en la bandeja del sistema, junto al reloj, y puede abrirse al iniciar Windows.

| Todas las cuentas a la vez (con su plan) y el panel de cuentas | Vista "Cuentas" |
| --- | --- |
| ![Panel de cuentas y lista apilada](docs/captura-cuentas.png) | ![Vista Cuentas](docs/captura-lista.png) |

![Vista completa con dos cuentas](docs/captura-completo.png)

## Instalar

1. Descarga `Instalar-Cupo-x.y.z.exe` desde la sección [Releases](../../releases).
2. Ábrelo. Se instala solo, sin permisos de administrador.
3. Windows puede mostrar un aviso azul de **SmartScreen** ("Windows protegió su PC"), porque el instalador no está firmado con un certificado de pago. Pulsa *Más información → Ejecutar de todas formas*. Si no te fías, el código está aquí completo y puedes [compilarlo tú](#compilarlo-tú-mismo).
4. La primera vez pulsa **Iniciar sesión** y entra a claude.ai como siempre (con Google, correo o lo que uses).

## Cómo funciona (y qué datos toca)

Anthropic no ofrece una forma oficial de consultar el uso del plan, así que Cupo hace lo mismo que tu navegador: abre claude.ai en una ventana invisible **con tu propia sesión** y lee los mismos números que muestra la página *Configuración → Uso*.

- **Tu contraseña nunca pasa por Cupo.** El inicio de sesión ocurre en la página real de claude.ai.
- La sesión queda guardada en tu computador, en un espacio propio de la app (uno por cuenta). Cupo solo comprueba si existe la cookie de sesión (sí / no); no la lee ni la copia.
- Los únicos datos que guarda son tus ajustes y el historial de porcentajes de uso por día, en un archivo local (`%APPDATA%\widget-uso-claude\datos.json`).
- No hay servidores, ni cuentas, ni telemetría. Lo único que sale a internet es la consulta a claude.ai.

## Limitaciones honestas

- **Puede dejar de funcionar sin aviso.** Como depende de cómo está hecha la página de claude.ai, si Anthropic la cambia el widget puede dejar de leer el uso. Cupo lo detecta y te avisa; el arreglo está todo en un solo archivo (`src/uso.js`).
- Solo Windows (10 y 11).
- El "uso de hoy" lo calcula Cupo: es la diferencia entre el porcentaje semanal de ahora y el que había al empezar el día (medianoche de tu zona horaria). Si abres Cupo por primera vez a media tarde, parte contando desde ese momento.
- Cupo no cuenta tokens ni mensajes: muestra los porcentajes que informa claude.ai.
- Revisa que tu uso de esta herramienta esté de acuerdo con los términos de servicio de Claude. Úsala bajo tu responsabilidad.

## Compilarlo tú mismo

Necesitas [Node.js](https://nodejs.org) (versión 20 o más nueva).

```bash
npm install
npm start          # abre el widget
npm run dist       # genera el instalador en la carpeta dist
```

**Modo de prueba:** `npm start -- --prueba` (o `Abrir widget (modo prueba).bat`) usa datos inventados que controlas desde el menú de la bandeja, y los guarda en otro archivo. Sirve para ver las alertas sin gastar tu cuota.

## Estructura

```
src/main.js        arranque, ventana, bandeja, cuentas
src/sesion.js      inicio de sesión (una sesión por cuenta)
src/uso.js         lectura del uso desde claude.ai  ← lo único que depende de su página
src/calculo.js     cálculo diario, alertas, proyecciones (sin Electron: fácil de probar)
src/almacen.js     datos guardados en JSON
src/idiomas/       los textos, un archivo por idioma
src/ventanas/      la pantalla del widget (HTML, CSS y JS)
```

**Agregar un idioma:** copia `src/idiomas/es.js`, tradúcelo y regístralo en `src/idiomas.js`.

## Contribuir

Ideas, errores y mejoras son bienvenidos: abre un *issue* o un *pull request*. Si el widget dejó de leer tu uso, un issue con el mensaje de error es lo más útil.

## Licencia

[MIT](LICENSE)
