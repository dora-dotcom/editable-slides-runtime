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
  function finish() { var p = document.createElement('pre'); p.id = 'b13-out'; p.textContent = log.join('\n'); document.body.appendChild(p); }
  function at(el, off) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), seen = 0, n;
    while ((n = w.nextNode())) { if (seen + n.length >= off) return { node: n, off: off - seen }; seen += n.length; }
    return null;
  }
  function select(el, from, to) {
    var a = at(el, from), b = at(el, to);
    if (!a || !b) return false;
    el.setAttribute('contenteditable', 'true');
    el.focus();
    var r = document.createRange(); r.setStart(a.node, a.off); r.setEnd(b.node, b.off);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
    return true;
  }
  var opened = [], answer = null;
  window.open = function (u) { opened.push(u); return null; };
  window.prompt = function () { return answer; };
  window.alert = function () {};

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      ok('浮动条有加链接的按钮', !!q('[data-text-link]'));
      ok('浮动条有去掉链接的按钮', !!q('[data-text-unlink]'));

      q('[data-insert="text"]').click();
      var obj = q('.slide-object.is-selected');
      var t = obj.querySelector('.slide-object-text');
      t.textContent = 'see the repo for details';

      // --- a link on selected words -------------------------------------------
      select(t, 8, 12);           // "repo"
      answer = 'github.com/dora-dotcom/editable-slides-runtime';
      q('[data-text-link]').click();
      var a = t.querySelector('a');
      ok('选中的字变成了链接', !!a && a.textContent === 'repo');
      ok('别的字没被牵连', t.textContent === 'see the repo for details');
      ok('裸域名补上了 https', (a.getAttribute('href') || '').indexOf('https://') === 0);
      ok('外链在新标签打开', a.getAttribute('target') === '_blank' && /noopener/.test(a.getAttribute('rel') || ''));
      ok('链接看起来像链接', getComputedStyle(a).textDecorationLine.indexOf('underline') !== -1);

      // --- editing: a click puts a caret in, it does not navigate --------------
      var was = opened.length;
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      ok('编辑时点链接不会跳走', opened.length === was);
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }));
      ok('编辑时按住 Cmd 点才跳', opened.length === was + 1);

      // --- a page number instead of an address --------------------------------
      select(t, 0, 3);
      answer = '2';
      q('[data-text-link]').click();
      var jump = all('a', t).filter(function (x) { return x.hasAttribute('data-link-slide'); })[0];
      ok('页码也能当目标', !!jump && jump.getAttribute('data-link-slide') === '2');
      ok('页码链接不会往外开标签', !jump.getAttribute('target'));

      // --- taking it off -------------------------------------------------------
      select(t, 8, 12);
      q('[data-text-unlink]').click();
      ok('链接能去掉', !all('a', t).some(function (x) { return /github/.test(x.getAttribute('href') || ''); }));
      ok('字还在', t.textContent === 'see the repo for details');
      q('#btnUndo').click();
      ok('去掉链接能撤销', all('a', t).some(function (x) { return /github/.test(x.getAttribute('href') || ''); }));

      // --- reading: links work without presenting -----------------------------
      q('#btnDoneEdit').click();
      var before = opened.length;
      var live = all('a[href^="https"]', t)[0];
      live.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      ok('阅读态下链接是活的（以前只有放映时才活）', opened.length === before + 1);

      // --- and an object carrying a destination -------------------------------
      var shape = document.createElement('div');
      shape.className = 'slide-object';
      shape.setAttribute('data-slide-object', ''); shape.setAttribute('data-object-type', 'shape');
      shape.setAttribute('data-oid', 'linked-shape'); shape.setAttribute('data-link', 'example.com');
      shape.style.cssText = 'left:70%;top:70%;width:14%;height:10%;';
      var layer = q('.slides-offset > section.slide .slide-edit-layer');
      layer.appendChild(shape);
      var n2 = opened.length;
      shape.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      ok('阅读态下带链接的图形也能点', opened.length === n2 + 1);
      ok('裸域名同样补了 https', /^https:\/\/example\.com/.test(opened[opened.length - 1]));

      // --- across a list: one anchor per item, never one around the items -----
      var slide = q('.slides-offset > section.slide');
      var lay = slide.querySelector('.slide-edit-layer') || slide;
      var lo = document.createElement('div');
      lo.className = 'slide-object';
      lo.setAttribute('data-slide-object', ''); lo.setAttribute('data-object-type', 'text');
      lo.setAttribute('data-oid', 'b13-list');
      lo.style.cssText = 'left:8%;top:60%;width:50%;height:20%;';
      lo.innerHTML = '<div class="slide-object-text" contenteditable="true">' +
        '<ul><li>first line</li><li>second line</li></ul></div>';
      lay.appendChild(lo);
      if (!document.body.classList.contains('deck-edit-mode')) q('#editToggle').click();
      pick(lo);
      var lt = lo.querySelector('.slide-object-text');
      var lis = lt.querySelectorAll('li');
      lt.focus();
      var lr = document.createRange();
      lr.setStart(lis[0].firstChild, 0);
      lr.setEnd(lis[1].firstChild, lis[1].firstChild.length);
      var ls = window.getSelection(); ls.removeAllRanges(); ls.addRange(lr);
      document.dispatchEvent(new Event('selectionchange'));
      answer = 'example.org';
      q('[data-text-link]').click();
      ok('跨两个条目会生成两个链接，不是一个包住它们',
        lt.querySelectorAll('a').length === 2 &&
        Array.prototype.every.call(lt.querySelectorAll('a'), function (x) { return !!x.closest('li'); }));
      ok('两行的字都还在', lt.textContent.replace(/\s+/g, '') === 'firstlinesecondline');

      // --- and a link survives being sent to someone --------------------------
      var captured = null;
      var realBlob = window.Blob;
      window.Blob = function (parts, o) {
        if (parts && typeof parts[0] === 'string' && parts[0].indexOf('<!DOCTYPE html>') === 0) captured = parts[0];
        return new realBlob(parts, o);
      };
      URL.createObjectURL = function () { return 'blob:stub'; };
      URL.revokeObjectURL = function () {};
      HTMLAnchorElement.prototype.click = function () {};
      delete window.showSaveFilePicker;
      q('#btnSaveCopy').click();
      window.Blob = realBlob;
      var d = captured && new DOMParser().parseFromString(captured, 'text/html');
      ok('导出的文件里链接还在', !!d && d.querySelectorAll('.slide-object-text a[href]').length >= 2);
      ok('页码那种链接也带出去了', !!d && d.querySelectorAll('[data-link-slide]').length >= 1);
      ok('导出后不再是可编辑状态', !!d && d.querySelectorAll('[contenteditable="true"]').length === 0);

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
