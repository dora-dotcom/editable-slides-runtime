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
  function deckSlides() { return all('.slides-offset > section.slide'); }

  // Animations cannot be timed reliably under virtual time, so watch the call
  // instead of the result: the logic is what is under test.
  var calls = [];
  var realAnimate = Element.prototype.animate;
  Element.prototype.animate = function (frames, opts) {
    calls.push({ el: this, frames: frames, opts: opts });
    return realAnimate.call(this, frames, { duration: 0 });
  };

  function finish() {
    var pre = document.createElement('pre');
    pre.id = 'a3-test-out';
    pre.textContent = log.join('\n');
    document.body.appendChild(pre);
  }

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      var slides = deckSlides();
      ok('deck has at least two slides', slides.length >= 2);

      ensureEdit();

      // --- an object that exists on both slides, in different places --------
      q('[data-insert="text"]').click();
      var first = q('.slide-object.is-selected');
      first.setAttribute('data-oid', 'twin');
      first.style.cssText = 'left:6%;top:12%;width:40%;height:12%;';
      var layer2 = q('.slide-edit-layer', slides[1]) || slides[1];
      var second = first.cloneNode(true);
      second.style.cssText = 'left:52%;top:70%;width:40%;height:12%;';
      layer2.appendChild(second);
      ok('the same oid now appears on both slides',
        slides[0].querySelector('[data-oid="twin"]') && slides[1].querySelector('[data-oid="twin"]'));

      // --- motion controls ---------------------------------------------------
      var sel = q('[data-fx-enter-set]');
      ok('the entrance control exists', !!sel);
      sel.value = 'fade-up';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      ok('entrance is recorded on the object', first.getAttribute('data-fx-enter') === 'fade-up');
      q('#btnUndo').click();
      ok('entrance is undoable', !first.getAttribute('data-fx-enter'));
      q('#btnRedo').click();
      ok('and redoable', first.getAttribute('data-fx-enter') === 'fade-up');

      var cnt = q('[data-fx-countup-toggle]');
      press(cnt);
      ok('count-up toggles on', first.getAttribute('data-fx-countup') === 'true');
      ok('the button reflects it', cnt.classList.contains('active'));
      press(cnt);
      ok('and toggles off', !first.hasAttribute('data-fx-countup'));

      // --- motion is suppressed while editing --------------------------------
      calls.length = 0;
      var strip = all('.filmstrip-item');
      if (strip[1]) strip[1].click();
      ok('no motion runs in edit mode', calls.length === 0);

      // --- morph on navigation ----------------------------------------------
      q('#btnDoneEdit').click();
      calls.length = 0;
      if (strip[0]) strip[0].click();
      if (strip[1]) strip[1].click();

      var morphs = calls.filter(function (c) {
        return c.el.getAttribute && c.el.getAttribute('data-oid') === 'twin' &&
          c.frames && c.frames[0] && String(c.frames[0].transform).indexOf('translate') === 0;
      });
      ok('the twin object morphs on arrival', morphs.length >= 1);
      if (morphs.length) {
        var f = morphs[morphs.length - 1].frames;
        ok('it starts at the other slide\'s box', /translate\(-?[\d.]+px,-?[\d.]+px\)/.test(f[0].transform.replace(/\s/g, '')));
        ok('and ends at its own', f[1].transform === 'none');
        ok('morph transforms from the top-left corner', f[0].transformOrigin === 'top left');
      }

      // --- entrances ----------------------------------------------------------
      var entrances = calls.filter(function (c) {
        return c.opts && c.opts.fill === 'backwards';
      });
      ok('the entrance animation runs on arrival', entrances.length >= 1);

      // --- media --------------------------------------------------------------
      ok('a media input exists', !!q('#deckMediaInput'));
      ok('the media input accepts video and audio',
        /video/.test(q('#deckMediaInput').accept) && /audio/.test(q('#deckMediaInput').accept));
      ok('a media insert button exists', !!q('[data-insert="media"]'));

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
