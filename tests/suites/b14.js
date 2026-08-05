(function () {
  /* A modal freezes a headless renderer. Nothing here may reach one. */
  if (!window.__modalsStubbed) {
    window.__modalsStubbed = true;
    window.alert = function () {};
    window.confirm = function () { return true; };
    if (!window.prompt.__stub) { window.prompt = function () { return 'example.com'; }; window.prompt.__stub = 1; }
  }

  // A modal freezes a headless renderer, so neither may reach one.
  window.alert = function () {};
  window.prompt = function () { return 'example.com'; };
  window.open = function () { return null; };
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
  function finish() { var p = document.createElement('pre'); p.id = 'b14-out'; p.textContent = log.join('\n'); document.body.appendChild(p); }
  // A real drag puts its boundaries in text nodes.
  function textAt(root, off) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), seen = 0, n;
    while ((n = w.nextNode())) { if (seen + n.length >= off) return { node: n, off: off - seen }; seen += n.length; }
    return null;
  }
  var el;
  function drag(root, from, to) {
    var a = textAt(root, from), b = textAt(root, to);
    el.focus();
    var r = document.createRange(); r.setStart(a.node, a.off); r.setEnd(b.node, b.off);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
  }
  function sizes() {
    return all('li', el).map(function (li) {
      var inner = li, next;
      while ((next = inner.querySelector('span'))) inner = next;
      return Math.round(parseFloat(getComputedStyle(inner).fontSize));
    });
  }
  var plus = function () { q('[data-size-step="1"]').click(); };
  var minus = function () { q('[data-size-step="-1"]').click(); };

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      ok('浮动条上有字号读数', !!q('[data-rte-size]'));

      var slide = q('.slides-offset > section.slide');
      var layer = slide.querySelector('.slide-edit-layer') || slide;
      var o = document.createElement('div');
      o.className = 'slide-object';
      o.setAttribute('data-slide-object', ''); o.setAttribute('data-object-type', 'text');
      o.setAttribute('data-oid', 'b14');
      o.style.cssText = 'left:8%;top:40%;width:60%;height:30%;';
      o.innerHTML = '<div class="slide-object-text" contenteditable="true" style="font-size:18px">' +
        '<ul><li>one line here</li><li>second line here</li><li>third line here</li></ul></div>';
      layer.appendChild(o);
      el = o.querySelector('.slide-object-text');
      pick(o);
      var lis = all('li', el);

      // --- a step has to be visible -------------------------------------------
      drag(lis[0], 0, lis[0].textContent.length);
      var start = sizes()[0];
      plus();
      var one = sizes()[0];
      ok('按一下 A+ 就看得出来（不是 1px）', one - start >= 2);
      ok('字号读数跟着变', parseFloat(q('[data-rte-size]').value) === one);
      plus(); plus();
      var three = sizes()[0];
      ok('连按三下一直在变大', three > one);
      ok('按了三下也只有一层包装，没有层层套', all('span', el).length === 1);

      minus();
      ok('A− 会退回上一档', sizes()[0] < three);

      // --- several lines, each from its own size --------------------------------
      var bigger = sizes()[0];
      drag(el, 0, el.textContent.length);
      plus();
      var after = sizes();
      ok('多选几行不会傻掉，三行都变了',
        after[0] > bigger && after[1] > 18 && after[2] > 18);
      ok('每行从自己的字号起算，不会被压平成第一行的',
        after[0] > after[1] && after[1] === after[2]);
      ok('多行之后也没有嵌套的包装', all('span span', el).length === 0);
      ok('每行一个包装', all('span', el).length === 3);

      // --- typing a size ------------------------------------------------------
      var f = q('[data-rte-size]');
      f.value = '40'; f.dispatchEvent(new Event('change', { bubbles: true }));
      ok('直接输入字号，选中的几行都听话', sizes().every(function (v) { return v === 40; }));
      ok('文字一个字没丢', el.textContent.replace(/\s+/g, '') === 'onelinehereseconedlinehere'.slice(0, 0) + 'onelineheresecondlineherethirdlinehere');
      ok('三行还在', all('li', el).length === 3);

      q('#btnUndo').click();
      ok('字号改动能撤销', sizes().some(function (v) { return v !== 40; }));

      // --- no selection: the whole block --------------------------------------
      window.getSelection().removeAllRanges();
      document.dispatchEvent(new Event('selectionchange'));
      pick(o);
      var blockBefore = el.style.fontSize;
      plus();
      ok('没有选中文字时改的是整块', el.style.fontSize !== blockBefore);

      // --- the link pair says which state you are in ---------------------------
      // On a fresh block, because the list above has been wrapped and rewrapped
      // and a synthetic selection over it is not what a drag would produce.
      var lo = document.createElement('div');
      lo.className = 'slide-object';
      lo.setAttribute('data-slide-object', ''); lo.setAttribute('data-object-type', 'text');
      lo.setAttribute('data-oid', 'b14-link');
      lo.style.cssText = 'left:8%;top:74%;width:50%;height:10%;';
      lo.innerHTML = '<div class="slide-object-text" contenteditable="true">plain words here</div>';
      layer.appendChild(lo);
      var el2 = lo.querySelector('.slide-object-text');
      pick(lo);
      var saved = el; el = el2;
      var unlink = q('[data-text-unlink]');
      var link = q('[data-text-link]');

      drag(el2, 0, 5);
      ok('没有链接时"去掉链接"是灰的', unlink.disabled === true);
      ok('也没有亮起来', !link.classList.contains('is-active'));
      link.click();
      ok('链接加上了', !!el2.querySelector('a[href]'));
      drag(el2, 1, 4);
      ok('光标在链接里时它才可用', unlink.disabled === false);
      ok('加链接的按钮也会亮起来', link.classList.contains('is-active'));
      drag(el2, 10, 14);
      ok('移出链接之后又灰回去', unlink.disabled === true);
      el = saved;

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
