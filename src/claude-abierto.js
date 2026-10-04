// claude-abierto.js: averigua si Claude está abierto en este computador (la app de escritorio de Claude, o Claude Code).
// Lo usa la opción "Mostrar solo mientras Claude está abierto". Solo mira la lista de programas abiertos de Windows
// (busca "claude.exe"); no lee nada de Claude. Claude abierto en el navegador no se puede detectar.

const { execFile } = require('child_process');

// Interpreta lo que responde "tasklist": true si aparece claude.exe en la lista.
function hayClaudeEn(salida) {
  return /(^|[\r\n])"?claude\.exe"?[,\s]/i.test(String(salida || ''));
}

// Responde true o false; o null si no se pudo saber (otro sistema, o falló la consulta).
function claudeEstaAbierto() {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolver) => {
    execFile('tasklist', ['/FI', 'IMAGENAME eq claude.exe', '/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 4000 }, (error, salida) => {
      resolver(error ? null : hayClaudeEn(salida));
    });
  });
}

module.exports = { claudeEstaAbierto, hayClaudeEn };
