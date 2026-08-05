(function () {
  /* A modal freezes a headless renderer. Nothing here may reach one. */
  if (!window.__modalsStubbed) {
    window.__modalsStubbed = true;
    window.alert = function () {};
    window.confirm = function () { return true; };
    if (!window.prompt.__stub) { window.prompt = function () { return 'example.com'; }; window.prompt.__stub = 1; }
  }

  var log = [];
  function ok(n, c) { log.push((c ? 'PASS  ' : 'FAIL  ') + n); return !!c; }
  function q(s, r) { return (r || document).querySelector(s); }
  function shown(s) { var e = q(s); return !!e && getComputedStyle(e).display !== 'none'; }
  function key(k) { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); }
  function editing() { return document.body.classList.contains('deck-edit-mode'); }
  function presenting() { return document.body.classList.contains('deck-presenting'); }
  function finish() {
    var pre = document.createElement('pre');
    pre.id = 'shape-test-out';
    pre.textContent = log.join('\n');
    document.body.appendChild(pre);
  }

  window.addEventListener('load', function () { setTimeout(run, 450); });

  function run() {
    try {
      var isReading = document.documentElement.getAttribute('data-deck-mode') === 'view';

      if (!isReading) {
        // --- a working file: an editor, and a way to present. Nothing else. ---
        ok('工作文件一打开就是编辑器', editing());
        ok('没有 Done —— 没有第三个状态可回', !shown('.deck-btn-done'));
        ok('没有 Edit 按钮 —— 已经在编辑了', !shown('.edit-toggle'));
        ok('E 键不会把人踢出编辑器', (key('e'), editing()));

        // F5 works from inside the editor; a bare P cannot, since P is a letter
        // someone might be typing.
        key('F5');
        ok('F5 从编辑器里直接放映', presenting());
        ok('放映时编辑器让开', !editing());
        key('Escape');
        ok('Esc 回到的是编辑器，不是别的地方', editing());

        // The same trip via the button people actually click.
        q('.deck-btn-present').click();
        ok('顶栏 Present 按钮也能放映', presenting());
        key('Escape');
        ok('按钮那条路回来也是编辑器', editing());

        ok('导出里有"只读副本"这一项', !!document.getElementById('btnSaveReading'));
      } else {
        // --- a reading copy: opens as something to read ----------------------
        ok('阅读副本打开时不是编辑器', !editing());
        ok('文档是不可编辑的',
          Array.prototype.slice.call(document.querySelectorAll('.slides-offset .slide-object-text'))
            .every(function (e) { return e.getAttribute('contenteditable') === 'false'; }));
        ok('标题也不可编辑', q('#deckTitle').getAttribute('contenteditable') === 'false');
        ok('有 Present 入口', !!q('.deck-btn-view-present'));
        ok('没有编辑器的工具栏', !shown('.deck-inspector'));
        ok('没有缩略图栏', !shown('.slide-sidebar'));

        // A reading copy is a posture, not a lock: whoever wants to change it
        // can, and then has a way back.
        key('e');
        ok('E 键能进编辑', editing());
        ok('进了编辑就有 Done 可以回来', shown('.deck-btn-done'));
        q('#btnDoneEdit').click();
        ok('Done 回到阅读态', !editing());

        key('p');
        ok('阅读态里 P 能放映', presenting());
        key('Escape');
        ok('Esc 回阅读态，不会掉进编辑器', !editing() && !presenting());
      }

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
