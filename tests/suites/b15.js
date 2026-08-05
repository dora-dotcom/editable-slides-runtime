(function () {
  /* A modal freezes a headless renderer. Nothing here may reach one. */
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
    p.id = 'b15-out';
    p.textContent = log.join('\n');
    document.body.appendChild(p);
  }
  /* The suite is a chain of timers, so a throw inside one of them lands outside
     every try/catch and the run would end having said nothing at all. */
  window.addEventListener('error', function (e) {
    log.push('ERROR ' + e.message + '  @@ ' + ((e.error && e.error.stack) || '').split('\n').slice(0, 4).join(' <- '));
    finish();
  });
  /* Which library events actually fire, so an assertion is never written against
     a sequence the library does not produce. */
  if (window.Moveable && window.Moveable.prototype && !window.Moveable.prototype.__traced) {
    var realOn = window.Moveable.prototype.on;
    window.Moveable.prototype.__traced = true;
    window.__evts = [];
    window.Moveable.prototype.on = function (name, fn) {
      if (typeof name === 'string' && typeof fn === 'function') {
        return realOn.call(this, name, function (ev) { window.__evts.push(name); return fn(ev); });
      }
      return realOn.apply(this, arguments);
    };
  }
  function guard(fn) {
    return function () {
      try { return fn.apply(null, arguments); }
      catch (e) { log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]); finish(); }
    };
  }
  function later(fn, ms) { setTimeout(guard(fn), ms || 50); }

  function ready() {
    /* The gesture library is inflated from a compressed payload, so it lands a
       few milliseconds after the editor does. */
    return document.body.classList.contains('deck-edit-mode') &&
      document.body.classList.contains('deck-sidebar-open') &&
      typeof window.Moveable === 'function' &&
      document.querySelector('.slides-offset > section.slide .slide-edit-layer');
  }
  function whenReady(fn, tries) {
    if (ready() || (tries || 0) > 60) { guard(fn)(); return; }
    setTimeout(function () { whenReady(fn, (tries || 0) + 1); }, 100);
  }

  function pct(el, p) { var m = (el.style[p] || '').match(/^(-?[\d.]+)%$/); return m ? parseFloat(m[1]) : null; }
  function angleOf(el) {
    var m = (el.style.transform || '').match(/rotate\(\s*(-?[\d.]+)deg/);
    return m ? parseFloat(m[1]) : 0;
  }

  /* Mouse events, because that is what the gesture library listens to. A suite
     that dispatches events nobody listens to tests a path the browser never
     takes, which has already happened once in this project. */
  function mouse(el, type, x, y, mods) {
    var init = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, which: 1 };
    if (mods) for (var k in mods) init[k] = mods[k];
    el.dispatchEvent(new MouseEvent(type, init));
  }
  function drag(el, dx, dy, mods) {
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    mouse(el, 'mousedown', x, y, mods);
    /* On document.body rather than on window: a real mouseup always lands on an
       element, and the library asks whether its target is inside something —
       which throws outright when handed the window object. */
    mouse(document.body, 'mousemove', x + dx / 2, y + dy / 2, mods);
    mouse(document.body, 'mousemove', x + dx, y + dy, mods);
    mouse(document.body, 'mouseup', x + dx, y + dy, mods);
  }
  /* Clicking a button the way a mouse does. A bare .click() has no mousedown in
     front of it, so it never clears the one-shot guard the library arms at the
     end of a drag to stop that drag registering as a click — and the button
     press vanished instead. */
  function press(el) {
    /* Feed the guard a click it can eat, first, on something harmless.
       Finishing a drag arms a one-shot capture listener that swallows the next
       click — for a mouse that is the click its own mouseup produces, so nobody
       ever notices, but a synthetic drag produces no click and the listener sits
       there waiting to eat the suite's next button press instead. */
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    mouse(el, 'mousedown', x, y);
    mouse(el, 'mouseup', x, y);
    el.click();
  }
  function handle(dir) { return q('.moveable-control-box .moveable-control.moveable-' + dir); }
  function rotator() { return q('.moveable-control-box .moveable-rotation-control'); }
  /* A drag swallows the click its own mouseup would produce, so that dragging
     something is not also clicking it. A synthetic click in the same task gets
     eaten by that guard, so undo is clicked a turn later. */
  function undoLater(fn) {
    later(function () {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
      later(fn, 20);
    }, 20);
  }
  /* Poking styles from a test is not something the editor does, so the handles
     have not been told. A window resize is the app's own "re-measure". */
  function settle() { window.dispatchEvent(new Event('resize')); }

  window.addEventListener('load', function () { whenReady(run); });

  var o = null;
  var wide = null;

  function run() {
    press(q('[data-shape="rect"]'));
    o = q('.slide-object.is-selected');
    o.style.left = '30%'; o.style.top = '30%'; o.style.width = '20%'; o.style.height = '20%';
    o.style.transform = '';
    settle();

    ok('对象上不再有内嵌的手柄按钮', all('.slide-object-resize', o).length === 0);
    ok('八个方向的手柄由库画出来',
      ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].every(function (d) { return !!handle(d); }));
    ok('旋转柄也在', !!rotator());
    ok('手柄框画在 slide 里，缩放才对得上', !!q('.slides-offset > section.slide .moveable-control-box'));

    later(dragIt);
  }

  function dragIt() {
    // One-to-one with the pointer: the library reports layout pixels and the
    // runtime writes percentages, and a factor dropped anywhere along that
    // chain shows up here as half or double.
    var r0 = o.getBoundingClientRect();
    drag(o, 100, 50);
    var r1 = o.getBoundingClientRect();
    ok('拖 100px 就走 100px（屏幕上量的 ' + (r1.left - r0.left).toFixed(1) + ',' + (r1.top - r0.top).toFixed(1) + '）',
      Math.abs(r1.left - r0.left - 100) < 3 && Math.abs(r1.top - r0.top - 50) < 3);
    ok('写回去的是百分比', pct(o, 'left') !== null && pct(o, 'top') !== null);
    undoLater(afterDragUndo);
  }

  function afterDragUndo() {
    ok('拖动能撤销', Math.abs(pct(o, 'left') - 30) < 0.01 && Math.abs(pct(o, 'top') - 30) < 0.01);
    var w0 = pct(o, 'width');
    drag(handle('se'), 80, 60);
    ok('拉右下角把它撑大', pct(o, 'width') > w0);
    ok('右下角不动左上角', Math.abs(pct(o, 'left') - 30) < 0.05 && Math.abs(pct(o, 'top') - 30) < 0.05);
    undoLater(function () {
      ok('改尺寸能撤销，尺寸和位置一起回去',
        Math.abs(pct(o, 'width') - 20) < 0.01 && Math.abs(pct(o, 'left') - 30) < 0.01);
      turnIt();
    });
  }

  function turnIt() {
    drag(rotator(), 120, 90);
    ok('拖旋转柄真的转了', angleOf(o) !== 0);
    ok('右边栏的角度跟着显示',
      Math.abs(parseFloat(q('[data-geom="rotate"]').value) - angleOf(o)) < 1.5);
    undoLater(function () {
      ok('旋转能撤销', angleOf(o) === 0);
      settle();
      later(snapAngle);
    });
  }

  function snapAngle() {
    drag(rotator(), 120, 90, { shiftKey: true });
    ok('按住 Shift 会吸附到 15 度的整数倍', angleOf(o) !== 0 && angleOf(o) % 15 === 0);
    o.style.transform = '';
    settle();
    later(textBox);
  }

  function textBox() {
    press(q('[data-insert="text"]'));
    wide = q('.slide-object.is-selected');
    ok('插入文本框成功了', !!wide && wide.getAttribute('data-object-type') === 'text');
    if (!wide || wide.getAttribute('data-object-type') !== 'text') {
      log.push('      (objects: ' + all('[data-slide-object]').map(function (x) { return x.getAttribute('data-object-type'); }).join(',') +
        ' | selected: ' + all('.slide-object.is-selected').map(function (x) { return x.getAttribute('data-object-type'); }).join(',') +
        ' | menu open: ' + !!q('.deck-menu.open') + ')');
    }
    wide.style.left = '6%'; wide.style.top = '60%'; wide.style.width = '86%'; wide.style.height = '12%';
    wide.style.transform = '';
    settle();
    later(function () {
      drag(q('.slide-object-move', wide), 60, 30);
      ok('宽对象往右拖，是真的往右', pct(wide, 'left') > 6);
      ok('往下也对', pct(wide, 'top') > 60);

      // Clicking the words puts a cursor in them rather than moving the box.
      var lp = pct(wide, 'left');
      drag(q('.slide-object-text', wide), 40, 0);
      ok('在文字上拖不会搬走文本框', Math.abs(pct(wide, 'left') - lp) < 0.01);

      // Bleeding off an edge is ordinary layout; being lost is not.
      wide.style.left = '6%'; wide.style.top = '60%';
      settle();
      later(function () {
        drag(q('.slide-object-move', wide), -400, 0);
        ok('可以让它出血到画面外', pct(wide, 'left') < 0);
        ok('但中心点还在画面内，拖不丢', pct(wide, 'left') + 86 / 2 >= -0.01);
        later(groupDrag);
      });
    });
  }

  function groupDrag() {
    wide.style.left = '6%'; wide.style.top = '60%';
    o.style.left = '30%'; o.style.top = '30%';
    settle();
    later(function () {
      var pd = function (el, mods) {
        var r = el.getBoundingClientRect();
        var init = { bubbles: true, cancelable: true, pointerId: 1,
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
        if (mods) for (var k in mods) init[k] = mods[k];
        el.dispatchEvent(new PointerEvent('pointerdown', init));
      };
      pd(o);
      pd(wide, { shiftKey: true });
      ok('Shift 点第二个能加选', all('.slide-object.is-selected').length === 2);
      later(function () {
        var area = q('.moveable-control-box .moveable-area');
        ok('多选之后手柄框罩住整片选区', !!area);
        drag(area || o, 50, 0);
        ok('拖一个，两个一起走', pct(o, 'left') > 30 && pct(wide, 'left') > 6);
        later(exportIt);
      });
    });
  }

  function exportIt() {
    o.style.transform = 'rotate(20deg)';
    var captured = null;
    var realBlob = window.Blob;
    window.Blob = function (parts, opt) {
      if (parts && typeof parts[0] === 'string' && parts[0].indexOf('<!DOCTYPE html>') === 0) captured = parts[0];
      return new realBlob(parts, opt);
    };
    URL.createObjectURL = function () { return 'blob:stub'; };
    URL.revokeObjectURL = function () {};
    HTMLAnchorElement.prototype.click = function () {};
    delete window.showSaveFilePicker;
    press(q('#btnSaveCopy'));
    window.Blob = realBlob;
    var d = captured && new DOMParser().parseFromString(captured, 'text/html');
    ok('导出的文件里没有手柄框', !!d && d.querySelectorAll('.moveable-control-box').length === 0);
    ok('也没有旧的手柄按钮', !!d && d.querySelectorAll('.slide-object-resize, .slide-object-rotate').length === 0);
    ok('库自己写进 head 的样式也不留下', !!d &&
      all('style', d).every(function (s) { return (s.textContent || '').indexOf('.moveable-control-box') === -1; }));
    ok('但转过的角度留下了', !!d && /rotate\(/.test(d.body.innerHTML));
    finish();
  }
})();
