(function () {
  /* A modal freezes a headless renderer. Nothing here may reach one. */
  if (!window.__modalsStubbed) {
    window.__modalsStubbed = true;
    window.alert = function () {};
    window.confirm = function () { return true; };
    if (!window.prompt.__stub) { window.prompt = function () { return 'example.com'; }; window.prompt.__stub = 1; }
  }

  var log = [];
  function ok(n, c) { log.push((c ? 'PASS  ' : 'FAIL  ') + n); }
  function q(s, r) { return (r || document).querySelector(s); }
  function shown(s) { var e = q(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none'; }
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
  function finish() { var p = document.createElement('pre'); p.id = 'b12-out'; p.textContent = log.join('\n'); document.body.appendChild(p); }

  var asked = [], written = [], handles = 0;
  window.showSaveFilePicker = function (o) {
    asked.push(o || {});
    handles++;
    var id = handles;
    return Promise.resolve({
      _id: id,
      createWritable: function () {
        return Promise.resolve({
          write: function (d) { written.push({ handle: id, text: String(d) }); return Promise.resolve(); },
          close: function () { return Promise.resolve(); }
        });
      }
    });
  };
  URL.createObjectURL = function () { return 'blob:stub'; };
  URL.revokeObjectURL = function () {};
  HTMLAnchorElement.prototype.click = function () {};

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      // --- the reader's dots do not float over the editor ----------------------
      ok('编辑态里不显示阅读用的圆点', !shown('.nav-dots'));
      ok('编辑态里也不显示进度条', !shown('.progress-bar'));

      // --- Save offers the file you are looking at, not a new one --------------
      var opened = decodeURIComponent(location.pathname).split('/').pop();
      q('#btnSaveFile').click();
      setTimeout(function () {
        try {
          ok('保存问了一次（浏览器不给已打开文件的写入权限）', asked.length === 1);
          ok('对话框提议的就是当前这个文件，不是另起一个',
            asked[0].suggestedName === opened);
          ok('带了 id，浏览器会记住上次的目录', asked[0].id === 'editable-deck-file');
          ok('确实写出去了', written.length === 1 && written[0].text.indexOf('<!DOCTYPE html>') === 0);

          // --- and never asks again --------------------------------------------
          q('#btnSaveFile').click();
          setTimeout(function () {
            try {
              ok('第二次保存不再问', asked.length === 1);
              ok('写的是同一个文件', written.length === 2 && written[1].handle === written[0].handle);

              // --- a copy is deliberate, and does not steal the handle ---------
              // Save is one button now; the copies are files you come away
              // with, which is what the Export menu already means.
              ok('Save 旁边没有拼接的箭头了', !q('#btnSaveMore') && !q('#deckSaveWrap'));
              ok('副本在 Export 菜单里', !!q('.deck-menu[data-menu="export"] #btnSaveCopy'));
              q('#btnSaveCopy').click();
              setTimeout(function () {
                try {
                  ok('存副本会问去哪，因为那是另一个文件', asked.length === 2);
                  ok('副本自己起名字，不叫当前文件名',
                    asked[1].suggestedName !== opened && /copy/.test(asked[1].suggestedName));
                  ok('副本写进了另一个文件', written.length === 3 && written[2].handle !== written[0].handle);

                  q('#btnSaveFile').click();
                  setTimeout(function () {
                    try {
                      ok('存过副本之后，Save 还是写原来那个文件',
                        asked.length === 2 && written[3].handle === written[0].handle);

                      // --- a reading copy saved straight to a file --------------
                      q('#btnSaveReading').click();
                      setTimeout(function () {
                        try {
                          var last = written[written.length - 1].text;
                          ok('阅读副本存出去的带 view 标记', /data-deck-mode="view"/.test(
                            new XMLSerializer().serializeToString(
                              new DOMParser().parseFromString(last, 'text/html').documentElement).slice(0, 400)));
                          ok('阅读副本也没有占用原文件的位置',
                            written[written.length - 1].handle !== written[0].handle);
                          finish();
                        } catch (e) { log.push('ERROR ' + e.message); finish(); }
                      }, 250);
                    } catch (e) { log.push('ERROR ' + e.message); finish(); }
                  }, 250);
                } catch (e) { log.push('ERROR ' + e.message); finish(); }
              }, 250);
            } catch (e) { log.push('ERROR ' + e.message); finish(); }
          }, 250);
        } catch (e) { log.push('ERROR ' + e.message); finish(); }
      }, 300);
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
