(function () {
  /* Turning an object that has an entrance.
   *
   * This is the bug that read as "the rotate handle does not work" through four
   * rewrites of the handle. The handle was fine. A stylesheet rule said
   *
   *     body.deck-edit-mode [data-fx-enter] { transform: none !important }
   *
   * so on a real deck — where nearly every object has an entrance — the angle
   * was written to the element and taken straight back off. Freshly inserted
   * objects have no entrance, which is exactly why every test passed.
   *
   * So this suite works on objects that HAVE motion on them, which is what a
   * deck someone actually made looks like. */
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
    p.id = 'b17-out';
    p.textContent = log.join('\n');
    document.body.appendChild(p);
  }
  window.addEventListener('error', function (e) { log.push('ERROR ' + e.message); finish(); });
  function guard(fn) {
    return function () {
      try { return fn.apply(null, arguments); }
      catch (e) { log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]); finish(); }
    };
  }
  function later(fn, ms) { setTimeout(guard(fn), ms || 60); }
  function ready() {
    return document.body.classList.contains('deck-edit-mode') &&
      document.body.classList.contains('deck-sidebar-open') &&
      typeof window.Moveable === 'function' &&
      document.querySelector('.slides-offset > section.slide .slide-edit-layer');
  }
  function whenReady(fn, tries) {
    if (ready() || (tries || 0) > 60) { guard(fn)(); return; }
    setTimeout(function () { whenReady(fn, (tries || 0) + 1); }, 100);
  }
  function mouse(el, type, x, y, mods) {
    var init = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, which: 1 };
    if (mods) for (var k in mods) init[k] = mods[k];
    el.dispatchEvent(new MouseEvent(type, init));
  }
  function drag(el, dx, dy, mods) {
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    mouse(el, 'mousedown', x, y, mods);
    mouse(document.body, 'mousemove', x + dx / 2, y + dy / 2, mods);
    mouse(document.body, 'mousemove', x + dx, y + dy, mods);
    mouse(document.body, 'mouseup', x + dx, y + dy, mods);
  }
  function angleOf(el) {
    var m = (el.style.transform || '').match(/rotate\(\s*(-?[\d.]+)deg/);
    return m ? parseFloat(m[1]) : 0;
  }
  /* What the eye sees, not what the style says: a rule that throws the rotation
     away leaves the inline style in place and the screen unturned, so asking the
     element for its style would have missed this entirely. */
  function turnedOnScreen(el) {
    var t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    var n = t.match(/-?[\d.e+-]+/g);
    if (!n || n.length < 4) return 0;
    return Math.round(Math.atan2(parseFloat(n[1]), parseFloat(n[0])) * 180 / Math.PI);
  }

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    var withFx = all('.slides-offset > section.slide [data-slide-object][data-fx-enter]');
    ok('这个 deck 上有带动效的对象（真实 deck 的样子）', withFx.length > 0);
    if (!withFx.length) { finish(); return; }

    var o = withFx[0];
    o.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));

    // The plain question first: can it be turned at all?
    o.style.transform = 'rotate(30deg)';
    ok('给带动效的对象写上旋转，屏幕上真的转了（' + turnedOnScreen(o) + '°）',
      Math.abs(turnedOnScreen(o) - 30) <= 1);

    // The panel's opacity slider was collateral damage of the same !important.
    o.style.opacity = '0.4';
    ok('带动效的对象也能调透明度', Math.abs(parseFloat(getComputedStyle(o).opacity) - 0.4) < 0.02);
    o.style.opacity = '';
    o.style.transform = '';

    later(function () {
      var rot = q('.moveable-control-box .moveable-rotation-control');
      ok('带动效的对象也有旋转柄', !!rot);
      if (!rot) { finish(); return; }
      drag(rot, 120, 90);
      ok('拖旋转柄，样式上转了', angleOf(o) !== 0);
      ok('屏幕上也转了（' + turnedOnScreen(o) + '°）', Math.abs(turnedOnScreen(o) - angleOf(o)) <= 2);

      // And sizing it still works, since that is what she could already do.
      var w0 = (o.style.width || '').match(/^([\d.]+)%$/);
      var se = q('.moveable-control-box .moveable-control.moveable-se');
      drag(se, 60, 40);
      var w1 = (o.style.width || '').match(/^([\d.]+)%$/);
      ok('转过之后还能拉大', !!w1 && (!w0 || parseFloat(w1[1]) > parseFloat(w0[1])));

      // Presenting must still animate: cancelling motion is for editing only.
      later(function () {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true }));
        ok('放映时进入了放映态', document.body.classList.contains('deck-presenting'));
        var playing = all('.slides-offset > section.slide [data-fx-enter]').some(function (el) {
          return el.getAnimations && el.getAnimations().length > 0;
        });
        ok('放映时动效还是会播（编辑时才停）', playing);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        later(function () {
          ok('Esc 回到编辑器', document.body.classList.contains('deck-edit-mode'));
          ok('回来之后带动效的对象仍然可以转', (function () {
            o.style.transform = 'rotate(45deg)';
            return Math.abs(turnedOnScreen(o) - 45) <= 1;
          })());
          finish();
        }, 200);
      }, 120);
    });
  }
})();
