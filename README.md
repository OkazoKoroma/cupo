# Cupo

**Un widget de escritorio para Windows que te muestra cuánto llevas usado de tu plan de Claude y te avisa antes de pasarte.**

[English version](README.en.md)

![Cupo con una cuenta](docs/captura-tarjeta.png)

> Proyecto **no oficial**. No tiene relación con Anthropic. "Claude" es una marca de Anthropic.

## ¿Para qué sirve?

Los planes de Claude (Pro, Max, Team…) tienen límites: una **sesión de 5 horas**, una **cuota semanal** y, en el plan Max, ventanas por modelo como **Fable**. claude.ai muestra esos números en *Configuración → Uso*, pero hay que ir a mirarlos. Cupo los deja **siempre a la vista** en una esquina de tu pantalla y te avisa a tiempo.

Además te ayuda a **repartir tu cuota semanal en el día a día**: tú eliges cuánto quieres usar como máximo por día (por ejemplo 14% de la semana) y Cupo te muestra cuánto llevas hoy y te avisa al acercarte.

- **Una sola cuenta:** ves Hoy, la sesión de 5 horas y la semana de un vistazo, con avisos, historial y proyección.
- **Varias cuentas** (por ejemplo, la personal y la del trabajo, o cuentas de distintos planes): ves **todas a la vez**, cada una con su plan, sus barras, sus propios límites y su propio historial. Los avisos dicen de qué cuenta son.

| Varias cuentas a la vez | Panel de cuentas |
| --- | --- |
| ![Dos cuentas apiladas](docs/captura-normal.png) | ![Panel de cuentas](docs/captura-cuentas.png) |

![Vista "Cuentas": una fila por cuenta](docs/captura-lista.png)

## Funciones

### Lo que muestra
- **Hoy:** lo que llevas del día contra un **límite diario que pones tú** (puede ser distinto para cada día de la semana).
- **Sesión de 5 horas** y **cuota semanal**, con su porcentaje y **cuánto falta para que se reinicien** ("en 2 h 15 min"), o la hora exacta si lo prefieres.
- **Plan Max:** además, la ventana semanal de **Fable** (y otros límites por modelo que informe claude.ai). En Pro no aparece.
- **Uso extra:** si tienes crédito extra activado con tope mensual, lo gastado (por ejemplo US$16 / US$50).
- **Tipo de plan** de cada cuenta (Pro, Max 5x, Team…).
- **Historial** de 7 o 30 días con tu promedio diario, **desglose** de la semana por producto (Claude Code, Chats, Cowork…) y **proyección** ("a este ritmo llegarías al límite a las 18:40").
- **Ícono junto al reloj** que se pone verde, amarillo o rojo según tu uso de hoy.

### Avisos (notificaciones de Windows)
- Al acercarte y al llegar a tu **límite diario**.
- Sesión de 5 horas: al llegar al porcentaje que elijas, al agotarse, cuando se reinicia y cuando **a este ritmo te quedarías sin sesión** antes del reinicio.
- **Cuota semanal** alta (85% por defecto), una vez por semana.
- **No molestar:** silencia los avisos por 1 hora o hasta mañana desde el menú de la bandeja.
- Aviso cuando hay una **versión nueva** de Cupo.

### Vistas y aspecto
- Vista **normal** (vertical u horizontal), **compacta** (una línea), **completa** (todo a la vez: barras, historial, desglose y proyección) y **Cuentas** (todas tus cuentas en filas).
- **Ventana estirable:** arrastra sus bordes para cambiar su forma; las letras no cambian de tamaño (doble clic en un borde para volver al tamaño original).
- Tema claro, oscuro o automático, transparencia, escala de 70% a 160% y **colores propios** (acento y colores de las barras).
- **Atajo de teclado** Ctrl + Alt + C para mostrarlo u ocultarlo desde cualquier programa.
- Exporta el historial a **CSV** (se abre en Excel).

![Vista completa](docs/captura-completo.png)

