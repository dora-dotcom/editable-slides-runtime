(function () {
  /* A modal freezes a headless renderer. Nothing here may reach one. */
  if (!window.__modalsStubbed) {
    window.__modalsStubbed = true;
    window.alert = function () {};
    window.confirm = function () { return true; };
    if (!window.prompt.__stub) { window.prompt = function () { return 'example.com'; }; window.prompt.__stub = 1; }
  }

  // The deck now opens in edit mode, so a suite must ensure the state it needs
  // rather than toggle blindly.
  function ensureEdit(){ if(!document.body.classList.contains('deck-edit-mode')){ var b=document.getElementById('editToggle'); if(b) b.click(); } }
  function ensureView(){ if(document.body.classList.contains('deck-edit-mode')){ var b=document.getElementById('btnDoneEdit'); if(b) b.click(); } }
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
  function ok(name, cond) { log.push((cond ? 'PASS  ' : 'FAIL  ') + name); return !!cond; }
  function q(sel, root) { return (root || document).querySelector(sel); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function finish() {
    var pre = document.createElement('pre');
    pre.id = 'a1-test-out';
    pre.textContent = log.join('\n');
    document.body.appendChild(pre);
  }

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      // --- enter edit mode -------------------------------------------------
      ensureEdit();
      ok('edit mode is on', document.body.classList.contains('deck-edit-mode'));

      var layer = q('.slides-offset');
      var oidsBefore = {};
      all('[data-slide-object]', layer).forEach(function (o) { oidsBefore[o.getAttribute('data-oid')] = 1; });
      var before = all('[data-slide-object]', layer).length;
      var chartsBefore = all('[data-chart-data]', layer).length;

      // --- insert one of everything ---------------------------------------
      ['text', 'table', 'chart'].forEach(function (k) { q('[data-insert="' + k + '"]').click(); });
      ['rect', 'ellipse', 'line', 'arrow'].forEach(function (k) {
        q('.deck-edit-chrome [data-shape="' + k + '"]').click();
      });

      var objs = all('[data-slide-object]', layer);
      ok('inserted 7 objects', objs.length === before + 7);
      ok('every object has an oid', objs.every(function (o) { return !!o.getAttribute('data-oid'); }));
      // Unique within a slide; repeating one across slides declares a morph.
      ok('oids are unique within each slide', all('.slides-offset > section.slide').every(function (sl) {
        var ids = all('[data-slide-object]', sl).map(function (o) { return o.getAttribute('data-oid'); });
        return new Set(ids).size === ids.length;
      }));
      var inserted = objs.filter(function (o) { return !oidsBefore[o.getAttribute('data-oid')]; });
      /* Handles are no longer buttons inside the object: the gesture library
         draws them into the slide, around whatever is selected. What every
         object still carries is the grip. */
      ok('every inserted object has its move grip', inserted.every(function (o) {
        return !!q('.slide-object-move', o);
      }));
      ok('and no object carries handles of its own any more',
        all('.slide-object-resize, .slide-object-rotate').length === 0);
      ok('selecting one draws a handle box in the slide', (function () {
        inserted[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
        return !!q('.slides-offset > section.slide .moveable-control-box');
      })());
      ok('geometry is percent-based', objs.every(function (o) { return /left:\s*[\d.]+%/.test(o.style.cssText); }));

      // --- shapes -----------------------------------------------------------
      ok('4 shape objects', inserted.filter(function (o) { return o.getAttribute('data-object-type') === 'shape'; }).length === 4);
      ok('shapes record their kind', ['rect', 'ellipse', 'line', 'arrow'].every(function (k) {
        return all('[data-object-type="shape"][data-shape="' + k + '"]', layer).length === 1;
      }));
      var arrowSvg = q('[data-shape="arrow"] svg', layer);
      ok('arrow renders line + head', arrowSvg && arrowSvg.querySelectorAll('line,polygon').length === 2);
      ok('shape stroke does not stretch', !!q('[data-shape="rect"] [vector-effect="non-scaling-stroke"]', layer));

      // --- table ------------------------------------------------------------
      var tbl = all('[data-object-type="table"] table', layer).pop();
      ok('table is 3x3', tbl && tbl.rows.length === 3 && tbl.rows[0].cells.length === 3);
      ok('cells are editable and reuse the RTE class', tbl &&
        tbl.rows[1].cells[0].classList.contains('slide-object-text') &&
        tbl.rows[1].cells[0].getAttribute('contenteditable') === 'true');
      // Rows and columns live in the properties panel now, not on a strip
      // floating over the table, so they act on the selected object.
      var tobj = tbl.closest('[data-object-type="table"]');
      tobj.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      tobj.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
      q('[data-table="row+"]').click();
      ok('+ Row adds a row', tbl.rows.length === 4);
      q('[data-table="col+"]').click();
      ok('+ Col adds a column', tbl.rows[0].cells.length === 4);
      q('[data-table="col-"]').click();
      ok('- Col removes a column', tbl.rows[0].cells.length === 3);
      ok('the table carries no duplicate control strip', !tobj.querySelector('.slide-object-tablectl'));

      // --- chart ------------------------------------------------------------
      var chartObj = q('[data-object-type="chart"]', layer);
      var svg = q('.slide-object-chart svg', chartObj);
      ok('chart rendered bars', svg && svg.querySelectorAll('rect').length === 4);
      chartObj.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      chartObj.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
      // Type and data live in the properties panel now — the strip that used to
      // float on the chart is gone, the same as the table's.
      ok('the chart carries no duplicate control strip', !chartObj.querySelector('.slide-object-chartctl'));
      q('[data-chart-type="pie"]').click();
      ok('switching to pie redraws', svg.querySelectorAll('path').length === 4);
      q('[data-chart-type="line"]').click();
      /* A path, not a polyline: the line can be smoothed now, and a smooth
         segment is a curve command that a polyline cannot hold. */
      ok('switching to line redraws', svg.querySelectorAll('path').length >= 1 &&
        svg.querySelectorAll('polyline').length === 0);
      var dataInput = q('[data-chart-data-input]');
      dataInput.value = 'A 5, B 10';
      dataInput.dispatchEvent(new Event('input', { bubbles: true }));
      ok('editing the data redraws', svg.querySelectorAll('circle').length === 2);

      // --- undo -------------------------------------------------------------
      q('[data-insert="text"]').click();
      var n = all('[data-slide-object]', layer).length;
      q('#btnUndo').click();
      ok('undo removes the last insert', all('[data-slide-object]', layer).length === n - 1);
      q('#btnRedo').click();
      ok('redo puts it back', all('[data-slide-object]', layer).length === n);

      // --- export strips editor furniture -----------------------------------
      // Capture the html where it is built, not by reading the Blob back: a
      // Blob read is real asynchronous work and a headless virtual clock runs
      // straight past it, so a poll measured in virtual time expires first.
      var captured = null;
      var realBlob = window.Blob;
      window.Blob = function (parts, opts) {
        if (parts && typeof parts[0] === 'string' && parts[0].indexOf('<!DOCTYPE html>') === 0) {
          captured = parts[0];
        }
        return new realBlob(parts, opts);
      };
      var realCreate = URL.createObjectURL;
      URL.createObjectURL = function () { return 'blob:stub'; };
      var realRevoke = URL.revokeObjectURL;
      URL.revokeObjectURL = function () {};
      var realClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {};
      delete window.showSaveFilePicker;  // force the download path
      q('#btnSaveCopy').click();
      HTMLAnchorElement.prototype.click = realClick;
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
      window.Blob = realBlob;

      if (captured) { checkExport(captured); }
      else { ok('export produced a file', false); }
      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }

  function checkExport(html) {
    var d = new DOMParser().parseFromString(html, 'text/html');
    ok('export has no table control strips', d.querySelectorAll('.slide-object-tablectl').length === 0);
    ok('export has no chart control strips', d.querySelectorAll('.slide-object-chartctl').length === 0);
    ok('export leaves nothing editable', d.querySelectorAll('[contenteditable="true"]').length === 0);
    ok('export keeps the chart svg', d.querySelectorAll('.slide-object-chart svg *').length > 0);
    ok('export keeps the chart data', d.querySelectorAll('[data-chart-data]').length >= 1);
    ok('export keeps the table', d.querySelectorAll('.slide-object-table table').length === 1);
    ok('export keeps all four shapes', d.querySelectorAll('[data-object-type="shape"]').length === 4);
    ok('export keeps every inserted object', d.querySelectorAll('[data-slide-object]').length ===
      document.querySelectorAll('[data-slide-object]').length);
    ok('export is a whole document', /^<!DOCTYPE html>\s*<html/i.test(html));
  }
})();
