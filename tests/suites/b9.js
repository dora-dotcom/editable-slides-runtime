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
  function finish() { var p = document.createElement('pre'); p.id = 'b9-out'; p.textContent = log.join('\n'); document.body.appendChild(p); }
  window.addEventListener('load', function () { whenReady(run); });

  // A list written the way real markup is, with newlines around it.
  function makeListBlock() {
    var slide = q('.slides-offset > section.slide');
    var layer = slide.querySelector('.slide-edit-layer') || slide;
    var o = document.createElement('div');
    o.className = 'slide-object';
    o.setAttribute('data-slide-object', ''); o.setAttribute('data-object-type', 'text');
    o.setAttribute('data-oid', 'b9-list');
    o.style.cssText = 'left:8%;top:40%;width:60%;height:30%;';
    o.innerHTML = '<div class="slide-object-text" contenteditable="true">\n      ' +
      '<ul>\n        <li>one line</li>\n        <li>second line</li>\n        <li>third line</li>\n      </ul>\n    </div>';
    layer.appendChild(o);
    pick(o);
    return o;
  }
  function selectItems(el, from, to) {
    var lis = el.querySelectorAll('li');
    el.focus();
    var r = document.createRange();
    r.setStart(lis[from].firstChild, 0);
    r.setEnd(lis[to].firstChild, lis[to].firstChild.length);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  }
  function faceValue(name) {
    var f = q('[data-rte-font]'), v = null;
    Array.prototype.forEach.call(f.options, function (o) { if (o.textContent === name) v = o.value; });
    return v;
  }

  function run() {
    try {
      var o = makeListBlock();
      var el = o.querySelector('.slide-object-text');

      // --- a face across three items -------------------------------------------
      selectItems(el, 0, 2);
      var f = q('[data-rte-font]');
      f.value = faceValue('Serif'); f.dispatchEvent(new Event('change', { bubbles: true }));
      var dressed = all('li', el).filter(function (li) { return /font-family/.test(li.innerHTML); });
      ok('三行都改到了，不是只有第一行', dressed.length === 3);
      ok('没有 span 包住 li —— 那是无效的 HTML', !/(<span[^>]*>\s*)?<span[^>]*>[^<]*<li/.test(el.innerHTML) &&
        all('span', el).every(function (sp) { return !sp.querySelector('li'); }));
      ok('每个 span 都在自己的 li 里面', all('span', el).every(function (sp) { return !!sp.closest('li'); }));
      ok('没有多出空的圆点', all('li', el).filter(function (li) { return li.textContent.trim() === ''; }).length === 0);
      ok('条目数没变', all('li', el).length === 3);
      ok('文字一个字没丢', el.textContent.replace(/\s+/g, '') === 'onelinesecondlinethirdline');

      // The selection must survive, so a second change lands on the same words.
      var c = q('[data-rte-colour]');
      c.value = '#cc0000'; c.dispatchEvent(new Event('input', { bubbles: true }));
      var coloured = all('li', el).filter(function (li) { return /color/.test(li.innerHTML); });
      ok('改完字体接着改颜色，三行还是三行', coloured.length === 3);

      // --- A+ across three items ------------------------------------------------
      selectItems(el, 0, 2);
      q('[data-size-step="1"]').click();
      var sized = all('li', el).filter(function (li) { return /font-size/.test(li.innerHTML); });
      ok('A+ 也是三行一起', sized.length === 3);

      q('#btnUndo').click();
      ok('多行改动是一步撤销', all('li', el).filter(function (li) { return /font-size/.test(li.innerHTML); }).length === 0);

      // --- toggling the list must not invent bullets ----------------------------
      var o2 = makeListBlock();
      var el2 = o2.querySelector('.slide-object-text');
      selectItems(el2, 0, 2);
      q('[data-cmd="insertUnorderedList"]').click();
      q('[data-cmd="insertUnorderedList"]').click();
      ok('列表开了又关，没有多出空圆点',
        all('li', el2).filter(function (li) { return li.textContent.trim() === ''; }).length === 0);
      ok('开关一圈文字还在', el2.textContent.replace(/\s+/g, '') === 'onelinesecondlinethirdline');

      // --- a plain multi-line block still works ---------------------------------
      q('[data-insert="text"]').click();
      var plain = q('.slide-object.is-selected');
      var pt = plain.querySelector('.slide-object-text');
      pt.innerHTML = 'alpha<br>beta<br>gamma';
      pt.setAttribute('contenteditable', 'true');
      pt.focus();
      var r = document.createRange();
      r.setStart(pt.firstChild, 0);
      r.setEnd(pt.lastChild, pt.lastChild.length);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      document.dispatchEvent(new Event('selectionchange'));
      var f2 = q('[data-rte-font]');
      f2.value = faceValue('Serif'); f2.dispatchEvent(new Event('change', { bubbles: true }));
      ok('没有列表的多行也能一次改完', /font-family/.test(pt.innerHTML));
      ok('三行都在', pt.textContent.replace(/\s+/g, '') === 'alphabetagamma');

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
