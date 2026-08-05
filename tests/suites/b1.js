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
  function shown(s) { var e = typeof s === 'string' ? q(s) : s; return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; }
  // Selection happens on pointerdown, which is what a real click sends first.
  function pick(el) {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
  }
  function set(sel, v, ev) { var el = q(sel); el.value = v; el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); return el; }
  function finish() {
    var pre = document.createElement('pre'); pre.id = 'b1-out'; pre.textContent = log.join('\n');
    document.body.appendChild(pre);
  }
  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      // --- shape --------------------------------------------------------------
      q('[data-shape="rect"]').click();
      var obj = q('.slide-object.is-selected');
      ok('插入了一个矩形', !!obj && obj.getAttribute('data-object-type') === 'shape');
      ok('选中形状时出现"填充与描边"', shown('#sectShape'));
      ok('选中形状时不会同时冒出图片那栏', !shown('#sectImage') && !shown('#sectMedia'));

      var svg = obj.querySelector('.slide-object-shape svg');
      set('[data-shape-fill]', '#ff0055');
      ok('填充色改到了形状上', svg.getAttribute('fill') === '#ff0055');
      set('[data-shape-stroke]', '#0033ff');
      ok('描边色也改得动', svg.getAttribute('stroke') === '#0033ff');
      set('[data-shape-stroke-width]', '6');
      ok('描边粗细改得动', svg.getAttribute('stroke-width') === '6');
      set('[data-shape-dash]', '7 5', 'change');
      ok('能改成虚线', svg.getAttribute('stroke-dasharray') === '7 5');
      set('[data-shape-radius]', '12');
      ok('矩形能圆角', svg.querySelector('rect').getAttribute('rx') === '12');
      q('#btnUndo').click();
      ok('圆角能撤销', svg.querySelector('rect').getAttribute('rx') !== '12');
      q('#btnRedo').click();
      ok('也能重做', svg.querySelector('rect').getAttribute('rx') === '12');
      q('[data-shape-fill-none]').click();
      ok('可以设成无填充', svg.getAttribute('fill') === 'none');

      // A line has no corners, so the row must not be there to poke at.
      q('[data-shape="line"]').click();
      ok('直线不显示圆角那一行', !shown('#shapeRadiusRow'));

      // An arrow's head must follow the stroke colour, not stay behind.
      q('[data-shape="arrow"]').click();
      var arrow = q('.slide-object.is-selected');
      set('[data-shape-stroke]', '#00aa44');
      var poly = arrow.querySelector('polygon');
      ok('箭头的头跟着描边色一起变', !!poly && poly.getAttribute('fill') === '#00aa44');

      // --- image --------------------------------------------------------------
      // Insert one the way the file picker would, then select it.
      var slide = document.querySelectorAll('.slides-offset > section.slide')[0];
      var layer = slide.querySelector('.slide-edit-layer') || slide;
      var g = document.createElement('div');
      g.className = 'slide-object'; g.setAttribute('data-slide-object', '');
      g.setAttribute('data-object-type', 'graphic'); g.setAttribute('data-oid', 'img-test');
      g.style.cssText = 'left:10%;top:10%;width:30%;height:30%;';
      g.innerHTML = '<div class="slide-object-graphic" style="width:100%;height:100%;">' +
        '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" style="width:100%;height:100%;object-fit:contain;">' +
        '</div>';
      layer.appendChild(g);
      pick(g);
      ok('选中图片时出现"裁切与圆角"', shown('#sectImage'));
      ok('图片那栏出现时形状那栏收起来', !shown('#sectShape'));
      var img = g.querySelector('img');
      set('[data-img-fit]', 'cover', 'change');
      ok('能改裁切方式', img.style.objectFit === 'cover');
      set('[data-img-radius]', '18');
      ok('图片能圆角', img.style.borderRadius === '18px');

      // --- media --------------------------------------------------------------
      var m = document.createElement('div');
      m.className = 'slide-object'; m.setAttribute('data-slide-object', '');
      m.setAttribute('data-object-type', 'media'); m.setAttribute('data-oid', 'vid-test');
      m.style.cssText = 'left:50%;top:10%;width:30%;height:30%;';
      m.innerHTML = '<div class="slide-object-media" style="width:100%;height:100%;">' +
        '<video src="data:video/mp4;base64,AAA" controls style="width:100%;height:100%;object-fit:contain;"></video></div>';
      layer.appendChild(m);
      pick(m);
      ok('选中视频时出现播放那栏', shown('#sectMedia'));
      var v = m.querySelector('video');
      q('[data-media-flag="loop"]').click();
      ok('循环播放打得开', v.hasAttribute('loop'));
      ok('按钮自己也亮了', q('[data-media-flag="loop"]').classList.contains('active'));
      q('[data-media-flag="loop"]').click();
      ok('再点一下关掉', !v.hasAttribute('loop'));
      set('[data-media-radius]', '10');
      ok('视频能圆角', v.style.borderRadius === '10px');

      // Audio has no picture — those rows must not be offered.
      var a = document.createElement('div');
      a.className = 'slide-object'; a.setAttribute('data-slide-object', '');
      a.setAttribute('data-object-type', 'media'); a.setAttribute('data-oid', 'aud-test');
      a.style.cssText = 'left:20%;top:80%;width:40%;height:8%;';
      a.innerHTML = '<div class="slide-object-media" style="width:100%;height:100%;">' +
        '<audio src="data:audio/mp3;base64,AAA" controls></audio></div>';
      layer.appendChild(a);
      pick(a);
      ok('音频不给裁切和封面这些没意义的行', !shown('#mediaFitRow') && !shown('#mediaPosterRow'));

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
