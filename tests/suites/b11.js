(function () {
  /* A modal freezes a headless renderer. Nothing here may reach one. */
  if (!window.__modalsStubbed) {
    window.__modalsStubbed = true;
    window.alert = function () {};
    window.confirm = function () { return true; };
    if (!window.prompt.__stub) { window.prompt = function () { return 'example.com'; }; window.prompt.__stub = 1; }
  }

  var log = [];
  function ok(n, c) { log.push((c ? 'PASS  ' : 'FAIL  ') + n); }
  function q(s, r) { return (r || document).querySelector(s); }
  function all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function pick(el) {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
  }
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
  function finish() { var p = document.createElement('pre'); p.id = 'b11-out'; p.textContent = log.join('\n'); document.body.appendChild(p); }
  function objectsOn(sec) { return all('[data-slide-object]', sec).length; }
  // offsetTop is measured against the offsetParent, which is not the scroller
  // here — take the position from where the two boxes actually are.
  function scrollTo(canvas, sec) {
    canvas.scrollTop += sec.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
    canvas.dispatchEvent(new Event('scroll'));
  }
  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      var slides = all('.slides-offset > section.slide');
      ok('deck 至少有两页', slides.length >= 2);
      var second = slides[1];

      // --- clicking a slide makes it the one you are working on ----------------
      var before = objectsOn(second);
      pick(second);
      q('[data-insert="text"]').click();
      ok('点了第二页再插入，东西落在第二页', objectsOn(second) === before + 1);
      ok('没有落到第一页', objectsOn(slides[0]) === all('[data-slide-object]', slides[0]).length);

      var b2 = objectsOn(second);
      q('[data-shape="rect"]').click();
      ok('形状也落在第二页', objectsOn(second) === b2 + 1);
      var b3 = objectsOn(second);
      q('[data-insert="table"]').click();
      ok('表格也落在第二页', objectsOn(second) === b3 + 1);
      var b4 = objectsOn(second);
      q('[data-insert="chart"]').click();
      ok('图表也落在第二页', objectsOn(second) === b4 + 1);

      // --- the panel describes the slide you are on ----------------------------
      pick(second);
      var pos = q('#slidePos');
      ok('右边栏说的是第二页', /Slide 2\b/.test(pos.textContent));

      // --- scrolling the canvas changes which slide you are on ------------------
      var canvas = q('.slides-offset');
      pick(slides[0]);
      var first = objectsOn(slides[0]);
      scrollTo(canvas, second);
      setTimeout(function () {
        try {
          ok('滚到第二页之后，右边栏跟着变', /Slide 2\b/.test(q('#slidePos').textContent));
          var s2 = objectsOn(second);
          q('[data-insert="text"]').click();
          ok('滚过去再插入，也落在第二页', objectsOn(second) === s2 + 1);
          ok('第一页没有被塞东西', objectsOn(slides[0]) === first);

          // Typing notes must not be wiped by a scroll refreshing the panel.
          var notes = q('[data-notes-input]') || q('#slideNotes') || q('.deck-inspector textarea');
          if (notes) {
            notes.focus();
            notes.value = 'half a sentence';
            scrollTo(canvas, slides[0]);
            setTimeout(function () {
              ok('滚动不会把正在打的备注冲掉', notes.value === 'half a sentence');
              finish();
            }, 200);
          } else { finish(); }
        } catch (e) { log.push('ERROR ' + e.message); finish(); }
      }, 200);
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
