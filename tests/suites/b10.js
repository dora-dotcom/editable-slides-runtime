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
  function keyOn(el, k, mods) {
    var o = { key: k, bubbles: true, cancelable: true };
    if (mods) for (var m in mods) o[m] = mods[m];
    el.dispatchEvent(new KeyboardEvent('keydown', o));
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
  function finish() { var p = document.createElement('pre'); p.id = 'b10-out'; p.textContent = log.join('\n'); document.body.appendChild(p); }
  window.addEventListener('load', function () { whenReady(run); });
  function selectAllIn(el) {
    el.setAttribute('contenteditable', 'true');
    el.focus();
    var r = document.createRange();
    r.selectNodeContents(el);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
    return r;
  }

  function run() {
    try {
      // --- Backspace in a panel field must not delete the object ---------------
      q('[data-insert="text"]').click();
      var obj = q('.slide-object.is-selected');
      var t = obj.querySelector('.slide-object-text');
      var field = q('[data-text-size]');
      field.focus();
      keyOn(field, 'Backspace');
      ok('在字号框里按退格，文字框还在', obj.isConnected);
      keyOn(field, 'Delete');
      ok('按 Delete 也还在', obj.isConnected);
      // …but Delete with the object selected and focus on the deck still deletes.
      t.blur(); document.body.focus();
      var before = all('[data-slide-object]').length;
      keyOn(document.body, 'Delete');
      ok('焦点不在输入框时 Delete 照常删除', all('[data-slide-object]').length === before - 1);

      // --- arrows in a field move the caret, not the deck ----------------------
      q('[data-insert="text"]').click();
      var obj2 = q('.slide-object.is-selected');
      var f2 = q('[data-text-size]');
      f2.focus();
      var slideBefore = document.documentElement.getAttribute('data-slide-index');
      keyOn(f2, 'ArrowDown');
      ok('在输入框里按方向键不会翻页',
        document.documentElement.getAttribute('data-slide-index') === slideBefore);

      // --- emptying the size field gives the design's size back ----------------
      var t2 = obj2.querySelector('.slide-object-text');
      f2.value = '48'; f2.dispatchEvent(new Event('input', { bubbles: true }));
      ok('输入字号生效', t2.style.fontSize === '48px');
      f2.value = ''; f2.dispatchEvent(new Event('input', { bubbles: true }));
      ok('删到一半（空的）什么都不做，不会把文字弄没', t2.style.fontSize === '48px' && t2.isConnected);
      f2.dispatchEvent(new Event('change', { bubbles: true }));
      ok('确认清空后回到设计自己的字号', !t2.style.fontSize);
      ok('文字框还在', obj2.isConnected && t2.isConnected);

      // --- out of range is brought back in ------------------------------------
      f2.value = '9999'; f2.dispatchEvent(new Event('input', { bubbles: true }));
      ok('超大的数字被收回上限', parseFloat(t2.style.fontSize) <= 400);
      f2.value = '-40'; f2.dispatchEvent(new Event('input', { bubbles: true }));
      ok('负数被收回下限', parseFloat(t2.style.fontSize) >= 6);

      // --- A+ can be pressed over and over ------------------------------------
      t2.textContent = 'grow me';
      selectAllIn(t2);
      var plus = q('[data-size-step="1"]');
      var sizes = [];
      for (var i = 0; i < 6; i++) {
        plus.click();
        var sp = t2.querySelector('span');
        sizes.push(sp ? parseFloat(sp.style.fontSize) : NaN);
      }
      ok('连按 A+ 每次都真的变大', sizes.every(function (v, i) { return i === 0 || v > sizes[i - 1]; }));
      ok('六次之后没有堆出六层 span', t2.querySelectorAll('span span').length === 0);

      var minus = q('[data-size-step="-1"]');
      for (var j = 0; j < 200; j++) minus.click();
      var sp2 = t2.querySelector('span');
      ok('一直按 A− 会停在能看清的下限', sp2 && parseFloat(sp2.style.fontSize) >= 6);
      ok('字还在', t2.textContent === 'grow me');

      // --- a table cell is one text element of many -----------------------------
      q('[data-insert="table"]').click();
      var tobj = q('.slide-object.is-selected');
      var cells = all('th, td', tobj);
      cells[0].textContent = 'first';
      cells[2].textContent = 'third';
      var third = cells[2];
      third.setAttribute('contenteditable', 'true');
      third.focus();
      var rr = document.createRange(); rr.selectNodeContents(third);
      var ss = window.getSelection(); ss.removeAllRanges(); ss.addRange(rr);
      document.dispatchEvent(new Event('selectionchange'));
      var face = q('[data-rte-font]'), serif = null;
      Array.prototype.forEach.call(face.options, function (o) { if (o.textContent === 'Serif') serif = o.value; });
      face.value = serif; face.dispatchEvent(new Event('change', { bubbles: true }));
      ok('在第三格改字体，改的是第三格', /font-family|Georgia/.test(third.innerHTML) || /Georgia/.test(third.style.fontFamily));
      ok('第一格没被牵连', !/Georgia/.test(cells[0].innerHTML) && !/Georgia/.test(cells[0].style.fontFamily || ''));

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
