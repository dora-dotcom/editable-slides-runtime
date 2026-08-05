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
  function key(k) { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); }
  function shown(el) { return !!el && getComputedStyle(el).display !== 'none'; }

  // A stand-in for the speaker window: a real document we can inspect, so the
  // painting code is exercised without opening anything.
  var fake = null;
  var realOpen = window.open;
  window.open = function () {
    var host = document.createElement('iframe');
    host.style.cssText = 'position:absolute;left:-99999px;width:800px;height:600px';
    document.body.appendChild(host);
    fake = {
      closed: false,
      document: host.contentDocument,
      focus: function () {},
    };
    return fake;
  };

  function finish() {
    window.open = realOpen;
    var pre = document.createElement('pre');
    pre.id = 'a4-test-out';
    pre.textContent = log.join('\n');
    document.body.appendChild(pre);
  }

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      var slides = all('.slides-offset > section.slide');
      ok('deck has slides', slides.length >= 2);
      ensureView(); // presenting starts from a deck you are reading, not editing
      slides[0].setAttribute('data-notes', 'Open with the revenue number.');

      // --- not framed, so the runtime keeps its chrome ----------------------
      ok('a top-level deck does not stand down',
        !document.documentElement.classList.contains('deck-stood-down'));
      ok('the edit chrome is present', !!q('#editToggle'));

      // --- present mode ------------------------------------------------------
      ok('the present bar starts hidden', !shown(q('.deck-present-bar')));
      key('p');
      ok('P starts presenting', document.body.classList.contains('deck-presenting'));
      ok('the present bar appears', shown(q('.deck-present-bar')));
      ok('the editor chrome goes away', !shown(q('.deck-left-hover-anchor')));
      ok('the pages sidebar goes away', !shown(q('.slide-sidebar')));
      ok('the bar counts the deck', /^1 \/ \d+$/.test(q('#deckPresentCount').textContent.trim()));

      q('[data-present="next"]').click();
      ok('the bar follows navigation', q('#deckPresentCount').textContent.trim().indexOf('2 /') === 0);

      // --- speaker window ----------------------------------------------------
      key('s');
      ok('the speaker window opened', !!fake);
      var d = fake.document;
      ok('it shows a slide count', /\d+ \/ \d+/.test(q('.sv-count', d).textContent));
      ok('it has a timer', !!q('.sv-timer', d));
      ok('it has navigation', all('[data-nav]', d).length === 2);

      q('[data-present="prev"]').click();
      ok('it follows the deck back to slide 1', q('.sv-count', d).textContent.indexOf('1 /') === 0);
      ok('it shows that slide\'s notes',
        q('.sv-notes', d).textContent.indexOf('Open with the revenue number') !== -1);

      q('[data-nav="next"]', d).click();
      ok('its own controls page the deck', q('#deckPresentCount').textContent.trim().indexOf('2 /') === 0);
      ok('and the notes follow', q('.sv-notes', d).classList.contains('sv-empty'));

      // --- exit ---------------------------------------------------------------
      key('Escape');
      ok('Escape exits presenting', !document.body.classList.contains('deck-presenting'));
      ok('the chrome comes back', shown(q('.deck-left-hover-anchor')));

      // --- presenting and editing do not overlap ------------------------------
      ensureEdit();
      ok('edit mode is on', document.body.classList.contains('deck-edit-mode'));
      key('p');
      ok('P does not start presenting while editing',
        !document.body.classList.contains('deck-presenting'));

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
