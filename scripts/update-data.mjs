#!/usr/bin/env node
// Actualiza data/*.json con los datos de Rexi (www.rexi.do), sin LLM.
//
// Rexi es una app Angular con render en el servidor: cada página trae sus datos
// completos en <script id="rexi-client-app-state" type="application/json">.
// El script lee ese JSON (no el diseño de la página), arma los mismos archivos
// que la rutina anterior y aplica sus mismos controles de calidad. Si una parte
// falla, deja su archivo como estaba y sigue con las demás.
//
// Uso:  node scripts/update-data.mjs [--out DIR] [--fichas]
//   --out DIR   escribe en DIR en vez de data/ (para comparar sin tocar nada)
//   --fichas    lee las fichas de los puestos aunque no sea lunes
// Sale con código 1 si alguna parte falló (los archivos que pasaron sí se escriben).
// tpm.json (tasa del Banco Central) queda fuera de este script.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const args = process.argv.slice(2);
const OUT = args.includes('--out') ? path.resolve(args[args.indexOf('--out') + 1]) : DATA;
const BASE = process.env.REXI_BASE || 'https://www.rexi.do';
const TZ = 'America/Santo_Domingo';

const IDS = JSON.parse(await readFile(path.join(ROOT, 'scripts', 'rexi-ids.json'), 'utf8'));

// ---------- fecha de República Dominicana (UTC-4 todo el año) ----------
const now = new Date();
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now); // AAAA-MM-DD
const HORA = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now);
const ES_LUNES = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now) === 'Mon';
const [Y, M, D] = HOY.split('-');
const HOY_DMY = `${D}/${M}/${Y}`;

// ---------- utilidades ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchState(url) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'fondos-rd-pwa/1.0 (actualizacion diaria; uso personal)', 'Accept-Language': 'es' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const m = html.match(/<script id="rexi-client-app-state" type="application\/json">([\s\S]*?)<\/script>/);
      if (!m) throw new Error('la página no trae rexi-client-app-state');
      // Escapes del TransferState de Angular
      const json = m[1].replace(/&q;/g, '"').replace(/&s;/g, "'").replace(/&l;/g, '<').replace(/&g;/g, '>').replace(/&a;/g, '&');
      return JSON.parse(json);
    } catch (e) {
      lastErr = e;
      await sleep(2000 * (i + 1));
    }
  }
  throw new Error(`${url}: ${lastErr.message}`);
}

// Pausa corta entre páginas para no cargar a Rexi.
let primera = true;
async function get(url) {
  if (!primera) await sleep(1000);
  primera = false;
  return fetchState(url);
}

