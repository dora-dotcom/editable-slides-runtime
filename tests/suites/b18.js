(function () {
  /* Type markdown, get typography.
   *
   * Every keystroke is dispatched the way a keyboard would: the character goes
   * in at the live caret and an `input` event follows, because the runtime reads
   * the selection rather than the event. A test that assembled the finished
   * string and fired one event would be testing a path a keyboard never takes.
   */
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
  function finish() {
    if (done) return;
    done = true;
    var p = document.createElement('pre');
    p.id = 'b18-out';
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

  function caret(node, offset) {
    var r = document.createRange();
    r.setStart(node, offset);
    r.collapse(true);
    var sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
  /** A fresh, empty, editable text object to type into. */
  function box() {
    q('[data-insert="text"]').click();
    var obj = q('.slide-object.is-selected');
    var host = q('.slide-object-text', obj);
    host.contentEditable = 'true';
    host.innerHTML = '';
    var t = document.createTextNode('');
    host.appendChild(t);
    host.focus();
    caret(t, 0);
    return host;
  }
  /** One keystroke: character in at the caret, then the input event. */
  function key(host, ch) {
    var sel = document.getSelection();
    var r = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!r || !host.contains(r.startContainer)) {
      var t0 = document.createTextNode('');
      host.appendChild(t0);
      caret(t0, 0);
      r = document.getSelection().getRangeAt(0);
    }
    var n = r.startContainer, off = r.startOffset;
    if (n.nodeType !== Node.TEXT_NODE) {
      var t = document.createTextNode('');
      if (n.childNodes[off]) n.insertBefore(t, n.childNodes[off]); else n.appendChild(t);
      n = t; off = 0;
    }
    n.insertData(off, ch);
    caret(n, off + ch.length);
    host.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
  }
  function type(host, text) {
    for (var i = 0; i < text.length; i++) key(host, text[i]);
  }
  function metaZ(host) {
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
  }
  /** Text with the zero-width caret spacers taken out, which is what a reader sees. */
  function shown(host) { return host.textContent.replace(/​/g, ''); }
  function html(host) { return host.innerHTML.replace(/​/g, ''); }

  window.addEventListener('load', function () { whenReady(run); });

  function run() {
    try {
      // --- inline patterns ---------------------------------------------------
      var h = box();
      type(h, '**bold**');
      ok('**bold** 变成真的粗体', !!q('b', h) && q('b', h).textContent === 'bold');
      ok('星号自己不见了', shown(h) === 'bold');
      type(h, ' after');
      ok('之后打的字不是粗的', q('b', h).textContent === 'bold' && shown(h) === 'bold after');

      h = box();
      type(h, '*slanted*');
      ok('*斜体* 变成斜体', !!q('i', h) && q('i', h).textContent === 'slanted');

      h = box();
      type(h, '__strong__');
      ok('__下划线两个__ 也是粗体', !!q('b', h) && q('b', h).textContent === 'strong');

      h = box();
      type(h, '_quiet_');
      ok('_单下划线_ 是斜体', !!q('i', h) && q('i', h).textContent === 'quiet');

      h = box();
      type(h, '~~gone~~');
      ok('~~删除线~~', !!q('s', h) && q('s', h).textContent === 'gone');

      h = box();
      type(h, '`npm run dev`');
      ok('`代码` 变成 code', !!q('code', h) && q('code', h).textContent === 'npm run dev');

      // --- what must NOT fire ------------------------------------------------
      h = box();
      type(h, '2*3 = 6');
      ok('乘号不会被当成斜体', !q('i', h) && shown(h) === '2*3 = 6');

      h = box();
      type(h, '\\*literal\\*');
      ok('反斜杠转义保持原样', !q('i', h) && shown(h).indexOf('*literal') !== -1);

      h = box();
      type(h, 'snake_case_name');
      ok('snake_case 不会变斜体', !q('i', h));

      // --- lists, which this runtime has for real -----------------------------
      h = box();
      type(h, '- first');
      ok('行首 "- " 变成真的项目符号列表', !!q('ul > li', h));
      /* Serialised, not textContent. A caret can end up inside a <br>, which is a
         void element: what you type becomes its child, renders nowhere, and is
         dropped from innerHTML — so the words are gone the moment the deck is
         saved. textContent counts them anyway and calls it a pass, which is
         exactly what happened here until a screenshot showed an empty box. */
      ok('列表项里是打的字，减号没留下',
        !!q('ul > li', h) && shown(h).indexOf('first') !== -1 &&
        html(h).indexOf('first') !== -1 && html(h).indexOf('<br>first') === -1);
      ok('字是 li 自己的内容，不是塞进 <br> 里', (function () {
        var li = q('ul > li', h);
        return !!li && Array.prototype.some.call(li.childNodes, function (n) {
          return n.nodeType === Node.TEXT_NODE && n.data.indexOf('first') !== -1;
        });
      })());

      h = box();
      type(h, '1. one');
      ok('行首 "1. " 变成编号列表', !!q('ol > li', h));

      h = box();
      type(h, 'not a list - dash');
      ok('句中的减号不会变列表', !q('ul', h));

      // --- ⌘Z means "I meant those characters" --------------------------------
      h = box();
      type(h, '**oops**');
      ok('先真的变粗了', !!q('b', h));
      metaZ(h);
      ok('⌘Z 把星号还回来', !q('b', h) && shown(h) === '**oops**');

      /* The revert window is "until the next keystroke", which is the whole
         point of it: it undoes the conversion, not your typing. */
      h = box();
      type(h, '- ');
      ok('"- " 立刻变成列表', !!q('ul', h));
      metaZ(h);
      ok('紧接着 ⌘Z 把列表撤回成减号', !q('ul', h) && shown(h).indexOf('-') === 0);

      h = box();
      type(h, '**typed**more');
      metaZ(h);
      ok('已经继续打字之后，⌘Z 不再抢这个键（粗体还在）', !!q('b', h));

      // --- pasting ------------------------------------------------------------
      h = box();
      var paste = function (host, text) {
        var dt = new DataTransfer();
        dt.setData('text/plain', text);
        host.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      };
      paste(h, 'plain **bold** and `code`\n- one\n- two\nafter');
      ok('粘贴的 **bold** 也转了', !!q('b', h) && q('b', h).textContent === 'bold');
      ok('粘贴的 `code` 也转了', !!q('code', h));
      ok('粘贴的两行列表变成一个列表两项',
        !!q('ul', h) && q('ul', h).querySelectorAll('li').length === 2);
      ok('列表之后的行还在', shown(h).indexOf('after') !== -1);

      h = box();
      paste(h, '1. one\n2. two');
      ok('粘贴编号列表变成 ol', !!q('ol', h) && q('ol', h).querySelectorAll('li').length === 2);

      h = box();
      /* Assembled, not written out: a literal closing script tag in this file
         would close the block this suite is injected into. */
      paste(h, '<' + 'script>alert(1)<' + '/script> **x**');
      ok('粘贴的标签被转义，不会变成真标签', !q('script', h) && html(h).indexOf('&lt;script') !== -1);

      // --- and none of it fires outside slide text ----------------------------
      var title = document.getElementById('deckTitle');
      if (title) {
        title.contentEditable = 'true';
        title.textContent = '';
        var tn = document.createTextNode('**not here**');
        title.appendChild(tn);
        caret(tn, tn.data.length);
        title.dispatchEvent(new InputEvent('input', { bubbles: true }));
        ok('deck 标题里不做 markdown 转换', !q('b', title));
      }

      finish();
    } catch (e) {
      log.push('ERROR ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]);
      finish();
    }
  }
})();
