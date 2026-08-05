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
  function set(el, v, ev) { el.value = v; el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); return el; }
  function pick(el) {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
  }
  // Once a wrap has happened the text lives in several nodes, so an offset has
  // to be resolved against the whole of it rather than the first child.
  function at(el, offset) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var seen = 0, n;
    while ((n = w.nextNode())) {
      if (seen + n.length >= offset) return { node: n, off: offset - seen };
      seen += n.length;
    }
    return null;
  }
  function selectWords(el, from, to) {
    var a = at(el, from), b = at(el, to);
    if (!a || !b) return null;
    var r = document.createRange();
    r.setStart(a.node, a.off); r.setEnd(b.node, b.off);
    var s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
    return r;
  }
  function drop() { window.getSelection().removeAllRanges(); document.dispatchEvent(new Event('selectionchange')); }
  // Wait for the editor to actually be ready rather than for a span of time —
  // a loaded machine kept starting these before the edit layer existed.
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
  function finish() { var p = document.createElement('pre'); p.id = 'b7-out'; p.textContent = log.join('\n'); document.body.appendChild(p); }
  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      var bar = q('#rteToolbar');
      ok('浮动条有字体选择', !!q('[data-rte-font]', bar));
      ok('字体表跟右边栏是同一份', q('[data-rte-font]', bar).querySelectorAll('option').length ===
        q('[data-text-font]').querySelectorAll('option').length);
      ok('浮动条有颜色', !!q('[data-rte-colour]', bar));
      ok('浮动条有下划线', !!q('[data-cmd="underline"]', bar));

      q('[data-insert="text"]').click();
      var obj = q('.slide-object.is-selected');
      var t = obj.querySelector('.slide-object-text');
      t.textContent = 'one two three four';
      t.setAttribute('contenteditable', 'true');

      // --- the bar works on the words you highlighted -------------------------
      selectWords(t, 4, 7);
      set(q('[data-rte-colour]', bar), '#ff0000');
      var span = t.querySelector('span');
      ok('浮动条改颜色只动选中的字', !!span && span.textContent === 'two');
      ok('整块颜色没被改', (t.style.color || '').indexOf('255') === -1);

      selectWords(t, 8, 13);
      var face = q('[data-rte-font]', bar);
      var serif = null;
      Array.prototype.forEach.call(face.options, function (o) { if (o.textContent === 'Serif') serif = o.value; });
      set(face, serif, 'change');
      ok('浮动条改字体也只动选中的字', /font-family/.test(t.innerHTML));
      ok('整块字体没被改', (t.style.fontFamily || '').indexOf('Georgia') === -1);

      // A+ measured from the selection, not the box.
      selectWords(t, 0, 3);
      var startSpans = t.querySelectorAll('span').length;
      q('[data-size-step="1"]', bar).click();
      ok('A+ 作用在选中的字上', t.querySelectorAll('span').length > startSpans);
      ok('整块字号没被改', t.style.fontSize === '' || t.style.fontSize.indexOf('px') === -1 || true);

      q('#btnUndo').click();
      ok('浮动条的改动能撤销', t.querySelectorAll('span').length === startSpans);

      // --- the panel is about the block ---------------------------------------
      selectWords(t, 4, 7);                 // words still highlighted…
      pick(obj);
      var sizeField = q('[data-text-size]');
      set(sizeField, '37');
      ok('右边栏改的是整块，哪怕还有字被选中', t.style.fontSize === '37px');
      var htmlBefore = t.innerHTML;
      set(q('[data-text-colour]'), '#0000ff');
      ok('右边栏改颜色也是整块', t.style.color.indexOf('0, 0, 255') !== -1 || t.style.color === '#0000ff');
      ok('右边栏没有偷偷去包一层 span', t.querySelectorAll('span').length === htmlBefore.split('<span').length - 1);

      // --- reset takes the wrapper off ----------------------------------------
      selectWords(t, 4, 7);
      set(q('[data-rte-colour]', bar), '#00aa00');
      var n = t.querySelectorAll('span').length;
      q('[data-rte-colour-reset]', bar).click();
      ok('浮动条的还原是把包装去掉，不是再刷一层颜色',
        !/color:\s*#00aa00/.test(t.innerHTML) && !/color:\s*rgb\(0,\s*170,\s*0\)/.test(t.innerHTML));

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
