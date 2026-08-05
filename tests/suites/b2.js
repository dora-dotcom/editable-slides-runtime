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
  function set(sel, v, ev) { var el = q(sel); el.value = v; el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); return el; }
  function finish() { var p = document.createElement('pre'); p.id = 'b2-out'; p.textContent = log.join('\n'); document.body.appendChild(p); }
  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      // --- text ---------------------------------------------------------------
      q('[data-insert="text"]').click();
      var obj = q('.slide-object.is-selected');
      var t = obj.querySelector('.slide-object-text');

      q('[data-text-align="center"]').click();
      ok('文字能居中', t.style.textAlign === 'center');
      ok('居中那个按钮亮起来了', q('[data-text-align="center"]').classList.contains('active'));
      q('[data-text-align="right"]').click();
      ok('能改成右对齐', t.style.textAlign === 'right');
      ok('居中那个按钮跟着灭了', !q('[data-text-align="center"]').classList.contains('active'));
      q('#btnUndo').click();
      ok('对齐能撤销', t.style.textAlign === 'center');

      q('[data-text-valign="center"]').click();
      ok('垂直居中生效', t.style.justifyContent === 'center');
      ok('垂直居中不是个死按钮 —— 盒子真的变成了列', t.style.display === 'flex' && t.style.flexDirection === 'column');
      ok('垂直那排按钮也亮了', q('[data-text-valign="center"]').classList.contains('active'));

      set('[data-text-leading]', '1.8');
      ok('行高改得动', t.style.lineHeight === '1.8');
      q('[data-text-leading-reset]').click();
      ok('行高能还原成设计自己的', !t.style.lineHeight);

      set('[data-text-weight]', '700', 'change');
      ok('字重改得动', t.style.fontWeight === '700');

      // Click away and back: the panel must still show what is set.
      set('[data-text-align]', '', 'change'); // no-op, just to move focus off
      q('[data-text-align="center"]').click();
      ok('回来时对齐仍然显示正确', q('[data-text-align="center"]').classList.contains('active'));

      // --- table --------------------------------------------------------------
      q('[data-insert="table"]').click();
      var tobj = q('.slide-object.is-selected');
      var tbl = tobj.querySelector('.slide-object-table table');
      ok('插入了表格', !!tbl);

      var cell = tbl.querySelector('th, td');
      set('[data-table-lines]', 'none', 'change');
      // Assert what is actually drawn — the shorthand does not round-trip.
      ok('能去掉网格线', getComputedStyle(cell).borderTopStyle === 'none');
      set('[data-table-lines]', 'rows', 'change');
      ok('能只留横线', getComputedStyle(cell).borderBottomStyle === 'solid' && getComputedStyle(cell).borderTopStyle === 'none');
      set('[data-table-lines]', 'all', 'change');
      ok('能全部加回来', getComputedStyle(cell).borderTopStyle === 'solid');

      set('[data-table-pad-x]', '1.2');
      ok('横向内边距改得动', cell.style.padding.indexOf('1.2em') !== -1);
      set('[data-table-pad-y]', '0.9');
      ok('纵向内边距改得动', cell.style.padding.indexOf('0.9em') === 0);

      var hb = q('[data-table-header]');
      var wasHead = tbl.hasAttribute('data-head');
      hb.click();
      ok('表头开关能切', tbl.hasAttribute('data-head') !== wasHead);
      // Header is a checkbox now, the way Bento has it.
      ok('勾选框反映了状态', hb.checked === tbl.hasAttribute('data-head'));
      q('#btnUndo').click();
      ok('表头开关能撤销', tbl.hasAttribute('data-head') === wasHead);

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
