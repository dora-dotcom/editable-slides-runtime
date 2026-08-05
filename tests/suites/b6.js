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
  function set(sel, v, ev) { var el = q(sel); el.value = v; el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); return el; }
  function pick(el, mods) {
    var o = { bubbles: true, cancelable: true };
    if (mods) for (var k in mods) o[k] = mods[k];
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
  }
  function cmd(k, extra) {
    var o = { key: k, metaKey: true, bubbles: true, cancelable: true };
    if (extra) for (var x in extra) o[x] = extra[x];
    document.dispatchEvent(new KeyboardEvent('keydown', o));
  }
  // Select some words inside a text object, the way a person drags across them.
  function selectWords(el, from, to) {
    var node = el.firstChild;
    while (node && node.nodeType !== 3) node = node.firstChild;
    if (!node) return null;
    var r = document.createRange();
    r.setStart(node, from); r.setEnd(node, Math.min(to, node.length));
    var s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
    return r;
  }
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
  function finish() { var p = document.createElement('pre'); p.id = 'b6-out'; p.textContent = log.join('\n'); document.body.appendChild(p); }
  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      // --- Save sits at the end of the bar -------------------------------------
      var trail = all('.deck-bar-trail > *');
      // Save now sits in a wrapper with its ▾, so the last thing in the row is
      // that pair rather than the button itself.
      var last = trail[trail.length - 1];
      ok('Save 在最右边', last.id === 'btnSaveFile' ||
        (!!last.querySelector && !!last.querySelector('#btnSaveFile')));

      // --- styling part of a paragraph -----------------------------------------
      q('[data-insert="text"]').click();
      var obj = q('.slide-object.is-selected');
      var t = obj.querySelector('.slide-object-text');
      t.textContent = 'one two three four';
      t.setAttribute('contenteditable', 'true');

      // The panel is about the block, even while words are highlighted — the
      // bar over the selection is what dresses the selection. (b7 covers that.)
      selectWords(t, 4, 7);
      set('[data-text-colour]', '#ff0000');
      ok('右边栏改的是整块', t.style.color.indexOf('255, 0, 0') !== -1 || t.style.color === '#ff0000');
      ok('右边栏不会去包一层 span', !t.querySelector('span'));

      set('[data-text-size]', '44');
      ok('右边栏改字号也是整块', t.style.fontSize === '44px');

      q('#btnUndo').click();
      ok('整块的改动能撤销', t.style.fontSize !== '44px');

      window.getSelection().removeAllRanges();
      document.dispatchEvent(new Event('selectionchange'));
      pick(obj);
      set('[data-text-size]', '31');
      ok('没有选中文字时当然也是整块', t.style.fontSize === '31px');

      // --- copy and paste an object --------------------------------------------
      var slide = all('.slides-offset > section.slide')[0];
      var layer = slide.querySelector('.slide-edit-layer') || slide;
      var before = all('[data-slide-object]', layer).length;
      pick(obj);
      cmd('c');
      cmd('v');
      var after = all('[data-slide-object]', layer).length;
      ok('复制粘贴多出来一个', after === before + 1);
      var copies = all('[data-slide-object]', layer);
      var made = copies[copies.length - 1];
      ok('粘出来的是选中状态', made.classList.contains('is-selected'));
      ok('粘出来的没有压在原件上', made.style.left !== obj.style.left);
      ok('粘出来的换了个 id，不然同一页两个会互相 morph',
        made.getAttribute('data-oid') !== obj.getAttribute('data-oid'));
      q('#btnUndo').click();
      ok('粘贴能撤销', all('[data-slide-object]', layer).length === before);

      // Duplicate is the same thing in one keystroke.
      pick(obj);
      cmd('d');
      ok('Cmd+D 直接复制一份', all('[data-slide-object]', layer).length === before + 1);

      // Cut removes it and keeps it for pasting.
      var victim = q('.slide-object.is-selected');
      cmd('x');
      ok('剪切把它拿走了', !victim.isConnected);
      cmd('v');
      ok('剪切之后还粘得回来', all('[data-slide-object]', layer).length === before + 1);

      // Multiple objects at once.
      var a = all('[data-slide-object]', layer)[0];
      var b = all('[data-slide-object]', layer)[1];
      pick(a); pick(b, { shiftKey: true });
      var n0 = all('[data-slide-object]', layer).length;
      cmd('c'); cmd('v');
      ok('两个一起复制粘贴', all('[data-slide-object]', layer).length === n0 + 2);

      // --- copy a whole slide ---------------------------------------------------
      var slides0 = all('.slides-offset > section.slide').length;
      document.body.click();               // drop the selection
      editorClear();
      cmd('c');
      cmd('v');
      ok('没选中东西时复制的是整页', all('.slides-offset > section.slide').length === slides0 + 1);

      // --- typing must not lose these keys --------------------------------------
      var t2 = q('.slides-offset .slide-object-text[contenteditable="true"]');
      if (t2) {
        var ev = new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'target', { value: t2 });
        var n1 = all('.slides-offset > section.slide').length;
        t2.dispatchEvent(ev);
        ok('在文字里按 Cmd+C 不会去复制整页', all('.slides-offset > section.slide').length === n1);
      }

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
  function editorClear() {
    all('.slide-object.is-selected').forEach(function (el) {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ctrlKey: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, ctrlKey: true }));
    });
  }
})();