const groups = r => Object.fromEntries((r.details || []).flatMap(d => d.listGroup.map(x => [x.name, x.value])));

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const num = s => {
  if (typeof s === 'number') return s;
  const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

// "A- por Feller Rate" -> "A- (Feller Rate)"
const rating = (v, none) => {
  const s = String(v ?? '').trim();
  if (!s || /^no (tiene|disponible)$/i.test(s)) return none;
  const m = s.match(/^(.+?) por (.+)$/);
  return m ? `${m[1]} (${m[2]})` : s;
};

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
// "Octubre 31, 2026" -> "2026-10-31"
const fechaES = s => {
  const m = String(s ?? '').trim().match(/^([A-Za-zÁÉÍÓÚáéíóú]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m || !MESES[m[1].toLowerCase()]) return null;
  return `${m[3]}-${String(MESES[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
};

async function readJSON(name, fallback = null) {
  const f = path.join(DATA, name);
  if (!existsSync(f)) return fallback;
  return JSON.parse(await readFile(f, 'utf8'));
}

// Mismo formato que los archivos actuales: indentado con 1 espacio, sin salto final.
async function writeJSON(name, data, finalNewline = false) {
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, name), JSON.stringify(data, null, 1) + (finalNewline ? '\n' : ''), 'utf8');
}

const resumen = [];
const fallas = [];

async function parte(nombre, fn) {
  try {
    resumen.push(`${nombre}: ${await fn()}`);
  } catch (e) {
    fallas.push(`${nombre}: ${e.message}`);
  }
}

function check(cond, msg) {
  if (!cond) throw new Error(`control de calidad: ${msg}; no se sobrescribió el archivo`);
}

// ---------- PARTE A. Fondos de inversión ----------
const limpiarFondo = n => n
  .replace(/^Fondo (de Inversión )?(Abierto|Cerrado|Mutuo)( de)?\s+/i, '')
  .replace(/^Renta Fija\s*-?\s*/i, '')
  .replace(/^Fondo\s+/i, '')
  .trim();

async function fondos() {
  const prev = await readJSON('fondos.json', []);
  const byId = Object.fromEntries(prev.map(f => [f.id, f]));
  // AFI con el nombre corto que ya usa la PWA, por entidad de Rexi
  const afiPorEntidad = {};
  const filas = [];
  for (const [c, tipo] of [[0, 'Abierto'], [1, 'Cerrado']]) {
    const st = (await get(`${BASE}/fondos-de-inversion/resultados?c=${c}`)).modelResultPage;
    check(st && Array.isArray(st.listResults), `la página de fondos c=${c} no trajo resultados`);
    for (const r of st.listResults) {
      const g = groups(r);
      if (g['Moneda'] && g['Moneda'] !== 'Pesos (RD$)') continue;
      const id = IDS.fondos[r.id] || slug(limpiarFondo(r.name));
      const anterior = byId[id];
      if (anterior) afiPorEntidad[r.entityId] = anterior.afi;
      const rent = num((String(g['Tasa de rentabilidad histórica'] || '').match(/360 días:\s*(-?[\d.,]+)%/) || [])[1]);
      const perm = String(g['Pacto de permanencia'] ?? '').trim();
      let permanencia, aporte;
      if (tipo === 'Cerrado') {
        permanencia = 'Se negocia en bolsa';
        aporte = num(g['Inversión mínima en cuotas']) === 1 ? '1 cuota' : '—';
      } else {
        permanencia = !perm ? 'No disponible' : /^no tiene$/i.test(perm) ? 'Ninguna' : perm;
        aporte = String(g['Aporte inicial'] ?? '').trim() || 'No disponible';
      }
      filas.push({
        id,
        fondo: anterior ? anterior.fondo : limpiarFondo(r.name),
        afi: anterior ? anterior.afi : null, // se completa abajo
        _entidad: r.entityId,
        _entidadNombre: r.entityName,
        tipo,
        rent,
        permanencia,
        aporte,
        riesgo: rating(g['Calificación de riesgo'], '—').replace(/ \(.*\)$/, ''),
        fecha: HOY,
      });
    }
  }
  for (const f of filas) {
    if (!f.afi) f.afi = afiPorEntidad[f._entidad] || f._entidadNombre;
    delete f._entidad; delete f._entidadNombre;
  }
  check(filas.length >= 10, `solo ${filas.length} fondos (mínimo 10)`);
  const malos = filas.filter(f => typeof f.rent !== 'number' || !(f.rent >= 0 && f.rent <= 20));
  check(!malos.length, `rentabilidad fuera de 0-20 en ${malos.map(f => `${f.id}=${f.rent}`).join(', ')}`);
  filas.sort((a, b) => (a.tipo === b.tipo ? b.rent - a.rent : a.tipo === 'Abierto' ? -1 : 1));

  // fondos_prev.json es la lectura anterior. Si fondos.json ya es de hoy (el
  // script corrió dos veces el mismo día) no se rota, para no perder los cambios.
  const yaEsDeHoy = prev.length && prev[0].fecha === HOY;
  if (!yaEsDeHoy) await writeJSON('fondos_prev.json', prev);
  await writeJSON('fondos.json', filas);

  const ids = new Set(filas.map(f => f.id));
  const nuevos = filas.filter(f => !byId[f.id]).map(f => f.fondo);
  const idos = prev.filter(f => !ids.has(f.id)).map(f => f.fondo);
  const cambios = filas.filter(f => byId[f.id] && byId[f.id].rent !== f.rent)
    .map(f => ({ f, d: f.rent - byId[f.id].rent })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3)
    .map(({ f }) => `${f.fondo} ${byId[f.id].rent}% → ${f.rent}%`);
  return `${filas.length} fondos` +
    (cambios.length ? `; mayores cambios: ${cambios.join(', ')}` : '; sin cambios de rentabilidad') +
    (nuevos.length ? `; nuevos: ${nuevos.join(', ')}` : '') +
    (idos.length ? `; ya no aparecen: ${idos.join(', ')}` : '') +
    (yaEsDeHoy ? '; fondos_prev.json no se rotó (ya había lectura de hoy)' : '');
}

// ---------- PARTE B. Productos estructurados ----------
async function productos() {
  const prev = await readJSON('prod_puestos.json', []);
  const byId = Object.fromEntries(prev.map(p => [p.id, p]));
  const puestos = await readJSON('puestos.json', []);
  const nombrePuesto = Object.fromEntries(Object.entries(IDS.puestos)
    .map(([rexi, id]) => [rexi, (puestos.find(p => p.id === id) || {}).puesto]).filter(([, n]) => n));
  const filas = [];
  for (const [c, tipo] of [[0, 'SBB'], [1, 'SBB con Mutuo']]) {
    const st = (await get(`${BASE}/productos-estructurados/resultados?c=${c}`)).modelResultPage;
    check(st && Array.isArray(st.listResults), `la página de productos c=${c} no trajo resultados`);
    for (const r of st.listResults) {
      const g = groups(r);
      if (g['Moneda'] !== 'Pesos (RD$)') continue;
      const puesto = nombrePuesto[r.entityId] || r.entityName;
      const producto = r.name.replace(/\s*\((SBB|Mutuo)[^)]*\)\s*$/i, '').trim();
      const id = IDS.productos[r.id] || slug(`${puesto.split(' ')[0]} ${producto}`);
      const anterior = byId[id];
      const col = (r.columns || []).find(x => x.name === 'Rentabilidad estimada') || {};
      const plazoRexi = (String(col.subTitle || '').match(/plazo de (.+)$/i) || [])[1]?.trim();
      // Si la PWA ya tenía un plazo más detallado que empieza igual, se conserva.
      const plazo = plazoRexi
        ? (anterior && String(anterior.plazo).startsWith(plazoRexi) ? anterior.plazo : plazoRexi)
        : 'No disponible';
      const minimo = String(g['Inversión mínima'] ?? '').trim() || 'No disponible';
      const pagoRexi = String(g['Periodicidad de pagos'] ?? '').trim();
      filas.push({
        id,
        puesto,
        producto: anterior ? anterior.producto : producto,
        tipo,
        rent: num(g['Rentabilidad estimada']),
        plazo,
        minimo,
        minimo_num: num(minimo),
        pago: ['Mensual', 'A vencimiento'].includes(pagoRexi) ? pagoRexi : 'No especificado',
        moneda: 'Pesos (RD$)',
        fecha: HOY,
      });
    }
  }
  check(filas.length >= 5, `solo ${filas.length} productos (mínimo 5)`);
  await writeJSON('prod_puestos.json', filas);
  const ids = new Set(filas.map(p => p.id));
  const nuevos = filas.filter(p => !byId[p.id]).map(p => `${p.puesto} ${p.producto}`);
  const idos = prev.filter(p => !ids.has(p.id)).map(p => `${p.puesto} ${p.producto}`);
  return `${filas.length} productos` + (nuevos.length ? `; nuevos: ${nuevos.join(', ')}` : '') + (idos.length ? `; ya no aparecen: ${idos.join(', ')}` : '');
}

// ---------- PARTE C. Puestos de bolsa ----------
const webDe = x => {
  const v = x.linkToWebPage?.value;
  if (!v) return '—';
  if (v.title && /^[\w-]+(\.[\w-]+)+$/.test(v.title)) return v.title;
  try { return new URL(v.link).hostname.replace(/^www\./, ''); } catch { return '—'; }
};

// Productos que Rexi lista en la ficha, por tipo (pt): 7 estructurados, 8 bonos, 6 fondos, 10 fideicomisos
const PT = { estructurados: 7, bonos: 8, fondos: 6, fideicomisos: 10 };

async function puestos() {
  const prev = await readJSON('puestos.json', []);
  const byId = Object.fromEntries(prev.map(p => [p.id, p]));
  const st = (await get(`${BASE}/entidades/puestos-de-bolsa`)).FeModelResultPage;
  check(st && Array.isArray(st.listResults), 'la lista de puestos no trajo resultados');
  const leerFichas = ES_LUNES || args.includes('--fichas');
  const fallasFicha = [];
  const filas = [];
  for (const x of st.listResults) {
    const id = IDS.puestos[x.id] || slug(x.name.replace(/,?\s*S\.?\s*A\.?$/i, ''));
    const anterior = byId[id];
    const fila = anterior ? { ...anterior } : {
      id, puesto: x.name.replace(/,?\s*S\.?\s*A\.?$/i, '').trim(), activos: null, corredores: null, calificacion: null,
      estructurados: null, bonos: null, fondos: null, fideicomisos: null, telefono: '—', web: '—', fecha: HOY,
    };
    fila.activos = num(x.assetsSize?.value);
    fila.corredores = Array.isArray(x.stockBrokers?.value) ? x.stockBrokers.value.length : null;
    fila.calificacion = rating(x.risk?.value?.riskQualification?.value, 'No listada');
    fila.fecha = HOY;
    if (leerFichas) {
      try {
        const f = (await get(`${BASE}/entidades/puestos-de-bolsa/${x.id}`)).FeModelSingle;
        if (!f) throw new Error('sin datos');
        const v = f.rexiAvailableProducts?.value;
        for (const [campo, pt] of Object.entries(PT)) {
          fila[campo] = Array.isArray(v) ? (v.find(p => p.pt === pt)?.totalAmount ?? null) : /no tiene/i.test(String(v)) ? 0 : null;
        }
        fila.telefono = f.mainOffice?.value?.phones?.value?.[0] || '—';
        fila.web = webDe(f);
      } catch (e) {
        fallasFicha.push(`${fila.puesto} (${e.message})`);
      }
    }
    filas.push(fila);
  }
  check(filas.length >= 10, `solo ${filas.length} puestos (mínimo 10)`);
  const malos = filas.filter(p => typeof p.activos !== 'number');
  check(!malos.length, `activos no numéricos en ${malos.map(p => p.id).join(', ')}`);
  filas.sort((a, b) => b.activos - a.activos);
  await writeJSON('puestos.json', filas);
  const ids = new Set(filas.map(p => p.id));
  const nuevos = filas.filter(p => !byId[p.id]).map(p => p.puesto);
  const idos = prev.filter(p => !ids.has(p.id)).map(p => p.puesto);
  return `${filas.length} puestos` + (leerFichas ? '; se leyeron las fichas' : '') +
    (fallasFicha.length ? `; fichas que fallaron (se dejaron sus datos anteriores): ${fallasFicha.join(', ')}` : '') +
    (nuevos.length ? `; nuevos: ${nuevos.join(', ')}` : '') + (idos.length ? `; quitados: ${idos.join(', ')}` : '');
}

// ---------- PARTE F. Bonos en pesos ----------
const BONOS_URLS = [
  [`${BASE}/emisiones-de-bonos/resultados?c=1`, 1],
  ...[1, 2, 3].map(p => [`${BASE}/emisiones-de-bonos/resultados?p=${p}&ido=false&o=9&iw=false&pq=1&a=0&t=360&c=1&cu=0`, p]),
];
const GOBIERNO = ['Ministerio de Hacienda', 'Banco Central'];

function filaBono(r, byId, deTotal) {
  const g = groups(r);
  const nombre = r.name.replace(/\s+/g, ' ').trim();
  const cupon = num(g['Tasa de cupón']);
  const bc = /DOBCNO|SIVEMBC/i.test(nombre) || r.entityName === 'Banco Central';
  const emisorRexi = bc ? 'Banco Central' : r.entityName;
  let id, emision, nota = '';

  const dob = nombre.match(/DOBCNO\s*(\d+(?:\.\d+)?)%\s*(\d{2})(\d{2})(\d{2})/i);
  const prog = nombre.match(/^(SIVEM(?:GC|BC)?)-(\d+)/i);
  if (dob) {
    const tasa = Number(dob[1]);
    const [, , dd, mm, yy] = dob;
    id = `dobcno-${tasa.toFixed(2).replace('.', '')}-${dd}${mm}${yy}`;
    emision = `DOBCNO ${tasa.toFixed(2)}% ${dd}/${mm}/20${yy}`;
    if (cupon !== null && Math.abs(tasa - cupon) > 1e-9) nota = `El nombre dice ${tasa.toFixed(2)}%, pero Rexi muestra un cupón de ${cupon.toFixed(2)}%.`;
  } else if (prog) {
    const P = `${prog[1].toUpperCase()}-${prog[2]}`;
    const p = P.toLowerCase();
    const n = (nombre.match(/\s(\d+)(?:\.ª|C)?\s+Emisi/i) || [])[1];
    const corporativo = !GOBIERNO.includes(emisorRexi);
    if (/deuda subordinada/i.test(nombre)) {
      const corto = IDS.emisores_bonos[r.entityName] || r.entityName;
      id = `${p}-${slug(corto).split('-').filter(w => w !== 'banco')[0]}`;
      emision = `${P} deuda subordinada`;
      nota = 'Deuda subordinada de un banco: no es depósito ni del Estado.';
    } else if (/\sUNICA\s/i.test(nombre)) {
      id = p; emision = `${P} emisión única`;
    } else if (n) {
      id = `${p}-${n}`; emision = `${P} ${n}.ª emisión`;
    } else {
      id = slug(nombre); emision = nombre;
    }
    if (corporativo && !/deuda subordinada/i.test(nombre)) {
      emision += ' (bono corporativo)';
      nota = 'Bono de empresa, no del Estado.';
    }
  } else {
    id = slug(nombre); emision = nombre;
  }

  const anterior = byId[id];
  const gobierno = GOBIERNO.includes(emisorRexi);
  return {
    id,
    emision: anterior ? anterior.emision : emision,
    emisor: anterior ? anterior.emisor : (IDS.emisores_bonos[emisorRexi] || emisorRexi),
    cupon,
    pago: String(g['Periodicidad de pagos'] ?? '').trim() || 'No indicado',
    vencimiento: fechaES(g['Fecha de vencimiento']),
    valor_unidad: String(g['Valor de unidad'] ?? '').trim() || 'No disponible',
    minimo: bc && String(g['Inversion mínima'] ?? g['Inversión mínima'] ?? '').trim() === 'RD$1,000,000' ? 'RD$1,000,000' : 'No indicado',
    calificacion: rating(g['Calificación de riesgo'], 'No indicada'),
    // Para empresas y bancos se conserva la nota que ya tenía la PWA (puede ser más detallada).
    nota: gobierno ? nota : (anterior && anterior.nota ? anterior.nota : nota),
    de_total: deTotal,
    fecha: HOY,
    fuente: `Lectura del ${HOY_DMY}`,
  };
}

async function bonos() {
  const prev = await readJSON('bonos_estado.json', []);
  const byId = Object.fromEntries(prev.map(b => [b.id, b]));
  const leidos = new Map(); // id Rexi -> producto
  let deTotal = 0, paginasOk = 0;
  const avisos = [];
  for (const [url, pagina] of BONOS_URLS) {
    try {
      const st = (await get(url)).modelResultPage;
      if (!st || !Array.isArray(st.listResults)) throw new Error('sin resultados');
      if (st.page !== pagina) { avisos.push(`pidió la página ${pagina} y Rexi devolvió la ${st.page}`); }
      for (const r of st.listResults) leidos.set(r.id, r);
      if (url.includes('a=0&t=360')) deTotal = Math.max(deTotal, st.amountResults || 0);
      paginasOk++;
    } catch (e) {
      avisos.push(`no se pudo leer ${url} (${e.message})`);
    }
  }
  check(paginasOk > 0, 'no se pudo leer ninguna página de bonos');
  if (!deTotal) deTotal = prev[0]?.de_total ?? leidos.size;

  const hoy = new Map();
  for (const r of leidos.values()) {
    const f = filaBono(r, byId, deTotal);
    if (!f.vencimiento) throw new Error(`no se entendió el vencimiento de ${r.name}`);
    hoy.set(f.id, f);
  }
  const malos = [...hoy.values()].filter(b => typeof b.cupon !== 'number' || !(b.cupon >= 0 && b.cupon <= 25));
  check(!malos.length, `cupón fuera de 0-25 en ${malos.map(b => `${b.id}=${b.cupon}`).join(', ')}`);

  // Fusión: lo leído hoy reemplaza; lo no leído se conserva (solo cambia de_total); lo vencido se quita.
  const fusion = new Map(prev.map(b => [b.id, { ...b, de_total: deTotal }]));
  for (const [id, b] of hoy) fusion.set(id, b);
  const vencidos = [...fusion.values()].filter(b => b.vencimiento < HOY);
  const lista = [...fusion.values()].filter(b => b.vencimiento >= HOY)
    .sort((a, b) => a.vencimiento.localeCompare(b.vencimiento) || a.id.localeCompare(b.id));
  check(lista.length >= 30, `la lista fusionada tiene ${lista.length} bonos (mínimo 30)`);
  await writeJSON('bonos_estado.json', lista);

  const nuevos = [...hoy.keys()].filter(id => !byId[id]);
  const conservados = lista.filter(b => !hoy.has(b.id)).length;
  return `${lista.length} bonos (${hoy.size} leídos hoy de ${deTotal} vigentes, ${conservados} conservados de lecturas anteriores)` +
    (nuevos.length ? `; nuevos: ${nuevos.join(', ')}` : '') +
    (vencidos.length ? `; vencidos y quitados: ${vencidos.map(b => b.id).join(', ')}` : '') +
    (avisos.length ? `; avisos: ${avisos.join('; ')}` : '');
}

// ---------- ejecutar ----------
await parte('Fondos', fondos);
await parte('Productos estructurados', productos);
await parte('Puestos de bolsa', puestos);
await parte('Bonos', bonos);

if (resumen.length) {
  await writeJSON('meta.json', { actualizado: `${HOY}T${HORA}-04:00`, fuente: 'Rexi (rexi.do)' }, true);
}

console.log(`Lectura de Rexi del ${HOY_DMY} ${HORA} (hora de RD)`);
for (const l of resumen) console.log(`OK   ${l}`);
for (const l of fallas) console.log(`FALLA ${l}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY,
    `### Datos de Rexi del ${HOY_DMY}\n\n` + resumen.map(l => `- ✅ ${l}`).join('\n') + '\n' + fallas.map(l => `- ❌ ${l}`).join('\n') + '\n',
    { flag: 'a' });
}
process.exitCode = fallas.length ? 1 : 0;
