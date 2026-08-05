(function () {
  /* A modal freezes a headless renderer. Nothing here may reach one. */
  if (!window.__modalsStubbed) {
    window.__modalsStubbed = true;
    window.alert = function () {};
    window.confirm = function () { return true; };
    if (!window.prompt.__stub) { window.prompt = function () { return 'example.com'; }; window.prompt.__stub = 1; }
  }

  // The deck now opens in edit mode, so a suite must ensure the state it needs
  // rather than toggle blindly.
  function ensureEdit(){ if(!document.body.classList.contains('deck-edit-mode')){ var b=document.getElementById('editToggle'); if(b) b.click(); } }
  function ensureView(){ if(document.body.classList.contains('deck-edit-mode')){ var b=document.getElementById('btnDoneEdit'); if(b) b.click(); } }
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
  function all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function press(el) { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); }
  // The filmstrip renders cloned slides, so anything counting slides or fields
  // has to scope to the deck itself the way the runtime does.
  function deckSlides() { return all('.slides-offset > section.slide'); }
  function deckAll(s) { return all('.slides-offset ' + s); }

  function finish() {
    var pre = document.createElement('pre');
    pre.id = 'a2-test-out';
    pre.textContent = log.join('\n');
    document.body.appendChild(pre);
  }

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      ensureEdit();

      // --- roles ------------------------------------------------------------
      q('[data-insert="text"]').click();
      var obj = q('.slide-object.is-selected');
      ok('inserting selects the new object', !!obj);
      press(q('[data-role-set="title"]'));
      ok('role is recorded on the object', obj.getAttribute('data-role') === 'title');
      ok('the role button reflects it', q('[data-role-set="title"]').classList.contains('active'));
      press(q('[data-role-set="title"]'));
      ok('pressing the same role clears it', !obj.getAttribute('data-role'));
      press(q('[data-role-set="body"]'));
      q('#btnUndo').click();
      ok('role changes are undoable', !obj.getAttribute('data-role'));
      q('#btnRedo').click();
      ok('and redoable', obj.getAttribute('data-role') === 'body');

      // --- dynamic fields ---------------------------------------------------
      var seenFields = deckAll('[data-field]');
      var fieldsBefore = seenFields.length;
      press(q('[data-field-insert="page"]'));
      var field = deckAll('[data-field="page"]').filter(function (e) { return seenFields.indexOf(e) === -1; })[0];
      ok('a field was inserted', deckAll('[data-field]').length === fieldsBefore + 1);
      ok('the token is kept in the document', field && field.getAttribute('data-field') === 'page');
      ok('the resolved value is shown', field && field.textContent === '1');

      press(q('[data-field-insert="pages"]'));
      var total = deckAll('[data-field="pages"]').filter(function (e) { return seenFields.indexOf(e) === -1; }).pop() ||
                  deckAll('[data-field="pages"]').pop();
      ok('total-pages field resolves', total && total.textContent === String(deckSlides().length));

      // move to slide 2 and confirm the page number follows the slide
      var slides = deckSlides();
      var second = slides[1];
      var layer2 = q('.slide-edit-layer', second) || second;
      layer2.appendChild(field.closest('[data-slide-object]'));
      // re-resolving happens on the deck's own refresh; call the same path the
      // chrome uses by toggling edit mode off and on
      q('#btnDoneEdit').click();
      ensureEdit();
      ok('a page field renumbers when its slide changes', field.textContent === '2');

      // --- speaker notes ----------------------------------------------------
      var panel = q('#slideNotes');
      ok('the notes panel exists', !!panel);
      panel.value = 'Say the thing about revenue.';
      panel.dispatchEvent(new Event('input', { bubbles: true }));
      ok('notes land on the slide element',
        deckSlides().some(function (s) { return s.getAttribute('data-notes') === 'Say the thing about revenue.'; }));

      // --- export ------------------------------------------------------------
      var captured = null;
      var realCreate = URL.createObjectURL;
      URL.createObjectURL = function (blob) {
        var r = new FileReader();
        r.onload = function () { checkExport(r.result); finish(); };
        r.readAsText(blob);
        captured = true;
        return 'blob:stub';
      };
      var realClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {};
      delete window.showSaveFilePicker;  // force the download path
      q('#btnSaveCopy').click();
      HTMLAnchorElement.prototype.click = realClick;
      URL.createObjectURL = realCreate;
      setTimeout(function () { if (!captured) { ok('export produced a file', false); finish(); } }, 600);
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }

  function checkExport(html) {
    var d = new DOMParser().parseFromString(html, 'text/html');
    ok('export keeps notes on the slide', d.querySelectorAll('.slides-offset > section.slide[data-notes]').length >= 1);
    ok('export keeps the field token', d.querySelectorAll('.slides-offset [data-field="page"]').length >= 1);
    ok('export keeps the role', d.querySelectorAll('.slides-offset [data-role="body"]').length >= 1);
    ok('export leaves nothing editable', d.querySelectorAll('[contenteditable="true"]').length === 0);
    ok('export has no notes panel duplicate state',
      (d.querySelector('#slideNotes') || { value: '' }).value === '');
  }
})();
