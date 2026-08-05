(function () {
  /* A modal freezes a headless renderer. Nothing here may reach one. */
  if (!window.__modalsStubbed) {
    window.__modalsStubbed = true;
    window.alert = function () {};
    window.confirm = function () { return true; };
    if (!window.prompt.__stub) { window.prompt = function () { return 'example.com'; }; window.prompt.__stub = 1; }
  }

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
  function ok(n, c) { log.push((c ? 'PASS  ' : 'FAIL  ') + n); }
  function q(s, r) { return (r || document).querySelector(s); }
  function all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function shown(s) { var e = q(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; }
  function set(sel, v, ev) { var el = q(sel); el.value = v; el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); return el; }
  function pick(el, mods) {
    var o = { bubbles: true, cancelable: true };
    if (mods) for (var k in mods) o[k] = mods[k];
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
  }
  function pctOf(el, p) { var m = (el.style[p] || '').match(/^([\d.]+)%$/); return m ? parseFloat(m[1]) : null; }
  function finish() { var p = document.createElement('pre'); p.id = 'b3-out'; p.textContent = log.join('\n'); document.body.appendChild(p); }
  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      // --- rotation -----------------------------------------------------------
      q('[data-insert="text"]').click();
      var a = q('.slide-object.is-selected');
      set('[data-geom="rotate"]', '15');
      ok('能旋转', /rotate\(15deg\)/.test(a.style.transform));
      ok('面板读得回来', (function () { pick(a); return q('[data-geom="rotate"]').value === '15'; })());
      q('[data-geom-rotate-reset]').click();
      ok('能扶正', !a.style.transform);
      set('[data-geom="rotate"]', '-8');

      // A rotated object must stay rotated after an entrance animation, which
      // used to end at transform:none and quietly straighten it.
      a.setAttribute('data-fx-enter', 'fade-up');
      var frames = null, realAnimate = Element.prototype.animate;
      Element.prototype.animate = function (f, o) { if (this === a) frames = f; return realAnimate.call(this, f, o); };
      q('#btnDoneEdit') && null;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true }));
      var st = all('.slides-offset > section.slide');
      if (st[1]) q('[data-present="next"]').click();
      q('[data-present="prev"]').click();
      Element.prototype.animate = realAnimate;
      ok('入场动画不会把转过的东西掰正',
        !frames || String(frames[frames.length - 1].transform).indexOf('rotate(-8deg)') !== -1);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      // --- shadow -------------------------------------------------------------
      pick(a);
      set('[data-obj-shadow]', 'medium', 'change');
      ok('阴影加得上', a.style.filter.indexOf('drop-shadow') === 0);
      pick(a);
      ok('阴影读得回来', q('[data-obj-shadow]').value === 'medium');
      set('[data-obj-shadow]', '', 'change');
      ok('阴影去得掉', !a.style.filter);

      // --- multi-select and align ---------------------------------------------
      /* Align is one row with two meanings now: with one thing selected it lines
         up against the slide, which is how left/right/top/bottom on the page
         became reachable at all. */
      ok('只选一个的时候对齐也在（对的是页面）', shown('#alignRow'));
      q('[data-insert="text"]').click();
      var b = q('.slide-object.is-selected');
      b.style.left = '60%'; b.style.top = '70%'; b.style.width = '20%'; b.style.height = '10%';
      a.style.left = '10%'; a.style.top = '20%'; a.style.width = '30%'; a.style.height = '10%';
      pick(a, { shiftKey: true });
      ok('Shift 点击能多选（Mac 上 Ctrl 点击是右键）', all('.slide-object.is-selected').length === 2);
      ok('选到两个，标签变成"互相对齐"',
        shown('#alignRow') && q('#alignLabel').textContent.indexOf('each other') !== -1);

      q('[data-align="left"]').click();
      ok('左对齐把两个拉到同一条边', pctOf(a, 'left') === pctOf(b, 'left'));
      q('#btnUndo').click();
      ok('对齐能撤销', pctOf(a, 'left') !== pctOf(b, 'left'));
      q('[data-align="top"]').click();
      ok('顶对齐也行', pctOf(a, 'top') === pctOf(b, 'top'));
      q('[data-align="hcenter"]').click();
      ok('居中对齐对的是中线，不是边',
        Math.abs((pctOf(a, 'left') + 30 / 2) - (pctOf(b, 'left') + 20 / 2)) < 0.001);

      // Spread needs three, and must leave the outer two alone.
      q('[data-insert="text"]').click();
      var c = q('.slide-object.is-selected');
      a.style.left = '0%'; b.style.left = '30%'; c.style.left = '80%';
      a.style.width = '10%'; b.style.width = '10%'; c.style.width = '10%';
      pick(a); pick(b, { shiftKey: true }); pick(c, { shiftKey: true });
      ok('三个都选上了', all('.slide-object.is-selected').length === 3);
      q('[data-distribute="h"]').click();
      var xs = [a, b, c].map(function (e) { return pctOf(e, 'left'); }).sort(function (p, r) { return p - r; });
      ok('两端不动', xs[0] === 0 && xs[2] === 80);
      ok('中间那个落在等距的位置', Math.abs((xs[1] - xs[0]) - (xs[2] - xs[1])) < 0.001);

      // --- link ---------------------------------------------------------------
      pick(a);
      set('[data-obj-link]', '2');
      ok('链接记在对象上', a.getAttribute('data-link') === '2');
      // In the editor a click must still select, not navigate.
      var wasCurrent = null;
      pick(a);
      ok('编辑态下点它是选中，不是跳转', a.classList.contains('is-selected'));
      q('[data-obj-link-clear]').click();
      ok('链接清得掉', !a.hasAttribute('data-link'));

      // --- slide transition ---------------------------------------------------
      var slide = all('.slides-offset > section.slide')[0];
      set('[data-slide-transition]', 'zoom', 'change');
      ok('切页动画记在这一页上', slide.getAttribute('data-transition') === 'zoom');
      q('#btnUndo').click();
      ok('切页动画能撤销', slide.getAttribute('data-transition') !== 'zoom');

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
