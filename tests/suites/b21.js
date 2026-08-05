(function () {
  /* A slide that computes: levers, formulas, formats, and a table that answers
   * when you drag one. */
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
    p.id = 'b21-out';
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
  function slide() { return q('.slides-offset > section.slide'); }
  function layer() { return q('.slide-edit-layer', slide()); }
  function pick(el, mods) {
    var r = el.getBoundingClientRect();
    var init = { bubbles: true, cancelable: true, pointerId: 1,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    if (mods) for (var k in mods) init[k] = mods[k];
    el.dispatchEvent(new PointerEvent('pointerdown', init));
  }
  /* Dragging a lever the way a hand does: the browser fires input on the range,
     and the runtime reads the range rather than the event. */
  function setLever(obj, value) {
    var input = q('input[type="range"]', obj);
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 }));
  }
  function calcSpan(host, formula, format, colour) {
    var span = document.createElement('span');
    span.setAttribute('data-calc', formula);
    if (format) span.setAttribute('data-format', format);
    if (colour) span.setAttribute('data-calc-colour', '');
    host.appendChild(span);
    return span;
  }

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      // --- inserting a lever --------------------------------------------------
      q('[data-insert="lever"]').click();
      var lev = q('.slide-object.is-selected');
      ok('插进来一个 lever', !!lev && lev.getAttribute('data-object-type') === 'lever');
      ok('它有滑块', !!q('input[type="range"]', lev));
      ok('自动起了个变量名', !!lev.getAttribute('data-var'));
      ok('右边栏出现 Lever 那一节', !q('#sectLever').hidden);

      // Name it the way her slide does.
      lev.setAttribute('data-var', 'R');
      lev.setAttribute('data-label', 'Users sharing one machine (R)');
      lev.setAttribute('data-min', '1');
      lev.setAttribute('data-max', '8');
      lev.setAttribute('data-step', '1');
      lev.setAttribute('data-value', '1');
      lev.style.left = '6%'; lev.style.top = '18%'; lev.style.width = '40%'; lev.style.height = '10%';

      var lev2 = (function () {
        q('[data-insert="lever"]').click();
        var l = q('.slide-object.is-selected');
        l.setAttribute('data-var', 'markup');
        l.setAttribute('data-label', 'Markup on machine minutes');
        l.setAttribute('data-min', '0');
        l.setAttribute('data-max', '2');
        l.setAttribute('data-step', '0.05');
        l.setAttribute('data-value', '1');
        l.setAttribute('data-format', 'pct0');
        l.style.left = '6%'; l.style.top = '30%'; l.style.width = '40%'; l.style.height = '10%';
        return l;
      })();

      // Constants for the parts of a model nobody drags.
      slide().setAttribute('data-vars', 'machine=50, tokens=0.25, explorers=700, regulars=250, operators=50');

      // --- a formula in text -------------------------------------------------
      q('[data-insert="text"]').click();
      var t1 = q('.slide-object.is-selected');
      var h1 = q('.slide-object-text', t1);
      h1.innerHTML = 'Breakeven utilisation = ';
      var breakeven = calcSpan(h1, '1 / (R * (1 + markup))', 'pct0');
      t1.style.left = '6%'; t1.style.top = '44%'; t1.style.width = '40%'; t1.style.height = '8%';

      // Nudging a lever recomputes it, which is the entire point.
      setLever(lev, 1);
      ok('R=1、markup=100% 时盈亏平衡点是 50%', breakeven.textContent === '50%');
      setLever(lev, 2);
      ok('R 拖到 2，答案跟着变成 25%', breakeven.textContent === '25%');
      setLever(lev2, 0);
      ok('markup 拖到 0，变成 50%', breakeven.textContent === '50%');
      setLever(lev2, 1);

      // --- formats ------------------------------------------------------------
      var fmt = q('.slide-object-text', t1);
      var cases = [
        ['4900', 'k', '4.9k'],
        ['4900', '$k', '$4.9k'],
        ['4900', '+$k', '+$4.9k'],
        ['-24500', '+$k', '-$24.5k'],
        ['1250000', '$k', '$1.3m'],
        ['0.5', 'pct0', '50%'],
        ['0.1234', 'pct1', '12.3%'],
        ['12345.6', 'n1', '12,345.6'],
        ['7', 'n', '7']
      ];
      var badFormats = cases.filter(function (c) {
        var s = calcSpan(fmt, c[0], c[1]);
        recalcNow();
        var got = s.textContent;
        s.remove();
        if (got !== c[2]) log.push('       ' + c[0] + ' as ' + c[1] + ' → ' + got + '（想要 ' + c[2] + '）');
        return got !== c[2];
      });
      ok('九种写法都对（k / $ / + / % / 小数 / 千分位）', badFormats.length === 0);

      // --- colour by sign ------------------------------------------------------
      var up = calcSpan(fmt, '10', '+$k', true);
      var down = calcSpan(fmt, '0 - 10', '+$k', true);
      recalcNow();
      ok('正数拿到 calc-pos', up.classList.contains('calc-pos'));
      ok('负数拿到 calc-neg 并且带负号', down.classList.contains('calc-neg') && down.textContent[0] === '-');
      ok('上下不同色', getComputedStyle(up).color !== getComputedStyle(down).color);

      // --- a table that answers, like hers ------------------------------------
      q('[data-insert="table"]').click();
      var table = q('.slide-object.is-selected');
      table.style.left = '52%'; table.style.top = '18%'; table.style.width = '42%'; table.style.height = '30%';
      var cells = all('.slide-object-text', table);
      ok('表格有格子可以放公式', cells.length >= 4);
      // margin per persona = users × machine time × minutes at the markup − cost
      var m1 = calcSpan(cells[0], 'explorers * 0.10 * machine * markup / R - explorers * 0.10 * machine / R', '+$k', true);
      var m2 = calcSpan(cells[1], 'operators * 0.75 * machine * markup / R - operators * 0.75 * machine / R', '+$k', true);
      var total = calcSpan(cells[2], '(explorers * 0.10 + operators * 0.75) * machine * (markup - 1) / R', '+$k', true);
      /* A markup of exactly 1 is no markup at all: every margin here is
         (markup - 1), so the whole table would be zero and a test that watched
         it move would be watching nothing. 1.25 is the 25% her slide charges. */
      setLever(lev2, 1.25);
      setLever(lev, 1);
      ok('表格里的公式算出来了', /\$/.test(m1.textContent) && /\$/.test(m2.textContent));
      ok('算出来的不是零', parseFloat(total.textContent.replace(/[^\d.-]/g, '')) !== 0);
      var before = total.textContent;
      setLever(lev, 4);
      ok('拖 R，表格整列都跟着动', total.textContent !== before);
      ok('合计仍然是三项的和', (function () {
        var n = function (s) { return parseFloat(s.replace(/[^\d.-]/g, '')); };
        return Math.abs(n(total.textContent) - (n(m1.textContent) + n(m2.textContent))) < 0.2;
      })());

      // --- a chart in the same model -----------------------------------------
      q('[data-insert="chart"]').click();
      var chart = q('.slide-object.is-selected');
      chart.setAttribute('data-chart-data', 'Explorer {explorers * 0.10 / R}, Operator {operators * 0.75 / R}');
      chart.style.left = '52%'; chart.style.top = '52%'; chart.style.width = '42%'; chart.style.height = '30%';
      setLever(lev, 1);
      var bars1 = all('rect', q('svg', chart)).map(function (r) { return parseFloat(r.getAttribute('height')); });
      setLever(lev, 8);
      var bars2 = all('rect', q('svg', chart)).map(function (r) { return parseFloat(r.getAttribute('height')); });
      ok('图表数据里的公式也会算', bars1.length === 2 && bars2.length === 2);
      ok('拖 R，柱子的比例跟着变', Math.abs(bars1[0] - bars2[0]) > 0.5 || Math.abs(bars1[1] - bars2[1]) > 0.5);

      // --- what a broken formula does ----------------------------------------
      var bad = calcSpan(fmt, 'R * ', 'n');
      var unknown = calcSpan(fmt, 'nosuchvar * 2', 'n');
      recalcNow();
      ok('写坏的公式显示 —，不炸', bad.textContent === '—');
      ok('用了不存在的变量也是 —', unknown.textContent === '—');
      /* Nothing in a formula may reach outside arithmetic. */
      var nasty = calcSpan(fmt, 'window', 'n');
      var nastier = calcSpan(fmt, 'alert(1)', 'n');
      recalcNow();
      ok('公式里写 window 不会拿到 window', nasty.textContent === '—');
      ok('公式里写 alert(1) 什么都不会发生', nastier.textContent === '—');
      bad.remove(); unknown.remove(); nasty.remove(); nastier.remove();

      // --- undo covers a drag, not every pixel -------------------------------
      setLever(lev, 1);
      var atOne = breakeven.textContent;
      setLever(lev, 5);
      ok('拖过之后数字变了', breakeven.textContent !== atOne);
      q('#btnUndo').click();
      ok('一次撤销就回到拖之前', lev.getAttribute('data-value') === '1' && breakeven.textContent === atOne);

      // --- live while presenting, which is the whole point --------------------
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true }));
      ok('进入放映', document.body.classList.contains('deck-presenting'));
      var presented = breakeven.textContent;
      setLever(lev, 6);
      ok('放映时拖 lever，数字照样跟着走', breakeven.textContent !== presented);
      ok('放映时也没把编辑器叫出来', !document.body.classList.contains('deck-edit-mode'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      setLever(lev, 5);

      // --- and it survives being sent to someone -----------------------------
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
      q('#btnSaveReading').click();
      window.Blob = realBlob;
      var d = captured && new DOMParser().parseFromString(captured, 'text/html');
      ok('只读副本里滑块还在', !!d && d.querySelectorAll('[data-object-type="lever"] input[type="range"]').length === 2);
      ok('公式也在（不是只剩数字）', !!d && d.querySelectorAll('[data-calc]').length >= 4);
      ok('公式旁边还留着上次算出来的值', !!d &&
        Array.prototype.some.call(d.querySelectorAll('[data-calc]'), function (s) { return /\d/.test(s.textContent); }));
      ok('常量记在 section 上', !!d && !!d.querySelector('section.slide[data-vars]'));

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }

  /* Recompute through the app's own path: a lever nudge is what a person does,
     and it is what makes the slide recalculate. */
  function recalcNow() {
    var lev = q('[data-object-type="lever"]');
    if (!lev) return;
    var input = q('input[type="range"]', lev);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
})();
