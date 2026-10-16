/* Lógica de la página: pestañas, tablas, ranking y calculadoras. */
(function () {
  var fmtPct = function (x) { return d3.format('.2f')(x) + '%'; };
  var fmtPp = function (x) { return (x > 0 ? '+' : x < 0 ? '−' : '') + d3.format('.2f')(Math.abs(x)) + ' pp'; };
  var fmtFecha = function (s) { var p = String(s).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(s); };
  var el = function (tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };

  dash.calc('resumen', {
    inputs: ['fondos'],
    title: 'Resumen de fondos',
    description: 'Mejor fondo abierto y cerrado, y conteos, a partir de la lista de fondos.',
    fn: function (fondos) {
      var best = function (t) { return fondos.filter(function (f) { return f.tipo === t; }).sort(function (a, b) { return b.rent - a.rent; })[0]; };
      var a = best('Abierto'), c = best('Cerrado');
      return [{
        mejor_abierto: a ? a.fondo : '', rent_abierto: a ? a.rent : null,
        mejor_cerrado: c ? c.fondo : '', rent_cerrado: c ? c.rent : null,
        total: fondos.length,
        abiertos: fondos.filter(function (f) { return f.tipo === 'Abierto'; }).length,
        cerrados: fondos.filter(function (f) { return f.tipo === 'Cerrado'; }).length,
        fecha: fondos[0] ? fondos[0].fecha : ''
      }];
    }
  });
  dash.calc('top', {
    inputs: ['fondos'],
    title: 'Top 10 por rentabilidad',
    description: 'Los diez fondos con mayor rentabilidad de 12 meses.',
    fn: function (fondos) {
      return fondos.slice().sort(function (a, b) { return b.rent - a.rent; }).slice(0, 10)
        .map(function (f) { return { id: f.id, fondo: f.fondo, tipo: f.tipo, rent: f.rent }; });
    }
  });
  dash.calc('cambios', {
    inputs: ['fondos', 'fondos_prev'],
    title: 'Cambio vs lectura anterior',
    description: 'Rentabilidad de hoy menos la de la lectura anterior, en puntos porcentuales.',
    fn: function (fondos, fondos_prev) {
      var p = new Map(fondos_prev.map(function (r) { return [r.id, r.rent]; }));
      return fondos.map(function (f) {
        return { id: f.id, delta: p.has(f.id) ? Math.round((f.rent - p.get(f.id)) * 100) / 100 : null };
      });
    }
  });
  dash.calc('salidas', {
    inputs: ['fondos', 'fondos_prev'],
    title: 'Fondos que salieron',
    description: 'Fondos de la lectura anterior que hoy no aparecen en la lista.',
    fn: function (fondos, fondos_prev) {
      var ids = new Set(fondos.map(function (f) { return f.id; }));
      return fondos_prev.filter(function (r) { return !ids.has(r.id); })
        .map(function (r) { return { id: r.id, fondo: r.fondo, afi: r.afi, rent_prev: r.rent }; });
    }
  });

  var state = { tipo: 'todos', key: 'rent', dir: -1 };
  var root = document.getElementById('fx-root');
  document.getElementById('sw-a').style.background = dash.colors[0];
  document.getElementById('sw-c').style.background = dash.colors[1];

  function fill(src) {
    var d = dash.data(src), row = d.status === 'ok' ? d.data[0] : null;
    root.querySelectorAll('[data-source="' + src + '"][data-field][data-row]').forEach(function (n) {
      var v = row ? row[n.dataset.field] : null;
      n.textContent = v == null || v === '' ? '—' : n.dataset.fmt === 'pct' ? fmtPct(v) : n.dataset.fmt === 'fecha' ? fmtFecha(v) : n.dataset.fmt === 'num1' ? d3.format(',.1f')(v) : String(v);
    });
  }

  function renderTop() {
    var box = document.getElementById('top-bars'), d = dash.data('top');
    box.replaceChildren();
    if (d.status !== 'ok') { box.appendChild(el('div', d.status === 'loading' ? '' : 'No se pudo cargar', 'muted')); return; }
    var max = d3.max(d.data, function (r) { return r.rent; }) || 1;
    d.data.forEach(function (r) {
      var row = el('div', null, 'brow');
      row.appendChild(el('div', r.fondo, 'bname'));
      var tr = el('div', null, 'btrack'), fl = el('div', null, 'bfill');
      fl.style.width = (r.rent / max * 100) + '%';
      fl.style.background = r.tipo === 'Cerrado' ? dash.colors[1] : dash.colors[0];
      tr.appendChild(fl); row.appendChild(tr);
      row.appendChild(el('div', fmtPct(r.rent), 'bval'));
      row.title = r.fondo + ' (' + r.tipo + ')';
      box.appendChild(row);
    });
  }

  function renderTable() {
    var tb = document.querySelector('#tabla tbody'), F = dash.data('fondos'), C = dash.data('cambios');
    tb.replaceChildren();
    if (F.status !== 'ok') {
      var tr0 = el('tr'), td0 = el('td', F.status === 'loading' ? '' : 'No se pudo cargar', 'muted'); td0.colSpan = 8; tr0.appendChild(td0); tb.appendChild(tr0); return;
    }
    var cm = new Map((C.status === 'ok' ? C.data : []).map(function (r) { return [r.id, r.delta]; }));
    var rows = F.data.filter(function (f) { return state.tipo === 'todos' || f.tipo === state.tipo; });
    var val = function (f) { return state.key === 'delta' ? (cm.has(f.id) ? cm.get(f.id) : null) : f[state.key]; };
    rows.sort(function (a, b) {
      var x = val(a), y = val(b);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'es')) * state.dir;
    });
    rows.forEach(function (f) {
      var tr = el('tr'); tr.dataset.key = f.id;
      tr.appendChild(el('td', f.fondo, 'nm'));
      tr.appendChild(el('td', f.afi, 'hide-sm'));
      tr.appendChild(el('td', f.tipo));
      tr.appendChild(el('td', fmtPct(f.rent), 'num'));
      var dv = cm.get(f.id);
      tr.appendChild(el('td', dv == null ? 'nuevo' : fmtPp(dv), 'num ' + (dv == null ? 'muted' : dv > 0 ? 'up' : dv < 0 ? 'down' : 'muted')));
      tr.appendChild(el('td', f.permanencia, 'hide-sm'));
      tr.appendChild(el('td', f.aporte, 'hide-sm'));
      tr.appendChild(el('td', f.riesgo, 'hide-sm'));
      tb.appendChild(tr);
    });
    document.querySelectorAll('#tabla th').forEach(function (th) {
      th.setAttribute('aria-sort', th.dataset.sort === state.key ? (state.dir > 0 ? 'ascending' : 'descending') : 'none');
    });
  }

  function renderSalidas() {
    var S = dash.data('salidas'), tbl = document.getElementById('tabla-salidas'), msg = document.getElementById('salidas-msg'), tb = tbl.querySelector('tbody');
    tb.replaceChildren();
    if (S.status !== 'ok') { tbl.hidden = true; msg.textContent = S.status === 'loading' ? '' : 'No se pudo cargar'; return; }
    if (!S.data.length) { tbl.hidden = true; msg.textContent = 'Ningún fondo salió del listado.'; return; }
    msg.textContent = ''; tbl.hidden = false;
    S.data.forEach(function (r) {
      var tr = el('tr'); tr.dataset.key = r.id;
      tr.appendChild(el('td', r.fondo, 'nm'));
      tr.appendChild(el('td', r.afi, 'hide-sm'));
      tr.appendChild(el('td', fmtPct(r.rent_prev), 'num'));
      tb.appendChild(tr);
    });
  }

  document.getElementById('f-tipo').addEventListener('change', function (e) { state.tipo = e.target.value; renderTable(); });
  document.querySelectorAll('#tabla th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.dataset.sort;
      if (state.key === k) state.dir = -state.dir; else { state.key = k; state.dir = (k === 'rent' || k === 'delta') ? -1 : 1; }
      renderTable();
    });
  });

  dash.calc('resumen_puestos', {
    inputs: ['puestos', 'prod_puestos'],
    title: 'Resumen de puestos de bolsa',
    description: 'Cantidad de puestos, el mayor por activos y las mejores tasas estimadas de productos estructurados.',
    fn: function (puestos, prod_puestos) {
      var mayor = puestos.slice().sort(function (a, b) { return b.activos - a.activos; })[0];
      var best = function (t) { return prod_puestos.filter(function (r) { return r.tipo === t && r.rent != null; }).sort(function (a, b) { return b.rent - a.rent; })[0]; };
      var s = best('SBB'), m = best('SBB con Mutuo');
      return [{
        total: puestos.length,
        top_puesto: mayor ? mayor.puesto : '', top_activos: mayor ? mayor.activos : null,
        sbb_puesto: s ? s.puesto : '', sbb_rent: s ? s.rent : null,
        mutuo_puesto: m ? m.puesto : '', mutuo_rent: m ? m.rent : null
      }];
    }
  });

  var stateP = { tipo: 'todos', key: 'rent', dir: -1 };
  var stateQ = { key: 'activos', dir: -1 };
  var cnt = function (v) { return v == null ? '—' : String(v); };
  var sorted = function (rows, key, dir) {
    return rows.slice().sort(function (a, b) {
      var x = a[key], y = b[key];
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'es')) * dir;
    });
  };
  var failRow = function (tb, d, cols) {
    tb.replaceChildren();
    var tr = el('tr'), td = el('td', d.status === 'loading' ? '' : 'No se pudo cargar', 'muted'); td.colSpan = cols; tr.appendChild(td); tb.appendChild(tr);
  };
  var setSort = function (tableId, st, render, numericKeys) {
    document.querySelectorAll('#' + tableId + ' th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.dataset.sort;
        if (st.key === k) st.dir = -st.dir; else { st.key = k; st.dir = numericKeys.indexOf(k) >= 0 ? -1 : 1; }
        render();
      });
    });
  };
  var marcaSort = function (tableId, st) {
    document.querySelectorAll('#' + tableId + ' th').forEach(function (th) {
      th.setAttribute('aria-sort', th.dataset.sort === st.key ? (st.dir > 0 ? 'ascending' : 'descending') : 'none');
    });
  };

  function renderProd() {
    var tb = document.querySelector('#tabla-prod tbody'), d = dash.data('prod_puestos');
    if (d.status !== 'ok') { failRow(tb, d, 7); return; }
    tb.replaceChildren();
    var rows = d.data.filter(function (r) { return stateP.tipo === 'todos' || r.tipo === stateP.tipo; });
    sorted(rows, stateP.key, stateP.dir).forEach(function (r) {
      var tr = el('tr'); tr.dataset.key = r.id;
      tr.appendChild(el('td', r.producto, 'nm'));
      tr.appendChild(el('td', r.puesto, 'nm'));
      tr.appendChild(el('td', r.tipo, 'hide-sm'));
      tr.appendChild(el('td', r.rent == null ? 'No disponible' : fmtPct(r.rent), 'num' + (r.rent == null ? ' muted' : '')));
      tr.appendChild(el('td', r.plazo, 'hide-sm'));
      tr.appendChild(el('td', r.minimo, 'num'));
      tr.appendChild(el('td', r.pago, 'hide-sm'));
      tb.appendChild(tr);
    });
    marcaSort('tabla-prod', stateP);
  }

  function renderPuestos() {
    var tb = document.querySelector('#tabla-puestos tbody'), d = dash.data('puestos');
    if (d.status !== 'ok') { failRow(tb, d, 10); return; }
    tb.replaceChildren();
    sorted(d.data, stateQ.key, stateQ.dir).forEach(function (r) {
      var tr = el('tr'); tr.dataset.key = r.id;
      tr.appendChild(el('td', r.puesto, 'nm'));
      tr.appendChild(el('td', d3.format(',.1f')(r.activos), 'num'));
      tr.appendChild(el('td', cnt(r.corredores), 'num hide-sm'));
      tr.appendChild(el('td', r.calificacion, 'hide-sm'));
      tr.appendChild(el('td', cnt(r.estructurados), 'num'));
      tr.appendChild(el('td', cnt(r.bonos), 'num'));
      tr.appendChild(el('td', cnt(r.fondos), 'num'));
      tr.appendChild(el('td', cnt(r.fideicomisos), 'num hide-sm'));
      tr.appendChild(el('td', r.telefono, 'hide-sm'));
      tr.appendChild(el('td', r.web, 'hide-sm'));
      tb.appendChild(tr);
    });
    marcaSort('tabla-puestos', stateQ);
  }

  document.getElementById('p-tipo').addEventListener('change', function (e) { stateP.tipo = e.target.value; renderProd(); });
  setSort('tabla-prod', stateP, renderProd, ['rent', 'minimo_num']);
  setSort('tabla-puestos', stateQ, renderPuestos, ['activos', 'corredores', 'estructurados', 'bonos', 'fondos', 'fideicomisos']);

  dash.calc('resumen_bonos', {
    inputs: ['bonos_estado'],
    title: 'Resumen de bonos del Estado',
    description: 'Mayores cupones de bonos vigentes por emisor y próximo vencimiento, a partir de la lista de bonos leída hoy.',
    fn: function (bonos_estado) {
      var hoy = new Date().toISOString().slice(0, 10);
      var vig = bonos_estado.filter(function (r) { return r.vencimiento >= hoy; });
      var top = function (emisor) { return vig.filter(function (r) { return r.emisor === emisor; }).sort(function (a, b) { return b.cupon - a.cupon; })[0]; };
      var h = top('Ministerio de Hacienda'), b = top('Banco Central');
      var prox = vig.slice().sort(function (a, b) { return a.vencimiento < b.vencimiento ? -1 : a.vencimiento > b.vencimiento ? 1 : 0; })[0];
      return [{
        mostradas: bonos_estado.length, total_rexi: bonos_estado[0] ? bonos_estado[0].de_total : null,
        fecha: bonos_estado[0] ? bonos_estado[0].fecha : '',
        h_cupon: h ? h.cupon : null, h_emision: h ? h.emision + ' (vence ' + h.vencimiento.split('-').reverse().join('/') + ')' : '',
        b_cupon: b ? b.cupon : null, b_emision: b ? b.emision : '',
        prox_venc: prox ? prox.vencimiento : '', prox_emision: prox ? prox.emision + ' · ' + prox.emisor : ''
      }];
    }
  });

  var stateB = { emisor: 'todos', key: 'vencimiento', dir: 1 };
  function renderBonos() {
    var tb = document.querySelector('#tabla-bonos tbody'), d = dash.data('bonos_estado'), notas = document.getElementById('bonos-notas');
    if (d.status !== 'ok') { failRow(tb, d, 8); notas.textContent = ''; return; }
    tb.replaceChildren();
    var hoy = new Date().toISOString().slice(0, 10);
    var rows = d.data.filter(function (r) { return stateB.emisor === 'todos' || (stateB.emisor === 'otros' ? (r.emisor !== 'Ministerio de Hacienda' && r.emisor !== 'Banco Central') : r.emisor === stateB.emisor); });
    var nt = [];
    sorted(rows, stateB.key, stateB.dir).forEach(function (r) {
      var vencido = r.vencimiento < hoy;
      var tr = el('tr'); tr.dataset.key = r.id;
      tr.appendChild(el('td', r.emision, 'nm'));
      tr.appendChild(el('td', r.emisor, 'hide-sm'));
      tr.appendChild(el('td', fmtPct(r.cupon), 'num'));
      tr.appendChild(el('td', r.pago, 'hide-sm'));
      tr.appendChild(el('td', fmtFecha(r.vencimiento) + (vencido ? ' (vencido)' : ''), vencido ? 'muted' : ''));
      tr.appendChild(el('td', r.valor_unidad, 'hide-sm'));
      tr.appendChild(el('td', r.minimo, 'hide-sm'));
      tr.appendChild(el('td', r.calificacion, 'hide-sm'));
      tb.appendChild(tr);
      if (r.nota) nt.push(r.emision + ': ' + r.nota);
    });
    notas.textContent = nt.join(' ');
    marcaSort('tabla-bonos', stateB);
  }
  document.getElementById('b-emisor').addEventListener('change', function (e) { stateB.emisor = e.target.value; renderBonos(); });
  setSort('tabla-bonos', stateB, renderBonos, ['cupon']);

  // ---------- Calculadoras ----------
  var money = function (v) { return 'RD$' + d3.format(',.0f')(v); };
  var numIn = function (s) { var m = String(s == null ? '' : s).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };
  var permDias = function (s) {
    s = String(s || '');
    if (/m[aá]s de 1 a[nñ]o/i.test(s)) return 366;
    var d = s.match(/(\d+)\s*d[ií]a/i); if (d) return Number(d[1]);
    var a = s.match(/(\d+)\s*a[nñ]o/i); if (a) return Number(a[1]) * 365;
    return 0;
  };
  var toDias = function (n, u) { return u === 'd' ? Math.round(n) : u === 'm' ? Math.round(n * 365 / 12) : Math.round(n * 365); };
  var diasTxt = function (d) { return d3.format(',')(d) + (d === 1 ? ' día' : ' días'); };
  var hoyISO = function () { return new Date().toISOString().slice(0, 10); };

  function itemsFondos(rows) {
    return rows.map(function (f) {
      var min = /RD\$/.test(f.aporte) ? numIn(f.aporte) : null;
      var perm = permDias(f.permanencia);
      return { id: f.id, nombre: f.fondo, entidad: f.afi, tasa: f.rent, eval: function (monto, dias) {
        var av = [], ok = true;
        if (min != null && monto < min) { ok = false; av.push('Aporte mínimo: ' + f.aporte + '.'); }
        if (min == null && f.tipo === 'Abierto') av.push('Aporte mínimo no indicado.');
        if (f.tipo === 'Cerrado') av.push('Fondo cerrado: se compra por un puesto de bolsa, a precio de mercado.');
        if (perm && dias < perm) { ok = false; av.push('Permanencia mínima: ' + f.permanencia + '.'); }
        if (/No disponible/i.test(f.permanencia)) av.push('Permanencia no indicada.');
        return { ok: ok, av: av, invertido: monto, dias: dias, bruto: monto * (Math.pow(1 + f.rent / 100, dias / 365) - 1) };
      } };
    });
  }
  function itemsEstructurados(rows) {
    return rows.map(function (r) {
      var P = numIn(r.plazo) || 120;
      return { id: r.id, nombre: r.producto, entidad: r.puesto, tasa: r.rent, eval: function (monto, dias) {
        var av = [], ok = true;
        if (r.rent == null) return { ok: false, av: ['Rexi no muestra su tasa.'], invertido: monto, dias: dias, bruto: 0, sinTasa: true };
        if (r.minimo_num != null && monto < r.minimo_num) { ok = false; av.push('Inversión mínima: ' + r.minimo + '.'); }
        if (dias < P) { ok = false; av.push('Su plazo es de ' + P + ' días y no se puede retirar antes.'); }
        else if (dias > P) av.push('Supone que lo renuevas cada ' + P + ' días a la misma tasa.');
        if (r.tipo === 'SBB con Mutuo') av.push('SBB con Mutuo: más riesgo, sin garantía que se pueda liquidar.');
        if (/30 a 280/.test(r.plazo)) av.push('Plazo flexible de 30 a 280 días.');
        var bruto = dias < P ? monto * (r.rent / 100) * dias / 360 : monto * (Math.pow(1 + (r.rent / 100) * P / 360, dias / P) - 1);
        return { ok: ok, av: av, invertido: monto, dias: dias, bruto: bruto };
      } };
    });
  }
  function itemsBonos(rows) {
    var hoy = hoyISO();
    return rows.filter(function (b) { return b.vencimiento >= hoy; }).map(function (b) {
      var unidad = /RD\$/.test(b.valor_unidad) ? numIn(b.valor_unidad) : null;
      var minimo = /\d/.test(b.minimo) ? numIn(b.minimo) : unidad;
      var diasVenc = Math.max(0, Math.round((Date.parse(b.vencimiento) - Date.parse(hoy)) / 864e5));
      var estado = b.emisor === 'Ministerio de Hacienda' || b.emisor === 'Banco Central';
      return { id: b.id, nombre: b.emision, entidad: b.emisor, tasa: b.cupon, eval: function (monto, dias) {
        var av = [], ok = true;
        var inv = unidad ? Math.floor(monto / unidad) * unidad : monto;
        if (minimo != null && inv < minimo) { ok = false; av.push(/\d/.test(b.minimo) ? 'Inversión mínima: ' + money(minimo) + '.' : 'Inversión mínima: una unidad de ' + b.valor_unidad + '.'); }
        else if (inv > 0 && inv < monto) av.push('Se invierten ' + money(inv) + ' (múltiplos de ' + b.valor_unidad + ').');
        if (unidad == null) av.push('Valor de unidad no indicado.');
        var dEf = Math.min(dias, diasVenc);
        if (dias > diasVenc) av.push('Vence el ' + fmtFecha(b.vencimiento) + ': solo cuenta hasta esa fecha.');
        if (!estado && !b.nota) av.push('No es del Estado.');
        if (b.nota) av.push(b.nota);
        return { ok: ok && inv > 0, av: av, invertido: inv, dias: dEf, bruto: inv * (b.cupon / 100) * dEf / 365 };
      } };
    });
  }

  function makeCalc(p, src, build, nombreTipo) {
    var $ = function (id) { return document.getElementById(p + '-' + id); };
    var optKey = '';
    function render() {
      var out = $('out'), head = $('head'), cuenta = $('cuenta'), sel = $('prod');
      var d = dash.data(src);
      out.replaceChildren(); head.textContent = ''; cuenta.textContent = '';
      if (d.status !== 'ok') { out.appendChild(el('div', d.status === 'loading' ? '' : 'No se pudo cargar', 'muted')); return; }
      var items = build(d.data);
      var key = items.map(function (i) { return i.id; }).join('|');
      if (key !== optKey) {
        var cur = sel.value;
        var opts = items.slice().sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); })
          .map(function (i) { return new Option(i.nombre + ' · ' + i.entidad, i.id); });
        sel.replaceChildren.apply(sel, [new Option('Las 10 mejores', '')].concat(opts));
        sel.value = items.some(function (i) { return i.id === cur; }) ? cur : '';
        optKey = key;
      }
      var monto = Number($('monto').value), n = Number($('plazo').value);
      if (!(monto > 0) || !(n > 0)) { head.textContent = 'Escribe un monto y un plazo mayores que cero.'; return; }
      var dias = toDias(n, $('unidad').value);
      var isr = $('isr').checked ? 0.10 : 0;
      var res = items.map(function (i) { var r = i.eval(monto, dias); r.item = i; r.isr = r.bruto * isr; r.neta = r.bruto - r.isr; return r; });
      var elegibles = res.filter(function (r) { return r.ok; }).sort(function (a, b) { return b.neta - a.neta; });
      var lista;
      if (sel.value) {
        lista = res.filter(function (r) { return r.item.id === sel.value; });
      } else {
        lista = elegibles.slice(0, 10);
      }
      var first = lista[0];
      if (!first) {
        head.textContent = 'Con ' + money(monto) + ' a ' + diasTxt(dias) + ' ningún ' + nombreTipo + ' cumple su monto mínimo o su plazo. Prueba con más dinero o más tiempo, o elige uno en específico.';
      } else if (!first.ok) {
        head.replaceChildren(document.createTextNode('Con ' + money(monto) + ' a ' + diasTxt(dias) + ', '), el('b', first.item.nombre),
          document.createTextNode(' (' + first.item.entidad + ') no aplica: ' + first.av.filter(function (a) { return /m[ií]nim|plazo es|no muestra/i.test(a); }).join(' ')));
      } else {
        head.replaceChildren(
          document.createTextNode('Con ' + money(monto) + ' a ' + diasTxt(dias) + (sel.value ? ', ' : ', la mejor opción es ')),
          el('b', first.item.nombre), document.createTextNode(' (' + first.item.entidad + '): ganarías '),
          el('b', money(first.neta)),
          document.createTextNode((isr ? ' netos' : '') + ' y terminarías con ' + money(first.invertido + first.neta) + '.'));
      }
      if (!lista.length) { cuenta.textContent = elegibles.length + ' de ' + items.length + ' cumplen con tu monto y plazo.'; return; }
      var t = el('table', null, 'cards'), th = el('thead'), hr = el('tr');
      var cols = [['#', 'num c-rank'], ['Producto', ''], ['Entidad', 'hide-sm'], ['Tasa', 'num'], ['Plazo contado', 'num hide-sm'], ['Invertido', 'num hide-sm'], ['Ganancia bruta', 'num hide-sm'], ['ISR', 'num hide-sm'], [isr ? 'Ganancia neta' : 'Ganancia', 'num'], ['Total al final', 'num'], ['Avisos', '']];
      cols.forEach(function (c) { var h = el('th', c[0], c[1]); h.style.cursor = 'default'; hr.appendChild(h); });
      th.appendChild(hr); t.appendChild(th);
      var tb = el('tbody');
      lista.forEach(function (r, k) {
        var tr = el('tr'); if (!r.ok) tr.className = 'no';
        tr.appendChild(el('td', '#' + (k + 1), 'num c-rank'));
        tr.appendChild(el('td', r.item.nombre, 'nm'));
        tr.appendChild(el('td', r.item.entidad, 'nm hide-sm'));
        tr.appendChild(el('td', r.item.tasa == null ? '—' : fmtPct(r.item.tasa), 'num'));
        tr.appendChild(el('td', diasTxt(r.dias), 'num hide-sm'));
        tr.appendChild(el('td', money(r.invertido), 'num hide-sm'));
        tr.appendChild(el('td', money(r.bruto), 'num hide-sm'));
        tr.appendChild(el('td', money(r.isr), 'num hide-sm'));
        tr.appendChild(el('td', money(r.neta), 'num neta'));
        tr.appendChild(el('td', money(r.invertido + r.neta), 'num'));
        tr.appendChild(el('td', r.av.join(' ') || (r.ok ? '' : '—'), 'av'));
        Array.prototype.forEach.call(tr.children, function (td, i) { td.setAttribute('data-label', cols[i][0]); });
        tb.appendChild(tr);
        if (r.av.length) {
          var ar = el('tr', null, 'avrow' + (r.ok ? '' : ' no')), ac = el('td', r.av.join(' '));
          ac.colSpan = cols.length - 1; ar.appendChild(el('td')); ar.appendChild(ac); tb.appendChild(ar);
        }
      });
      t.appendChild(tb); out.appendChild(t);
      cuenta.textContent = elegibles.length + ' de ' + items.length + ' cumplen con tu monto y plazo' + (sel.value ? '.' : '; aquí se muestran las ' + Math.min(10, elegibles.length) + ' que más ganan.') + ' Estimación antes de comisiones; confirma condiciones con la entidad.';
    }
    ['monto', 'plazo', 'unidad', 'prod', 'isr'].forEach(function (k) {
      $(k).addEventListener(k === 'monto' || k === 'plazo' ? 'input' : 'change', render);
    });
    return render;
  }
  var calcs = [
    makeCalc('cf', 'fondos', itemsFondos, 'fondo'),
    makeCalc('cp', 'prod_puestos', itemsEstructurados, 'producto'),
    makeCalc('cb', 'bonos_estado', itemsBonos, 'bono')
  ];

  function renderRank() {
    var out = document.getElementById('rank-out'), d = dash.data('bonos_estado');
    out.replaceChildren();
    if (d.status !== 'ok') { out.appendChild(el('div', d.status === 'loading' ? '' : 'No se pudo cargar', 'muted')); return; }
    var hoy = hoyISO();
    var rows = d.data.filter(function (b) { return b.vencimiento >= hoy; })
      .sort(function (a, b) { return b.cupon - a.cupon || (a.vencimiento < b.vencimiento ? -1 : 1); });
    var max = d3.max(rows, function (b) { return b.cupon; }) || 1;
    var t = el('table', null, 'cards'), th = el('thead'), hr = el('tr');
    var cols = [['#', 'num c-rank'], ['Emisión', ''], ['Emisor', 'hide-sm'], ['Cupón', ''], ['Pago', 'hide-sm'], ['Vence', ''], ['Años al vencimiento', 'num hide-sm'], ['Inversión mínima', 'hide-sm']];
    cols.forEach(function (c) { var h = el('th', c[0], c[1]); h.style.cursor = 'default'; hr.appendChild(h); });
    th.appendChild(hr); t.appendChild(th);
    var tb = el('tbody');
    rows.forEach(function (b, k) {
      var tr = el('tr'); tr.dataset.key = b.id;
      tr.appendChild(el('td', '#' + (k + 1), 'num c-rank'));
      tr.appendChild(el('td', b.emision, 'nm'));
      tr.appendChild(el('td', b.emisor, 'nm hide-sm'));
      var td = el('td'), wrap = el('div', null, 'cell-bar'), bar = el('i', null, k < 3 ? 'top' : '');
      bar.style.width = Math.max(4, b.cupon / max * 96) + 'px';
      wrap.appendChild(bar); wrap.appendChild(el('span', fmtPct(b.cupon))); td.appendChild(wrap); tr.appendChild(td);
      tr.appendChild(el('td', b.pago, 'hide-sm'));
      tr.appendChild(el('td', fmtFecha(b.vencimiento)));
      tr.appendChild(el('td', d3.format('.1f')((Date.parse(b.vencimiento) - Date.parse(hoy)) / 864e5 / 365.25), 'num hide-sm'));
      var mn = /\d/.test(b.minimo) ? b.minimo : (/RD\$/.test(b.valor_unidad || '') ? b.valor_unidad + ' (una unidad)' : '—');
      tr.appendChild(el('td', mn, 'hide-sm'));
      Array.prototype.forEach.call(tr.children, function (td, i) { td.setAttribute('data-label', cols[i][0]); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); out.appendChild(t);
  }

  function showPage(id) {
    document.querySelectorAll('.fx .pg').forEach(function (p) { p.hidden = p.id !== id; });
    document.querySelectorAll('.fx .tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.pg === id ? 'true' : 'false'); });
    dash.setLink(id);
  }
  document.querySelectorAll('.fx .tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      var cambia = b.getAttribute('aria-selected') !== 'true';
      showPage(b.dataset.pg);
      if (cambia) window.scrollTo(0, 0);
    });
  });
  var h0 = location.hash.slice(1), pg0 = h0 ? document.getElementById(h0) : null;
  if (pg0 && pg0.classList.contains('pg')) showPage(h0);

  dash.onData(function () {
    fill('resumen'); fill('tpm'); fill('resumen_puestos'); fill('puestos'); fill('resumen_bonos');
    renderTop(); renderTable(); renderSalidas(); renderProd(); renderPuestos(); renderBonos(); renderRank(); calcs.forEach(function (c) { c(); });
  });
})();
