(function () {
  /* The arrange kit: align, spread, match, order, group. */
  if (!window.__modalsStubbed) {
    window.__modalsStubbed = true;
    window.alert = function () {};
    window.confirm = function () { return true; };
    if (!window.prompt.__stub) { window.prompt = function () { return 'example.com'; }; window.prompt.__stub = 1; }
  }

  var log = [];
  var done = false;
  function ok(n, c) { log.push((c ? 'PASS  ' : 'FAIL  ') + n); }
  function q(s, r) { return (r || document).querySelector(s); }
  function all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function finish() {
    if (done) return;
    done = true;
    var p = document.createElement('pre');
    p.id = 'b20-out';
    p.textContent = log.join('\n');
    document.body.appendChild(p);
  }
  window.addEventListener('error', function (e) {
    log.push('ERROR ' + e.message + '  @@ ' + ((e.error && e.error.stack) || '').split('\n').slice(0, 3).join(' <- '));
    finish();
  });
  function ready() {
    return document.body.classList.contains('deck-edit-mode') &&
      document.body.classList.contains('deck-sidebar-open') &&
      typeof window.Moveable === 'function' &&
      document.querySelector('.slides-offset > section.slide .slide-edit-layer');
  }
  function whenReady(fn, tries) {
    if (ready() || (tries || 0) > 60) { fn(); return; }
    setTimeout(function () { whenReady(fn, (tries || 0) + 1); }, 100);
  }
  function pctOf(el, p) { var m = (el.style[p] || '').match(/^(-?[\d.]+)%$/); return m ? parseFloat(m[1]) : null; }
  function shown(sel) { var e = q(sel); return !!e && !e.hidden; }
  function pick(el, mods) {
    var r = el.getBoundingClientRect();
    var init = { bubbles: true, cancelable: true, pointerId: 1,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    if (mods) for (var k in mods) init[k] = mods[k];
    el.dispatchEvent(new PointerEvent('pointerdown', init));
  }
  /* Clicking something already in the selection keeps the selection — that is
     how a multi-selection gets dragged by one of its members — so starting a
     fresh one means clicking the slide first. */
  /* The canvas slide, not `section.slide` — the filmstrip holds clones of every
     slide, and the sidebar comes first in the document, so the bare selector
     found a thumbnail. A press on a thumbnail is chrome and clears nothing,
     which quietly left the previous selection in place. */
  function emptySlide() { return q('.slides-offset > section.slide'); }
  function only(el) {
    pick(emptySlide());
    pick(el);
  }
  function shape(geom) {
    q('[data-shape="rect"]').click();
    var o = q('.slide-object.is-selected');
    o.style.left = geom[0] + '%'; o.style.top = geom[1] + '%';
    o.style.width = geom[2] + '%'; o.style.height = geom[3] + '%';
    return o;
  }
  function key(k, mods) {
    var init = { key: k, bubbles: true };
    if (mods) for (var m in mods) init[m] = mods[m];
    document.dispatchEvent(new KeyboardEvent('keydown', init));
  }

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      // --- one object aligns to the slide ------------------------------------
      var a = shape([12, 18, 20, 10]);
      ok('只选一个也有对齐（对的是页面）', shown('#alignRow'));
      ok('标签说的是"对到页面上"', q('#alignLabel').textContent.indexOf('slide') !== -1);
      q('[data-align="left"]').click();
      ok('左对齐把它贴到页面左边', pctOf(a, 'left') === 0);
      q('[data-align="right"]').click();
      ok('右对齐贴到页面右边', Math.abs(pctOf(a, 'left') - 80) < 0.001);
      q('[data-align="hcenter"]').click();
      ok('水平居中', Math.abs(pctOf(a, 'left') - 40) < 0.001);
      q('[data-align="bottom"]').click();
      ok('底对齐贴到页面底边', Math.abs(pctOf(a, 'top') - 90) < 0.001);
      q('[data-align="vcenter"]').click();
      ok('垂直居中', Math.abs(pctOf(a, 'top') - 45) < 0.001);
      q('#btnUndo').click();
      ok('对齐能撤销', Math.abs(pctOf(a, 'top') - 90) < 0.001);

      // --- two or more align to each other ----------------------------------
      var b = shape([60, 70, 30, 20]);
      a.style.left = '10%'; a.style.top = '20%';
      only(a); pick(b, { shiftKey: true });
      ok('两个都选上了', all('.slide-object.is-selected').length === 2);
      ok('标签换成"互相对齐"', q('#alignLabel').textContent.indexOf('each other') !== -1);
      q('[data-align="left"]').click();
      ok('互相左对齐是对到两个里最左的那条边',
        pctOf(a, 'left') === 10 && pctOf(b, 'left') === 10);
      ok('没有跑到页面边上去', pctOf(a, 'left') !== 0);

      // --- match size --------------------------------------------------------
      ok('两个以上才给"统一大小"', shown('#matchRow'));
      only(a); pick(b, { shiftKey: true });   // a picked first: a is the reference
      q('[data-match="w"]').click();
      ok('统一宽度用的是先选中的那个（a=' + a.style.width + ' b=' + b.style.width + ' 选中 ' + all('.slide-object.is-selected').length + '）',
        pctOf(b, 'width') === 20 && pctOf(a, 'width') === 20);
      q('[data-match="h"]').click();
      ok('统一高度也一样', pctOf(b, 'height') === 10);
      q('#btnUndo').click();
      ok('统一大小能撤销', pctOf(b, 'height') === 20);

      // --- spread needs three ------------------------------------------------
      ok('两个的时候不给"平均分布"', !shown('#spreadRow'));
      var c = shape([80, 40, 10, 10]);
      a.style.left = '0%'; b.style.left = '30%'; c.style.left = '80%';
      a.style.width = '10%'; b.style.width = '10%'; c.style.width = '10%';
      only(a); pick(b, { shiftKey: true }); pick(c, { shiftKey: true });
      ok('三个的时候才给', shown('#spreadRow'));
      q('[data-distribute="h"]').click();
      var xs = [a, b, c].map(function (e) { return pctOf(e, 'left'); }).sort(function (p, r) { return p - r; });
      ok('两端不动，中间等距', xs[0] === 0 && xs[2] === 80 &&
        Math.abs((xs[1] - xs[0]) - (xs[2] - xs[1])) < 0.001);

      // --- order, one step at a time ----------------------------------------
      var layer = a.parentNode;
      var order = function () { return all('[data-slide-object]', layer).indexOf(c); };
      only(c);
      var was = order();
      q('[data-arrange="backward"]').click();
      ok('往后一层就是往后一层', order() === was - 1);
      q('[data-arrange="forward"]').click();
      ok('往前一层回来了', order() === was);
      q('#btnUndo').click();
      ok('调层次能撤销', order() === was - 1);
      q('[data-arrange="front"]').click();
      ok('置顶还是置顶（' + order() + ' / ' + all('[data-slide-object]', layer).length + '）',
        order() === all('[data-slide-object]', layer).length - 1);

      // --- grouping ----------------------------------------------------------
      only(a);
      ok('只选一个、又没成组的时候不显示成组那一栏（选中 ' + all('.slide-object.is-selected').length + '）', !shown('#groupRow'));
      only(a); pick(b, { shiftKey: true });
      ok('两个的时候出现成组', shown('#groupRow'));
      q('[data-group="group"]').click();
      ok('成组之后两个带上同一个组标记（选中 ' + all('.slide-object.is-selected').length + ' a=' + a.getAttribute('data-group') + '）',
        !!a.getAttribute('data-group') && a.getAttribute('data-group') === b.getAttribute('data-group'));
      ok('DOM 里没有多出容器，还是原来的父节点', a.parentNode === layer && b.parentNode === layer);

      // Clicking one member selects the group.
      pick(emptySlide());
      pick(a);
      ok('点一个成员，整组都选上', all('.slide-object.is-selected').length === 2 &&
        b.classList.contains('is-selected'));

      // Alt-click reaches the one under the pointer.
      pick(emptySlide());
      pick(a, { altKey: true });
      ok('Alt 点击只选中它自己', all('.slide-object.is-selected').length === 1 &&
        a.classList.contains('is-selected'));

      // A group moves as one.
      only(a);
      var ax = pctOf(a, 'left'), bx = pctOf(b, 'left');
      var area = q('.moveable-control-box .moveable-area');
      ok('整组选中时手柄框罩住整组', !!area);
      if (area) {
        var r = area.getBoundingClientRect();
        var x = r.left + r.width / 2, y = r.top + r.height / 2;
        var mouse = function (t, cx, cy) {
          area.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0, which: 1 }));
        };
        mouse('mousedown', x, y);
        document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + 60, clientY: y, button: 0, which: 1 }));
        document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x + 60, clientY: y, button: 0, which: 1 }));
        ok('拖整组，两个一起动', pctOf(a, 'left') > ax && pctOf(b, 'left') > bx);
      }

      // ⇧⌘G takes it apart, from either member.
      only(a);
      key('g', { metaKey: true, shiftKey: true });
      ok('⇧⌘G 解组', !a.hasAttribute('data-group') && !b.hasAttribute('data-group'));
      // ⌘G puts it back.
      only(a); pick(b, { shiftKey: true });
      key('g', { metaKey: true });
      ok('⌘G 成组', !!a.getAttribute('data-group'));
      q('#btnUndo').click();
      ok('成组能撤销', !a.hasAttribute('data-group'));

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