## Idiomas

Español · English · Português (Brasil) · Français · Deutsch, o **automático** (el idioma de Windows). Se cambia en Ajustes y todo se traduce al instante: la ventana, el menú, los avisos y el CSV (con la coma o el punto decimal de cada idioma).

## Instalar

1. Descarga `Instalar-Cupo-x.y.z.exe` desde la sección [Releases](../../releases).
2. Ábrelo. Se instala solo, sin permisos de administrador.
3. Windows puede mostrar un aviso azul de **SmartScreen** ("Windows protegió su PC"), porque el instalador no está firmado con un certificado de pago. Pulsa *Más información → Ejecutar de todas formas*. Si no te fías, el código está aquí completo y puedes [compilarlo tú](#compilarlo-tú-mismo).
4. Pulsa **Iniciar sesión** y entra a claude.ai como siempre. Para agregar otra cuenta: la etiqueta con el nombre de la cuenta (arriba a la izquierda) → **Agregar**.

Por ahora solo hay versión para **Windows** (10 y 11).

## Cómo funciona (y qué datos toca)

Anthropic no ofrece una forma oficial de consultar el uso del plan, así que Cupo hace lo mismo que tu navegador: abre claude.ai en una ventana invisible **con tu propia sesión** y lee los mismos números que muestra la página *Configuración → Uso*. **No gasta tu cuota:** nunca le envía mensajes a Claude.

- **Tu contraseña nunca pasa por Cupo.** El inicio de sesión ocurre en la página real de claude.ai.
- Cada cuenta tiene su sesión guardada en tu computador, en un espacio propio. Cupo solo comprueba si existe la cookie de sesión (sí / no); no la lee ni la copia.
- Los únicos datos que guarda son tus ajustes y el historial de porcentajes de uso por día, en un archivo local (`%APPDATA%\widget-uso-claude\datos.json`).
- No hay servidores, ni cuentas, ni telemetría. Lo que sale a internet: las consultas a claude.ai y, una vez al día, una consulta a GitHub para saber si hay una versión nueva (se puede apagar en Ajustes).

## Limitaciones honestas

- **Puede dejar de funcionar sin aviso.** Como depende de cómo está hecha la página de claude.ai, si Anthropic la cambia el widget puede dejar de leer el uso. Cupo lo detecta y te avisa; el arreglo está en un solo archivo (`src/uso.js`).
- El "uso de hoy" lo calcula Cupo: es la diferencia entre el porcentaje semanal de ahora y el que había al empezar el día (medianoche de tu zona horaria).
- Cupo no cuenta tokens ni mensajes: muestra los porcentajes que informa claude.ai.
- Revisa que tu uso de esta herramienta esté de acuerdo con los términos de servicio de Claude. Úsala bajo tu responsabilidad.

## Compilarlo tú mismo

Necesitas [Node.js](https://nodejs.org) (versión 20 o más nueva).

```bash
npm install
npm start          # abre el widget
npm run dist       # genera el instalador en la carpeta dist
```

## Estructura

```
src/main.js            arranque, ventana, bandeja, cuentas, avisos
src/sesion.js          inicio de sesión (una sesión por cuenta)
src/uso.js             lectura del uso desde claude.ai  ← lo único que depende de su página
src/calculo.js         cálculo diario, alertas, proyecciones (sin Electron: fácil de probar)
src/almacen.js         datos guardados en JSON
src/actualizaciones.js aviso de versión nueva (GitHub)
src/idiomas/           los textos, un archivo por idioma
src/ventanas/          la pantalla del widget (HTML, CSS y JS)
```

**Agregar un idioma:** copia `src/idiomas/es.js`, tradúcelo y regístralo en `src/idiomas.js`.

## Contribuir

Ideas, errores y mejoras son bienvenidos: abre un *issue* o un *pull request*. Si el widget dejó de leer tu uso, un issue con el mensaje de error es lo más útil.

## Licencia

[MIT](LICENSE)
