(function () {
  /* A modal freezes a headless renderer. Nothing here may reach one. */
  if (!window.__modalsStubbed) {
    window.__modalsStubbed = true;
    window.alert = function () {};
    window.confirm = function () { return true; };
    if (!window.prompt.__stub) { window.prompt = function () { return 'example.com'; }; window.prompt.__stub = 1; }
  }

  function ensureEdit(){ if(!document.body.classList.contains('deck-edit-mode')){ var b=document.getElementById('editToggle'); if(b) b.click(); } }
  // This suite is about the automatic browser copy. Writing the file opens a
  // real picker, which a headless renderer waits on forever, so stand it in.
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
  function ok(n, c) { log.push((c ? 'PASS  ' : 'FAIL  ') + n); return !!c; }
  function q(s, r) { return (r || document).querySelector(s); }
  function key(k, mods) {
    var e = { key: k, bubbles: true };
    if (mods) for (var m in mods) e[m] = mods[m];
    document.dispatchEvent(new KeyboardEvent('keydown', e));
  }
  function stored() {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      var v = localStorage.getItem(k);
      if (v && v.indexOf('deckHtml') !== -1) return v;
    }
    return null;
  }
  function finish() {
    var pre = document.createElement('pre');
    pre.id = 'save-test-out';
    pre.textContent = log.join('\n');
    document.body.appendChild(pre);
  }

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      localStorage.clear();
      ensureEdit();

      ok('存盘按钮已经不在了', !document.getElementById('btnSave'));
      ok('Pages 按钮已经不在了', !document.getElementById('pagesToggle'));
      ok('但页面栏自己是开着的', document.body.classList.contains('deck-sidebar-open'));

      ok('还没编辑时浏览器里没有存档', !stored());

      // An edit that goes through the history stack.
      q('[data-insert="text"]').click();
      var note = document.getElementById('deckSaveNote');
      ok('有一个存盘提示位', !!note);
      ok('存盘是延后的，不是每个动作都写一次', !stored());

      setTimeout(function () {
        try {
          var saved = stored();
          ok('等一下之后自动存了', !!saved);
          ok('存的是这份 deck 的内容', !!saved && saved.indexOf('slide') !== -1);
          ok('存完给了提示', note.classList.contains('is-on'));

          // Typing does not go through history, so it is watched separately.
          localStorage.clear();
          var t = q('.slides-offset .slide-object-text');
          if (t) {
            t.setAttribute('contenteditable', 'true');
            t.textContent = 'typed';
            t.dispatchEvent(new Event('input', { bubbles: true }));
          }
          ok('打字也会排队等着存', !stored());

          setTimeout(function () {
            try {
              ok('打字过一会儿也自动存了', !!stored());

              // Ctrl/Cmd+S still works — it just writes now instead of being
              // the only way anything ever got written.
              localStorage.clear();
              q('[data-insert="text"]').click();
              key('s', { metaKey: true });
              ok('Cmd+S 立刻写，不用等', !!stored());

              finish();
            } catch (e) { log.push('ERROR ' + e.message); finish(); }
          }, 1300);
        } catch (e) { log.push('ERROR ' + e.message); finish(); }
      }, 1300);
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
