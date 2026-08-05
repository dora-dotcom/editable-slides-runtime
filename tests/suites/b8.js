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
  function all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function pick(el) {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
  }
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
  function finish() { var p = document.createElement('pre'); p.id = 'b8-out'; p.textContent = log.join('\n'); document.body.appendChild(p); }
  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      var bar = q('#rteToolbar');
      ok('浮动条有项目符号按钮', !!q('[data-cmd="insertUnorderedList"]', bar));
      ok('浮动条有编号按钮', !!q('[data-cmd="insertOrderedList"]', bar));
      ok('那两个图标画出来了，不是空框',
        all('[data-cmd="insertUnorderedList"] svg *', bar).length > 1);
      ok('右边栏有 List 那一行', all('[data-block-list]').length === 3);

      q('[data-insert="text"]').click();
      var obj = q('.slide-object.is-selected');
      var t = obj.querySelector('.slide-object-text');
      t.innerHTML = 'first<br>second<br>third';

      // --- the panel turns the whole block into a list -------------------------
      q('[data-block-list="ul"]').click();
      var ul = t.querySelector('ul');
      ok('整块变成了项目符号列表', !!ul);
      ok('三行变成三个条目', ul && ul.children.length === 3);
      ok('文字没丢', t.textContent.replace(/\s+/g, '') === 'firstsecondthird');
      ok('缩进是照着这份 deck 已有的列表来的', /padding-left/.test(ul.getAttribute('style') || ''));
      ok('没有去改 marker，样式还是设计自己的', !/list-style/.test(ul.getAttribute('style') || ''));
      ok('面板反映了当前是项目符号', q('[data-block-list="ul"]').classList.contains('active'));

      q('[data-block-list="ol"]').click();
      ok('能换成编号列表', !!t.querySelector('ol') && !t.querySelector('ul'));
      ok('条目数没变', t.querySelector('ol').children.length === 3);

      q('[data-block-list="none"]').click();
      ok('能变回普通几行', !t.querySelector('ol') && !t.querySelector('ul'));
      ok('变回来文字还在', t.textContent.replace(/\s+/g, '') === 'firstsecondthird');

      q('#btnUndo').click();
      ok('列表的开关能撤销', !!t.querySelector('ol'));

      // --- an existing list in the document is read, not overwritten -----------
      pick(obj);
      ok('重新选中时面板认得出它是编号列表',
        q('[data-block-list="ol"]').classList.contains('active'));

      // --- Tab nests, Shift+Tab lifts back out ---------------------------------
      t.setAttribute('contenteditable', 'true');
      var li = t.querySelectorAll('li')[1];
      var r = document.createRange();
      r.selectNodeContents(li);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      var depthBefore = t.querySelectorAll('ol ol, ol ul, ul ul, ul ol').length;
      // A real Tab lands on the editable element, not on the item — dispatching
      // it on the <li> was testing a path the browser never takes.
      t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      ok('Tab 把条目缩进一级', t.querySelectorAll('ol ol, ol ul, ul ul, ul ol').length > depthBefore);
      // The browser leaves the nested list as a sibling of its item, which is
      // not allowed there and ends up in the file people receive.
      ok('嵌套的列表放在它该在的条目里，不是当兄弟节点丢在外面',
        t.querySelectorAll('ul > ul, ul > ol, ol > ul, ol > ol').length === 0);
      var li2 = t.querySelectorAll('li')[1];
      var r2 = document.createRange(); r2.selectNodeContents(li2);
      sel.removeAllRanges(); sel.addRange(r2);
      t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
      ok('Shift+Tab 退回来', t.querySelectorAll('ol ol, ol ul, ul ul, ul ol').length === depthBefore);

      // --- a list must survive being sent to someone --------------------------
      // Captured where the html is built; reading a Blob back is real async
      // work that a headless virtual clock runs past.
      var captured = null;
      var realBlob = window.Blob;
      window.Blob = function (parts, opts) {
        if (parts && typeof parts[0] === 'string' && parts[0].indexOf('<!DOCTYPE html>') === 0) captured = parts[0];
        return new realBlob(parts, opts);
      };
      URL.createObjectURL = function () { return 'blob:stub'; };
      URL.revokeObjectURL = function () {};
      HTMLAnchorElement.prototype.click = function () {};
      delete window.showSaveFilePicker;  // force the download path
      q('#btnSaveCopy').click();
      window.Blob = realBlob;
      var d = captured && new DOMParser().parseFromString(captured, 'text/html');
      ok('导出的文件里列表还在', !!d && d.querySelectorAll('.slide-object-text ol, .slide-object-text ul').length > 0);
      ok('导出的条目一条没少', !!d && d.querySelectorAll('.slide-object-text li').length >= 3);
      ok('导出的列表不是可编辑状态', !!d && d.querySelectorAll('[contenteditable="true"]').length === 0);

      finish();
      return;
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
