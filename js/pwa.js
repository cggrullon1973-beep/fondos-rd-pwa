/* Instalación, estado sin conexión, fecha de los datos y service worker. */
(function () {
  var btn = document.getElementById('btn-instalar'), diferido = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); diferido = e; btn.hidden = false; });
  btn.addEventListener('click', function () {
    if (!diferido) return;
    diferido.prompt();
    diferido.userChoice.finally(function () { diferido = null; btn.hidden = true; });
  });
  window.addEventListener('appinstalled', function () { btn.hidden = true; });

  var off = document.getElementById('offline');
  function red() { off.hidden = navigator.onLine; }
  window.addEventListener('online', function () { red(); if (window.__cargarDatos) window.__cargarDatos(); });
  window.addEventListener('offline', red); red();

  var upd = document.getElementById('upd');
  dash.onData(function () {
    var m = dash.data('meta'), f = dash.data('fondos');
    var iso = m.status === 'ok' && m.data && m.data.actualizado ? m.data.actualizado : (f.status === 'ok' && f.data[0] ? f.data[0].fecha : null);
    if (!iso) { upd.textContent = (m.status === 'loading' || f.status === 'loading') ? 'Cargando datos…' : 'No se pudieron cargar los datos.'; return; }
    var d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
    var tz = { timeZone: 'America/Santo_Domingo' };
    var txt = d.toLocaleDateString('es-DO', Object.assign({ day: 'numeric', month: 'long', year: 'numeric' }, tz));
    if (iso.length > 10) txt += ', ' + d.toLocaleTimeString('es-DO', Object.assign({ hour: 'numeric', minute: '2-digit' }, tz)).replace(/\.$/, '');
    upd.textContent = 'Datos de Rexi al ' + txt + '. Se actualizan cada mañana.';
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW', e); }); });
  }
})();
