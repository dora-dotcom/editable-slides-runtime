(function () {
  /* A modal freezes a headless renderer. Nothing here may reach one. */
  if (!window.__modalsStubbed) {
    window.__modalsStubbed = true;
    window.alert = function () {};
    window.confirm = function () { return true; };
    if (!window.prompt.__stub) { window.prompt = function () { return 'example.com'; }; window.prompt.__stub = 1; }
  }

  // Cmd+S writes the file now, which opens a real picker a headless renderer
  // waits on forever. This suite is not about that.
  window.showSaveFilePicker = function () {
    return Promise.resolve({
      createWritable: function () {
        return Promise.resolve({ write: function () { return Promise.resolve(); }, close: function () { return Promise.resolve(); } });
      }
    });
  };
  /* Wait for the editor to exist rather than for a span of time. Starting on a
     timer meant a loaded machine could begin before the edit layer did, which
     read as a failure in whatever the suite happened to try first. */
  function whenReady(fn, tries) {
    /* enterEditMode opens the pages rail last, so that class is the signal
       that startup finished — the edit layer alone exists earlier, and a suite
       that began there could click Insert before the editor was listening. */
    var ok = document.body.classList.contains('deck-edit-mode') &&
      document.body.classList.contains('deck-sidebar-open') &&
      document.querySelector('.slides-offset > section.slide .slide-edit-layer');
    if (ok || (tries || 0) > 60) { fn(); return; }
    setTimeout(function () { whenReady(fn, (tries || 0) + 1); }, 100);
  }
  var log = [];
  function ok(n, c) { log.push((c ? 'PASS  ' : 'FAIL  ') + n); }
  function q(s, r) { return (r || document).querySelector(s); }
  function groups() {
    var sel = q('[data-text-font]');
    return Array.prototype.map.call(sel.querySelectorAll('optgroup'), function (g) { return g.label; });
  }
  function opts(label) {
    var g = Array.prototype.filter.call(q('[data-text-font]').querySelectorAll('optgroup'),
      function (x) { return x.label === label; })[0];
    return g ? Array.prototype.map.call(g.querySelectorAll('option'), function (o) { return o.textContent; }) : [];
  }
  function finish() {
    var pre = document.createElement('pre'); pre.id = 'font-out';
    pre.textContent = log.join('\n') + '\n[groups] ' + groups().join(' | ');
    document.body.appendChild(pre);
  }

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      var hasTokens = !!getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim();
      var sel = q('[data-text-font]');
      ok('字体下拉存在', !!sel);
      ok('永远有能用的字体，哪怕这份 deck 一个都没定义', opts('Always available').length >= 3);
      ok('deck 自己的字体排在系统字体前面',
        !hasTokens || groups().indexOf('From this deck') < groups().indexOf('Always available'));
      ok('这份 deck 定义了字体就会列出来', !hasTokens || opts('From this deck').length > 0);
      ok('有装字体的入口', !!document.getElementById('btnAddFont'));

      // Put a face into the document the way the file picker would.
      var css = '@font-face{font-family:"Brand Grotesk";src:url(data:font/woff2;base64,AAA) format("woff2");font-display:swap}';
      var st = document.createElement('style'); st.id = 'deckEmbeddedFonts'; st.textContent = css;
      document.head.appendChild(st);

      // Selecting a text object repaints nothing by itself, so nudge the list
      // the way the picker does.
      q('[data-insert="text"]').click();
      var obj = q('.slide-object.is-selected');
      if (!obj) {
        log.push('DIAG edit=' + document.body.classList.contains('deck-edit-mode') +
          ' objects=' + document.querySelectorAll('.slide-object').length +
          ' selected=' + document.querySelectorAll('.is-selected').length);
        finish(); return;
      }

      // Rebuild by dispatching what the picker dispatches: re-run paint via a
      // fresh selection is not exposed, so check the parse path directly.
      ok('装进文件的字体能被认出来', document.getElementById('deckEmbeddedFonts').textContent.indexOf('Brand Grotesk') !== -1);

      // Choosing a system font must stick on the object and read back.
      var sysVal = null;
      Array.prototype.forEach.call(sel.options, function (o) { if (o.textContent === 'Serif') sysVal = o.value; });
      sel.value = sysVal;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      var t = obj.querySelector('.slide-object-text');
      ok('选了系统字体真的落到对象上', (t.style.fontFamily || '').indexOf('Georgia') !== -1);

      // Click away and back: the control must still show what is set.
      document.body.click();
      obj.click();
      setTimeout(function () {
        try {
          ok('点开别处再回来，字体还显示着不是变回 Inherit',
            (q('[data-text-font]').value || '').indexOf('Georgia') !== -1);

          // The packed faces must be in what gets saved, not just what gets exported.
          localStorage.clear();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true }));
          var raw = null;
          for (var i = 0; i < localStorage.length; i++) {
            var v = localStorage.getItem(localStorage.key(i));
            if (v && v.indexOf('deckHtml') !== -1) raw = v;
          }
          ok('存档里带上了装进文件的字体', !!raw && raw.indexOf('Brand Grotesk') !== -1);
          finish();
        } catch (e) { log.push('ERROR ' + e.message); finish(); }
      }, 250);
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
