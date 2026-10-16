/* Reemplaza la API del tablero: carga data/*.json, calcula los resúmenes y avisa a la página. */
(function () {
  var FILES = { fondos: 'data/fondos.json', fondos_prev: 'data/fondos_prev.json', tpm: 'data/tpm.json',
    puestos: 'data/puestos.json', prod_puestos: 'data/prod_puestos.json', bonos_estado: 'data/bonos_estado.json', meta: 'data/meta.json' };
  var store = {}, calcs = {}, listeners = [];
  Object.keys(FILES).forEach(function (k) { store[k] = { status: 'loading', data: [] }; });

  function fmt(spec) {
    var m = String(spec).match(/^(,)?(?:\.(\d+)f)?$/);
    var group = m && !!m[1], dec = m && m[2] != null ? Number(m[2]) : 0;
    return function (v) {
      var n = Number(v);
      if (!isFinite(n)) return '';
      return n.toLocaleString('en-US', { useGrouping: group, minimumFractionDigits: dec, maximumFractionDigits: dec });
    };
  }
  window.d3 = {
    format: fmt,
    max: function (arr, f) { var r; (arr || []).forEach(function (x) { var v = f ? f(x) : x; if (v != null && (r == null || v > r)) r = v; }); return r; }
  };

  window.dash = {
    data: function (id) {
      var c = calcs[id];
      if (c) {
        var ins = c.inputs.map(function (i) { return window.dash.data(i); });
        var bad = ins.filter(function (x) { return x.status !== 'ok'; })[0];
        if (bad) return { status: bad.status, data: [] };
        try { return { status: 'ok', data: c.fn.apply(null, ins.map(function (x) { return x.data; })) }; }
        catch (e) { console.error(e); return { status: 'error', data: [], message: String(e) }; }
      }
      return store[id] || { status: 'missing', data: [] };
    },
    calc: function (id, def) { calcs[id] = def; },
    onData: function (fn) { listeners.push(fn); try { fn(); } catch (e) { console.error(e); } },
    colors: ['var(--series-1)', 'var(--series-2)'],
    setLink: function (name) { try { history.replaceState(null, '', '#' + name); } catch (e) {} },
    refresh: load
  };

  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }

  function load() {
    return Promise.all(Object.keys(FILES).map(function (k) {
      return fetch(FILES[k], { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) { store[k] = { status: 'ok', data: d }; })
        .catch(function (e) { store[k] = { status: 'error', data: [], message: String(e) }; });
    })).then(emit);
  }
  window.__cargarDatos = load;
  load();
})();
