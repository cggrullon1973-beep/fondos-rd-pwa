# Inversiones RD

App web instalable (PWA) con los fondos de inversión, los puestos de bolsa y los bonos en pesos de República Dominicana. Tiene un ranking de bonos y calculadoras de ganancia. Funciona en PC y teléfono, y sin conexión muestra los últimos datos guardados.

Los datos vienen del comparador Rexi (rexi.do) y están en la carpeta `data/`. Es información de mercado, no asesoría financiera.

## Estructura

```
index.html              la página
css/app.css             estilos (claro y oscuro, PC y teléfono)
js/shim.js              carga data/*.json y calcula los resúmenes
js/app.js               pestañas, tablas, ranking y calculadoras
js/pwa.js               instalación, aviso sin conexión, fecha de los datos
sw.js                   service worker (funciona sin conexión)
manifest.webmanifest    nombre, colores e íconos de la app instalada
icons/                  íconos
data/                   los datos (se reemplazan cada día)
scripts/update-data.mjs lee Rexi y actualiza data/ (lo corre GitHub Actions)
vercel.json             caché: los datos nunca quedan viejos en el navegador
```

No necesita compilar nada: es un sitio estático.

## Publicar en Vercel

1. Sube esta carpeta a un repositorio de GitHub.
2. En vercel.com, entra con tu cuenta de GitHub y elige **Add New… → Project**.
3. Importa el repositorio. En **Framework Preset** elige **Other** y deja vacíos los comandos de build. Pulsa **Deploy**.
4. Vercel te da un enlace `https://<nombre>.vercel.app`.

Cada vez que cambie algo en el repositorio (por ejemplo, los datos de `data/`), Vercel publica la versión nueva solo.

## Instalarla

- **PC (Chrome o Edge):** abre el enlace y pulsa **Instalar app** arriba a la derecha, o el ícono de instalar en la barra de direcciones.
- **Android (Chrome):** menú ⋮ → **Instalar app** o **Agregar a la pantalla principal**.
- **iPhone (Safari):** botón Compartir → **Agregar a la pantalla de inicio**.

## Actualización diaria de los datos

Cada día a las 6:30 a. m. (hora de RD) el workflow `.github/workflows/update-data.yml` corre `scripts/update-data.mjs` en GitHub Actions. El script lee Rexi (el JSON que cada página trae dentro del HTML, sin IA), reescribe `fondos.json`, `fondos_prev.json`, `prod_puestos.json`, `puestos.json`, `bonos_estado.json` y `meta.json`, y si `data/` cambió hace commit y push a `main`; Vercel publica solo.

- Cada parte tiene su control de calidad (mínimo de filas y tasas en rango). Si una parte falla, su archivo queda como estaba, las demás sí se publican y el workflow queda en rojo (GitHub te avisa por correo).
- Los lunes también lee la ficha de cada puesto (cantidad de productos). Para forzarlo otro día: **Actions → Actualizar datos de Rexi → Run workflow** y marca *fichas*.
- `scripts/rexi-ids.json` relaciona el id de Rexi con el id de la PWA. Si Rexi agrega un fondo o producto, el script le crea un id a partir del nombre; para fijarlo, agrégalo ahí.
- `tpm.json` (tasa del Banco Central) no lo toca el script.

Para probarlo sin tocar `data/`: `node scripts/update-data.mjs --out /tmp/salida`.

`data/meta.json` guarda la fecha y hora de la última actualización, que es la que muestra la app.

## Probarla en tu computadora

```
python3 -m http.server 8000
```

Abre http://localhost:8000. El service worker necesita `localhost` o `https`.
