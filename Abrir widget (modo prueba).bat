@echo off
rem Abre el widget en MODO DE PRUEBA: el uso es inventado y se controla con clic derecho
rem en el ícono de la bandeja > "PRUEBA (datos inventados)". No toca tu historial real.
rem Antes de usarlo, cierra el widget normal (clic derecho en la bandeja > Salir).
cd /d "%~dp0"
start "" "node_modules\electron\dist\electron.exe" . --prueba
