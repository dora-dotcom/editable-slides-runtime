// Three real states of the runtime, captured from a real deck.
window.addEventListener('load', function () {
  setTimeout(function () {
    var what = (location.hash || '#edit').slice(1);
    var slides = document.querySelectorAll('.slides-offset > section.slide');
    if (what === 'edit') {
      // Land on a slide with a table and a chart, with something selected so
      // the properties panel has content.
      var target = slides[4];
      var canvas = document.querySelector('.slides-offset');
      canvas.scrollTop += target.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
      canvas.dispatchEvent(new Event('scroll'));
      setTimeout(function () {
        var t = target.querySelector('[data-object-type="table"]');
        if (t) {
          t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        }
      }, 200);
    } else if (what === 'present') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true }));
      var next = document.querySelector('[data-present="next"]');
      for (var i = 0; i < 5 && next; i++) next.click();
      // The progress bar is chrome too, and this picture is about its absence.
      document.querySelectorAll('.progress-bar, .nav-dots').forEach(function (e) { e.style.display = 'none'; });
    } else if (what === 'speaker') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true }));
      var n = document.querySelector('[data-present="next"]');
      for (var j = 0; j < 5 && n; j++) n.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
    }
  }, 600);
});
