window.addEventListener('load', function () {
  setTimeout(function () {
    var slides = document.querySelectorAll('.slides-offset > section.slide');
    var target = slides[1];
    var canvas = document.querySelector('.slides-offset');
    canvas.scrollTop += target.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
    canvas.dispatchEvent(new Event('scroll'));
    setTimeout(function () {
      var t = target.querySelector('.slide-object-text');
      var o = t.closest('[data-slide-object]');
      o.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      o.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
      t.setAttribute('contenteditable', 'true');
      t.focus();
      var n = t.firstChild;
      while (n && n.nodeType !== 3) n = n.firstChild;
      if (n) {
        var r = document.createRange();
        r.setStart(n, 0); r.setEnd(n, Math.min(18, n.length));
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        document.dispatchEvent(new Event('selectionchange'));
      }
    }, 250);
  }, 600);
});
