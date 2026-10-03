@echo off
rem Abre el widget con doble clic (no hace falta usar la terminal).
rem Se mueve a la carpeta del proyecto y lanza Electron separado de esta ventana,
rem así la ventana negra se cierra sola y el widget sigue abierto.
cd /d "%~dp0"
start "" "node_modules\electron\dist\electron.exe" .
