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
  function finish() { var p = document.createElement('pre'); p.id = 'b5-out'; p.textContent = log.join('\n'); document.body.appendChild(p); }

  // Stand in for the file picker so nothing has to be clicked by a person.
  var written = null, picked = 0, fellBack = 0, caught = [];
  window.addEventListener('error', function (e) { caught.push(e.message); });
  window.addEventListener('unhandledrejection', function (e) { caught.push('reject: ' + (e.reason && e.reason.message)); });
  // Writing in place can fall back to handing over a copy. In a headless
  // browser a real download stalls the renderer, so catch that path too and
  // report it rather than hanging on it.
  URL.createObjectURL = function (blob) {
    fellBack++;
    blob.text().then(function (t) { if (!written) written = t; });
    return 'blob:stub';
  };
  URL.revokeObjectURL = function () {};
  HTMLAnchorElement.prototype.click = function () {};
  window.showSaveFilePicker = function () {
    picked++;
    return Promise.resolve({
      createWritable: function () {
        return Promise.resolve({
          write: function (data) { written = String(data); return Promise.resolve(); },
          close: function () { return Promise.resolve(); }
        });
      }
    });
  };

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      localStorage.clear();
      var note = q('#deckSaveNote');
      var btn = q('#btnSaveFile');
      ok('顶栏有 Save 按钮', !!btn);
      ok('一开始不显示时间', note.textContent === '');

      // The chart controls are readable now, not squashed into icon slots.
      q('[data-insert="chart"]').click();
      /* The Show row is the always-on set. The kind-specific rows (stacking,
         smoothing, a hole in a pie) are hidden unless the chart is that kind, so
         only what is on screen is measured. */
      var visible = function (name) {
        var b = q('[data-chart-flag="' + name + '"]');
        return !!b && b.getBoundingClientRect().width > 0;
      };
      ok('Show 那排五个都在', ['labels', 'values', 'legend', 'grid', 'axis'].every(visible));
      ok('新图是柱状图，所以只多出 Stacked', visible('stack') &&
        !visible('smooth') && !visible('area') && !visible('donut'));
      var flags = all('[data-chart-flag]').filter(function (b) {
        return b.getBoundingClientRect().width > 0;
      });
      var widths = flags.map(function (b) { return b.getBoundingClientRect().width; });
      ok('每个按钮都装得下自己的字', widths.every(function (w) { return w > 34; }));
      ok('按钮之间不重叠', (function () {
        for (var i = 1; i < flags.length; i++) {
          var a = flags[i - 1].getBoundingClientRect(), b = flags[i].getBoundingClientRect();
          if (b.top === a.top && b.left < a.right - 0.5) return false;
        }
        return true;
      })());
      var cobj = q('.slide-object.is-selected');
      ok('图表上不再有重复的浮动控制条', !cobj.querySelector('.slide-object-chartctl'));

      // Autosave writes the browser copy and says so.
      setTimeout(function () {
        try {
          ok('自动存了之后标题旁边有时间', /\d+:\d\d/.test(note.textContent));
          ok('说清楚了存在浏览器里', note.textContent.indexOf('browser') !== -1);
          ok('还没写过文件时按钮上有个提示点', btn.classList.contains('is-dirty'));

          btn.click();
          // Writing is asynchronous; wait for it rather than for a span of
          // time, which a loaded machine kept outrunning.
          (function waitWrite(n) {
            if (!written && n < 60) { setTimeout(function () { waitWrite(n + 1); }, 100); return; }
            try {
              ok('Save 真的写了一份文件出来', !!written,
                'fellBack=' + fellBack + ' picked=' + picked + ' errs=' + caught.join('/'));
              if (!written) log.push('DIAG fellBack=' + fellBack + ' picked=' + picked + ' errs=' + caught.join('/'));
              ok('写出去的是完整的一份 deck',
                written.indexOf('<!DOCTYPE html>') === 0 &&
                written.indexOf('slides-offset') !== -1);
              ok('写出去的东西不是可编辑状态',
                new DOMParser().parseFromString(written, 'text/html')
                  .querySelectorAll('[contenteditable="true"]').length === 0);
              ok('存完说的是写进文件了', note.textContent.indexOf('the file') !== -1);
              ok('提示点消失了', !btn.classList.contains('is-dirty'));

              // Editing after a file save must say the file is behind.
              q('[data-insert="text"]').click();
              setTimeout(function () {
                try {
                  ok('再改动之后提醒文件落后了', note.textContent.indexOf('Unsaved') === 0);
                  ok('这时候提示点回来了', btn.classList.contains('is-dirty'));
                  ok('第二次保存不会再问一遍存到哪', (btn.click(), true));
                  setTimeout(function () {
                    ok('文件位置只问了一次', picked === 1);
                    finish();
                  }, 300);
                } catch (e) { log.push('ERROR ' + e.message); finish(); }
              }, 1200);
            } catch (e) { log.push('ERROR ' + e.message); finish(); }
          })(0);
        } catch (e) { log.push('ERROR ' + e.message); finish(); }
      }, 1200);
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
