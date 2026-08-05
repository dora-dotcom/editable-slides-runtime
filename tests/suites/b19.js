(function () {
  /* Charts: what the panel offers and what the SVG actually contains. */
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
    p.id = 'b19-out';
    p.textContent = log.join('\n');
    document.body.appendChild(p);
  }
  window.addEventListener('error', function (e) { log.push('ERROR ' + e.message); finish(); });
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

  var chart = null;
  function svg() { return q('.slide-object-chart svg', chart); }
  function words() { return q('.chart-words', chart); }
  function flag(name) {
    var b = q('[data-chart-flag="' + name + '"]');
    if (b) b.click();
  }
  function kind(name) { q('[data-chart-type="' + name + '"]').click(); }
  function data(str) {
    chart.setAttribute('data-chart-data', str);
    var di = q('[data-chart-data-input]');
    if (di) { di.value = str; di.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  /* Distinct fills, which is the whole point of a palette. */
  function fills(sel) {
    var seen = {};
    all(sel, svg()).forEach(function (n) { seen[n.getAttribute('fill')] = 1; });
    return Object.keys(seen).filter(function (k) { return k && k !== 'none'; });
  }

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      q('[data-insert="chart"]').click();
      chart = q('.slide-object.is-selected');
      ok('插进来一个 chart', !!chart && chart.getAttribute('data-object-type') === 'chart');
      ok('画出来了', !!svg() && svg().innerHTML.length > 0);

      // --- a palette rather than one colour at falling opacity ---------------
      data('Q1 12 8, Q2 18 14, Q3 9 16, Q4 22 11');
      var bars = fills('rect');
      ok('两个系列拿到两种不同的颜色（不是同色不同透明度）', bars.length === 2);
      ok('颜色是从 deck 的强调色推出来的十六进制', bars.every(function (c) { return /^#[0-9a-f]{6}$/i.test(c); }));
      ok('柱子上没有再靠 fill-opacity 区分',
        all('rect', svg()).every(function (r) { return !r.getAttribute('fill-opacity'); }));

      // --- explicit series colours ------------------------------------------
      var cl = q('[data-chart-colours]');
      cl.value = '#112233, #445566';
      cl.dispatchEvent(new Event('input', { bubbles: true }));
      var mine = fills('rect').sort();
      ok('自己指定的系列颜色会照用', mine.length === 2 && mine[0] === '#112233' && mine[1] === '#445566');
      cl.value = '';
      cl.dispatchEvent(new Event('input', { bubbles: true }));

      // --- axis numbers on round values -------------------------------------
      flag('axis');
      var ticks = all('.chart-axis', words()).map(function (s) { return parseFloat(s.textContent); });
      ok('侧边出现了刻度数字', ticks.length >= 3);
      ok('刻度是从 0 开始的整数', ticks.indexOf(0) !== -1 && ticks.every(function (t) { return t % 1 === 0; }));
      ok('刻度间隔一样宽', (function () {
        var gaps = [];
        for (var i = 1; i < ticks.length; i++) gaps.push(Math.abs(ticks[i] - ticks[i - 1]));
        return gaps.every(function (g) { return Math.abs(g - gaps[0]) < 1e-6; });
      })());

      // --- negatives hang below the zero line -------------------------------
      data('Up 20, Down -10, Flat 0');
      var rects = all('rect', svg());
      var axis = all('line', svg()).pop();
      var zero = parseFloat(axis.getAttribute('y1'));
      var up = rects[0], down = rects[1];
      ok('正数从零线往上长',
        parseFloat(up.getAttribute('y')) + parseFloat(up.getAttribute('height')) <= zero + 0.5);
      ok('负数从零线往下掉', parseFloat(down.getAttribute('y')) >= zero - 0.5);

      // --- stacked columns ---------------------------------------------------
      data('Q1 10 6, Q2 12 4');
      flag('stack');
      ok('Stacked 只在柱状图那一栏出现', !q('[data-chart-only="bar"]').hidden);
      var xs = all('rect', svg()).map(function (r) { return r.getAttribute('x'); });
      ok('堆叠后每类只有一列（两段共用一个 x）',
        xs.length === 4 && xs[0] === xs[1] && xs[2] === xs[3]);
      flag('stack');

      // --- line: smooth and area --------------------------------------------
      data('Jan 4, Feb 7, Mar 6, Apr 11, May 14');
      kind('line');
      ok('切到折线图', chart.getAttribute('data-chart') === 'line');
      ok('线是一条 path', !!q('path', svg()));
      var straight = q('path', svg()).getAttribute('d');
      ok('默认是直线段', straight.indexOf('Q') === -1);
      flag('smooth');
      ok('Smooth 之后变成曲线', q('path', svg()).getAttribute('d').indexOf('Q') !== -1);
      var before = all('path', svg()).length;
      flag('area');
      ok('Area 之后多了一块填色', all('path', svg()).length > before);
      ok('填色那块是闭合的，并且半透明', all('path', svg()).some(function (p) {
        return /Z$/.test(p.getAttribute('d') || '') && parseFloat(p.getAttribute('fill-opacity') || '1') < 0.5;
      }));
      ok('折线的选项只在折线那一栏', !q('[data-chart-only="line"]').hidden && q('[data-chart-only="bar"]').hidden);

      // --- pie and doughnut --------------------------------------------------
      data('Alpha 42, Beta 28, Gamma 18, Delta 12');
      kind('pie');
      ok('切到饼图', chart.getAttribute('data-chart') === 'pie');
      var slices = all('path', svg());
      ok('四块扇形', slices.length === 4);
      ok('每块颜色不同', fills('path').length === 4);
      ok('实心饼是从圆心画出去的', (slices[0].getAttribute('d') || '').indexOf('M50,31') === 0);
      flag('donut');
      ok('Doughnut 之后中间空了（不再从圆心起笔）',
        (all('path', svg())[0].getAttribute('d') || '').indexOf('M50,31') !== 0);
      ok('图例里带上了百分比', (function () {
        var keys = all('.chart-key', words()).map(function (k) { return k.textContent; });
        return keys.some(function (k) { return /%$/.test(k.trim()); });
      })());

      // --- scatter -----------------------------------------------------------
      data('10 8, 15 12, 22 10, 28 19, 34 15');
      kind('scatter');
      ok('切到散点图', chart.getAttribute('data-chart') === 'scatter');
      ok('五个点', all('circle', svg()).length === 5);
      ok('x 是按数值排的，不是按顺序均分', (function () {
        var cx = all('circle', svg()).map(function (c) { return parseFloat(c.getAttribute('cx')); });
        var d1 = cx[1] - cx[0], d2 = cx[2] - cx[1];
        return Math.abs(d2 - d1) > 0.5;   // 15→22 is a wider step than 10→15
      })());
      ok('底下的刻度也是数字', all('.chart-cat', words()).every(function (s) {
        return /^-?[\d.]+$/.test(s.textContent.trim());
      }));

      // A scatter on data written for columns still draws something.
      data('Q1 12, Q2 18, Q3 9');
      ok('拿柱状图的数据画散点也不会空白', all('circle', svg()).length === 3);

      // --- and the whole thing survives an export ---------------------------
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
      q('#btnSaveCopy').click();
      window.Blob = realBlob;
      var d = captured && new DOMParser().parseFromString(captured, 'text/html');
      ok('导出的文件里图还在', !!d && !!d.querySelector('[data-object-type="chart"] svg circle, [data-object-type="chart"] svg rect, [data-object-type="chart"] svg path'));
      ok('导出的文件里图的设置也在', !!d && d.querySelector('[data-object-type="chart"]').hasAttribute('data-chart-data'));

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
