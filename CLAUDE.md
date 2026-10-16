# CLAUDE.md

PWA estática "Inversiones RD": muestra fondos de inversión, productos estructurados, puestos de bolsa y bonos en pesos de República Dominicana con datos de Rexi (www.rexi.do). Responde y escribe en español; los usuarios no son técnicos.

## Cómo está montado

- Sitio estático, sin compilación ni dependencias: `index.html`, `css/app.css`, `js/shim.js` (carga `data/*.json`), `js/app.js` (pestañas, tablas, calculadoras), `js/pwa.js`, `sw.js`.
- Despliegue: Vercel publica solo cada push a `main` (GitHub cggrullon1973-beep/fondos-rd-pwa).
- Si cambias archivos de la app (no los de `data/`), sube `VERSION` en `sw.js`; si no, los teléfonos siguen con la versión guardada.
- Probar en local: `python3 -m http.server 8000` y abrir http://localhost:8000.

## Actualización diaria (todo en la nube)

| Hora RD (UTC) | Qué | Escribe |
| --- | --- | --- |
| 6:30 a. m. (10:30) | Workflow `.github/workflows/update-data.yml` corre `scripts/update-data.mjs` (Node 24, sin LLM) | `fondos.json`, `fondos_prev.json`, `prod_puestos.json`, `puestos.json`, `bonos_estado.json`, `meta.json` |
| 7:15 a. m. (11:15) | Rutina de Claude "TPM Banco Central → PWA" (trig_01977LHtEuLyfHJ69DikB9rG) | solo `tpm.json` y `meta.json` |

- El script lee el JSON que trae cada página de Rexi en `<script id="rexi-client-app-state">` (TransferState de Angular, con los escapes `&q;` `&l;` `&g;` `&a;` `&s;`). Nada de leer el HTML visible.
- Cada parte tiene su control de calidad (≥10 fondos con rent entre 0 y 20, ≥5 productos, ≥10 puestos con activos numéricos, bonos con cupón entre 0 y 25 y ≥30 tras la fusión). Si una parte falla, su archivo no se toca, las demás se publican y el workflow termina en rojo.
- Bonos: se fusionan con lo que ya hay (lo que no se leyó se conserva y lo vencido se quita).
- Fichas de puestos (`estructurados`, `bonos`, `fondos`, `fideicomisos`): solo los lunes o con `--fichas`. El número es el de la ficha, `0` si dice "No tiene" y `null` si no da cantidad para ese tipo.
- `fondos_prev.json` = lectura anterior; no se rota si `fondos.json` ya es de hoy.

## Reglas para `data/`

- No edites `data/` a mano salvo `tpm.json`. Lo demás lo regenera el script.
- Formato: listas de objetos, `JSON.stringify(x, null, 1)`, UTF-8, sin salto de línea final (`meta.json` sí lleva uno).
- Los `id` son estables: la app compara por id. `scripts/rexi-ids.json` relaciona el id numérico de Rexi con el id de la PWA; para fijar un producto nuevo, agrégalo ahí. Los ids de bonos se derivan del nombre (`sivemgc-229`, `sivem-274-7`, `dobcno-950-030328`).
- `meta.json`: `{"actualizado": "<ISO con -04:00>", "fuente": "Rexi (rexi.do)"}`.
- No redondees ni "corrijas" las cifras de Rexi: las rentabilidades son históricas, las tasas de los estructurados son estimaciones y el cupón no es rendimiento.

## Si el workflow falla

1. Lee el resumen de la corrida en GitHub Actions: dice qué parte falló y por qué.
2. Reprodúcelo sin tocar `data/`: `node scripts/update-data.mjs --out /tmp/salida` (con `--fichas` para las fichas). `REXI_BASE` cambia el dominio, por ejemplo para probar el caso de falla.
3. Casi siempre es que Rexi cambió de estructura: revisa las claves (`modelResultPage.listResults[].details[].listGroup`, `FeModelResultPage`, `FeModelSingle.rexiAvailableProducts`) y ajusta el script, manteniendo esquemas e ids.
4. Compara la salida con `data/` antes de publicar.

## Otros

- Términos de Rexi: piden autorización escrita para reproducir su información; el uso actual es personal.
- Documentación para no técnicos: https://claude.ai/code/artifact/533ab574-de3c-42d7-90c9-9f73aed8e68c
