(function () {
  /* A modal freezes a headless renderer. Nothing here may reach one. */
  if (!window.__modalsStubbed) {
    window.__modalsStubbed = true;
    window.alert = function () {};
    window.confirm = function () { return true; };
    if (!window.prompt.__stub) { window.prompt = function () { return 'example.com'; }; window.prompt.__stub = 1; }
  }

  function whenReady(fn, tries) {
    /* The gesture library is inflated from a compressed payload, so it lands a
       few milliseconds after the editor does. */
    var ok = document.body.classList.contains('deck-edit-mode') &&
      document.body.classList.contains('deck-sidebar-open') &&
      typeof window.Moveable === 'function' &&
      document.querySelector('.slides-offset > section.slide .slide-edit-layer');
    if (ok || (tries || 0) > 60) { fn(); return; }
    setTimeout(function () { whenReady(fn, (tries || 0) + 1); }, 100);
  }
  var log = [];
  function ok(n, c) { log.push((c ? 'PASS  ' : 'FAIL  ') + n); }
  function q(s, r) { return (r || document).querySelector(s); }
  function finish() { var p = document.createElement('pre'); p.id = 'b16-out'; p.textContent = log.join('\n'); document.body.appendChild(p); }

  // What must not move is what the eye sees not moving: the opposite corner in
  // the object's own frame, placed on the slide THROUGH the rotation. Checking
  // the unrotated box instead says a correct rotated resize is wrong, because
  // turning about the centre moves that box's edges by design.
  function frame(obj) {
    var pc = function (p, dflt) {
      var m = (obj.style[p] || '').match(/^(-?[\d.]+)%$/);
      return m ? parseFloat(m[1]) : dflt;
    };
    var ang = (function () {
      var m = (obj.style.transform || '').match(/rotate\(\s*(-?[\d.]+)deg/);
      return m ? parseFloat(m[1]) : 0;
    })();
    return { l: pc('left', 0), t: pc('top', 0), w: pc('width', 0), h: pc('height', 0), a: ang };
  }
  // The anchor corner, in percent-of-slide, after the rotation about the centre.
  // Percent of width and percent of height are different lengths, so the turn is
  // done on a common basis: percent-of-width for both axes, then back.
  function anchorPoint(f, dir, aspect) {
    var sx = dir.indexOf('e') !== -1 ? -1 : dir.indexOf('w') !== -1 ? 1 : 0;
    var sy = dir.indexOf('s') !== -1 ? -1 : dir.indexOf('n') !== -1 ? 1 : 0;
    var cx = f.l + f.w / 2, cy = f.t + f.h / 2;
    var ox = sx * f.w / 2, oy = sy * f.h / 2;
    var oxw = ox, oyw = oy / aspect;
    var r = f.a * Math.PI / 180, c = Math.cos(r), s2 = Math.sin(r);
    var rxw = oxw * c - oyw * s2;
    var ryw = oxw * s2 + oyw * c;
    return { x: cx + rxw, y: cy + ryw * aspect, sx: sx, sy: sy };
  }

  /* The handles belong to the gesture library now, and it listens to mouse
     events rather than pointer ones — driving it with the events it does not
     listen to was how a test could pass a path the browser never takes. */
  function mouse(el, type, x, y, mods) {
    var init = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, which: 1 };
    if (mods) for (var k in mods) init[k] = mods[k];
    el.dispatchEvent(new MouseEvent(type, init));
  }
  function drag(handle, dx, dy, mods) {
    var r = handle.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    mouse(handle, 'mousedown', x, y, mods);
    mouse(window, 'mousemove', x + dx / 2, y + dy / 2, mods);
    mouse(window, 'mousemove', x + dx, y + dy, mods);
    mouse(window, 'mouseup', x + dx, y + dy, mods);
  }
  function handle(dir) { return q('.moveable-control-box .moveable-control.moveable-' + dir); }
  /* Poking styles from a test is not a thing the editor did, so the handles have
     not been told. A window resize is the app's own way of saying "re-measure". */
  function settle() { window.dispatchEvent(new Event('resize')); }

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      var slide = q('.slides-offset > section.slide');
      q('[data-shape="rect"]').click();
      var o = q('.slide-object.is-selected');
      var DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

      ok('选中之后八个方向都有手柄', DIRS.every(function (d) { return !!handle(d); }));
      ok('有旋转柄', !!q('.moveable-control-box .moveable-rotation-control'));
      ok('手柄画在 slide 里面（缩放才对得上）',
        !!q('.slides-offset > section.slide > .moveable-control-box') ||
        !!q('.slides-offset > section.slide .moveable-control-box'));

      var cases = [];
      [0, 30].forEach(function (angle) {
        DIRS.forEach(function (dir) { cases.push({ angle: angle, dir: dir }); });
      });

      var i = 0;
      function step() {
        if (i >= cases.length) { tail(); return; }
        var c = cases[i++];
        var dir = c.dir;
        o.style.left = '30%'; o.style.top = '30%';
        o.style.width = '24%'; o.style.height = '22%';
        o.style.transform = c.angle ? 'rotate(' + c.angle + 'deg)' : '';
        settle();
        setTimeout(function () {
          var sr = slide.getBoundingClientRect();
          var aspect = sr.width / sr.height;
          var before = frame(o);
          var want = anchorPoint(before, dir, aspect);
          // Pull outward along both axes so every handle actually grows.
          var pull = { nw: [-50, -40], n: [0, -40], ne: [50, -40], e: [50, 0],
                       se: [50, 40], s: [0, 40], sw: [-50, 40], w: [-50, 0] }[dir];
          var h = handle(dir);
          if (!h) { ok(c.angle + '° 拉 ' + dir + '：手柄在', false); step(); return; }
          drag(h, pull[0], pull[1]);
          var after = frame(o);
          var got = anchorPoint(after, dir, aspect);
          // In percent of the slide; 0.4% of 1280 is about five pixels.
          var slipX = want.sx === 0 ? 0 : Math.abs(got.x - want.x);
          var slipY = want.sy === 0 ? 0 : Math.abs(got.y - want.y);
          var grew = (dir === 'n' || dir === 's') ? after.h > before.h
                   : (dir === 'e' || dir === 'w') ? after.w > before.w
                   : (after.w > before.w && after.h > before.h);
          ok(c.angle + '° 拉 ' + dir + '：对角不动（偏移 ' + slipX.toFixed(2) + ',' + slipY.toFixed(2) + '%）',
             slipX < 0.25 && slipY < 0.25);
          ok(c.angle + '° 拉 ' + dir + '：真的变大了', grew);
          setTimeout(step, 20);
        }, 40);
      }

      function tail() {
        // The axis that was not grabbed must not change at all.
        o.style.left = '30%'; o.style.top = '30%'; o.style.width = '24%'; o.style.height = '22%';
        o.style.transform = '';
        settle();
        setTimeout(function () {
          var b0 = frame(o);
          drag(handle('e'), 60, 0);
          var a0 = frame(o);
          ok('拉右边不会碰到高度', Math.abs(a0.h - b0.h) < 0.05 && Math.abs(a0.t - b0.t) < 0.05);
          finish();
        }, 40);
      }

      step();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
