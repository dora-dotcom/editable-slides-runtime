(function () {
  /* A modal freezes a headless renderer. Nothing here may reach one. */
  if (!window.__modalsStubbed) {
    window.__modalsStubbed = true;
    window.alert = function () {};
    window.confirm = function () { return true; };
    if (!window.prompt.__stub) { window.prompt = function () { return 'example.com'; }; window.prompt.__stub = 1; }
  }

  var log = [], texts = [], names = [];
  function ok(n, c) { log.push((c ? 'PASS  ' : 'FAIL  ') + n); }
  /* Capture where the html is built rather than by reading the Blob back: a
   * Blob read is real asynchronous work, and a headless virtual clock runs
   * straight past it, so a poll measured in virtual time expires first. */
  var realBlob = window.Blob;
  window.Blob = function (parts, opts) {
    if (parts && typeof parts[0] === 'string' && parts[0].indexOf('<!DOCTYPE html>') === 0) {
      texts.push(parts[0]);
    }
    return new realBlob(parts, opts);
  };
  /* This suite is about the fallback: a browser with no way to write in place
   * hands over a download instead, and that copy must be as complete and as
   * sanitised as one written to a file. */
  delete window.showSaveFilePicker;
  URL.createObjectURL = function () { return 'blob:stub'; };
  URL.revokeObjectURL = function () {};
  HTMLAnchorElement.prototype.click = function () { names.push(this.download || ''); };

  window.addEventListener('load', function () { setTimeout(function () {
    document.getElementById('btnSaveReading').click();
    document.getElementById('btnSaveCopy').click();

    var ro = null, rw = null;
    names.forEach(function (n, i) { if (/reading copy/.test(n)) ro = texts[i]; else rw = texts[i]; });
    function parse(t) { return t ? new DOMParser().parseFromString(t, 'text/html') : null; }
    function editableCount(d) { return d ? d.querySelectorAll('[contenteditable="true"]').length : -1; }
    var dro = parse(ro), drw = parse(rw);

    ok('只读副本的文件名认得出来', names.some(function (n) { return /reading copy/.test(n); }));
    ok('只读副本开头就标着 view',
      !!dro && dro.documentElement.getAttribute('data-deck-mode') === 'view');
    ok('只读副本里没有一处是可编辑的', editableCount(dro) === 0);
    ok('只读副本仍然是完整的一份文件',
      !!ro && ro.indexOf('<!DOCTYPE html>') === 0 && !!dro.querySelector('.slides-offset > section.slide'));
    ok('只读副本带着 runtime，能自己放映', !!dro && dro.querySelectorAll('script').length > 0);
    ok('普通导出没有 view 标记',
      !!drw && drw.documentElement.getAttribute('data-deck-mode') === null);
    ok('普通导出也没有残留的可编辑状态', editableCount(drw) === 0);
    ok('两份的内容是同一个 deck',
      !!dro && !!drw &&
      dro.querySelectorAll('.slides-offset > section.slide').length ===
      drw.querySelectorAll('.slides-offset > section.slide').length);

    window.Blob = realBlob;
    var pre = document.createElement('pre');
    pre.id = 'ro-out';
    pre.textContent = log.join('\n') + '\n[names ' + names.length + '] ' + names.join(' , ') +
      '\n[texts ' + texts.length + ']';
    document.body.appendChild(pre);
  }, 500); });
})();
