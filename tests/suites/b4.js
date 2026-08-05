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
  function set(sel, v, ev) { var el = q(sel); el.value = v; el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); return el; }
  function finish() { var p = document.createElement('pre'); p.id = 'b4-out'; p.textContent = log.join('\n'); document.body.appendChild(p); }
  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      // --- media from a link ---------------------------------------------------
      ok('Media 变成了三个入口', all('[data-insert="media"], [data-insert="media-link"]').length === 3);
      var realPrompt = window.prompt;
      window.prompt = function () { return 'https://example.com/talk.mp4'; };
      q('[data-insert="media-link"][data-media-kind="video"]').click();
      window.prompt = realPrompt;
      var vobj = q('.slide-object.is-selected');
      var v = vobj && vobj.querySelector('video');
      ok('链接的视频插进来了', !!v && v.getAttribute('src') === 'https://example.com/talk.mp4');
      ok('标了是链接的不是内嵌的', vobj.hasAttribute('data-media-linked'));
      ok('链接的视频没有把几百 KB 塞进文件', v.getAttribute('src').indexOf('data:') !== 0);

      // --- table ---------------------------------------------------------------
      q('[data-insert="table"]').click();
      var tobj = q('.slide-object.is-selected');
      var tbl = tobj.querySelector('.slide-object-table table');
      ok('表格上不再有重复的浮动控制条', !tobj.querySelector('.slide-object-tablectl'));

      var cols0 = tbl.rows[0].cells.length, rows0 = tbl.rows.length;
      ok('面板显示了列数', q('[data-table-cols]').textContent === String(cols0));
      ok('面板显示了行数', q('[data-table-rows]').textContent === String(rows0));

      q('[data-table="col+"]').click();
      ok('面板上的加列真的加了列（以前是死按钮）', tbl.rows[0].cells.length === cols0 + 1);
      ok('计数跟着变', q('[data-table-cols]').textContent === String(cols0 + 1));
      q('[data-table="col-"]').click();
      ok('减列也行', tbl.rows[0].cells.length === cols0);
      q('[data-table="row+"]').click();
      ok('加行也行', tbl.rows.length === rows0 + 1);
      q('#btnUndo').click();
      ok('行列变化能撤销', tbl.rows.length === rows0);

      var hd = q('[data-table-header]');
      hd.checked = true; hd.dispatchEvent(new Event('change', { bubbles: true }));
      ok('表头是个勾选框，勾上了', tbl.hasAttribute('data-head'));
      ok('表头那行变粗了', tbl.rows[0].cells[0].style.fontWeight === '700');

      set('[data-table-preset]', 'striped', 'change');
      ok('预设记下了', tbl.getAttribute('data-preset') === 'striped');
      ok('隔行底色出来了', !!tbl.rows[2] && tbl.rows[2].cells[0].style.background !== '');

      set('[data-table-head-fill]', '#112233');
      ok('表头底色改得动', tbl.rows[0].cells[0].style.background.indexOf('rgb(17, 34, 51)') === 0 ||
        tbl.rows[0].cells[0].style.background === '#112233');
      q('[data-table-clear="head-fill"]').click();
      ok('表头底色清得掉', !tbl.hasAttribute('data-head-fill'));

      set('[data-table-radius]', '10');
      ok('表格能圆角', tbl.style.borderRadius === '10px');
      ok('外框跟着裁切，不然圆角看不见', tbl.parentElement.style.overflow === 'hidden');
      set('[data-table-font]', '22');
      ok('表格字号改得动', tbl.style.fontSize === '22px');

      // Tab moves across, Enter moves down.
      var c00 = tbl.rows[0].cells[0];
      c00.focus();
      var ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      c00.dispatchEvent(ev);
      ok('Tab 跳到下一格', document.activeElement === tbl.rows[0].cells[1]);
      var ev2 = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      document.activeElement.dispatchEvent(ev2);
      ok('Enter 跳到下一行', document.activeElement === tbl.rows[1].cells[1]);

      // Table to chart.
      tbl.rows[0].cells[0].textContent = 'Q1'; tbl.rows[0].cells[1].textContent = '12';
      tbl.rows[1].cells[0].textContent = 'Q2'; tbl.rows[1].cells[1].textContent = '20';
      tbl.rows[2].cells[0].textContent = 'Q3'; tbl.rows[2].cells[1].textContent = '15';
      hd.checked = false; hd.dispatchEvent(new Event('change', { bubbles: true }));
      var before = all('[data-object-type="chart"]').length;
      q('[data-table-to-chart]').click();
      var charts = all('[data-object-type="chart"]');
      ok('从表格生成了图表', charts.length === before + 1);
      var made = charts[charts.length - 1];
      ok('数字是从表格里读出来的，不用重打', (made.getAttribute('data-chart-data') || '').indexOf('Q1 12') === 0);

      // --- chart ---------------------------------------------------------------
      q('[data-insert="chart"]').click();
      var cobj = q('.slide-object.is-selected');
      var host = cobj.querySelector('.slide-object-chart');
      ok('新图表默认就带着标签', cobj.hasAttribute('data-chart-labels'));
      ok('坐标轴标签真的画出来了（以前一个字都没有）', all('.chart-cat', host).length >= 4);
      ok('数值也标出来了', all('.chart-val', host).length >= 4);
      ok('文字是 HTML 不在 svg 里，所以不会被拉变形', !host.querySelector('svg text'));

      q('[data-chart-flag="labels"]').click();
      ok('标签能关掉', all('.chart-cat', host).length === 0);
      q('[data-chart-flag="labels"]').click();
      ok('也能开回来', all('.chart-cat', host).length >= 4);

      q('[data-chart-flag="grid"]').click();
      ok('网格线画出来了', cobj.querySelectorAll('svg line').length > 1);

      // Two numbers per label is two series.
      set('[data-chart-data-input]', 'Q1 12 8, Q2 18 14, Q3 9 11', 'input');
      set('[data-chart-names]', 'Plan, Actual');
      q('[data-chart-flag="legend"]').click();
      ok('一个标签给两个数就是两组', cobj.querySelectorAll('svg rect').length === 6);
      ok('图例出来了', all('.chart-key', host).length === 2);
      ok('图例用的是我填的名字', (q('.chart-key', host) || {}).textContent === 'Plan');

      set('[data-chart-colour]', '#cc0044');
      ok('图表配色改得动', cobj.querySelector('svg rect').getAttribute('fill') === '#cc0044');
      q('[data-chart-colour-reset]').click();
      ok('配色能还原成设计自己的', !cobj.hasAttribute('data-chart-colour'));

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
