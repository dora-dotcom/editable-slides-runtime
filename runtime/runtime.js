// Editable deck runtime — extracted from frontend-slides-editable/examples/editable-deck-reference.html
// Lines 535-1938. Drop-in: paste inside a script tag before </body>.

(function () {
  'use strict';

  const STORAGE_KEY = 'editable-deck:' + (document.documentElement.getAttribute('data-deck-id') || 'default');
  const SNAP_PX = 8;
  const MAX_HISTORY = 60;
  const RESIZE_MIN_FRAC = 0.05;

  // Declared up here rather than beside the chart code: a document that already
  // contains a chart repaints during startup, which runs before a `const` lower
  // in the file has been initialised.
  const CHART_FILL = 'var(--deck-chrome-accent, currentColor)';
  const CHART_INK = 'var(--text-primary, currentColor)';

  /* ---------- Embed etiquette ----------
   * A deck carries its own chrome so it works alone. Inside someone else's
   * viewer that chrome is a collision: two toolbars, two sets of arrow-key
   * handlers, two present modes. So when framed, the runtime stands down and
   * leaves the document as content — unless the host explicitly asks for it
   * back by setting data-deck-host-chrome on <html>, which is how a host that
   * wants to offer the editor opts in. See CONTRACT.md. */
  const IS_EMBEDDED = (function () {
    try { return window.self !== window.top; } catch (e) { return true; }
  })();
  const CHROME_ENABLED =
    !IS_EMBEDDED || document.documentElement.hasAttribute('data-deck-host-chrome');
  if (!CHROME_ENABLED) document.documentElement.classList.add('deck-stood-down');

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function isDeckChromeNode(node) {
    if (!node || !node.closest) return false;
    return !!(node.closest('#deckEditChrome') || node.closest('#rteToolbar') || node.closest('#slideSidebar') ||
      node.closest('.deck-edit-chrome') || node.closest('[data-deck-chrome-surface]'));
  }

  /* ---------- History ---------- */
  class HistoryStack {
    constructor(onChange) {
      this._u = [];
      this._r = [];
      this._onChange = typeof onChange === 'function' ? onChange : function () {};
    }
    /* Saving hangs off a real change to the deck, not off the chrome being
     * refreshed — hooked to the latter, merely opening a file wrote a copy
     * and told you it had saved something you had not done. */
    _changed() {
      if (typeof scheduleSave === 'function') scheduleSave();
      this._onChange();
    }
    push(record) {
      this._u.push(record);
      if (this._u.length > MAX_HISTORY) this._u.shift();
      this._r.length = 0;
      this._changed();
    }
    undo() {
      const r = this._u.pop();
      if (r && r.undo) r.undo();
      if (r) this._r.push(r);
      this._changed();
    }
    redo() {
      const r = this._r.pop();
      if (r && r.redo) r.redo();
      if (r) this._u.push(r);
      this._changed();
    }
    canUndo() { return this._u.length > 0; }
    canRedo() { return this._r.length > 0; }
  }

  /* ---------- Slide deck (scroll / nav) ---------- */
  class SlideDeck {
    constructor() {
      this.slidesContainer = document.body;
      this.refreshSlides();
      this.current = 0;
      this.onSlideChange = null;
      this._obs = new IntersectionObserver(
        (ents) => {
          ents.forEach((en) => {
            if (en.isIntersecting) en.target.classList.add('visible');
          });
        },
        { threshold: 0.35 }
      );
      this.slides.forEach((s) => this._obs.observe(s));
      this._onScroll = () => this._syncCurrentFromScroll();
      window.addEventListener('scroll', this._onScroll, { passive: true });
      this._keys = this._keys.bind(this);
      window.addEventListener('keydown', this._keys);
      this._wheel = this._wheel.bind(this);
      window.addEventListener('wheel', this._wheel, { passive: false });
      this._syncCurrentFromScroll();
    }
    refreshSlides() {
      const root = document.querySelector('.slides-offset');
      this.slides = root
        ? Array.from(root.querySelectorAll(':scope > section.slide'))
        : [];
    }
    _syncCurrentFromScroll() {
      const h = window.innerHeight;
      let best = 0, bestRatio = 0;
      this.slides.forEach((s, i) => {
        const r = s.getBoundingClientRect();
        const vis = Math.max(0, Math.min(r.bottom, h) - Math.max(r.top, 0)) / h;
        if (vis > bestRatio) { bestRatio = vis; best = i; }
      });
      if (best !== this.current) {
        this.current = best;
        this.onSlideChange && this.onSlideChange(best);
      }
      this._updateChrome();
    }
    goTo(i, dir) {
      this.refreshSlides();
      i = Math.max(0, Math.min(this.slides.length - 1, i));
      // Slides marked skip are still editable, just not part of the talk.
      if (document.body.classList.contains('deck-presenting')) {
        const step = dir || (i >= this.current ? 1 : -1);
        while (this.slides[i] && this.slides[i].hasAttribute('data-skip')) {
          const next = i + step;
          if (next < 0 || next >= this.slides.length) break;
          i = next;
        }
      }
      const instant = prefersReducedMotion() || document.body.classList.contains('deck-presenting');
      this.slides[i].scrollIntoView({ behavior: instant ? 'auto' : 'smooth' });
      this.current = i;
      this._updateChrome();
      this.onSlideChange && this.onSlideChange(i);
    }
    /* Which slide is current, without scrolling to it. goTo both moves the
     * view and records where you are, which is right when something asks to
     * go somewhere — but scrolling the canvas and clicking a slide also change
     * where you are, and neither should yank the view. Without this the deck
     * still believed it was on the first slide, so everything was inserted
     * there no matter what you were looking at. */
    setCurrent(i) {
      this.refreshSlides();
      if (i < 0 || i >= this.slides.length || i === this.current) return;
      this.current = i;
      this._updateChrome();
      this.onSlideChange && this.onSlideChange(i);
    }
    _updateChrome() {
      const n = this.slides.length;
      const p = n ? ((this.current + 1) / n) * 100 : 0;
      const bar = document.getElementById('progressBar');
      if (bar) bar.style.width = p + '%';
      const dots = document.getElementById('navDots');
      if (dots) {
        dots.innerHTML = '';
        for (let i = 0; i < n; i++) {
          const b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('aria-label', 'Go to slide ' + (i + 1));
          if (i === this.current) b.classList.add('active');
          b.addEventListener('click', () => this.goTo(i));
          dots.appendChild(b);
        }
      }
    }
    _keys(e) {
      // Stood down inside someone else's viewer: the host pages the deck.
      if (!CHROME_ENABLED) return;
      /* Arrows and space in a panel field move the caret and type a space;
       * they must not also page the deck. */
      if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.body.classList.contains('deck-edit-mode')) {
        if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
          e.preventDefault(); this.goTo(this.current + 1);
        } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
          e.preventDefault(); this.goTo(this.current - 1);
        }
      } else {
        if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
          e.preventDefault(); this.goTo(this.current + 1);
        } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
          e.preventDefault(); this.goTo(this.current - 1);
        }
      }
    }
    _wheel(e) {
      if (!CHROME_ENABLED) return;
      if (document.body.classList.contains('deck-edit-mode')) return;
      if (Math.abs(e.deltaY) < 8) return;
      e.preventDefault();
      if (e.deltaY > 0) this.goTo(this.current + 1);
      else this.goTo(this.current - 1);
    }
  }

  /* A document's resting state is not editable. It was arriving with
   * contenteditable="true" baked into the markup, so anyone who opened a deck
   * just to read it could put a cursor in the text and type. Editing is a mode,
   * and the mode turns it on. */
  function setDeckEditable(on) {
    document.querySelectorAll('.slides-offset .slide-object-text').forEach(function (el) {
      el.setAttribute('contenteditable', on ? 'true' : 'false');
    });
  }

  const RESIZE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  function objectAngle(el) {
    const m = ((el && el.style.transform) || '').match(/rotate\(\s*(-?[\d.]+)deg/);
    return m ? parseFloat(m[1]) : 0;
  }

  function ensureResizeHandles(root) {
    const el = root || document;
    el.querySelectorAll('[data-slide-object]').forEach((obj) => {
      /* Eight, not one. A single corner meant an object could only ever grow
       * down and to the right — to trim the top of a box you had to move it as
       * well, and get both right. */
      /* All eight or none: a deck carrying handles from an older runtime — and
       * they were carried, because exports never stripped them — would
       * otherwise keep its single stale one and never get the rest. */
      const have = obj.querySelectorAll('.slide-object-resize');
      const complete = have.length === RESIZE_DIRS.length && RESIZE_DIRS.every(
        (d) => obj.querySelector('.slide-object-resize[data-resize="' + d + '"]'));
      if (!complete) {
        have.forEach((h) => h.remove());
        RESIZE_DIRS.forEach((dir) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'slide-object-resize';
          btn.setAttribute('data-resize', dir);
          btn.setAttribute('aria-label', 'Resize ' + dir);
          obj.appendChild(btn);
        });
      }
      /* Turning something is a thing you do by turning it. The panel's Angle
       * field stays, for when a number is what you mean. */
      if (!obj.querySelector('.slide-object-rotate')) {
        const rot = document.createElement('button');
        rot.type = 'button';
        rot.className = 'slide-object-rotate';
        rot.setAttribute('aria-label', 'Rotate');
        obj.appendChild(rot);
      }
      // A document arrives with objects but no handles — only ones inserted by
      // the editor carried them, so half a deck could be dragged and half
      // could not. Both handles are affordances, not content: added here,
      // stripped on save and export.
      if (!obj.querySelector('.slide-object-move')) {
        const mv = document.createElement('button');
        mv.type = 'button';
        mv.className = 'slide-object-move';
        mv.setAttribute('aria-label', 'Move');
        mv.textContent = '\u283F';
        obj.insertBefore(mv, obj.firstChild);
      }
    });
  }

  // Tables and charts carry their own control strips. Those are editor
  // furniture, stripped on save and export (see sanitizeEditableState), so they
  // are rebuilt here whenever a document is loaded or restored — the same
  // contract ensureResizeHandles has.
  function ensureObjectControls(root) {
    const el = root || document;
    /* The table's own strip is gone: rows and columns are in the panel, with a
     * count beside them, and two places to do one thing is one too many. Any
     * strip a document arrived carrying is taken out here. */
    el.querySelectorAll('.slide-object-tablectl, .slide-object-chartctl').forEach((strip) => strip.remove());
  }

  /* ---------- Editor: select, drag, resize, snap, RTE ---------- */
  class SlideObjectEditor {
    constructor(deck, history) {
      this.deck = deck;
      this.history = history;
      this.active = false;
      this.selected = new Set();
      this._dragState = null;
      this._resizeState = null;
      this._snapEls = [];

      this.toolbar = document.getElementById('rteToolbar');
      this._onDocPointerDown = this._onDocPointerDown.bind(this);
      this._onDocPointerMove = this._onDocPointerMove.bind(this);
      this._onDocPointerUp = this._onDocPointerUp.bind(this);
      this._onResizeMove = this._onResizeMove.bind(this);
      this._onResizeUp = this._onResizeUp.bind(this);
      this._onRotateMove = this._onRotateMove.bind(this);
      this._onRotateUp = this._onRotateUp.bind(this);
      this._onSelectionChange = this._onSelectionChange.bind(this);
      this._onFocusIn = this._onFocusIn.bind(this);
    }
    setActive(on) {
      this.active = !!on;
      document.body.classList.toggle('deck-edit-mode', on);
      document.body.classList.toggle('slide-anim-paused', on);
      setDeckEditable(on);
      const title = document.getElementById('deckTitle');
      if (title) title.setAttribute('contenteditable', on ? 'true' : 'false');
      if (on) {
        setTimeout(function () { if (zoomFit) fitZoom(); }, 0);
        ensureResizeHandles(document);
        ensureObjectControls(document);
        repaintCharts(document);
      refreshFields();
      } else {
        this.clearSelection();
        this.toolbar.classList.remove('visible');
        // The filmstrip belongs to the edit shell. Presenting turns editing
        // off, so without this it survived the trip and reappeared over the
        // deck on the way back.
        document.body.classList.remove('deck-sidebar-open');
        document.querySelectorAll('.slide-object-text[contenteditable="true"]').forEach((el) => {
          el.contentEditable = 'false';
        });
      }
    }
    toggle() { this.setActive(!this.active); }

    clearSelection() {
      this.selected.forEach((el) => el.classList.remove('is-selected'));
      this.selected.clear();
      if (typeof syncInspector === 'function') syncInspector();
    }
    _addSel(el) {
      el.classList.add('is-selected');
      this.selected.add(el);
      /* The panel used to be refreshed by a document-level click handler,
       * which meant inserting an object refreshed it a moment BEFORE the
       * object existed — the new sections stayed shut on the thing you had
       * just made. Selection is what the panel is about, so selection tells
       * it. */
      if (typeof syncInspector === 'function') syncInspector();
    }
    _toggleSel(el) {
      if (this.selected.has(el)) {
        el.classList.remove('is-selected');
        this.selected.delete(el);
      } else this._addSel(el);
    }
    _selectOnly(el) {
      this.clearSelection();
      this._addSel(el);
    }

    _closestObject(t) {
      return t && t.closest && t.closest('[data-slide-object]');
    }

    _onDocPointerDown(e) {
      if (!this.active) return;
      if (isDeckChromeNode(e.target)) return;

      const obj = this._closestObject(e.target);
      const slide = e.target.closest && e.target.closest('section.slide');

      /* Ctrl-click alone is a right-click on a Mac, so multiple selection was
       * unreachable on half the machines this runs on. Shift is the one
       * everybody already knows. */
      if (obj && (e.shiftKey || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this._toggleSel(obj);
        return;
      }

      if (obj && !(e.shiftKey || e.ctrlKey || e.metaKey)) {
        const onResize = e.target.closest('.slide-object-resize');
        if (onResize) {
          e.preventDefault();
          e.stopPropagation();
          if (!this.selected.has(obj)) this._selectOnly(obj);
          if (this.selected.size === 1) this._startResize(e, obj);
          return;
        }

        if (e.target.closest('.slide-object-rotate')) {
          e.preventDefault();
          e.stopPropagation();
          this._startRotate(e, obj);
          return;
        }

        const isText = obj.getAttribute('data-object-type') === 'text';
        const onMove = e.target.closest('.slide-object-move');
        const onText = e.target.closest('.slide-object-text');

        if (isText && onText && !onMove) {
          this._selectOnly(obj);
          const te = obj.querySelector('.slide-object-text');
          if (te) {
            if (te.dataset._deckHtmlBefore === undefined) te.dataset._deckHtmlBefore = te.innerHTML;
            te.contentEditable = 'true';
            te.focus();
            this._updateRteToolbar();
          }
          return;
        }

        if (!this.selected.has(obj)) this._selectOnly(obj);

        if (onMove || !isText) {
          e.preventDefault();
          this._startDrag(e, obj);
        }
        return;
      }

      if (slide && !obj) {
        this.clearSelection();
        document.querySelectorAll('.slide-object-text[contenteditable="true"]').forEach((el) => {
          el.contentEditable = 'false';
        });
        this.toolbar.classList.remove('visible');
      }
    }

    _parsePct(el, prop) {
      const v = getComputedStyle(el)[prop];
      if (v.endsWith('%')) return parseFloat(v) || 0;
      return null;
    }

    /**
     * Resolved % of slide for left/top. Browsers report computed left/top in px — using that
     * with ?? 0 caused objects to jump to (0,0) on drag start.
     */
    _positionPct(el, slide, axis) {
      const prop = axis === 'left' ? 'left' : 'top';
      const raw = el.style && el.style[prop] ? String(el.style[prop]).trim() : '';
      if (raw.endsWith('%')) {
        const p = parseFloat(raw);
        return Number.isFinite(p) ? p : 0;
      }
      const sr = this._slideRect(slide);
      const r = el.getBoundingClientRect();
      if (axis === 'left') {
        return ((r.left - sr.left) / sr.width) * 100;
      }
      return ((r.top - sr.top) / sr.height) * 100;
    }

    _setPct(el, leftPct, topPct) {
      el.style.left = leftPct + '%';
      el.style.top = topPct + '%';
    }

    _slideRect(slide) {
      return slide.getBoundingClientRect();
    }

    _startDrag(e, primary) {
      const slide = primary.closest('section.slide');
      if (!slide) return;
      const sr = this._slideRect(slide);
      const moving = Array.from(this.selected).filter((o) => slide.contains(o));
      if (!moving.length) moving.push(primary);

      /* Sizes measured in the same space as the slide rect. offsetWidth is in
       * layout pixels and the rect is in on-screen pixels, and the canvas is
       * zoomed — mixing them made the drag clamp believe a wide object was
       * wider than the slide, which pinned it to the left edge on every drag,
       * and quietly put the snap guides in the wrong place too. */
      const starts = moving.map((o) => {
        const r = o.getBoundingClientRect();
        return {
          el: o,
          l: this._positionPct(o, slide, 'left'),
          t: this._positionPct(o, slide, 'top'),
          w: r.width,
          h: r.height,
          wPct: (r.width / sr.width) * 100,
          hPct: (r.height / sr.height) * 100
        };
      });

      this._dragState = {
        slide,
        sr,
        moving: starts,
        startX: e.clientX,
        startY: e.clientY,
        primary: primary
      };
      this._clearSnap();

      document.addEventListener('pointermove', this._onDocPointerMove);
      document.addEventListener('pointerup', this._onDocPointerUp);
      document.addEventListener('pointercancel', this._onDocPointerUp);
      try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    }

    _startResize(e, obj) {
      const slide = obj.closest('section.slide');
      if (!slide) return;
      const sr = this._slideRect(slide);
      const handle = e.target.closest('.slide-object-resize');
      const dir = (handle && handle.getAttribute('data-resize')) || 'se';
      /* Measure from the style, not from the box: a rotated element's
       * bounding rect is the axis-aligned box AROUND it, which is bigger than
       * the element and would make every drag jump. */
      /* From the inline style, not the computed one: a positioned element's
       * computed left is resolved to pixels, so asking for a percentage there
       * always came back empty and every drag started from zero. */
      const left = pct(obj, 'left') || 0;
      const top = pct(obj, 'top') || 0;
      const wPct = pct(obj, 'width');
      const hPct = pct(obj, 'height');
      this._resizeState = {
        slide,
        el: obj,
        sr,
        dir,
        angle: objectAngle(obj),
        startX: e.clientX,
        startY: e.clientY,
        startW: (wPct == null ? obj.getBoundingClientRect().width / sr.width * 100 : wPct),
        startH: (hPct == null ? obj.getBoundingClientRect().height / sr.height * 100 : hPct),
        startL: left,
        startT: top,
        beforeW: obj.style.width,
        beforeH: obj.style.height,
        beforeL: obj.style.left,
        beforeT: obj.style.top,
        hadWidthPct: wPct != null,
        hadHeightPct: hPct != null
      };
      document.addEventListener('pointermove', this._onResizeMove);
      document.addEventListener('pointerup', this._onResizeUp);
      document.addEventListener('pointercancel', this._onResizeUp);
      try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    }

    _onResizeMove(e) {
      if (!this._resizeState) return;
      const st = this._resizeState;
      const sr = st.sr;
      /* Percent throughout, so a resize means the same thing at any zoom and
       * on any screen. */
      const dxPct = (e.clientX - st.startX) / sr.width * 100;
      const dyPct = (e.clientY - st.startY) / sr.height * 100;

      /* A turned object is dragged in its own frame: pulling its right edge
       * has to widen it, whichever way "right" is currently pointing. */
      const a = st.angle * Math.PI / 180;
      const cos = Math.cos(a), sin = Math.sin(a);
      const lx = dxPct * cos + dyPct * sin;
      const ly = -dxPct * sin + dyPct * cos;

      const minW = RESIZE_MIN_FRAC * 100;
      const minH = RESIZE_MIN_FRAC * 100;
      let w = st.startW, h = st.startH, mx = 0, my = 0;

      if (st.dir.indexOf('e') !== -1) {
        w = Math.max(minW, st.startW + lx);
        mx = (w - st.startW) / 2;
      } else if (st.dir.indexOf('w') !== -1) {
        w = Math.max(minW, st.startW - lx);
        mx = -(w - st.startW) / 2;
      }
      if (st.dir.indexOf('s') !== -1) {
        h = Math.max(minH, st.startH + ly);
        my = (h - st.startH) / 2;
      } else if (st.dir.indexOf('n') !== -1) {
        h = Math.max(minH, st.startH - ly);
        my = -(h - st.startH) / 2;
      }

      /* The centre moves by half of what the edge did — back in screen axes,
       * because that is where left and top live. */
      const cdx = mx * cos - my * sin;
      const cdy = mx * sin + my * cos;
      const cx = st.startL + st.startW / 2 + cdx;
      const cy = st.startT + st.startH / 2 + cdy;

      st.el.style.width = w + '%';
      st.el.style.height = h + '%';
      st.el.style.left = (cx - w / 2) + '%';
      st.el.style.top = (cy - h / 2) + '%';
    }

    _onResizeUp() {
      if (!this._resizeState) return;
      const st = this._resizeState;
      const el = st.el;
      const afterW = el.style.width;
      const afterH = el.style.height;
      const afterL = el.style.left;
      const afterT = el.style.top;
      const beforeW = st.beforeW;
      const beforeH = st.beforeH;
      const beforeL = st.beforeL;
      const beforeT = st.beforeT;
      const changed = afterW !== beforeW || afterH !== beforeH ||
        afterL !== beforeL || afterT !== beforeT;
      if (changed) {
        /* Pulling a top or left edge moves the object as well as sizing it,
         * so undo has to put all four back. */
        this.history.push({
          undo: () => {
            el.style.width = beforeW; el.style.height = beforeH;
            el.style.left = beforeL; el.style.top = beforeT;
          },
          redo: () => {
            el.style.width = afterW; el.style.height = afterH;
            el.style.left = afterL; el.style.top = afterT;
          }
        });
      }
      this._resizeState = null;
      document.removeEventListener('pointermove', this._onResizeMove);
      document.removeEventListener('pointerup', this._onResizeUp);
      document.removeEventListener('pointercancel', this._onResizeUp);
    }

    _startRotate(e, obj) {
      const slide = obj.closest('section.slide');
      if (!slide) return;
      if (!this.selected.has(obj)) this._selectOnly(obj);
      const r = obj.getBoundingClientRect();
      this._rotateState = {
        el: obj,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        before: obj.style.transform
      };
      document.addEventListener('pointermove', this._onRotateMove);
      document.addEventListener('pointerup', this._onRotateUp);
      document.addEventListener('pointercancel', this._onRotateUp);
      try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    }

    _onRotateMove(e) {
      const st = this._rotateState;
      if (!st) return;
      /* The handle sits above the object, so straight up is zero. */
      let deg = Math.atan2(e.clientY - st.cy, e.clientX - st.cx) * 180 / Math.PI + 90;
      /* Shift snaps, the way it does in every drawing tool. Fifteen degrees
       * because that is where the useful angles are. */
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      else deg = Math.round(deg);
      while (deg > 180) deg -= 360;
      while (deg <= -180) deg += 360;
      st.el.style.transform = deg === 0 ? '' : 'rotate(' + deg + 'deg)';
      syncInspector();
    }

    _onRotateUp() {
      const st = this._rotateState;
      if (!st) return;
      const el = st.el;
      const after = el.style.transform;
      const before = st.before;
      if (after !== before) {
        this.history.push({
          undo: () => { el.style.transform = before; syncInspector(); },
          redo: () => { el.style.transform = after; syncInspector(); }
        });
        updateUndoRedoChrome();
      }
      this._rotateState = null;
      document.removeEventListener('pointermove', this._onRotateMove);
      document.removeEventListener('pointerup', this._onRotateUp);
      document.removeEventListener('pointercancel', this._onRotateUp);
    }

    _otherObjects(slide, excludeSet) {
      return Array.from(slide.querySelectorAll('[data-slide-object]')).filter((o) => !excludeSet.has(o));
    }

    /* Slide edge snap lines removed — only center guides + other objects (plan A). */
    _snapLinesForSlide(slide, excludeSet) {
      const sr = this._slideRect(slide);
      const linesV = [sr.width / 2];
      const linesH = [sr.height / 2];
      this._otherObjects(slide, excludeSet).forEach((o) => {
        const r = o.getBoundingClientRect();
        const left = r.left - sr.left;
        const top = r.top - sr.top;
        linesV.push(left, left + r.width / 2, left + r.width);
        linesH.push(top, top + r.height / 2, top + r.height);
      });
      return { linesV, linesH, sr };
    }

    _applySnap(dx, dy, primaryStart, state) {
      if (prefersReducedMotion()) {
        return { dx, dy, lv: null, lh: null };
      }
      const { slide, moving, sr } = state;
      const exclude = new Set(moving.map((m) => m.el));
      const snap = this._snapLinesForSlide(slide, exclude);
      const pw = primaryStart.w;
      const ph = primaryStart.h;
      let pl = (primaryStart.l / 100) * sr.width + dx;
      let pt = (primaryStart.t / 100) * sr.height + dy;

      let bestVX = null, bestVd = SNAP_PX + 1;
      snap.linesV.forEach((xv) => {
        [pl, pl + pw / 2, pl + pw].forEach((edge) => {
          const d = xv - edge;
          if (Math.abs(d) < bestVd) { bestVd = Math.abs(d); bestVX = xv - edge; }
        });
      });
      let bestHY = null, bestHd = SNAP_PX + 1;
      snap.linesH.forEach((yh) => {
        [pt, pt + ph / 2, pt + ph].forEach((edge) => {
          const d = yh - edge;
          if (Math.abs(d) < bestHd) { bestHd = Math.abs(d); bestHY = yh - edge; }
        });
      });

      let ndx = dx, ndy = dy;
      if (bestVX !== null && bestVd <= SNAP_PX) ndx += bestVX;
      if (bestHY !== null && bestHd <= SNAP_PX) ndy += bestHY;

      let lv = null, lh = null;
      if (bestVX !== null && bestVd <= SNAP_PX) {
        const nx = pl + ndx - dx;
        lv = { pos: nx + pw / 2 };
      }
      if (bestHY !== null && bestHd <= SNAP_PX) {
        const ny = pt + ndy - dy;
        lh = { pos: ny + ph / 2 };
      }
      return { dx: ndx, dy: ndy, lv, lh, sr };
    }

    _showSnap(lv, lh, sr, slide) {
      this._clearSnap();
      const layer = slide.querySelector('.slide-edit-layer');
      if (!layer) return;
      if (lv) {
        const d = document.createElement('div');
        d.className = 'snap-line-v';
        d.style.left = (lv.pos / sr.width * 100) + '%';
        layer.appendChild(d);
        this._snapEls.push(d);
      }
      if (lh) {
        const d = document.createElement('div');
        d.className = 'snap-line-h';
        d.style.top = (lh.pos / sr.height * 100) + '%';
        layer.appendChild(d);
        this._snapEls.push(d);
      }
    }
    _clearSnap() {
      this._snapEls.forEach((e) => e.remove());
      this._snapEls = [];
    }

    _onDocPointerMove(e) {
      if (!this._dragState) return;
      const st = this._dragState;
      const sr = st.sr;
      let dx = e.clientX - st.startX;
      let dy = e.clientY - st.startY;

      const primaryStart = st.moving.find((m) => m.el === st.primary) || st.moving[0];
      const snapped = this._applySnap(dx, dy, primaryStart, st);
      dx = snapped.dx;
      dy = snapped.dy;

      st.moving.forEach((m) => {
        let nl = m.l + (dx / sr.width) * 100;
        let nt = m.t + (dy / sr.height) * 100;
        /* The centre stays on the slide, not the whole object. Something
         * bleeding off an edge is ordinary layout — forbidding it was the
         * stricter rule and the wrong one — while keeping the middle inside
         * means nothing can be dragged somewhere you cannot reach it again. */
        nl = Math.max(-m.wPct / 2, Math.min(100 - m.wPct / 2, nl));
        nt = Math.max(-m.hPct / 2, Math.min(100 - m.hPct / 2, nt));
        this._setPct(m.el, nl, nt);
      });

      if (snapped.lv || snapped.lh) this._showSnap(snapped.lv, snapped.lh, sr, st.slide);
      else this._clearSnap();
    }

    _onDocPointerUp() {
      if (!this._dragState) return;
      const st = this._dragState;
      const after = st.moving.map((m) => ({
        el: m.el,
        l: this._positionPct(m.el, st.slide, 'left'),
        t: this._positionPct(m.el, st.slide, 'top')
      }));
      const before = st.moving.map((m) => ({ el: m.el, l: m.l, t: m.t }));

      const changed = after.some((a, i) => a.l !== before[i].l || a.t !== before[i].t);
      if (changed) {
        this.history.push({
          undo: () => {
            before.forEach((b) => this._setPct(b.el, b.l, b.t));
          },
          redo: () => {
            after.forEach((a) => this._setPct(a.el, a.l, a.t));
          }
        });
      }

      this._dragState = null;
      this._clearSnap();
      document.removeEventListener('pointermove', this._onDocPointerMove);
      document.removeEventListener('pointerup', this._onDocPointerUp);
      document.removeEventListener('pointercancel', this._onDocPointerUp);
    }

    _syncRteButtons() {
      ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList'].forEach((cmd) => {
        const b = this.toolbar.querySelector('button[data-cmd="' + cmd + '"]');
        if (!b) return;
        try { b.classList.toggle('is-active', document.queryCommandState(cmd)); } catch (_) {}
      });
      /* Face and colour read back from where the selection actually starts,
       * so the bar describes the words under it rather than the box. */
      const sel = document.getSelection();
      /* Where the selection starts, resolved the same way everything else here
       * resolves it: reading parentElement is wrong when the boundary is an
       * element, which is exactly what it is after a wrap or a link. */
      const at = (sel && sel.rangeCount
        ? elementAtRangeStart(sel.getRangeAt(0))
        : null) || this._activeTextEl();
      if (!at) return;
      const swatch = this.toolbar.querySelector('[data-rte-colour]');
      if (swatch && document.activeElement !== swatch) {
        const m = getComputedStyle(at).color.match(/\d+/g);
        if (m) {
          swatch.value = '#' + m.slice(0, 3).map(function (n) {
            return ('0' + parseInt(n, 10).toString(16)).slice(-2);
          }).join('');
        }
      }
      if (this.toolbar._paintSize) this.toolbar._paintSize();
      /* The link pair reads as one control when it says which state you are in —
       * but "in a link" has to mean the same thing here as it does to the button
       * itself. Asking only whether the selection STARTS inside one disabled
       * Remove for a selection that began a character before the link, which is
       * exactly the case the handler was taught to cope with. */
      const host = this._activeTextEl();
      let inLink = at.closest ? at.closest('a') : null;
      if (!inLink && host && sel && sel.rangeCount) {
        const r0 = sel.getRangeAt(0);
        inLink = Array.prototype.slice.call(host.querySelectorAll('a')).some(function (a2) {
          try { return r0.intersectsNode(a2); } catch (e) { return false; }
        });
      }
      const linkBtn = this.toolbar.querySelector('[data-text-link]');
      const unlinkBtn = this.toolbar.querySelector('[data-text-unlink]');
      if (linkBtn) linkBtn.classList.toggle('is-active', !!inLink);
      if (unlinkBtn) unlinkBtn.disabled = !inLink;
      const face = this.toolbar.querySelector('[data-rte-font]');
      if (face && document.activeElement !== face) {
        const inline = ((at.style && at.style.fontFamily) || '').trim();
        const known = Array.prototype.some.call(face.options, function (o) { return o.value === inline; });
        face.value = known ? inline : '';
      }
    }

    _activeTextEl() {
      const el = document.activeElement;
      if (el && el.classList && el.classList.contains('slide-object-text') && el.getAttribute('contenteditable') === 'true') {
        return el;
      }
      const sel = document.getSelection();
      if (!sel || !sel.rangeCount) return null;
      const n = sel.anchorNode;
      const p = n && (n.nodeType === 3 ? n.parentElement : n);
      const active = p && p.closest && p.closest('.slide-object-text[contenteditable="true"]');
      if (active) return active;
      if (this.toolbar.contains(document.activeElement)) {
        return document.querySelector('.slide-object-text[contenteditable="true"]');
      }
      return null;
    }

    _updateRteToolbar() {
      if (!this.active) return;
      // Text formatting stays floating: it belongs against the selection,
      // where you can see what it applies to. Everything else moved to the
      // inspector, so this shows for text and nothing else.
      const anchor = this._activeTextEl();
      if (!anchor) {
        this.toolbar.classList.remove('visible');
        return;
      }
      const sel = document.getSelection();
      let rr = anchor.getBoundingClientRect();
      if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0).getBoundingClientRect();
        if (r.width > 1 && r.height > 1) rr = r;
      }
      this.toolbar.classList.add('visible');
      this.toolbar.style.left = Math.min(window.innerWidth - this.toolbar.offsetWidth - 8, Math.max(8, rr.left + window.scrollX)) + 'px';
      this.toolbar.style.top = (rr.top + window.scrollY - this.toolbar.offsetHeight - 8) + 'px';
      this._syncRteButtons();
    }

    _onFocusIn(e) {
      if (!this.active) return;
      const te = e.target.closest && e.target.closest('.slide-object-text[contenteditable="true"]');
      if (te) this._updateRteToolbar();
    }

    _onSelectionChange() {
      if (!this.active) return;
      this._updateRteToolbar();
    }

    _applyInlineStyle(textEl, stylePatch) {
      textEl.focus();
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return false;
      const range = sel.getRangeAt(0);
      if (!textEl.contains(range.commonAncestorContainer)) return false;

      const span = document.createElement('span');
      Object.keys(stylePatch).forEach((key) => {
        span.style[key] = stylePatch[key];
      });
      if (range.collapsed) {
        span.appendChild(document.createTextNode('\u200b'));
        range.insertNode(span);
        const nr = document.createRange();
        nr.setStart(span.firstChild, 1);
        nr.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nr);
        return true;
      }

      /* Across more than one line this has to be done line by line, or the
       * span ends up wrapping the <li> elements between them. */
      if (typeof styleAcross === 'function') {
        styleAcross(range, stylePatch);
        return true;
      }
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
      const nr = document.createRange();
      nr.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(nr);
      return true;
    }

    _applyFontSizeFactor(textEl, fac) {
      const fs = 'clamp(' + (0.7 * fac) + 'rem, ' + (1.2 * fac) + 'vw, ' + (1.4 * fac) + 'rem)';
      return this._applyInlineStyle(textEl, { fontSize: fs });
    }

    _applyFontFamily(textEl, fontExpr) {
      return this._applyInlineStyle(textEl, { fontFamily: fontExpr });
    }

    bind() {
      document.addEventListener('pointerdown', this._onDocPointerDown, true);
      document.addEventListener('focusin', this._onFocusIn, true);
      document.addEventListener('selectionchange', this._onSelectionChange);
      this.toolbar.querySelectorAll('button[data-cmd]').forEach((btn) => {
        btn.addEventListener('mousedown', (ev) => ev.preventDefault());
        btn.addEventListener('click', () => this._exec(btn.getAttribute('data-cmd')));
      });
      /* The steppers are wired further down, next to the size readout they
         share: this used to reach through _applyInlineStyle, which re-reads the
         live selection after focusing and so lost the wrapper it had just made,
         piling a new span on every press. */
      this.toolbar.querySelectorAll('button[data-font]').forEach((btn) => {
        btn.addEventListener('mousedown', (ev) => ev.preventDefault());
        btn.addEventListener('click', () => {
          const fontExpr = btn.getAttribute('data-font');
          if (!fontExpr) return;
          const textEl = this._activeTextEl();
          if (!textEl) return;
          const beforeHtml = textEl.innerHTML;
          this._applyFontFamily(textEl, fontExpr);
          const afterHtml = textEl.innerHTML;
          if (beforeHtml !== afterHtml) {
            this.history.push({
              undo: () => { textEl.innerHTML = beforeHtml; },
              redo: () => { textEl.innerHTML = afterHtml; }
            });
          }
          this._updateRteToolbar();
        });
      });
    }

    _exec(cmd) {
      const textEl = this._activeTextEl();
      if (!textEl) return;
      textEl.focus();
      const before = textEl.innerHTML;
      const isList = cmd === 'insertUnorderedList' || cmd === 'insertOrderedList';
      if (isList && typeof stripBlockWhitespace === 'function') stripBlockWhitespace(textEl);
      document.execCommand(cmd, false, null);
      if (isList) {
        if (typeof dropEmptyItems === 'function') dropEmptyItems(textEl);
        if (typeof tidyNestedLists === 'function') tidyNestedLists(textEl);
      }
      const after = textEl.innerHTML;
      if (before !== after) {
        this.history.push({
          undo: () => { textEl.innerHTML = before; },
          redo: () => { textEl.innerHTML = after; }
        });
      }
      this._syncRteButtons();
      this._updateRteToolbar();
    }
  }

  /* ---------- Sidebar ---------- */
  class SlideSidebar {
    constructor(deck, history) {
      this.deck = deck;
      this.history = history;
      this.list = document.getElementById('filmstripList');
      this.open = false;
      this._dragFilm = null;
    }
    setOpen(on) {
      this.open = !!on;
      document.body.classList.toggle('deck-sidebar-open', on);
      const railBtn = document.getElementById('pagesToggle');
      if (railBtn) railBtn.classList.toggle('active', on);
      if (on) this.refresh();
    }
    toggle() { this.setOpen(!this.open); }

    refresh() {
      this.list.innerHTML = '';
      this.deck.refreshSlides();
      this.deck.slides.forEach((slide, idx) => {
        const item = document.createElement('div');
        item.className = 'filmstrip-item';
        item.dataset.slideIndex = String(idx);
        if (idx === this.deck.current) item.classList.add('is-current');

        const lineTop = document.createElement('div');
        lineTop.className = 'filmstrip-drop-line filmstrip-drop-line-before';
        const host = document.createElement('div');
        host.className = 'filmstrip-thumb-host';
        const lineBot = document.createElement('div');
        lineBot.className = 'filmstrip-drop-line filmstrip-drop-line-after';

        const actions = document.createElement('div');
        actions.className = 'filmstrip-actions';
        const num = document.createElement('span');
        num.className = 'filmstrip-num';
        num.textContent = String(idx + 1);
        const dup = document.createElement('button');
        dup.type = 'button';
        dup.innerHTML = ICON.duplicate;
        dup.title = 'Duplicate this slide';
        dup.setAttribute('aria-label', 'Duplicate slide');
        dup.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this._addSlide(idx, true);
        });
        const del = document.createElement('button');
        del.type = 'button';
        del.innerHTML = ICON.trash;
        del.title = 'Delete this slide';
        del.setAttribute('aria-label', 'Delete slide');
        del.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this._deleteSlide(idx);
        });
        actions.appendChild(dup);
        actions.appendChild(del);

        item.appendChild(lineTop);
        item.appendChild(host);
        item.appendChild(lineBot);

        item.addEventListener('click', (ev) => {
          if (ev.target.closest('button')) return;
          this.deck.goTo(idx);
          this.refresh();
        });

        this._fillThumb(slide, host);
        // after _fillThumb: it clears the host to draw the thumbnail.
        // Everything that sits on a thumbnail is anchored to the thumbnail —
        // the item is taller than it, so item-relative corners miss.
        host.appendChild(num);
        host.appendChild(actions);
        const skipped = slide.hasAttribute('data-skip');
        if (skipped) item.classList.add('is-skipped');

        // Shown on hover, and kept on once a slide is skipped, so the ones
        // left out of the talk are obvious without hovering every thumbnail.
        const eye = document.createElement('button');
        eye.type = 'button';
        eye.className = 'filmstrip-eye';
        eye.innerHTML = skipped ? ICON.eyeOff : ICON.eye;
        eye.title = skipped ? 'Skipped when presenting — click to include' : 'Skip this slide when presenting';
        eye.setAttribute('aria-label', eye.title);
        eye.setAttribute('aria-pressed', String(skipped));
        eye.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setSkip(slide, !slide.hasAttribute('data-skip'));
        });
        eye.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        host.appendChild(eye);

        item.addEventListener('pointerdown', (ev) => {
          if (ev.target.closest('button')) return;
          this._startFilmDrag(ev, item, idx);
        });

        this.list.appendChild(item);
      });
    }

    _fillThumb(slideEl, host) {
      host.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;border-radius:6px;';
      const sc = document.createElement('div');
      sc.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;';
      const cl = slideEl.cloneNode(true);
      cl.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      cl.querySelectorAll('script').forEach((n) => n.remove());
      cl.querySelectorAll('[data-slide-object]').forEach((n) => {
        n.removeAttribute('data-slide-object');
        n.removeAttribute('data-oid');
        n.removeAttribute('data-object-type');
        n.classList.remove('is-selected');
      });
      cl.querySelectorAll('.slide-object-move, .slide-object-resize, .slide-object-rotate')
        .forEach((n) => n.remove());
      cl.querySelectorAll('[contenteditable]').forEach((n) => n.setAttribute('contenteditable', 'false'));
      const w = slideEl.offsetWidth || window.innerWidth;
      const h = slideEl.offsetHeight || window.innerHeight;
      cl.style.width = w + 'px';
      cl.style.height = h + 'px';
      sc.appendChild(cl);
      wrap.appendChild(sc);
      host.appendChild(wrap);
      requestAnimationFrame(() => {
        const bw = host.clientWidth;
        const bh = host.clientHeight;
        const s = Math.min(bw / w, bh / h);
        sc.style.transform = 'scale(' + s + ')';
      });
    }

    _startFilmDrag(ev, item, fromIndex) {
      if (ev.button !== 0) return;
      ev.preventDefault();
      item.classList.add('dragging');
      this._dragFilm = { fromIndex, item, lastX: ev.clientX, lastY: ev.clientY, targetIndex: null, before: true };
      const move = (e) => {
        this._dragFilm.lastX = e.clientX;
        this._dragFilm.lastY = e.clientY;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const target = el && el.closest && el.closest('.filmstrip-item');
        this.list.querySelectorAll('.filmstrip-item').forEach((it) => {
          it.classList.remove('drop-before', 'drop-after');
        });
        if (!target || target === item) return;
        const r = target.getBoundingClientRect();
        const before = e.clientY < r.top + r.height / 2;
        target.classList.add(before ? 'drop-before' : 'drop-after');
        this._dragFilm.targetIndex = parseInt(target.dataset.slideIndex, 10);
        this._dragFilm.before = before;
      };
      const up = () => {
        item.classList.remove('dragging');
        this.list.querySelectorAll('.filmstrip-item').forEach((it) => {
          it.classList.remove('drop-before', 'drop-after');
        });
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        if (this._dragFilm) {
          const { fromIndex, targetIndex, before } = this._dragFilm;
          this._dragFilm = null;
          if (targetIndex !== null && targetIndex !== undefined) {
            this._reorderFilmstrip(fromIndex, targetIndex, before);
          }
        }
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    }

    _reorderFilmstrip(fromIndex, targetIndex, before) {
      this.deck.refreshSlides();
      const slides = [...this.deck.slides];
      const n = slides.length;
      if (fromIndex < 0 || fromIndex >= n) return;
      if (targetIndex < 0 || targetIndex >= n) return;

      const beforeIds = slides.map((s) => s.id);
      const [el] = slides.splice(fromIndex, 1);
      let to;
      if (before) {
        to = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
      } else {
        to = fromIndex <= targetIndex ? targetIndex : targetIndex + 1;
      }
      to = Math.max(0, Math.min(slides.length, to));
      slides.splice(to, 0, el);

      const parent = slides[0].parentNode;
      slides.forEach((s) => parent.appendChild(s));

      this.deck.refreshSlides();
      const afterIds = this.deck.slides.map((s) => s.id);

      this.history.push({
        undo: () => {
          this._restoreOrder(parent, beforeIds);
          this.deck.refreshSlides();
          this.deck._updateChrome();
          this.refresh();
        },
        redo: () => {
          this._restoreOrder(parent, afterIds);
          this.deck.refreshSlides();
          this.deck._updateChrome();
          this.refresh();
        }
      });
      this.deck._updateChrome();
      this.refresh();
    }

    _restoreOrder(parent, ids) {
      const map = {};
      Array.from(parent.querySelectorAll(':scope > section.slide')).forEach((s) => { map[s.id] = s; });
      const frag = document.createDocumentFragment();
      ids.forEach((id) => { if (map[id]) frag.appendChild(map[id]); });
      parent.appendChild(frag);
    }

    /** Insert a slide after `index`. Duplicating keeps the oids on purpose:
     *  an object that appears on two slides under the same oid morphs between
     *  them, so "duplicate, then move things" is how a transition gets made. */
    _addSlide(index, duplicate) {
      this.deck.refreshSlides();
      const slides = this.deck.slides;
      const source = slides[index] || slides[0];
      if (!source) return;
      const parent = source.parentNode;

      let node;
      if (duplicate) {
        node = source.cloneNode(true);
        node.classList.remove('visible');
      } else {
        node = document.createElement('section');
        node.className = 'slide';
        const layer = document.createElement('div');
        layer.className = 'slide-edit-layer';
        node.appendChild(layer);
        const bg = source.querySelector('.slide-bg-container');
        if (bg) node.insertBefore(bg.cloneNode(false), layer);
      }
      node.id = 'slide-' + Date.now().toString(36);
      node.removeAttribute('data-notes');

      parent.insertBefore(node, source.nextElementSibling);
      const settle = () => {
        this.deck.refreshSlides();
        ensureResizeHandles(document);
        ensureObjectControls(document);
        repaintCharts(document);
        refreshFields();
        this.deck._updateChrome();
        this.refresh();
      };
      settle();
      this.deck.goTo(index + 1);

      this.history.push({
        undo: () => { if (node.parentNode) node.parentNode.removeChild(node); settle(); },
        redo: () => { parent.insertBefore(node, source.nextElementSibling); settle(); }
      });
      updateUndoRedoChrome();
    }

    _deleteSlide(index) {
      this.deck.refreshSlides();
      if (this.deck.slides.length <= 1) {
        alert('At least one slide is required.');
        return;
      }
      if (!confirm('Delete this slide?')) return;
      const slide = this.deck.slides[index];
      const parent = slide.parentNode;
      const next = slide.nextElementSibling;
      const outer = slide.outerHTML;
      const nid = next && next.id ? next.id : null;
      const sid = slide.id;

      parent.removeChild(slide);
      this.deck.refreshSlides();
      this.history.push({
        undo: () => {
          const tpl = document.createElement('template');
          tpl.innerHTML = outer.trim();
          const node = tpl.content.firstElementChild;
          if (nid) {
            const ref = parent.querySelector('#' + CSS.escape(nid));
            parent.insertBefore(node, ref);
          } else parent.appendChild(node);
          this.deck.refreshSlides();
          ensureResizeHandles(document);
          ensureObjectControls(document);
          repaintCharts(document);
      refreshFields();
          this.deck._updateChrome();
          this.refresh();
        },
        redo: () => {
          const el = document.getElementById(sid);
          if (el && el.parentNode) el.parentNode.removeChild(el);
          this.deck.refreshSlides();
          this.deck._updateChrome();
          this.refresh();
        }
      });
      this.deck.goTo(Math.min(index, this.deck.slides.length - 1));
      this.refresh();
    }
  }

  function sanitizeEditableState(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.slide-object.is-selected').forEach((el) => {
      el.classList.remove('is-selected');
    });
    // Everything editable, not just slide text: the deck title lives in the
    // chrome and is contenteditable too, and anything added later will be
    // caught by the same rule rather than needing to be remembered.
    root.querySelectorAll('[contenteditable="true"]').forEach((el) => {
      el.setAttribute('contenteditable', 'false');
    });
    root.querySelectorAll('.slide-object-text').forEach((el) => {
      delete el.dataset._deckHtmlBefore;
      el.removeAttribute('data-_deck-html-before');
    });
    root.querySelectorAll('.snap-line-v, .snap-line-h').forEach((el) => el.remove());
    // Per-object editing affordances are rebuilt on load by ensureObjectControls,
    // so they never need to be written into a saved or exported file.
    root.querySelectorAll('.slide-object-tablectl, .slide-object-chartctl').forEach((el) => el.remove());
  }

  function serializeSlidesRoot(root) {
    const clone = root.cloneNode(true);
    sanitizeEditableState(clone);
    return clone.innerHTML;
  }

  function sanitizeExportDocument(docEl) {
    if (!docEl || !docEl.querySelector) return;
    const body = docEl.querySelector('body');
    if (body) {
      body.classList.remove('deck-edit-mode', 'slide-anim-paused', 'deck-sidebar-open');
    }
    sanitizeEditableState(docEl);
    /* The handles are the tool, not the deck. They were never taken out of an
     * export — hidden by the chrome's own CSS, so nobody noticed, but they
     * travelled in every file anyone was sent. */
    docEl.querySelectorAll('.slide-object-move, .slide-object-resize, .slide-object-rotate, ' +
      '.slide-object-tablectl, .slide-object-chartctl').forEach((n) => n.remove());
    const filmstrip = docEl.querySelector('#filmstripList');
    if (filmstrip) filmstrip.innerHTML = '';
    ['#editToggle', '#deckEditChrome', '#rteToolbar'].forEach((selector) => {
      const el = docEl.querySelector(selector);
      if (!el) return;
      el.classList.remove('show', 'active', 'visible');
      if (selector === '#rteToolbar') {
        el.style.left = '';
        el.style.top = '';
      }
    });
  }

  /* ---------- persistence ---------- */
  function saveState() {
    const root = document.querySelector('.slides-offset') || document.body;
    const fonts = document.getElementById('deckEmbeddedFonts');
    const data = {
      v: 3,
      deckHtml: serializeSlidesRoot(root),
      /* Packed fonts live in the head, and the slides root is all that gets
       * serialised — without this they survived export but not a reload. */
      fontsCss: fonts ? fonts.textContent : ''
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { console.warn(e); }
  }

  /* Two different things are called saving here, and conflating them would be
   * a lie in the interface.
   *
   * The browser copy is automatic: every change schedules a write, coalesced
   * so that holding a key down does not serialise the deck on each letter. It
   * survives a reload, and it never touches the file on disk.
   *
   * The file is what you send someone, and writing it is deliberate. Chrome
   * treats a file:// document as a secure context, so the file can genuinely
   * be written back in place rather than re-downloaded beside itself; where
   * that is unavailable the export path takes over. This is the split Bento
   * makes, and it is why it still has a Save button despite auto-saving. */
  let saveT = null;
  let fileHandle = null;
  let dirtySinceFile = false;
  let lastAutoAt = null;
  let lastFileAt = null;

  function clockOf(d) {
    return d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function paintSaveNote() {
    const note = document.getElementById('deckSaveNote');
    const btn = document.getElementById('btnSaveFile');
    if (btn) btn.classList.toggle('is-dirty', dirtySinceFile || (!lastFileAt && !!lastAutoAt));
    if (!note) return;
    if (lastFileAt && !dirtySinceFile) {
      note.textContent = 'Saved to the file · ' + clockOf(lastFileAt);
    } else if (lastFileAt) {
      note.textContent = 'Unsaved changes · kept here ' + clockOf(lastAutoAt || lastFileAt);
    } else if (lastAutoAt) {
      note.textContent = 'Saved in this browser · ' + clockOf(lastAutoAt);
    } else {
      note.textContent = '';
    }
    note.classList.toggle('is-on', !!note.textContent);
    note.classList.toggle('is-warn', !!lastFileAt && dirtySinceFile);
  }

  function noteSaved() {
    lastAutoAt = new Date();
    if (lastFileAt) dirtySinceFile = true;
    paintSaveNote();
  }

  /* The name of the file you are actually looking at.
   *
   * This is the difference between Save and Save-as. The picker was offered a
   * name derived from the deck's title, and a title and a filename drift apart
   * constantly — a deck called "Your deck, editable anywhere" living in
   * runtime-deck.html was offered as "Your deck, editable anywhere.html", so an
   * ordinary Save quietly proposed a SECOND file beside the real one. Offering
   * the open file's own name turns the same dialog into "overwrite this?" —
   * which is what was meant. Bento's picker makes exactly this call. */
  function openedFileName() {
    try {
      const last = decodeURIComponent(location.pathname).split('/').pop();
      return /\.html?$/i.test(last || '') ? last : null;
    } catch (e) { return null; }
  }

  function deckStem() {
    const opened = openedFileName();
    if (opened) return opened.replace(/\.html?$/i, '');
    return (document.title || 'deck').replace(/\.html?$/i, '');
  }

  /* A page opened from a disk is given no writable handle — that is the
   * browser's rule, not a gap here, and it is why the first save has to ask
   * once. Everything after it writes in place. Two things make the one dialog
   * cheap: it is pointed at the file already open, and it carries an id, so the
   * browser reopens it in the folder used last time. */
  async function saveToFile(opts) {
    const o = opts || {};
    const html = '<!DOCTYPE html>\n' + (function () {
      const clone = document.documentElement.cloneNode(true);
      sanitizeExportDocument(clone);
      if (o.readOnly) clone.setAttribute('data-deck-mode', 'view');
      else clone.removeAttribute('data-deck-mode');
      return clone.outerHTML;
    })();
    /* No way to write in place — hand over a copy instead of pretending. */
    const copyInstead = function () {
      exportHtml(!!o.readOnly);
      lastFileAt = new Date();
      dirtySinceFile = false;
      paintSaveNote();
      const note = document.getElementById('deckSaveNote');
      if (note) note.textContent = 'Saved a copy · ' + clockOf(lastFileAt);
    };
    if (typeof window.showSaveFilePicker !== 'function') { copyInstead(); return; }
    try {
      const needsPicker = o.pick || !fileHandle;
      let handle = fileHandle;
      if (needsPicker) {
        const ask = {
          /* A copy names itself; a plain save offers the file it is already
           * looking at. */
          suggestedName: o.suffix ? deckStem() + o.suffix + '.html' : (openedFileName() || deckStem() + '.html'),
          id: 'editable-deck-file',
          types: [{ description: 'Web page', accept: { 'text/html': ['.html'] } }]
        };
        /* startIn takes a handle, never a path — with one we land in the open
         * file's own folder. */
        if (fileHandle) ask.startIn = fileHandle;
        handle = await window.showSaveFilePicker(ask);
        /* A copy is a different file on purpose, so it must not become the one
         * that plain Save writes from now on. */
        if (!o.keepSeparate) fileHandle = handle;
      }
      const w = await handle.createWritable();
      /* The stream takes the string directly — wrapping 300 KB in a Blob first
       * bought nothing. */
      await w.write(html);
      await w.close();
      if (o.keepSeparate) {
        /* A copy leaves the deck exactly as behind or as current as it was. */
        paintSaveNote();
        return;
      }
      lastFileAt = new Date();
      dirtySinceFile = false;
      paintSaveNote();
    } catch (err) {
      /* Cancelling the picker is a choice, not a failure. Anything else — the
       * browser withholding permission, a read-only location — means writing
       * in place is not available here, and the honest answer is a copy, not
       * a dialog. An alert would also have frozen the page. */
      if (err && err.name === 'AbortError') return;
      console.warn(err);
      fileHandle = null;
      copyInstead();
    }
  }
  function flushSave() {
    clearTimeout(saveT);
    saveT = null;
    saveState();
    noteSaved();
  }

  (function () {
    const btn = document.getElementById('btnSaveFile');
    if (btn) btn.addEventListener('click', function () { flushSave(); saveToFile(); });

    /* A copy and a reading copy are files you come away with, which is what
     * the Export menu already means — so they live there and Save stays one
     * button. Where the browser can write in place they go through a picker;
     * where it cannot, saveToFile hands over a download instead. */
    const copy = document.getElementById('btnSaveCopy');
    if (copy) copy.addEventListener('click', function () {
      flushSave(); saveToFile({ pick: true, keepSeparate: true, suffix: ' copy' });
    });
    const reading = document.getElementById('btnSaveReading');
    if (reading) reading.addEventListener('click', function () {
      flushSave(); saveToFile({ pick: true, keepSeparate: true, readOnly: true, suffix: ' (reading copy)' });
    });
  })();
  function scheduleSave() {
    if (!editor.active) return;
    clearTimeout(saveT);
    saveT = setTimeout(flushSave, 900);
  }
  /* A pending write must not die with the tab. pagehide fires on close, on
   * navigation and on the bfcache path, which beforeunload does not. */
  /* Typing does not go through the history stack on every letter, so text has
   * to be watched directly or a page of prose would sit unsaved. */
  document.addEventListener('input', function (e) {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('.slides-offset') || t.id === 'deckTitle' || t.hasAttribute('data-notes-input')) scheduleSave();
  }, true);
  window.addEventListener('pagehide', function () { if (saveT) { clearTimeout(saveT); saveState(); } });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && saveT) { clearTimeout(saveT); saveState(); }
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data) return;
      if (data.fontsCss) {
        let fs = document.getElementById('deckEmbeddedFonts');
        if (!fs) {
          fs = document.createElement('style');
          fs.id = 'deckEmbeddedFonts';
          document.head.appendChild(fs);
        }
        fs.textContent = data.fontsCss;
      }
      const parent = document.querySelector('.slides-offset') || document.body;
      if (typeof data.deckHtml === 'string') {
        parent.innerHTML = data.deckHtml;
      } else if (Array.isArray(data.slides)) {
        const map = {};
        Array.from(parent.querySelectorAll(':scope > section.slide')).forEach((s) => { map[s.id] = s; });
        data.slides.forEach((entry) => {
          const el = map[entry.id];
          if (el) el.innerHTML = entry.html;
        });
      } else return;
      ensureResizeHandles(document);
      ensureObjectControls(document);
      repaintCharts(document);
      refreshFields();
      deck.refreshSlides();
      deck._syncCurrentFromScroll();
      deck._updateChrome();
    } catch (e) { console.warn(e); }
  }

  /* Two kinds of file come out of here, and which one you meant is a choice
   * made at export rather than by hand-editing an attribute afterwards. A
   * reading copy opens as a deck to read, with a way in for whoever wants it;
   * a working copy opens as the editor. Bento splits the same way — its
   * "readonly" files are player files, chosen when you save them. */
  function exportHtml(readOnly) {
    const clone = document.documentElement.cloneNode(true);
    sanitizeExportDocument(clone);
    if (readOnly) clone.setAttribute('data-deck-mode', 'view');
    else clone.removeAttribute('data-deck-mode');
    const html = '<!DOCTYPE html>\n' + clone.outerHTML;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const stem = (document.title || 'deck').replace(/\.html?$/i, '');
    a.download = stem + (readOnly ? ' (reading copy).html' : '.html');
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportPdf() {
    const PW = 1280, PH = 720;
    const clone = document.documentElement.cloneNode(true);
    sanitizeExportDocument(clone);
    clone.querySelectorAll('script').forEach((s) => s.remove());

    const style = document.createElement('style');
    style.id = 'deck-print-override';
    style.textContent = [
      '@page{size:' + PW + 'px ' + PH + 'px;margin:0}',
      '*,*::before,*::after{animation:none!important;transition:none!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}',
      'html{scroll-snap-type:none!important;scroll-behavior:auto!important}',
      'html,body{width:' + PW + 'px!important;height:auto!important;overflow:visible!important;background:#000!important}',
      '.slides-offset{display:block!important;width:' + PW + 'px!important}',
      '.slide{',
      '  width:' + PW + 'px!important;height:' + PH + 'px!important;',
      '  max-height:' + PH + 'px!important;overflow:hidden!important;',
      '  page-break-after:always!important;break-after:page!important;',
      '  position:relative!important;display:flex!important;flex-direction:column!important',
      '}',
      '.slide:last-child{page-break-after:avoid!important;break-after:avoid!important}',
      ['.progress-bar','.nav-dots','.deck-left-hover-anchor','#deckLeftHover',
       '.slide-sidebar','#slideSidebar','.rte-toolbar','#rteToolbar',
       '.slide-bg-replace-anchor','.slide-object-move','.slide-object-resize','.slide-object-rotate',
       '.snap-line-v','.snap-line-h'].join(',') + '{display:none!important}',
      '.reveal{opacity:1!important;transform:none!important}',
      '.slide-edit-layer{pointer-events:none!important}'
    ].join('\n');

    const head = clone.querySelector('head');
    if (head) head.appendChild(style);

    // Auto-print after fonts load; the script runs inside the Blob window
    const printScript = document.createElement('script');
    printScript.textContent = [
      'document.fonts.ready',
      '  .then(function(){setTimeout(function(){window.focus();window.print();},350);})',
      '  .catch(function(){setTimeout(function(){window.focus();window.print();},900);});'
    ].join('');
    const body = clone.querySelector('body');
    if (body) body.appendChild(printScript);

    const html = '<!DOCTYPE html>\n' + clone.outerHTML;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      URL.revokeObjectURL(url);
      alert('PDF export blocked — please allow popups for this page, then try again.');
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /* ---------- init ---------- */
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  const btnDoneEdit = document.getElementById('btnDoneEdit');
  const deckEditChromeEl = document.getElementById('deckEditChrome');
  const deckLeftHover = document.getElementById('deckLeftHover');
  const editToggle = document.getElementById('editToggle');


  function updateUndoRedoChrome() {
    if (btnUndo) {
      btnUndo.disabled = !history.canUndo();
      btnUndo.setAttribute('aria-disabled', btnUndo.disabled ? 'true' : 'false');
    }
    if (btnRedo) {
      btnRedo.disabled = !history.canRedo();
      btnRedo.setAttribute('aria-disabled', btnRedo.disabled ? 'true' : 'false');
    }
  }

  /* Clicking anywhere on a slide is a statement about which slide you mean,
   * and so is scrolling one into view. */
  function watchWhichSlide() {
    document.addEventListener('pointerdown', function (e) {
      if (!editor.active) return;
      const sec = e.target.closest && e.target.closest('.slides-offset > section.slide');
      if (!sec) return;
      const i = (deck.slides || []).indexOf(sec);
      if (i >= 0) deck.setCurrent(i);
    }, true);

    const canvas = document.querySelector('.slides-offset');
    if (!canvas) return;
    let timer = null;
    const nearestToTheMiddle = function () {
      if (presenting) return;
      const box = canvas.getBoundingClientRect();
      const mid = box.top + canvas.clientHeight / 2;
      let best = -1, closest = Infinity;
      (deck.slides || []).forEach(function (sec, i) {
        const r = sec.getBoundingClientRect();
        const gap = Math.abs((r.top + r.bottom) / 2 - mid);
        if (gap < closest) { closest = gap; best = i; }
      });
      if (best >= 0) deck.setCurrent(best);
    };
    canvas.addEventListener('scroll', function () {
      clearTimeout(timer);
      timer = setTimeout(nearestToTheMiddle, 90);
    }, { passive: true });
  }

  const history = new HistoryStack(updateUndoRedoChrome);
  const deck = new SlideDeck();
  const editor = new SlideObjectEditor(deck, history);
  const sidebar = new SlideSidebar(deck, history);

  ensureResizeHandles(document);
  ensureObjectControls(document);
  repaintCharts(document);
  refreshFields();
  editor.bind();
  watchWhichSlide();
  updateUndoRedoChrome();

  /* A document's resting state is not editable — decks arrive with
   * contenteditable baked into their markup, so without this anyone opening
   * one to read it could put a cursor in the text and type. */
  setDeckEditable(false);

  /* The file is the editor, so it opens as one. That is the call Bento makes
   * too, and it fixes a real problem with the alternative: Edit lived behind a
   * hover corner nobody finds. Two ways out of the default:
   *   - a document can ask to open read-only with data-deck-mode="view" on
   *     <html>, which is what a copy meant only for reading would set;
   *   - a runtime that has stood down inside another viewer never starts
   *     editing, because the host owns the document there. */
  const OPENS_IN_VIEW =
    document.documentElement.getAttribute('data-deck-mode') === 'view' || !CHROME_ENABLED;
  /* A normal file has two states, edit and present, and no button for a third:
   * "Done" only means something when the document opened as something to read.
   * That is a property of the file, not a mode anyone toggles — a deck sent
   * round to be read sets data-deck-mode="view" and keeps its way in and out.
   * Bento draws the same line: its editor has no Done either, and a file that
   * is meant to be read is a different kind of file. */
  document.body.classList.toggle('deck-has-view', OPENS_IN_VIEW);
  if (!OPENS_IN_VIEW) {
    // enterEditMode, not editor.setActive — the pages rail is part of the edit
    // shell, and going in through the back door left it shut.
    requestAnimationFrame(function () { enterEditMode(); });
  }

  document.addEventListener('focusout', (e) => {
    const t = e.target;
    if (!editor.active) return;
    if (!t.classList || !t.classList.contains('slide-object-text')) return;
    if (t.getAttribute('contenteditable') !== 'true') return;

    setTimeout(() => {
      if (!editor.active) return;
      const ae = document.activeElement;
      if (ae && (ae === t || t.contains(ae) || editor.toolbar.contains(ae))) return;
      t.contentEditable = 'false';
      const before = t.dataset._deckHtmlBefore;
      if (before !== undefined && before !== t.innerHTML) {
        const after = t.innerHTML;
        history.push({
          undo: () => { t.innerHTML = before; },
          redo: () => { t.innerHTML = after; }
        });
      }
      delete t.dataset._deckHtmlBefore;
      editor.toolbar.classList.remove('visible');
      updateUndoRedoChrome();
    }, 0);
  }, true);

  if (btnUndo) {
    btnUndo.addEventListener('mousedown', (ev) => ev.preventDefault());
    btnUndo.addEventListener('click', () => { history.undo(); });
  }
  if (btnRedo) {
    btnRedo.addEventListener('mousedown', (ev) => ev.preventDefault());
    btnRedo.addEventListener('click', () => { history.redo(); });
  }
  if (btnDoneEdit) {
    btnDoneEdit.addEventListener('click', () => exitEditMode());
  }

  function exitEditMode() {
    editor.setActive(false);
    editToggle.classList.remove('active');
    sidebar.setOpen(false);
    editToggle.classList.remove('show');
    if (deckEditChromeEl) deckEditChromeEl.classList.remove('show');
    updateUndoRedoChrome();
  }

  function enterEditMode() {
    editor.setActive(true);
    editToggle.classList.add('active');
    sidebar.setOpen(true);
    updateUndoRedoChrome();
  }

  loadState();

  deck.onSlideChange = () => {
    if (sidebar.open) sidebar.refresh();
    deck._updateChrome();
  };

  /* Top-left cluster: hover reveals controls (Edit / Present, and in edit
     mode the toolbar) */
  let hideT = null;
  function showToggles() {
    clearTimeout(hideT);
    editToggle.classList.add('show');
    document.querySelectorAll('.deck-btn-present, .deck-btn-view-present').forEach(function (b) { b.classList.add('show'); });
    if (document.body.classList.contains('deck-edit-mode') && deckEditChromeEl) {
      deckEditChromeEl.classList.add('show');
    }
  }
  function scheduleHide() {
    hideT = setTimeout(() => {
      editToggle.classList.remove('show');
      document.querySelectorAll('.deck-btn-present, .deck-btn-view-present').forEach(function (b) { b.classList.remove('show'); });
      if (deckEditChromeEl) deckEditChromeEl.classList.remove('show');
    }, 400);
  }
  if (deckLeftHover) {
    deckLeftHover.addEventListener('mouseenter', showToggles);
    deckLeftHover.addEventListener('mouseleave', scheduleHide);
  }
  editToggle.addEventListener('mouseenter', () => clearTimeout(hideT));
  editToggle.addEventListener('mouseleave', scheduleHide);
  if (deckEditChromeEl) {
    deckEditChromeEl.addEventListener('mouseenter', () => clearTimeout(hideT));
    deckEditChromeEl.addEventListener('mouseleave', scheduleHide);
  }
  editToggle.addEventListener('click', () => {
    if (!editor.active) enterEditMode();
  });


  document.getElementById('btnExportPdf').addEventListener('click', exportPdf);

  /* A key pressed inside one of the panel's own fields belongs to that field.
   * The guard here only ever checked for typing in slide text, so Backspace in
   * the font-size box — clearing it to type another number — reached the
   * delete-the-selection branch and took the object with it. */
  function inFormField(e) {
    const t = e.target;
    return !!(t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]'));
  }

  document.addEventListener('keydown', (e) => {
    if (inFormField(e) && !(e.target.closest && e.target.closest('.slide-object-text[contenteditable="true"]'))) {
      /* Let the field have it, except for the save reflex which means the same
       * thing everywhere. */
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        flushSave();
        saveToFile();
      }
      return;
    }
    const ce = e.target.closest && e.target.closest('.slide-object-text[contenteditable="true"]');
    if (editor.active && (e.key === 'Escape' || e.key === 'Esc')) {
      if (ce) {
        e.preventDefault();
        ce.contentEditable = 'false';
        ce.blur();
        editor.toolbar.classList.remove('visible');
        return;
      }
      e.preventDefault();
      exitEditMode();
      return;
    }
    /* E is the way into editing a file that opened as something to read.
     * In a normal file there is nothing to toggle — it is already the editor,
     * and a stray E would only tip you out of it. */
    if ((e.key === 'e' || e.key === 'E') && !ce && OPENS_IN_VIEW) {
      e.preventDefault();
      if (editor.active) exitEditMode();
      else enterEditMode();
    }
    if (editor.active && (e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      /* The browser's own "save page" here would write a copy of the DOM
       * without the runtime's cleanup, so this takes the key and does the
       * thing the reflex means: put the changes in the file. */
      e.preventDefault();
      flushSave();
      saveToFile();
    }
    if (editor.active && !ce && (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
    }
    if (editor.active && !ce && (e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      history.redo();
    }
    if (editor.active && !ce && (e.key === 'Delete' || e.key === 'Backspace')) {
      if (editor.selected.size === 0) return;
      if (editor.selected.size >= 2 && !confirm('Delete ' + editor.selected.size + ' objects?')) return;
      const toRemove = Array.from(editor.selected);
      const snapshots = toRemove.map((el) => {
        const slideSec = el.closest('section.slide');
        return {
          slideId: slideSec ? slideSec.id : '',
          oid: el.getAttribute('data-oid') || '',
          html: el.outerHTML
        };
      });
      toRemove.forEach((el) => el.remove());
      editor.clearSelection();
      history.push({
        undo: () => {
          snapshots.forEach((s) => {
            const slideSec = document.getElementById(s.slideId);
            if (!slideSec) return;
            const layer = slideSec.querySelector('.slide-edit-layer');
            if (!layer) return;
            const tpl = document.createElement('template');
            tpl.innerHTML = s.html.trim();
            const node = tpl.content.firstElementChild;
            if (node) layer.appendChild(node);
          });
          ensureResizeHandles(document);
          ensureObjectControls(document);
          repaintCharts(document);
      refreshFields();
        },
        redo: () => {
          snapshots.forEach((s) => {
            const slideSec = document.getElementById(s.slideId);
            if (!slideSec || !s.oid) return;
            const n = slideSec.querySelector('[data-oid="' + s.oid.replace(/"/g, '') + '"]');
            if (n) n.remove();
          });
        }
      });
    }
  });

  const ICON = {
    duplicate: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<rect x="9" y="9" width="11" height="11" rx="2"/>' +
      '<path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M4 7h16M10 11v6M14 11v6"/>' +
      '<path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/>' +
      '<path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/>' +
      '<circle cx="12" cy="12" r="2.6"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M2 12s3.6-6 10-6c1.9 0 3.5.5 4.9 1.2M22 12s-3.6 6-10 6c-1.9 0-3.6-.5-5-1.3"/>' +
      '<path d="M4 4l16 16"/></svg>'
  };

  /* === Object insertion === */

  // Every inserted object has the same anatomy: a percent-positioned
  // .slide-object in the slide's edit layer, carrying a stable oid and a type,
  // with the move and resize affordances the editor binds to. This generalises
  // the path the image button used to own privately, so shapes, tables and
  // charts all arrive undoable and selectable for free.

  const OBJ_GEOM = {
    graphic: { left: 25, top: 20, width: 30, height: 40 },
    shape:   { left: 32, top: 36, width: 26, height: 20 },
    table:   { left: 10, top: 28, width: 62, height: 32 },
    chart:   { left: 14, top: 24, width: 56, height: 46 },
    text:    { left: 20, top: 40, width: 45, height: 12 }
  };

  let oidSeq = 0;
  function mintOid(kind) {
    oidSeq += 1;
    return 's' + deck.current + '-' + kind + '-' + Date.now().toString(36) + oidSeq;
  }

  function buildObject(kind, innerHtml, geom) {
    const g = Object.assign({}, OBJ_GEOM[kind] || OBJ_GEOM.shape, geom || {});
    const obj = document.createElement('div');
    obj.className = 'slide-object';
    obj.setAttribute('data-slide-object', '');
    obj.setAttribute('data-oid', mintOid(kind));
    obj.setAttribute('data-object-type', kind);
    obj.style.cssText =
      'left:' + g.left + '%;top:' + g.top + '%;width:' + g.width + '%;height:' + g.height + '%;';
    obj.innerHTML =
      '<button type="button" class="slide-object-move" aria-label="Move">⠿</button>' +
      RESIZE_DIRS.map(function (d) {
        return '<button type="button" class="slide-object-resize" data-resize="' + d +
               '" aria-label="Resize ' + d + '"></button>';
      }).join('') +
      '<button type="button" class="slide-object-rotate" aria-label="Rotate"></button>' +
      innerHtml;
    return obj;
  }

  /** Insert an object on the current slide, undoably. Returns the element. */
  function insertObject(kind, innerHtml, geom) {
    const slide = deck.slides[deck.current];
    const layer = slide && slide.querySelector('.slide-edit-layer');
    if (!layer) return null;
    const obj = buildObject(kind, innerHtml, geom);
    layer.appendChild(obj);
    ensureResizeHandles(layer);
    history.push({
      undo: function () { obj.remove(); },
      redo: function () { layer.appendChild(obj); ensureResizeHandles(layer); }
    });
    updateUndoRedoChrome();
    if (editor && typeof editor._selectOnly === 'function') editor._selectOnly(obj);
    return obj;
  }

  /* === Shapes === */

  // Inline SVG stretched to the object box: it scales with a resize, prints,
  // and survives export with no external dependency. preserveAspectRatio="none"
  // lets the box stretch freely; non-scaling-stroke stops the outline from
  // stretching with it.
  const SHAPE_SVG = {
    rect:    '<rect x="2" y="2" width="96" height="96" rx="2" vector-effect="non-scaling-stroke"/>',
    ellipse: '<ellipse cx="50" cy="50" rx="48" ry="48" vector-effect="non-scaling-stroke"/>',
    line:    '<line x1="2" y1="50" x2="98" y2="50" vector-effect="non-scaling-stroke"/>',
    arrow:   '<line x1="2" y1="50" x2="86" y2="50" vector-effect="non-scaling-stroke"/>' +
             '<polygon points="86,41 99,50 86,59" stroke="none" fill="var(--text-primary, currentColor)"/>'
  };

  function shapeMarkup(kind) {
    const filled = kind === 'rect' || kind === 'ellipse';
    return '<div class="slide-object-shape" style="width:100%;height:100%;pointer-events:none;">' +
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" ' +
      'fill="' + (filled ? 'var(--deck-chrome-accent, currentColor)' : 'none') + '" ' +
      'stroke="var(--text-primary, currentColor)" stroke-width="2" ' +
      'stroke-linecap="round" style="display:block;overflow:visible;">' +
      (SHAPE_SVG[kind] || SHAPE_SVG.rect) +
      '</svg></div>';
  }

  function insertShape(kind) {
    const geom = (kind === 'line' || kind === 'arrow')
      ? { left: 30, top: 48, width: 34, height: 6 }
      : null;
    const obj = insertObject('shape', shapeMarkup(kind), geom);
    if (obj) obj.setAttribute('data-shape', kind);
    return obj;
  }

  /* === Text === */

  function insertText() {
    return insertObject('text',
      '<div class="slide-object-text" contenteditable="true" ' +
      'style="width:100%;height:100%;font-family:var(--font-body);' +
      'font-size:var(--body-size, 1rem);color:var(--text-primary, currentColor);">Text</div>');
  }

  /* === Tables === */

  // Cells carry .slide-object-text and contenteditable, so they plug straight
  // into the rich-text toolbar rather than needing an editing path of their own.
  function cellHtml(head, text) {
    const tag = head ? 'th' : 'td';
    return '<' + tag + ' class="slide-object-text" contenteditable="true" style="' +
      'border:1px solid var(--deck-chrome-border, currentColor);padding:0.35em 0.6em;' +
      'text-align:left;vertical-align:middle;' + (head ? 'font-weight:700;' : 'font-weight:400;') +
      '">' + text + '</' + tag + '>';
  }

  function tableMarkup(rows, cols) {
    let html = '<div class="slide-object-table" style="width:100%;height:100%;overflow:hidden;">' +
      // table-layout:fixed divides the width evenly; without it one cell with
      // content claims almost the whole table and the rest collapse.
      '<table style="width:100%;height:100%;table-layout:fixed;border-collapse:collapse;' +
      'font-family:var(--font-body);font-size:var(--small-size, 0.9rem);' +
      'color:var(--text-primary, currentColor);">';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) html += cellHtml(r === 0, r === 0 ? 'Header' : '');
      html += '</tr>';
    }
    return html + '</table></div>';
  }

  function insertTable() {
    const obj = insertObject('table', tableMarkup(3, 3));
    if (obj) ensureObjectControls(obj.parentNode);
    return obj;
  }

  /* Rows and columns, undoable. These used to be reachable only through a
   * strip floating on the object — the identical buttons in the properties
   * panel matched no selector and did nothing at all. The panel is where a
   * table's properties live, so the handler answers to both and the strip is
   * gone. */
  document.addEventListener('click', function (e) {
    const btn = e.target.closest && e.target.closest('[data-table]');
    if (!btn || !editor.active) return;
    e.preventDefault();
    e.stopPropagation();
    const obj = btn.closest('[data-object-type="table"]') || selectedObject();
    const table = obj && obj.querySelector('table');
    if (!table) return;
    const before = table.innerHTML;
    const rows = table.rows;
    const action = btn.getAttribute('data-table');

    if (action === 'row+' && rows.length) {
      const row = table.insertRow(-1);
      for (let c = 0; c < rows[0].cells.length; c++) row.innerHTML += cellHtml(false, '');
    } else if (action === 'row-' && rows.length > 1) {
      table.deleteRow(-1);
    } else if (action === 'col+') {
      for (let r = 0; r < rows.length; r++) rows[r].innerHTML += cellHtml(r === 0, r === 0 ? 'Header' : '');
    } else if (action === 'col-' && rows[0] && rows[0].cells.length > 1) {
      for (let r = 0; r < rows.length; r++) rows[r].deleteCell(-1);
    } else {
      return;
    }

    paintTable(table);
    const after = table.innerHTML;
    history.push({
      undo: function () { table.innerHTML = before; paintTable(table); syncInspector(); },
      redo: function () { table.innerHTML = after; paintTable(table); syncInspector(); }
    });
    updateUndoRedoChrome();
    syncInspector();
  });

  /* Tab across, Enter down. Without this Tab left the table entirely and
   * Enter opened a new line inside a cell, which is never what someone
   * filling in a table means. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' && e.key !== 'Enter') return;
    const cell = e.target.closest && e.target.closest('.slide-object-table th, .slide-object-table td');
    if (!cell || cell.getAttribute('contenteditable') !== 'true') return;
    const row = cell.parentElement;
    const table = cell.closest('table');
    if (!table || !row) return;
    const ci = Array.prototype.indexOf.call(row.cells, cell);
    const ri = Array.prototype.indexOf.call(table.rows, row);
    let next = null;
    if (e.key === 'Tab') {
      const step = e.shiftKey ? -1 : 1;
      next = row.cells[ci + step] ||
        (table.rows[ri + step] && table.rows[ri + step].cells[step > 0 ? 0 : table.rows[ri + step].cells.length - 1]);
    } else {
      const step = e.shiftKey ? -1 : 1;
      next = table.rows[ri + step] && table.rows[ri + step].cells[ci];
    }
    if (!next) return;
    e.preventDefault();
    next.focus();
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(next);
    sel.removeAllRanges();
    sel.addRange(r);
  }, true);

  /* === Charts === */

  // Rendered as inline SVG with no dependency. A deck is a single file that
  // gets emailed around, so inlining a charting library would put ~200 KB into
  // every copy — the same reason Bento wrote their own instead of shipping
  // ECharts. Bar, line and pie cover what a review deck actually needs.

  /* A label followed by one or more numbers. One number is the old single
   * series and still parses; two or more give a series each, which is what a
   * plan-against-actual chart needs. `value` stays on every entry so anything
   * written against the old shape keeps working. */
  function parseSeries(text) {
    return String(text || '').split(',').map(function (pair) {
      const m = pair.trim().match(/^(.*?)[\s:]+((?:-?[\d.]+[\s:]*)+)$/);
      if (!m) return null;
      const values = m[2].trim().split(/[\s:]+/).map(function (n) { return parseFloat(n) || 0; });
      return { label: m[1].trim(), values: values, value: values[0] };
    }).filter(Boolean);
  }

  function seriesText(series) {
    return series.map(function (d) {
      return d.label + ' ' + (d.values || [d.value]).join(' ');
    }).join(', ');
  }

  function seriesCount(series) {
    return series.reduce(function (n, d) { return Math.max(n, (d.values || [d.value]).length); }, 1);
  }

  /* Shapes are drawn in SVG that stretches to the object's box. Text cannot
   * live in there — preserveAspectRatio="none" would squash the letters with
   * it — which is why this chart had no labels at all. The words are laid over
   * the top as HTML instead, positioned in percent, so they stay upright and
   * take the deck's own font. */
  function renderChart(type, series, opts) {
    if (!series.length) return '';
    const o = opts || {};
    const W = 100, H = 62, PAD = 2;
    const n = seriesCount(series);
    const all = series.reduce(function (a, d) { return a.concat(d.values || [d.value]); }, []);
    const max = Math.max.apply(null, all).valueOf() || 1;
    const tint = function (i) { return (1 - i * 0.22).toFixed(2); };
    const fill = o.colour || CHART_FILL;
    /* A legend is drawn across the top, so the plot has to give it room —
     * without this the tallest column ran under the key and its own value
     * label landed on top of it. */
    const TOP = o.legend ? 11 : 0;
    const RISE = H - PAD * 3 - TOP;
    let body = '';

    if (type === 'pie') {
      const total = series.reduce(function (s, d) { return s + (d.values ? d.values[0] : d.value); }, 0) || 1;
      let a0 = -Math.PI / 2;
      const cx = 50, cy = 31, r = 28;
      series.forEach(function (d, i) {
        const v = d.values ? d.values[0] : d.value;
        const a1 = a0 + (v / total) * Math.PI * 2;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        body += '<path d="M' + cx + ',' + cy + ' L' + x0.toFixed(2) + ',' + y0.toFixed(2) +
          ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ',' + y1.toFixed(2) + ' Z" ' +
          'fill="' + fill + '" fill-opacity="' + (1 - i * 0.16).toFixed(2) + '" ' +
          'stroke="' + CHART_INK + '" stroke-width="0.4"/>';
        a0 = a1;
      });
      return body;
    }

    if (o.grid) {
      for (let g = 1; g <= 4; g++) {
        const y = (H - PAD) - (g / 4) * RISE;
        body += '<line x1="' + PAD + '" y1="' + y.toFixed(2) + '" x2="' + (W - PAD) + '" y2="' + y.toFixed(2) +
          '" stroke="' + CHART_INK + '" stroke-width="0.25" stroke-opacity="0.25" vector-effect="non-scaling-stroke"/>';
      }
    }

    const step = (W - PAD * 2) / series.length;
    if (type === 'line') {
      for (let si = 0; si < n; si++) {
        const pts = series.map(function (d, i) {
          const raw = (d.values || [d.value])[si];
          const v = raw === undefined ? 0 : raw;
          const x = PAD + step * (i + 0.5);
          const y = H - PAD - (v / max) * RISE;
          return x.toFixed(2) + ',' + y.toFixed(2);
        }).join(' ');
        body += '<polyline points="' + pts + '" fill="none" stroke="' + fill +
          '" stroke-opacity="' + tint(si) + '" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
        series.forEach(function (d, i) {
          const v = (d.values || [d.value])[si];
          if (v === undefined) return;
          const x = PAD + step * (i + 0.5);
          const y = H - PAD - (v / max) * RISE;
          body += '<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="1.4" fill="' +
            fill + '" fill-opacity="' + tint(si) + '"/>';
        });
      }
    } else {
      series.forEach(function (d, i) {
        const vals = d.values || [d.value];
        const group = step * 0.72;
        const bw = group / n;
        const x0 = PAD + step * i + (step - group) / 2;
        for (let si = 0; si < n; si++) {
          const v = vals[si];
          if (v === undefined) continue;
          const h = (v / max) * RISE;
          body += '<rect x="' + (x0 + bw * si).toFixed(2) + '" y="' + (H - PAD - h).toFixed(2) +
            '" width="' + (bw * 0.88).toFixed(2) + '" height="' + Math.max(h, 0.4).toFixed(2) +
            '" fill="' + fill + '" fill-opacity="' + tint(si) + '"/>';
        }
      });
    }

    body += '<line x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) +
      '" stroke="' + CHART_INK + '" stroke-width="0.4" vector-effect="non-scaling-stroke"/>';
    return body;
  }

  /* The words: category labels along the bottom, the number on each column or
   * point, and a key for the series. Percent positions mirror the geometry the
   * SVG just drew. */
  function renderChartText(type, series, opts) {
    const o = opts || {};
    if (!series.length) return '';
    const W = 100, H = 62, PAD = 2;
    const n = seriesCount(series);
    const all = series.reduce(function (a, d) { return a.concat(d.values || [d.value]); }, []);
    const max = Math.max.apply(null, all).valueOf() || 1;
    const esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    const TOP = o.legend ? 11 : 0;
    const RISE = H - PAD * 3 - TOP;
    let out = '';

    if (type === 'pie') {
      if (!o.labels) return '';
      series.forEach(function (d, i) {
        out += '<span class="chart-key"><i style="opacity:' + (1 - i * 0.16).toFixed(2) +
          '"></i>' + esc(d.label) + '</span>';
      });
      return '<div class="chart-legend">' + out + '</div>';
    }

    const step = (W - PAD * 2) / series.length;
    series.forEach(function (d, i) {
      const cx = PAD + step * (i + 0.5);
      if (o.labels) {
        out += '<span class="chart-cat" style="left:' + cx.toFixed(2) + '%;">' + esc(d.label) + '</span>';
      }
      if (o.values) {
        (d.values || [d.value]).forEach(function (v, si) {
          const y = (H - PAD - (v / max) * RISE) / H * 100;
          const off = n === 1 ? 0 : (si - (n - 1) / 2) * (step * 0.72 / n);
          out += '<span class="chart-val" style="left:' + (cx + off).toFixed(2) +
            '%;top:' + Math.max(0, y - 9).toFixed(2) + '%;">' + esc(v) + '</span>';
        });
      }
    });

    if (o.legend) {
      const names = (o.names || '').split(',').map(function (x) { return x.trim(); });
      let keys = '';
      for (let si = 0; si < n; si++) {
        keys += '<span class="chart-key"><i style="opacity:' + (1 - si * 0.22).toFixed(2) +
          '"></i>' + esc(names[si] || 'Series ' + (si + 1)) + '</span>';
      }
      out += '<div class="chart-legend">' + keys + '</div>';
    }
    return out;
  }

  function chartOpts(obj) {
    return {
      labels: obj.hasAttribute('data-chart-labels'),
      values: obj.hasAttribute('data-chart-values'),
      legend: obj.hasAttribute('data-chart-legend'),
      grid: obj.hasAttribute('data-chart-grid'),
      names: obj.getAttribute('data-chart-names') || '',
      colour: obj.getAttribute('data-chart-colour') || ''
    };
  }

  function paintChart(obj) {
    const host = obj.querySelector('.slide-object-chart');
    const svg = host && host.querySelector('svg');
    if (!svg) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const type = obj.getAttribute('data-chart') || 'bar';
    const series = parseSeries(obj.getAttribute('data-chart-data'));
    const o = chartOpts(obj);
    svg.innerHTML = renderChart(type, series, o);
    let words = host.querySelector('.chart-words');
    if (!words) {
      words = document.createElement('div');
      words.className = 'chart-words';
      words.setAttribute('contenteditable', 'false');
      host.appendChild(words);
    }
    words.innerHTML = renderChartText(type, series, o);
  }

  function chartMarkup() {
    return '<div class="slide-object-chart" style="width:100%;height:100%;pointer-events:none;position:relative;">' +
      '<svg viewBox="0 0 100 70" preserveAspectRatio="none" width="100%" height="100%" ' +
      'style="display:block;overflow:visible;"></svg></div>';
  }

  function insertChart() {
    const obj = insertObject('chart', chartMarkup());
    if (!obj) return null;
    obj.setAttribute('data-chart', 'bar');
    obj.setAttribute('data-chart-data', 'Q1 12, Q2 18, Q3 9, Q4 22');
    /* A chart with no labels is barely a chart, so a new one arrives with the
     * words already on. */
    obj.setAttribute('data-chart-labels', '');
    obj.setAttribute('data-chart-values', '');
    ensureObjectControls(obj.parentNode);
    paintChart(obj);
    return obj;
  }

  // Chart type switch and data edits, both undoable as one step per change.
  document.addEventListener('click', function (e) {
    const btn = e.target.closest && e.target.closest('[data-chart-type]');
    if (!btn || !editor.active) return;
    e.preventDefault();
    e.stopPropagation();
    /* The panel is where these live now, and a panel button is not inside the
     * chart — resolving only upwards left Bar/Line/Pie dead once the strip on
     * the object was removed. */
    const obj = btn.closest('[data-object-type="chart"]') || selectedObject();
    if (!obj || obj.getAttribute('data-object-type') !== 'chart') return;
    const before = obj.getAttribute('data-chart');
    const after = btn.getAttribute('data-chart-type');
    if (before === after) return;
    obj.setAttribute('data-chart', after);
    paintChart(obj);
    history.push({
      undo: function () { obj.setAttribute('data-chart', before); paintChart(obj); },
      redo: function () { obj.setAttribute('data-chart', after); paintChart(obj); }
    });
    updateUndoRedoChrome();
  });

  // Data edits repaint immediately but land in history as one entry per burst,
  // so undo steps over a typed value rather than a keystroke.
  const chartEditState = new WeakMap();
  document.addEventListener('input', function (e) {
    const span = e.target.closest && e.target.closest('.slide-object-chartdata');
    if (!span) return;
    const obj = span.closest('[data-object-type="chart"]');
    if (!obj) return;

    let state = chartEditState.get(obj);
    if (!state) {
      state = { before: obj.getAttribute('data-chart-data') || '', timer: 0 };
      chartEditState.set(obj, state);
    }
    clearTimeout(state.timer);

    obj.setAttribute('data-chart-data', span.textContent);
    paintChart(obj);

    state.timer = setTimeout(function () {
      const before = state.before;
      const after = obj.getAttribute('data-chart-data') || '';
      chartEditState.delete(obj);
      if (before === after) return;
      history.push({
        undo: function () {
          obj.setAttribute('data-chart-data', before);
          const s = obj.querySelector('.slide-object-chartdata');
          if (s) s.textContent = before;
          paintChart(obj);
        },
        redo: function () {
          obj.setAttribute('data-chart-data', after);
          const s = obj.querySelector('.slide-object-chartdata');
          if (s) s.textContent = after;
          paintChart(obj);
        }
      });
      updateUndoRedoChrome();
    }, 500);
  });

  // Repaint charts restored from storage or a re-render of the filmstrip.
  function repaintCharts(root) {
    (root || document).querySelectorAll('[data-object-type="chart"]').forEach(paintChart);
  }

  /* === Dynamic fields === */

  // A field keeps its token in the attribute and its resolved value as text, so
  // the document stores {{page}} rather than "3" and the number follows the
  // slide when pages are reordered.
  function resolveField(token, slideIndex, slideCount) {
    const now = new Date();
    switch (token) {
      case 'page': return String(slideIndex + 1);
      case 'pages': return String(slideCount);
      case 'title': return document.title || '';
      case 'date': return now.toLocaleDateString();
      case 'time': return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      default: return '';
    }
  }

  function refreshFields() {
    const slides = deck.slides || [];
    // Numbering follows the talk, not the file: a skipped slide is neither
    // counted nor numbered, so the run of page numbers stays unbroken.
    const shown = slides.filter(function (s) { return !s.hasAttribute('data-skip'); });
    slides.forEach(function (slide) {
      const at = shown.indexOf(slide);
      slide.querySelectorAll('[data-field]').forEach(function (el) {
        el.textContent = at === -1 ? '—' : resolveField(el.getAttribute('data-field'), at, shown.length);
      });
    });
  }

  function insertField(token) {
    const sel = window.getSelection();
    const span = document.createElement('span');
    span.setAttribute('data-field', token);
    span.textContent = resolveField(token, deck.current, (deck.slides || []).length);

    const textEl = sel && sel.anchorNode && sel.anchorNode.parentElement &&
      sel.anchorNode.parentElement.closest('.slide-object-text[contenteditable="true"]');
    if (textEl && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(span);
      range.setStartAfter(span);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return span;
    }
    // No text cursor: drop it in as its own small text object instead.
    insertObject('text',
      '<div class="slide-object-text" contenteditable="true" ' +
      'style="width:100%;height:100%;font-family:var(--font-body);' +
      'color:var(--text-primary, currentColor);">' + span.outerHTML + '</div>',
      { left: 82, top: 90, width: 12, height: 6 });
    return null;
  }

  /* === Roles === */

  // A role says what a text object IS, so a layout can be applied later by
  // matching donor to target on role rather than on hand-kept ids.
  const ROLES = ['title', 'subtitle', 'body', 'kicker'];

  function applyRole(role) {
    const obj = document.querySelector('.slide-object.is-selected');
    if (!obj) return;
    const before = obj.getAttribute('data-role');
    const after = before === role ? null : role;
    if (after) obj.setAttribute('data-role', after); else obj.removeAttribute('data-role');
    syncRoleButtons();
    history.push({
      undo: function () { if (before) obj.setAttribute('data-role', before); else obj.removeAttribute('data-role'); syncRoleButtons(); },
      redo: function () { if (after) obj.setAttribute('data-role', after); else obj.removeAttribute('data-role'); syncRoleButtons(); }
    });
    updateUndoRedoChrome();
  }

  function syncRoleButtons() {
    const obj = document.querySelector('.slide-object.is-selected');
    const current = obj ? obj.getAttribute('data-role') : null;
    document.querySelectorAll('[data-role-set]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-role-set') === current);
    });
  }

  /* === Slide notes === */

  // Notes live on the slide element, so they travel with the file: export it,
  // hand it to someone, hand it to an agent — the notes are still there.
  function notesPanel() { return document.getElementById('slideNotes'); }

  function loadNotesForCurrentSlide() {
    const panel = notesPanel();
    const slide = deck.slides && deck.slides[deck.current];
    if (!panel || !slide) return;
    /* Now that scrolling changes the current slide, this runs while someone
     * may be mid-sentence in the notes. Leave it alone if it has the caret. */
    if (document.activeElement === panel) return;
    panel.value = slide.getAttribute('data-notes') || '';
  }

  (function () {
    const panel = notesPanel();
    if (!panel) return;
    let pending = null;
    panel.addEventListener('input', function () {
      const slide = deck.slides && deck.slides[deck.current];
      if (!slide) return;
      const before = slide.getAttribute('data-notes') || '';
      if (pending) clearTimeout(pending);
      slide.setAttribute('data-notes', panel.value);
      pending = setTimeout(function () {
        const after = slide.getAttribute('data-notes') || '';
        pending = null;
        if (before === after) return;
        history.push({
          undo: function () { slide.setAttribute('data-notes', before); loadNotesForCurrentSlide(); },
          redo: function () { slide.setAttribute('data-notes', after); loadNotesForCurrentSlide(); }
        });
        updateUndoRedoChrome();
      }, 600);
    });
  })();

  // Keep fields, notes and role buttons in step with the visible slide. The
  // deck marks the current slide with .visible, so watching that is enough and
  // needs no hook into the navigation code.
  (function () {
    const offset = document.querySelector('.slides-offset');
    if (!offset) return;
    let last = -1;
    const sync = function () {
      if (deck.current === last) return;
      last = deck.current;
      loadNotesForCurrentSlide();
      syncRoleButtons();
      // The panel describes the current slide, so it has to follow navigation
      // as well as selection — otherwise the filmstrip and the panel disagree.
      syncInspector();
    };
    new MutationObserver(sync).observe(offset, {
      subtree: true, attributes: true, attributeFilter: ['class']
    });
    document.addEventListener('click', syncRoleButtons, true);
    sync();
  })();

  /* === Motion: morph, entrances, count-up === */

  // Morph is geometry-driven, not inference: an object that appears on two
  // slides under the same data-oid already states both of its frames, so
  // arriving at the second one animates it FROM the first one's box. Percent
  // geometry makes the two comparable without caring where either slide sits.
  function boxWithin(obj, slide) {
    const o = obj.getBoundingClientRect();
    const s = slide.getBoundingClientRect();
    return { x: o.left - s.left, y: o.top - s.top, w: o.width, h: o.height };
  }

  /* An object's resting transform is no longer always nothing — it can be
   * turned. Every animation here used to end at transform:none, which
   * straightened a rotated object the moment it arrived. */
  function restTransform(obj) { return (obj.style.transform || '').trim() || 'none'; }
  function overRest(t, obj) {
    const rest = restTransform(obj);
    if (rest === 'none') return t;
    return t === 'none' ? rest : t + ' ' + rest;
  }

  function morphInto(slideIndex, fromIndex) {
    if (prefersReducedMotion() || fromIndex === slideIndex) return;
    const slides = deck.slides || [];
    const from = slides[fromIndex];
    const to = slides[slideIndex];
    if (!from || !to) return;

    to.querySelectorAll('[data-slide-object][data-oid]').forEach(function (obj) {
      const oid = obj.getAttribute('data-oid');
      const twin = from.querySelector('[data-oid="' + CSS.escape(oid) + '"]');
      if (!twin || twin === obj) return;

      const a = boxWithin(twin, from);
      const b = boxWithin(obj, to);
      if (!b.w || !b.h) return;
      const dx = a.x - b.x, dy = a.y - b.y;
      const sx = a.w / b.w, sy = a.h / b.h;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;

      obj.animate(
        [
          { transformOrigin: 'top left', transform: overRest('translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')', obj) },
          { transformOrigin: 'top left', transform: restTransform(obj) }
        ],
        { duration: 520, easing: 'cubic-bezier(.22,.61,.36,1)' }
      );
    });
  }

  const FX_ENTER = {
    'fade': [{ opacity: 0 }, { opacity: 1 }],
    'fade-up': [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }],
    'fade-down': [{ opacity: 0, transform: 'translateY(-16px)' }, { opacity: 1, transform: 'none' }],
    'slide-left': [{ opacity: 0, transform: 'translateX(120px)' }, { opacity: 1, transform: 'none' }],
    'slide-right': [{ opacity: 0, transform: 'translateX(-120px)' }, { opacity: 1, transform: 'none' }],
    'slide-up': [{ opacity: 0, transform: 'translateY(120px)' }, { opacity: 1, transform: 'none' }],
    'slide-down': [{ opacity: 0, transform: 'translateY(-120px)' }, { opacity: 1, transform: 'none' }]
  };

  function playEntrances(slide) {
    if (prefersReducedMotion() || !slide) return;
    slide.querySelectorAll('[data-fx-enter]').forEach(function (obj) {
      const base = FX_ENTER[obj.getAttribute('data-fx-enter')] || FX_ENTER.fade;
      const frames = base.map(function (f) {
        return f.transform === undefined ? f : Object.assign({}, f, { transform: overRest(f.transform, obj) });
      });
      const order = parseInt(obj.getAttribute('data-fx-order') || '0', 10) || 0;
      const dur = parseFloat(obj.getAttribute('data-fx-duration') || '') || (frames.length && frames[0].transform ? 750 : 550);
      obj.animate(frames, { duration: dur, delay: order * 90, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'backwards' });
    });
  }

  // Count-up walks the numbers already in the text rather than replacing it, so
  // "$12.4M in Q3" animates the 12.4 and leaves the rest alone.
  function playCountUps(slide) {
    if (prefersReducedMotion() || !slide) return;
    slide.querySelectorAll('[data-fx-countup]').forEach(function (obj) {
      const target = obj.querySelector('.slide-object-text') || obj;
      if (target.dataset._countupSource === undefined) target.dataset._countupSource = target.innerHTML;
      const source = target.dataset._countupSource;
      const numbers = source.match(/-?\d[\d,]*\.?\d*/g);
      if (!numbers) return;

      const started = performance.now();
      const DUR = 900;
      const step = function (now) {
        const t = Math.min(1, (now - started) / DUR);
        const eased = 1 - Math.pow(1 - t, 3);
        let i = 0;
        target.innerHTML = source.replace(/-?\d[\d,]*\.?\d*/g, function (raw) {
          const clean = raw.replace(/,/g, '');
          const value = parseFloat(clean);
          const decimals = (clean.split('.')[1] || '').length;
          i += 1;
          const shown = (value * eased).toFixed(decimals);
          return raw.indexOf(',') === -1 ? shown : Number(shown).toLocaleString(undefined, {
            minimumFractionDigits: decimals, maximumFractionDigits: decimals
          });
        });
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* A slide can say how it arrives. This runs on the slide itself rather than
   * on the scroller, so it composes with a deck that snaps and with one that
   * does not. */
  const SLIDE_IN = {
    fade:  [{ opacity: 0 }, { opacity: 1 }],
    slide: [{ transform: 'translateX(6%)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    up:    [{ transform: 'translateY(6%)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    zoom:  [{ transform: 'scale(1.04)', opacity: 0 }, { transform: 'none', opacity: 1 }]
  };
  function playTransition(slide) {
    if (prefersReducedMotion() || !slide) return;
    const frames = SLIDE_IN[slide.getAttribute('data-transition')];
    if (!frames) return;
    slide.animate(frames, { duration: 420, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'backwards' });
  }

  (function () {
    let previous = deck.current;
    const already = deck.onSlideChange;
    deck.onSlideChange = function (i) {
      if (typeof already === 'function') already(i);
      const slide = (deck.slides || [])[i];
      // Motion belongs to viewing, not editing: it would fight a drag.
      if (!editor.active) {
        playTransition(slide);
        morphInto(i, previous);
        playEntrances(slide);
        playCountUps(slide);
      }
      paintSpeaker();
      paintPresentBar();
      // Every goTo passes through here, which is the reliable place to keep
      // the panel describing the slide you are actually looking at.
      loadNotesForCurrentSlide();
      syncInspector();
      previous = i;
    };
  })();

  /* === Present mode === */

  // The deck is already a stack of full-viewport slides, so presenting is
  // mostly a matter of getting out of its way: drop the chrome, stop editing,
  // hide the scrollbars. Keeping it that simple is also what makes it work
  // from a local file with no server and no permissions.
  let presenting = false;

  function slideTitle(slide) {
    if (!slide) return '';
    const el = slide.querySelector('[data-role="title"] .slide-object-text') ||
      slide.querySelector('.slide-object-text');
    return el ? el.textContent.trim().replace(/\s+/g, ' ').slice(0, 90) : '';
  }

  let presentCameFromEdit = false;
  function setPresenting(on) {
    if (!CHROME_ENABLED) return;
    presenting = !!on;
    document.body.classList.toggle('deck-presenting', presenting);
    if (presenting) {
      /* Presenting sits on top of whatever you were doing and hands it back
       * on the way out. Without this, Esc from a show dropped you into the
       * read-only state — somewhere nobody asked to be. */
      presentCameFromEdit = editor.active;
      if (editor.active) editor.setActive(false);
      const focused = document.activeElement;
      if (focused && focused.blur) focused.blur();
      deck.goTo(deck.current);
    }
    paintPresentBar();
    paintSpeaker();
    if (presenting) wakePresentControls();
    else {
      clearTimeout(presentIdle);
      document.body.classList.remove('deck-present-awake');
      if (presentCameFromEdit) {
        presentCameFromEdit = false;
        enterEditMode();
      }
    }
  }

  /* === Speaker window === */

  // Opened by handle and driven directly rather than by messaging: a window
  // reference works regardless of origin, which is what lets the speaker view
  // run from a deck opened off a disk. There is no reliable cross-window close
  // event either, so the handle is polled.
  let speakerWin = null;
  let speakerWatch = 0;
  let presentStarted = 0;

  const SPEAKER_CSS =
    'body{margin:0;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;' +
    'background:#111318;color:#f2f4f7;padding:20px;}' +
    '.sv-top{display:flex;align-items:baseline;gap:16px;margin-bottom:14px}' +
    '.sv-timer{font-size:34px;font-variant-numeric:tabular-nums;cursor:pointer}' +
    '.sv-count{opacity:.6}' +
    '.sv-next{opacity:.72;margin-bottom:14px}' +
    '.sv-next b{opacity:.55;font-weight:600;text-transform:uppercase;letter-spacing:.1em;font-size:11px;display:block}' +
    '.sv-notes{white-space:pre-wrap;font-size:17px;line-height:1.6;' +
    'background:#191c23;border-radius:8px;padding:14px 16px;min-height:40vh}' +
    '.sv-empty{opacity:.4}' +
    '.sv-ctrls{margin-top:14px;display:flex;gap:6px}' +
    '.sv-ctrls button{font:inherit;padding:6px 12px;border-radius:6px;cursor:pointer;' +
    'border:1px solid #333a45;background:#20242c;color:inherit}';

  function watchSpeaker() {
    clearInterval(speakerWatch);
    if (!speakerWin) return;
    speakerWatch = window.setInterval(function () {
      if (!speakerWin || speakerWin.closed) {
        speakerWin = null;
        clearInterval(speakerWatch);
      }
    }, 1000);
  }

  function openSpeaker() {
    if (!CHROME_ENABLED) return;
    if (speakerWin && !speakerWin.closed) { speakerWin.focus(); return; }
    speakerWin = window.open('', 'deck-speaker', 'width=1100,height=760');
    if (!speakerWin) {
      console.warn('[deck] speaker window blocked — allow pop-ups for this page');
      return;
    }
    const d = speakerWin.document;
    d.title = (document.title || 'Deck') + ' — speaker view';
    d.head.innerHTML = '<meta charset="utf-8"><style>' + SPEAKER_CSS + '</style>';
    d.body.innerHTML =
      '<div class="sv-top"><div class="sv-timer" title="Click to reset">00:00</div>' +
      '<div class="sv-count"></div></div>' +
      '<div class="sv-next"><b>Next</b><span></span></div>' +
      '<div class="sv-notes"></div>' +
      '<div class="sv-ctrls"><button data-nav="prev">‹ Previous</button>' +
      '<button data-nav="next">Next ›</button></div>';

    d.addEventListener('click', function (e) {
      const nav = e.target.closest && e.target.closest('[data-nav]');
      if (nav) deck.goTo(deck.current + (nav.getAttribute('data-nav') === 'next' ? 1 : -1));
      else if (e.target.closest && e.target.closest('.sv-timer')) presentStarted = Date.now();
    });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') deck.goTo(deck.current + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') deck.goTo(deck.current - 1);
    });

    if (!presentStarted) presentStarted = Date.now();
    watchSpeaker();
    paintSpeaker();
  }

  let presentIdle = 0;
  function wakePresentControls() {
    if (!presenting) return;
    document.body.classList.add('deck-present-awake');
    clearTimeout(presentIdle);
    presentIdle = setTimeout(function () {
      document.body.classList.remove('deck-present-awake');
    }, 2600);
  }
  document.addEventListener('mousemove', wakePresentControls);
  document.addEventListener('keydown', wakePresentControls);

  function paintPresentBar() {
    const el = document.getElementById('deckPresentCount');
    if (el) el.textContent = (deck.current + 1) + ' / ' + ((deck.slides || []).length || 1);
  }

  function paintSpeaker() {
    if (!speakerWin || speakerWin.closed) return;
    const d = speakerWin.document;
    const slides = deck.slides || [];
    const slide = slides[deck.current];
    const notes = (slide && slide.getAttribute('data-notes')) || '';
    const next = slideTitle(slides[deck.current + 1]);

    const count = d.querySelector('.sv-count');
    if (count) count.textContent = (deck.current + 1) + ' / ' + slides.length;
    const nextEl = d.querySelector('.sv-next span');
    if (nextEl) nextEl.textContent = next || '— end of deck —';
    const notesEl = d.querySelector('.sv-notes');
    if (notesEl) {
      notesEl.textContent = notes || 'No notes on this slide.';
      notesEl.classList.toggle('sv-empty', !notes);
    }
  }

  setInterval(function () {
    if (!speakerWin || speakerWin.closed || !presentStarted) return;
    const el = speakerWin.document.querySelector('.sv-timer');
    if (!el) return;
    const s = Math.floor((Date.now() - presentStarted) / 1000);
    el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }, 1000);

  document.addEventListener('keydown', function (e) {
    if (!CHROME_ENABLED) return;
    // Escape is checked before the typing guard: a way out must never depend
    // on where the focus happens to be.
    if (e.key === 'Escape' && presenting) { setPresenting(false); return; }
    if (e.target.closest && e.target.closest('[contenteditable="true"]')) return;
    /* F5 is the one that works from inside the editor, because it cannot be
     * mistaken for typing. Bento settled on the same key. P is left for the
     * reading state, where a bare letter is safe. */
    if (e.key === 'F5') { e.preventDefault(); setPresenting(!presenting); return; }
    if ((e.key === 'p' || e.key === 'P') && !editor.active) { setPresenting(!presenting); return; }
    if ((e.key === 's' || e.key === 'S') && presenting) openSpeaker();
  });

  /* === Media === */

  // Embedding is what keeps a deck one file, but a clip embeds as base64 at
  // roughly 4/3 its size — so warn at the point of choosing, the way Bento's
  // "embed short, link long" rule does, rather than after the file is huge.
  const MEDIA_INLINE_WARN = 8 * 1024 * 1024;

  /* A clip can also be linked rather than carried. Embedding keeps a deck one
   * file, which is the point of this thing, but it costs roughly 4/3 the size
   * of the clip — so a long video is better hosted and pointed at, and the
   * deck stays small. Bento splits the Media button the same way. */
  (function () {
    document.querySelectorAll('[data-insert="media-link"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!editor.active) return;
        const kind = btn.getAttribute('data-media-kind') || 'video';
        const url = (window.prompt(kind === 'audio'
          ? 'Address of the audio to play'
          : 'Address of the video to play') || '').trim();
        if (!url) return;
        const obj = insertObject('media', mediaMarkup(kind, url),
          kind === 'audio' ? { left: 20, top: 78, width: 60, height: 8 } : null);
        if (obj) {
          obj.setAttribute('data-media', kind);
          obj.setAttribute('data-media-linked', '');
        }
      });
    });
  })();

  function mediaMarkup(kind, src) {
    const common = 'width:100%;height:100%;display:block;pointer-events:none;';
    return '<div class="slide-object-media" style="width:100%;height:100%;">' +
      (kind === 'audio'
        ? '<audio src="' + src + '" controls style="' + common + 'height:auto;pointer-events:auto;"></audio>'
        : '<video src="' + src + '" controls playsinline style="' + common + 'object-fit:contain;pointer-events:auto;"></video>') +
      '</div>';
  }

  (function () {
    const inp = document.getElementById('deckMediaInput');
    if (!inp) return;
    document.querySelectorAll('[data-insert="media"]').forEach(function (btn) {
      btn.addEventListener('click', function () { if (editor.active) inp.click(); });
    });
    inp.addEventListener('change', function (e) {
      const file = e.target.files[0];
      inp.value = '';
      if (!file) return;
      const kind = file.type.indexOf('audio') === 0 ? 'audio' : 'video';
      if (file.size > MEDIA_INLINE_WARN) {
        const mb = Math.round(file.size / 1024 / 1024);
        const grown = Math.round(file.size * 1.34 / 1024 / 1024);
        if (!window.confirm(
          'That clip is ' + mb + ' MB. Embedding keeps the deck a single file, but it ' +
          'will add about ' + grown + ' MB to it.\n\nEmbed it anyway?\n\n' +
          'Cancel, and you can host the clip and paste its URL into the object instead.'
        )) return;
      }
      const reader = new FileReader();
      reader.onload = function (ev) {
        const obj = insertObject('media', mediaMarkup(kind, ev.target.result),
          kind === 'audio' ? { left: 20, top: 78, width: 60, height: 8 } : null);
        if (obj) obj.setAttribute('data-media', kind);
      };
      reader.readAsDataURL(file);
    });
  })();


  /* === Inspector === */

  // Bento's panel is a stack of folding sections that change with what is
  // selected. Ours takes the same shape but only the sections we can actually
  // back: geometry, arrange, colour, the table and chart controls that were
  // floating beside their objects, and motion. Their Effects, Fill & stroke,
  // Interactivity, Layout and Advanced (JSON) sections are deliberately absent
  // — we have nothing behind them yet, and an empty control is worse than none.

  function selectedObject() { return document.querySelector('.slide-object.is-selected'); }
  function currentSlide() { return (deck.slides || [])[deck.current] || null; }

  function pct(el, prop) {
    const m = (el.style[prop] || '').match(/^([\d.]+)%$/);
    return m ? parseFloat(m[1]) : null;
  }

  function pushAttr(apply, before, after) {
    apply(after);
    history.push({ undo: function () { apply(before); syncInspector(); },
                   redo: function () { apply(after); syncInspector(); } });
    updateUndoRedoChrome();
  }

  // Folding sections.
  document.addEventListener('click', function (e) {
    const head = e.target.closest && e.target.closest('.deck-sect-head[data-fold]');
    if (!head || e.target.closest('.deck-sect-tools')) return;
    head.parentElement.classList.toggle('is-folded');
  });

  // Panel collapse, the handles on the inside edge of each panel.
  document.addEventListener('click', function (e) {
    const h = e.target.closest && e.target.closest('[data-panel-toggle]');
    if (!h) return;
    const which = h.getAttribute('data-panel-toggle');
    document.body.classList.toggle('deck-hide-' + which);
    if (zoomFit) setTimeout(fitZoom, 0);
  });

  /* The deck's own fonts come first, because a design that names its faces
   * means them. But offering only those left the control empty on a deck that
   * names none, and gave nobody a way to bring a font in — so beneath them sit
   * stacks that need no download, and beneath those, whatever has been packed
   * into this file. */
  function documentFonts() {
    const cs = getComputedStyle(document.documentElement);
    const out = [];
    ['display', 'body', 'mono'].forEach(function (key) {
      if (cs.getPropertyValue('--font-' + key).trim()) {
        out.push({ label: key.charAt(0).toUpperCase() + key.slice(1), value: 'var(--font-' + key + ')' });
      }
    });
    return out;
  }

  /* Stacks rather than single names: these resolve to something on every
   * machine, so a deck sent to someone else does not silently fall back. */
  const SYSTEM_FONTS = [
    { label: 'Sans', value: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    { label: 'Serif', value: 'Georgia, "Times New Roman", Times, serif' },
    { label: 'Mono', value: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
    { label: 'Rounded', value: '"SF Pro Rounded", "Segoe UI Variable", Avenir, "Century Gothic", sans-serif' },
    { label: 'Condensed', value: '"HelveticaNeue-CondensedBold", "Arial Narrow", "Roboto Condensed", sans-serif' }
  ];

  const EMBED_STYLE_ID = 'deckEmbeddedFonts';
  function embedStyleEl(make) {
    let el = document.getElementById(EMBED_STYLE_ID);
    if (!el && make) {
      el = document.createElement('style');
      el.id = EMBED_STYLE_ID;
      document.head.appendChild(el);
    }
    return el;
  }
  /* The families packed into this file are read back out of the rule block
   * rather than tracked separately, so a deck that arrives with fonts already
   * in it lists them without having been told. */
  function embeddedFonts() {
    const el = embedStyleEl(false);
    if (!el) return [];
    const seen = [];
    const re = /font-family:\s*(?:"([^"]+)"|'([^']+)'|([^;{}]+))/g;
    let m;
    while ((m = re.exec(el.textContent))) {
      const name = (m[1] || m[2] || m[3] || '').trim();
      if (name && seen.indexOf(name) === -1) seen.push(name);
    }
    return seen.map(function (n) { return { label: n, value: '"' + n + '"' }; });
  }

  function paintFontList(target) {
    const sel = target || document.querySelector('[data-text-font]');
    if (!sel) return;
    const keep = sel.value;
    sel.innerHTML = '';
    const inherit = document.createElement('option');
    inherit.value = ''; inherit.textContent = 'Inherit';
    sel.appendChild(inherit);
    [['From this deck', documentFonts()],
     ['Packed into this file', embeddedFonts()],
     ['Always available', SYSTEM_FONTS]].forEach(function (pair) {
      if (!pair[1].length) return;
      const g = document.createElement('optgroup');
      g.label = pair[0];
      pair[1].forEach(function (f) {
        const o = document.createElement('option');
        o.value = f.value; o.textContent = f.label;
        g.appendChild(o);
      });
      sel.appendChild(g);
    });
    sel.value = keep;
  }
  paintFontList();
  paintFontList(document.querySelector('[data-rte-font]'));

  /* A font file goes into the document the way an image does — base64, so the
   * deck stays one file and the face travels with it to whoever opens it. */
  (function () {
    const inp = document.getElementById('deckFontInput');
    const btn = document.getElementById('btnAddFont');
    if (!inp || !btn) return;
    btn.addEventListener('click', function () { inp.click(); });
    inp.addEventListener('change', function (e) {
      const file = e.target.files[0];
      inp.value = '';
      if (!file) return;
      const family = file.name.replace(/\.(woff2?|ttf|otf)$/i, '').replace(/[_-]+/g, ' ').replace(/"/g, '').trim();
      if (!family) return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        const style = embedStyleEl(true);
        const fmt = /\.woff2$/i.test(file.name) ? 'woff2'
          : /\.woff$/i.test(file.name) ? 'woff'
          : /\.otf$/i.test(file.name) ? 'opentype' : 'truetype';
        style.textContent += '\n@font-face{font-family:"' + family + '";src:url(' +
          ev.target.result + ') format("' + fmt + '");font-display:swap}';
        paintFontList();
        const sel = document.querySelector('[data-text-font]');
        if (sel) {
          sel.value = '"' + family + '"';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        scheduleSave();
      };
      reader.readAsDataURL(file);
    });
  })();

  document.addEventListener('change', function (e) {
    const sel = e.target.closest && e.target.closest('[data-text-font]');
    if (!sel) return;
    const obj = selectedObject();
    if (obj) styleText(obj, { fontFamily: sel.value }, 'block');
  });
  document.addEventListener('input', function (e) {
    const f = e.target.closest && e.target.closest('[data-text-size]');
    if (!f) return;
    const obj = selectedObject();
    if (!obj) return;
    const v = parseFloat(f.value);
    /* A half-typed number is not a size. Nothing happens until it is one, and
     * an out-of-range one is brought back inside rather than applied. */
    if (isNaN(v)) return;
    styleText(obj, { fontSize: Math.min(FONT_MAX, Math.max(FONT_MIN, v)) + 'px' }, 'block');
  });

  /* Emptying the field means "no size of my own" — the design's own size back.
   * On change rather than on input, so clearing it in order to type another
   * number does not flash the text to its default on the way. */
  document.addEventListener('change', function (e) {
    const f = e.target.closest && e.target.closest('[data-text-size]');
    if (!f || f.value.trim() !== '') return;
    const obj = selectedObject();
    const el = textEl(obj);
    if (el) { setStyle(el, 'fontSize', ''); syncInspector(); }
  });


  /* === Fill, stroke, fit: the properties the insert buttons were missing ===
   *
   * You could put a rectangle on a slide and then not colour it, which made
   * the Shape button half a feature. Same for a picture's crop and a video's
   * cover. Each of these edits an attribute or an inline style on the node the
   * object already has, so nothing new is invented for a document to carry. */

  function shapeSvg(obj) { return obj && obj.querySelector('.slide-object-shape svg'); }
  function imageEl(obj) { return obj && obj.querySelector('.slide-object-graphic img'); }
  function mediaEl(obj) { return obj && obj.querySelector('.slide-object-media video, .slide-object-media audio'); }

  /* A colour input needs six hex digits, and these documents legitimately
   * carry var(--token) and currentColor. Ask the browser what it resolved to
   * rather than trying to parse the authored value. */
  function hexOf(el, prop) {
    if (!el) return null;
    const v = getComputedStyle(el)[prop];
    const m = v && v.match(/\d+/g);
    if (!m || m.length < 3) return null;
    return '#' + m.slice(0, 3).map(function (n) {
      return ('0' + parseInt(n, 10).toString(16)).slice(-2);
    }).join('');
  }

  function shapeAttr(obj, name, value) {
    const svg = shapeSvg(obj);
    if (!svg) return;
    const before = svg.getAttribute(name);
    pushAttr(function (v) {
      if (v === null) svg.removeAttribute(name);
      else svg.setAttribute(name, v);
      /* An arrow's head is a filled polygon of its own; left alone it kept the
       * old colour while the shaft changed and the arrow came apart. */
      if (name === 'stroke') {
        svg.querySelectorAll('polygon').forEach(function (p) { p.setAttribute('fill', v); });
      }
    }, before, value);
  }

  document.addEventListener('input', function (e) {
    const t = e.target;
    if (!t.closest) return;
    const obj = selectedObject();
    if (!obj) return;
    if (t.closest('[data-shape-fill]')) shapeAttr(obj, 'fill', t.value);
    else if (t.closest('[data-shape-stroke]')) shapeAttr(obj, 'stroke', t.value);
    else if (t.closest('[data-shape-stroke-width]')) shapeAttr(obj, 'stroke-width', t.value);
    else if (t.closest('[data-shape-radius]')) {
      const svg = shapeSvg(obj);
      const r = svg && svg.querySelector('rect');
      if (r) {
        const before = r.getAttribute('rx');
        pushAttr(function (v) { r.setAttribute('rx', v); r.setAttribute('ry', v); }, before, t.value);
      }
    } else if (t.closest('[data-img-radius]')) {
      const img = imageEl(obj);
      if (img) setStyle(img, 'borderRadius', t.value ? t.value + 'px' : '');
    } else if (t.closest('[data-media-radius]')) {
      const m = mediaEl(obj);
      if (m) setStyle(m, 'borderRadius', t.value ? t.value + 'px' : '');
    }
  });

  document.addEventListener('change', function (e) {
    const t = e.target;
    if (!t.closest) return;
    const obj = selectedObject();
    if (!obj) return;
    if (t.closest('[data-shape-dash]')) shapeAttr(obj, 'stroke-dasharray', t.value || null);
    else if (t.closest('[data-img-fit]')) {
      const img = imageEl(obj);
      if (img) setStyle(img, 'objectFit', t.value);
    } else if (t.closest('[data-media-fit]')) {
      const m = mediaEl(obj);
      if (m) setStyle(m, 'objectFit', t.value);
    }
  });

  document.addEventListener('click', function (e) {
    const t = e.target;
    if (!t.closest) return;
    const obj = selectedObject();
    if (!obj) return;
    if (t.closest('[data-shape-fill-none]')) { shapeAttr(obj, 'fill', 'none'); syncInspector(); }
    const flag = t.closest('[data-media-flag]');
    if (flag) {
      const m = mediaEl(obj);
      if (!m) return;
      const name = flag.getAttribute('data-media-flag');
      const before = m.hasAttribute(name);
      pushAttr(function (v) {
        if (v) m.setAttribute(name, ''); else m.removeAttribute(name);
        if (name === 'muted') m.muted = !!v;
      }, before, !before);
      syncInspector();
    }
    if (t.closest('[data-media-poster-clear]')) {
      const m = mediaEl(obj);
      if (m && m.tagName === 'VIDEO') {
        const before = m.getAttribute('poster');
        pushAttr(function (v) { if (v) m.setAttribute('poster', v); else m.removeAttribute('poster'); }, before, null);
      }
    }
  });

  /* One helper so every inline-style property change is undoable the same way
   * and nothing has to remember to push its own record. */
  function setStyle(el, prop, value) {
    const before = el.style[prop];
    pushAttr(function (v) { el.style[prop] = v; }, before, value);
  }

  (function () {
    const inp = document.getElementById('deckPosterInput');
    const btn = document.getElementById('btnMediaPoster');
    if (!inp || !btn) return;
    btn.addEventListener('click', function () { inp.click(); });
    inp.addEventListener('change', function (e) {
      const file = e.target.files[0];
      inp.value = '';
      const obj = selectedObject();
      const m = mediaEl(obj);
      if (!file || !m || m.tagName !== 'VIDEO') return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        const before = m.getAttribute('poster');
        pushAttr(function (v) { if (v) m.setAttribute('poster', v); else m.removeAttribute('poster'); },
          before, ev.target.result);
      };
      reader.readAsDataURL(file);
    });
  })();


  /* === Text shape and table shape ===
   *
   * Alignment was the conspicuous hole: you could pick a font and a colour but
   * not where the words sat in their box, which is the first thing anyone
   * reaches for. Tables could gain and lose rows and nothing else. */

  function textEl(obj) { return obj && obj.querySelector('.slide-object-text'); }

  function tableEl(obj) { return obj && obj.querySelector('.slide-object-table table'); }
  function tableCells(tbl) {
    return tbl ? Array.prototype.slice.call(tbl.querySelectorAll('th, td')) : [];
  }

  /* Grid, padding and header are re-derived from the table's own attributes
   * rather than remembered per cell, so undo only has to restore a word and
   * the cells follow. */
  /* Every part of a table's look is an attribute on the table itself, and the
   * cells are repainted from those. Undo therefore only has to put one word
   * back, and a table pasted from elsewhere adopts the look the moment it is
   * given one. */
  const TABLE_PRESETS = {
    boxed:   { grid: 'all',  stripe: false },
    lines:   { grid: 'rows', stripe: false },
    striped: { grid: 'rows', stripe: true },
    plain:   { grid: 'none', stripe: false }
  };

  function paintTable(tbl) {
    if (!tbl) return;
    const at = function (n) { return tbl.getAttribute(n); };
    const preset = TABLE_PRESETS[at('data-preset')] || null;
    const lines = at('data-grid') || (preset ? preset.grid : 'all');
    const stripe = preset ? preset.stripe : false;
    const lineCol = at('data-line') || 'var(--deck-chrome-border, currentColor)';
    const headFill = at('data-head-fill');
    const headText = at('data-head-text');
    const textCol = at('data-text');
    const px = at('data-pad-x');
    const py = at('data-pad-y');
    const font = at('data-font');
    const radius = at('data-radius');
    const head = tbl.hasAttribute('data-head');

    /* A radius on a table with collapsed borders does nothing — the cells
     * paint over the corners — so the wrapper has to clip. */
    tbl.style.borderRadius = radius ? radius + 'px' : '';
    const wrap = tbl.parentElement;
    if (wrap && wrap.classList.contains('slide-object-table')) {
      wrap.style.borderRadius = radius ? radius + 'px' : '';
      wrap.style.overflow = 'hidden';
    }
    if (font) tbl.style.fontSize = font + 'px';

    Array.prototype.slice.call(tbl.rows || []).forEach(function (tr, ri) {
      const isHead = head && ri === 0;
      Array.prototype.slice.call(tr.cells).forEach(function (cell) {
        if (lines === 'none') { cell.style.border = '0 none'; }
        else if (lines === 'rows') {
          cell.style.border = '0 none';
          cell.style.borderBottom = '1px solid ' + lineCol;
        } else {
          cell.style.border = '1px solid ' + lineCol;
        }
        cell.style.padding = (py === null ? '0.35' : py) + 'em ' + (px === null ? '0.6' : px) + 'em';
        cell.style.fontWeight = isHead ? '700' : '400';
        cell.style.background = isHead && headFill ? headFill
          : (stripe && !isHead && ri % 2 === 0 ? 'rgba(127,127,127,0.09)' : '');
        cell.style.color = isHead && headText ? headText : (textCol || '');
      });
    });
  }

  function tableSet(obj, attr, value) {
    const tbl = tableEl(obj);
    if (!tbl) return;
    const before = tbl.getAttribute(attr);
    pushAttr(function (v) {
      if (v === null) tbl.removeAttribute(attr);
      else tbl.setAttribute(attr, v);
      paintTable(tbl);
    }, before, value);
  }

  document.addEventListener('click', function (e) {
    const t = e.target;
    if (!t.closest) return;
    const obj = selectedObject();
    if (!obj) return;

    const al = t.closest('[data-text-align]');
    if (al) {
      const el = textEl(obj);
      if (el) { setStyle(el, 'textAlign', al.getAttribute('data-text-align')); syncInspector(); }
      return;
    }
    const va = t.closest('[data-text-valign]');
    if (va) {
      const el = textEl(obj);
      if (el) {
        /* Vertical placement needs the box to be a column, so the two go on
         * together — setting justify-content alone on a plain block does
         * nothing, which would have read as a dead button. */
        const want = va.getAttribute('data-text-valign');
        const beforeD = el.style.display, beforeF = el.style.flexDirection, beforeJ = el.style.justifyContent;
        pushAttr(function (v) {
          el.style.display = v.d; el.style.flexDirection = v.f; el.style.justifyContent = v.j;
        }, { d: beforeD, f: beforeF, j: beforeJ }, { d: 'flex', f: 'column', j: want });
        syncInspector();
      }
      return;
    }
    if (t.closest('[data-text-leading-reset]')) {
      const el = textEl(obj);
      if (el) { setStyle(el, 'lineHeight', ''); syncInspector(); }
      return;
    }
    const clr = t.closest('[data-table-clear]');
    if (clr) {
      tableSet(obj, 'data-' + clr.getAttribute('data-table-clear'), null);
      syncInspector();
      return;
    }
    if (t.closest('[data-table-to-chart]')) tableToChart(obj);
  });

  /* The checkbox is its own listener: a change on an input never reaches the
   * click handler in a state worth reading. */
  document.addEventListener('change', function (e) {
    const t = e.target;
    if (!t.closest || !t.closest('[data-table-header]')) return;
    const obj = selectedObject();
    const tbl = tableEl(obj);
    if (tbl) { tableSet(obj, 'data-head', t.checked ? '' : null); syncInspector(); }
  });

  /* A table already holds the numbers, so charting it should not mean typing
   * them again. The first column becomes the labels, the rest the values. */
  function tableToChart(obj) {
    const tbl = tableEl(obj);
    if (!tbl) return;
    const rows = Array.prototype.slice.call(tbl.rows || []);
    const skipHead = tbl.hasAttribute('data-head') ? 1 : 0;
    const pairs = [];
    rows.slice(skipHead).forEach(function (tr) {
      const cells = Array.prototype.slice.call(tr.cells).map(function (c) { return c.textContent.trim(); });
      if (!cells.length) return;
      const label = cells[0];
      const num = cells.slice(1).map(parseFloat).filter(function (n) { return !isNaN(n); });
      if (label && num.length) pairs.push(label.replace(/,/g, ' ') + ' ' + num.join(' '));
    });
    if (!pairs.length) {
      window.alert('No numbers found — a chart needs a label column and at least one column of numbers.');
      return;
    }
    const chart = insertChart();
    if (!chart) return;
    chart.setAttribute('data-chart-data', pairs.join(', '));
    /* Land it beside the table it came from rather than in the default spot,
     * so the two can be compared without a drag first. */
    const box = obj.getBoundingClientRect();
    const slide = obj.closest('section.slide');
    if (slide) {
      const sb = slide.getBoundingClientRect();
      chart.style.left = (((box.left - sb.left) / sb.width) * 100) + '%';
      chart.style.top = Math.min(92, ((box.top - sb.top) / sb.height) * 100 + 4) + '%';
      chart.style.width = ((box.width / sb.width) * 100) + '%';
      chart.style.height = ((box.height / sb.height) * 100) + '%';
    }
    paintChart(chart);
    syncInspector();
  }

  document.addEventListener('input', function (e) {
    const t = e.target;
    if (!t.closest) return;
    const obj = selectedObject();
    if (!obj) return;
    if (t.closest('[data-text-leading]')) {
      const el = textEl(obj);
      if (el) setStyle(el, 'lineHeight', t.value);
    } else if (t.closest('[data-table-pad-x]')) tableSet(obj, 'data-pad-x', t.value);
    else if (t.closest('[data-table-pad-y]')) tableSet(obj, 'data-pad-y', t.value);
    else if (t.closest('[data-table-font]')) tableSet(obj, 'data-font', t.value);
    else if (t.closest('[data-table-radius]')) tableSet(obj, 'data-radius', t.value);
    /* Colour inputs report on input while the picker is dragged and only on
     * change when it closes. Listening for change alone meant the table did
     * not follow the colour you were choosing. */
    else if (t.closest('[data-table-head-fill]')) tableSet(obj, 'data-head-fill', t.value);
    else if (t.closest('[data-table-head-text]')) tableSet(obj, 'data-head-text', t.value);
    else if (t.closest('[data-table-text]')) tableSet(obj, 'data-text', t.value);
    else if (t.closest('[data-table-line]')) tableSet(obj, 'data-line', t.value);
  });

  document.addEventListener('change', function (e) {
    const t = e.target;
    if (!t.closest) return;
    const obj = selectedObject();
    if (!obj) return;
    if (t.closest('[data-text-weight]')) {
      styleText(obj, { fontWeight: t.value }, 'block');
    }
    else if (t.closest('[data-table-lines]')) tableSet(obj, 'data-grid', t.value);
    else if (t.closest('[data-table-preset]')) {
      /* Picking a preset clears a one-off grid choice, or the preset would
       * appear not to take. */
      const tbl = tableEl(obj);
      if (tbl) tbl.removeAttribute('data-grid');
      tableSet(obj, 'data-preset', t.value);
      syncInspector();
    }
  });


  /* === Angle, shadow, aligning to each other, and where a click goes === */

  const SHADOWS = {
    soft:   'drop-shadow(0 2px 6px rgba(0,0,0,0.18))',
    medium: 'drop-shadow(0 6px 16px rgba(0,0,0,0.22))',
    strong: 'drop-shadow(0 12px 28px rgba(0,0,0,0.30))'
  };

  function selectedObjects() {
    return Array.prototype.slice.call(document.querySelectorAll('.slide-object.is-selected'));
  }

  /* Everything is positioned in percent of the slide, so alignment is done in
   * percent too — no pixel round-trip, and it survives a resize of the window. */
  function boxOf(el) {
    return {
      x: pct(el, 'left') || 0,
      y: pct(el, 'top') || 0,
      w: pct(el, 'width') || 0,
      h: pct(el, 'height') || 0
    };
  }

  function moveMany(els, place) {
    const before = els.map(function (el) { return { left: el.style.left, top: el.style.top }; });
    const boxes = els.map(boxOf);
    const after = place(boxes);
    const apply = function (list) {
      els.forEach(function (el, i) {
        if (list[i].left !== undefined) el.style.left = list[i].left;
        if (list[i].top !== undefined) el.style.top = list[i].top;
      });
    };
    pushAttr(apply, before, after);
  }

  const ALIGNERS = {
    left:    function (b) { const v = Math.min.apply(null, b.map(function (x) { return x.x; })); return b.map(function () { return { left: v + '%' }; }); },
    right:   function (b) { const v = Math.max.apply(null, b.map(function (x) { return x.x + x.w; })); return b.map(function (x) { return { left: (v - x.w) + '%' }; }); },
    hcenter: function (b) { const v = b.reduce(function (a, x) { return a + x.x + x.w / 2; }, 0) / b.length; return b.map(function (x) { return { left: (v - x.w / 2) + '%' }; }); },
    top:     function (b) { const v = Math.min.apply(null, b.map(function (x) { return x.y; })); return b.map(function () { return { top: v + '%' }; }); },
    bottom:  function (b) { const v = Math.max.apply(null, b.map(function (x) { return x.y + x.h; })); return b.map(function (x) { return { top: (v - x.h) + '%' }; }); },
    vcenter: function (b) { const v = b.reduce(function (a, x) { return a + x.y + x.h / 2; }, 0) / b.length; return b.map(function (x) { return { top: (v - x.h / 2) + '%' }; }); }
  };

  /* Spread keeps the two outermost objects where they are and evens the gaps
   * between the rest — the same rule every drawing tool uses. */
  function spread(boxes, axis) {
    const pos = axis === 'h' ? 'x' : 'y';
    const size = axis === 'h' ? 'w' : 'h';
    const key = axis === 'h' ? 'left' : 'top';
    const order = boxes.map(function (b, i) { return { i: i, b: b }; })
      .sort(function (p, q) { return p.b[pos] - q.b[pos]; });
    const first = order[0].b, last = order[order.length - 1].b;
    const span = (last[pos] + last[size]) - first[pos];
    const used = order.reduce(function (a, o) { return a + o.b[size]; }, 0);
    const gap = (span - used) / (order.length - 1);
    const out = boxes.map(function () { return {}; });
    let at = first[pos];
    order.forEach(function (o) {
      out[o.i][key] = at + '%';
      at += o.b[size] + gap;
    });
    return out;
  }

  document.addEventListener('click', function (e) {
    const t = e.target;
    if (!t.closest) return;

    const al = t.closest('[data-align]');
    if (al) {
      const els = selectedObjects();
      if (els.length >= 2) moveMany(els, ALIGNERS[al.getAttribute('data-align')]);
      return;
    }
    const sp = t.closest('[data-distribute]');
    if (sp) {
      const els = selectedObjects();
      if (els.length >= 3) moveMany(els, function (b) { return spread(b, sp.getAttribute('data-distribute')); });
      return;
    }
    const obj = selectedObject();
    if (!obj) return;
    if (t.closest('[data-geom-rotate-reset]')) { setStyle(obj, 'transform', ''); syncInspector(); }
    if (t.closest('[data-obj-link-clear]')) {
      const before = obj.getAttribute('data-link');
      pushAttr(function (v) {
        if (v) obj.setAttribute('data-link', v); else obj.removeAttribute('data-link');
      }, before, null);
      syncInspector();
    }
  });

  document.addEventListener('input', function (e) {
    const t = e.target;
    if (!t.closest) return;
    const obj = selectedObject();
    if (!obj) return;
    if (t.closest('[data-geom="rotate"]')) {
      const n = parseFloat(t.value);
      setStyle(obj, 'transform', isNaN(n) || n === 0 ? '' : 'rotate(' + n + 'deg)');
    } else if (t.closest('[data-obj-link]')) {
      const before = obj.getAttribute('data-link');
      const v = t.value.trim();
      pushAttr(function (x) {
        if (x) obj.setAttribute('data-link', x); else obj.removeAttribute('data-link');
      }, before, v || null);
    }
  });

  document.addEventListener('change', function (e) {
    const t = e.target;
    if (!t.closest) return;
    if (t.closest('[data-slide-transition]')) {
      const slide = currentSlide();
      if (!slide) return;
      const before = slide.getAttribute('data-transition');
      pushAttr(function (v) {
        if (v) slide.setAttribute('data-transition', v); else slide.removeAttribute('data-transition');
      }, before, t.value || null);
      return;
    }
    const obj = selectedObject();
    if (!obj) return;
    if (t.closest('[data-obj-shadow]')) {
      const before = obj.style.filter;
      pushAttr(function (v) { obj.style.filter = v; }, before, SHADOWS[t.value] || '');
    }
  });



  /* Chart options are attributes, repainted from, so undo restores a word. */
  function chartSet(obj, attr, value) {
    const before = obj.hasAttribute(attr) ? (obj.getAttribute(attr) || '') : null;
    pushAttr(function (v) {
      if (v === null) obj.removeAttribute(attr);
      else obj.setAttribute(attr, v);
      paintChart(obj);
    }, before, value);
  }

  document.addEventListener('click', function (e) {
    const t = e.target;
    if (!t.closest) return;
    const obj = selectedObject();
    if (!obj || obj.getAttribute('data-object-type') !== 'chart') return;
    const flag = t.closest('[data-chart-flag]');
    if (flag) {
      const attr = 'data-chart-' + flag.getAttribute('data-chart-flag');
      chartSet(obj, attr, obj.hasAttribute(attr) ? null : '');
      syncInspector();
      return;
    }
    if (t.closest('[data-chart-colour-reset]')) { chartSet(obj, 'data-chart-colour', null); syncInspector(); }
  });

  document.addEventListener('input', function (e) {
    const t = e.target;
    if (!t.closest) return;
    const obj = selectedObject();
    if (!obj || obj.getAttribute('data-object-type') !== 'chart') return;
    if (t.closest('[data-chart-names]')) chartSet(obj, 'data-chart-names', t.value);
    else if (t.closest('[data-chart-colour]')) chartSet(obj, 'data-chart-colour', t.value);
  });


  /* === Styling part of a paragraph rather than all of it ===
   *
   * Font, size, weight and colour used to land on the whole text object,
   * because that is the element the panel had a handle on. Selecting three
   * words and making them red did nothing to those three words.
   *
   * The obstacle is that clicking anything in the panel moves focus out of the
   * text and the selection goes with it. So the last real selection inside a
   * text object is remembered, and the panel works against that. */
  let lastTextRange = null;
  document.addEventListener('selectionchange', function () {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    /* Resolve the boundary as an element rather than reaching for
     * parentElement, which points at the wrong thing whenever the boundary IS
     * an element — selecting a whole block is exactly that, and this quietly
     * refused to remember it, so the bar then acted on the block instead of the
     * words. Third place this idiom was wrong; there are no more. */
    const startEl = elementAtRangeStart(r);
    const host = startEl && startEl.closest &&
      startEl.closest('.slide-object-text[contenteditable="true"]');
    /* Only selections inside editable text are of interest. A change caused by
     * focusing a panel field is neither remembered nor allowed to forget. */
    if (!host) return;
    lastTextRange = r.collapsed ? null : r.cloneRange();
  });

  function liveTextRange(obj) { return liveTextRangeIn(textEl(obj)); }

  function liveTextRangeIn(el) {
    if (!lastTextRange || !el) return null;
    const node = lastTextRange.commonAncestorContainer;
    const holder = node.nodeType === 1 ? node : node.parentElement;
    return holder && el.contains(holder) ? lastTextRange : null;
  }

  /* A span whose only child is another span says nothing the inner one does
   * not. They pile up over a session of pressing A+, and the outer ones are
   * dead weight in a file someone else has to read. */
  function collapseWrappers(inner) {
    let outer = inner && inner.parentElement;
    while (outer && outer.tagName === 'SPAN' && outer.childNodes.length === 1 &&
           outer.attributes.length <= 1 &&
           (outer.attributes.length === 0 || outer.hasAttribute('style'))) {
      const up = outer.parentElement;
      outer.parentNode.replaceChild(inner, outer);
      outer = up && up.tagName === 'SPAN' ? up : null;
    }
  }

  /* Wrap what is selected in a span carrying the change. surroundContents
   * refuses a range that cuts across element boundaries — "half of this bold
   * word and half of the next" — so the fallback lifts the contents out and
   * puts them back inside the span, which handles every range. */
  function wrapRange(range, css) {
    /* If a styling span already covers exactly this run, change it instead of
     * nesting another inside it. Ten presses of A+ would otherwise leave ten
     * spans deep, and each press would measure the outermost rather than the
     * innermost. */
    let holder = range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    /* A range that selects exactly one child element is a range about that
     * element. Reading only the common ancestor missed it: the selection put
     * back after a wrap has its boundaries in the parent, so the next press saw
     * the line rather than the wrapper and made another one inside it — four
     * deep after four presses. */
    if (holder && range.startContainer === holder && range.endContainer === holder &&
        range.endOffset - range.startOffset === 1) {
      const only = holder.childNodes[range.startOffset];
      if (only && only.nodeType === 1) holder = only;
    }
    /* And descend into a wrapper that already covers exactly this run. Without
     * this, a line that had been styled once was wrapped AROUND its own
     * wrapper on the next pass — and the inner one wins, so the line looked
     * like it was refusing to change. */
    const runText = range.toString();
    for (let guard = 0; guard < 8 && holder; guard += 1) {
      const kids = Array.prototype.filter.call(holder.childNodes, function (n) {
        return n.nodeType !== 3 || n.nodeValue.trim() !== '';
      });
      const only = kids.length === 1 ? kids[0] : null;
      if (only && only.nodeType === 1 && only.tagName === 'SPAN' &&
          only.textContent === runText && runText !== '') {
        holder = only;
        continue;
      }
      break;
    }
    /* A wrapper this code made is reusable whether or not it has picked up a
       style yet — requiring one meant a freshly made span was wrapped again on
       the next press, and the sizes piled up four deep. */
    const onlyStyle = holder && holder.attributes.length === 0 ||
      (holder && holder.attributes.length === 1 && holder.hasAttribute('style'));
    const reusable = holder && holder.tagName === 'SPAN' && onlyStyle &&
      holder.textContent === range.toString() && range.toString() !== '';
    if (reusable) {
      Object.keys(css).forEach(function (k) { holder.style[k] = css[k]; });
      collapseWrappers(holder);
      const keep = document.createRange();
      keep.selectNodeContents(holder);
      const s0 = window.getSelection();
      s0.removeAllRanges();
      s0.addRange(keep);
      lastTextRange = keep.cloneRange();
      return holder;
    }
    const span = document.createElement('span');
    Object.keys(css).forEach(function (k) { span.style[k] = css[k]; });
    try {
      range.surroundContents(span);
    } catch (e) {
      span.appendChild(range.extractContents());
      range.insertNode(span);
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    const back = document.createRange();
    back.selectNodeContents(span);
    sel.addRange(back);
    lastTextRange = back.cloneRange();
    return span;
  }

  /* Two places can change type, and they mean different things.
   *
   * The bar that floats over a selection is about the words you highlighted —
   * it is right there, and it is the precise instrument. The panel on the
   * right is about the block: it follows what is selected on the slide and
   * describes the whole of it. Keeping the two apart is what makes either
   * predictable; a panel that sometimes hit three words and sometimes the
   * paragraph would be neither.
   *
   * Undo restores the element's markup either way, so a wrap and a whole-block
   * change step back alike. */

  /* A selection that runs across several lines cannot be dressed by one
   * wrapper. Wrapping it put a <span> around the <li> elements it crossed,
   * which is not allowed there: the browser re-parented what it could, the
   * style landed on the first line only, and the whitespace at either end of
   * the list was pushed out into empty bullets of its own.
   *
   * So each line is dressed separately, and no span ever contains a list item.
   * The wraps run last-to-first, because wrapping one line moves nodes and
   * would invalidate the boundary points of the lines before it. */
  const BLOCKISH = 'li, p, div, h1, h2, h3, h4, h5, h6';
  const FONT_MIN = 6, FONT_MAX = 400;

  function leafBlocks(host, range) {
    return Array.prototype.slice.call(host.querySelectorAll(BLOCKISH))
      .filter(function (b) { return !b.querySelector(BLOCKISH); })
      .filter(function (b) {
        try { return range.intersectsNode(b); } catch (e) { return false; }
      });
  }

  function clipToRange(block, range) {
    const r = document.createRange();
    r.selectNodeContents(block);
    try {
      if (range.comparePoint(r.startContainer, r.startOffset) < 0) {
        r.setStart(range.startContainer, range.startOffset);
      }
      if (range.comparePoint(r.endContainer, r.endOffset) > 0) {
        r.setEnd(range.endContainer, range.endOffset);
      }
    } catch (e) { /* boundary in another tree — take the whole block */ }
    return r;
  }

  /* Where the selection starts, as an element. After a wrap the range's start
   * container is the parent and the offset points at the span that was just
   * made, so reading parentElement gave the line's size rather than the run's
   * — and pressing A+ twice produced the same result twice. */
  function elementAtRangeStart(range) {
    let n = range.startContainer;
    if (n && n.nodeType === 1) {
      n = n.childNodes[range.startOffset] || n.lastChild || n;
    }
    return n && n.nodeType === 1 ? n : (n ? n.parentElement : null);
  }

  /* Sizes step through a ladder rather than by a pixel. A pixel is invisible,
   * which is indistinguishable from broken, and it is not how anyone thinks
   * about type. */
  const SIZE_LADDER = [6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28,
                       32, 36, 40, 44, 48, 56, 64, 72, 80, 96, 120, 144, 180,
                       240, 300, 400];

  function nextSize(px, dir) {
    const at = Math.round(px);
    let i = 0;
    while (i < SIZE_LADDER.length - 1 && SIZE_LADDER[i] < at) i += 1;
    if (dir > 0) {
      if (SIZE_LADDER[i] > at) return SIZE_LADDER[i];
      return SIZE_LADDER[Math.min(SIZE_LADDER.length - 1, i + 1)];
    }
    if (SIZE_LADDER[i] < at) return SIZE_LADDER[i];
    return SIZE_LADDER[Math.max(0, i - 1)];
  }

  /* Each line steps from its own size, so a selection of mixed sizes keeps its
   * relative shape instead of being flattened to whatever the first line was. */
  function stepSizeAcross(host, range, dir) {
    const blocks = leafBlocks(host, range);
    const parts = blocks.length < 2 ? [range] : blocks.map(function (b) { return clipToRange(b, range); });
    const made = [];
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].collapsed) continue;
      const span = wrapRange(parts[i], {});
      const now = parseFloat(getComputedStyle(span).fontSize) || 16;
      span.style.fontSize = nextSize(now, dir) + 'px';
      made.unshift(span);
    }
    if (made.length) {
      const back = document.createRange();
      /* One wrapper: select its contents so the next press recognises it. */
      if (made.length === 1) back.selectNodeContents(made[0]);
      else {
        back.setStartBefore(made[0]);
        back.setEndAfter(made[made.length - 1]);
      }
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(back);
      lastTextRange = back.cloneRange();
    }
    return made;
  }

  function styleAcross(range, css) {
    const host = (range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement);
    const text = host && host.closest && host.closest('.slide-object-text');
    const blocks = text ? leafBlocks(text, range) : [];
    if (blocks.length < 2) return [wrapRange(range, css)];
    const parts = blocks.map(function (b) { return clipToRange(b, range); });
    const made = [];
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!parts[i].collapsed) made.unshift(wrapRange(parts[i], css));
    }
    /* Put the selection back over everything that was just changed, so a
     * second change — size after face — still has the same words to work on. */
    if (made.length) {
      const back = document.createRange();
      /* One wrapper: select its contents so the next press recognises it. */
      if (made.length === 1) back.selectNodeContents(made[0]);
      else {
        back.setStartBefore(made[0]);
        back.setEndAfter(made[made.length - 1]);
      }
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(back);
      lastTextRange = back.cloneRange();
    }
    return made;
  }

  /* Whitespace between a list and the edge of its text object is invisible
   * until a list command turns it into an empty bullet. */
  function stripBlockWhitespace(el) {
    if (!el) return;
    const structured = Array.prototype.some.call(el.childNodes, function (n) {
      return n.nodeType === 1 && /^(UL|OL|P|DIV|LI)$/.test(n.tagName);
    });
    if (!structured) return;
    Array.prototype.slice.call(el.childNodes).forEach(function (n) {
      if (n.nodeType === 3 && !n.nodeValue.trim()) n.remove();
    });
  }

  function dropEmptyItems(el) {
    if (!el) return;
    el.querySelectorAll('li').forEach(function (li) {
      if (!li.childNodes.length) li.remove();
    });
  }

  function styleText(obj, css, scope) {
    styleTextEl(textEl(obj), css, scope);
  }

  /* Which element is being styled matters more than which object is selected.
   * A table's cells are all .slide-object-text, so resolving from the object
   * picked the first cell — type in the third and the font changed in the
   * first. The bar works against the element the caret is actually in. */
  function styleTextEl(el, css, scope) {
    if (!el) return;
    const range = scope === 'block' ? null : liveTextRangeIn(el);
    if (range) {
      const before = el.innerHTML;
      styleAcross(range, css);
      const after = el.innerHTML;
      history.push({
        undo: function () { el.innerHTML = before; lastTextRange = null; syncInspector(); },
        redo: function () { el.innerHTML = after; lastTextRange = null; syncInspector(); }
      });
      updateUndoRedoChrome();
      return;
    }
    const before = {};
    const after = {};
    Object.keys(css).forEach(function (k) { before[k] = el.style[k]; after[k] = css[k]; });
    pushAttr(function (v) {
      Object.keys(v).forEach(function (k) { el.style[k] = v[k]; });
    }, before, after);
  }


  /* === Copy, cut, paste, duplicate ===
   *
   * None of this existed. You could not copy a box, a picture or a slide —
   * the only way to get a second one was to build it again.
   *
   * The clipboard here is the runtime's own rather than the system's: an
   * object is a piece of this document's markup, and asking the OS to carry
   * that faithfully between two file:// pages is a losing game. Images pasted
   * from outside are handled separately, on the paste event, where the system
   * clipboard genuinely does have something to give. */
  let objClipboard = null;   // { kind: 'objects'|'slide', html: [...] }

  function typingSomewhere(e) {
    const t = e.target;
    if (!t || !t.closest) return false;
    if (t.closest('input, textarea, select')) return true;
    return !!t.closest('[contenteditable="true"]');
  }

  function copySelection(cut) {
    const els = selectedObjects();
    if (els.length) {
      objClipboard = { kind: 'objects', html: els.map(function (el) { return el.outerHTML; }) };
      if (cut) {
        const homes = els.map(function (el) { return { el: el, parent: el.parentNode, next: el.nextElementSibling }; });
        homes.forEach(function (h) { h.el.remove(); });
        editor.clearSelection();
        history.push({
          undo: function () { homes.forEach(function (h) { h.parent.insertBefore(h.el, h.next); }); },
          redo: function () { homes.forEach(function (h) { h.el.remove(); }); }
        });
        updateUndoRedoChrome();
      }
      return true;
    }
    /* Nothing selected means the slide itself, which is the rule Bento uses
     * and the one that makes ⌘C useful without a selection. */
    const slide = currentSlide();
    if (!slide) return false;
    objClipboard = { kind: 'slide', html: [slide.outerHTML] };
    return true;
  }

  function pasteClipboard() {
    if (!objClipboard) return false;
    if (objClipboard.kind === 'slide') {
      const holder = document.createElement('div');
      holder.innerHTML = objClipboard.html[0];
      const copy = holder.firstElementChild;
      if (!copy) return false;
      copy.id = '';
      const here = currentSlide();
      if (here && here.parentNode) here.parentNode.insertBefore(copy, here.nextSibling);
      else return false;
      deck.refreshSlides();
      ensureResizeHandles(copy);
      ensureObjectControls(copy);
      repaintCharts(copy);
      history.push({
        undo: function () { copy.remove(); deck.refreshSlides(); sidebar.refresh(); },
        redo: function () { here.parentNode.insertBefore(copy, here.nextSibling); deck.refreshSlides(); sidebar.refresh(); }
      });
      updateUndoRedoChrome();
      sidebar.refresh();
      deck.goTo(deck.slides.indexOf(copy));
      return true;
    }

    const slide = currentSlide();
    const layer = slide && slide.querySelector('.slide-edit-layer');
    if (!layer) return false;
    const made = [];
    objClipboard.html.forEach(function (html) {
      const holder = document.createElement('div');
      holder.innerHTML = html;
      const copy = holder.firstElementChild;
      if (!copy) return;
      copy.classList.remove('is-selected');
      /* A pasted object must not answer to the id it was copied from, or the
       * two would morph into each other on the same slide. */
      copy.setAttribute('data-oid', mintOid(copy.getAttribute('data-object-type') || 'obj'));
      nudge(copy);
      layer.appendChild(copy);
      made.push(copy);
    });
    if (!made.length) return false;
    ensureResizeHandles(layer);
    ensureObjectControls(layer);
    repaintCharts(layer);
    editor.clearSelection();
    made.forEach(function (el) { editor._addSel(el); });
    history.push({
      undo: function () { made.forEach(function (el) { el.remove(); }); },
      redo: function () { made.forEach(function (el) { layer.appendChild(el); }); ensureResizeHandles(layer); }
    });
    updateUndoRedoChrome();
    return true;
  }

  /* Land the copy a little off the original so it is visibly a second thing
   * and not a redraw of the first. */
  function nudge(el) {
    const x = parseFloat(el.style.left) || 0;
    const y = parseFloat(el.style.top) || 0;
    el.style.left = Math.min(94, x + 2.5) + '%';
    el.style.top = Math.min(94, y + 2.5) + '%';
  }

  /* Oids are unique within a slide, so a copied slide keeps its own — and
   * that is on purpose: a duplicated slide morphing into its twin is exactly
   * the trick duplicating a slide is for. */

  function duplicateSelection() {
    if (!selectedObjects().length) return false;
    copySelection(false);
    return pasteClipboard();
  }

  document.addEventListener('keydown', function (e) {
    if (!editor.active || presenting) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = (e.key || '').toLowerCase();
    if (k !== 'c' && k !== 'x' && k !== 'v' && k !== 'd') return;
    /* Inside a text box or a field these belong to the text, not the deck. */
    if (typingSomewhere(e)) return;
    if (k === 'c') { if (copySelection(false)) e.preventDefault(); }
    else if (k === 'x') { if (copySelection(true)) e.preventDefault(); }
    else if (k === 'v') { if (pasteClipboard()) e.preventDefault(); }
    else if (k === 'd') { e.preventDefault(); duplicateSelection(); }
  });

  /* An image on the system clipboard is the one thing worth taking from
   * outside: screenshots are how most pictures reach a deck. */
  document.addEventListener('paste', function (e) {
    if (!editor.active || presenting) return;
    if (typingSomewhere(e)) return;
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        const file = items[i].getAsFile();
        if (!file) continue;
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = function (ev) {
          insertObject('graphic',
            '<div class="slide-object-graphic" style="width:100%;height:100%;">' +
            '<img src="' + ev.target.result + '" alt="" style="max-height:none;width:100%;height:100%;' +
            'object-fit:contain;pointer-events:none;display:block;">' +
            '</div>');
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  });


  /* The bar over a selection: colour, face and size for the words you
   * highlighted. Bold, italic and underline already worked on a selection;
   * these three did not exist here, so the only way to reach them was the
   * panel, which is about the block. */
  (function () {
    const bar = document.getElementById('rteToolbar');
    if (!bar) return;

    /* The element the caret is in, which in a table is one cell of many. */
    function target() {
      const live = editor._activeTextEl && editor._activeTextEl();
      if (live) return live;
      return textEl(selectedObject());
    }

    const fontSel = bar.querySelector('[data-rte-font]');
    if (fontSel) {
      paintFontList(fontSel);
      fontSel.addEventListener('change', function () {
        styleTextEl(target(), { fontFamily: fontSel.value }, 'selection');
      });
    }

    /* Size lives here: two steps and a number, all against the selection. */
    const sizeField = bar.querySelector('[data-rte-size]');

    function sizeHost() {
      const live = editor._activeTextEl && editor._activeTextEl();
      return live || textEl(selectedObject());
    }

    function commitSize(dir, absolute) {
      const host = sizeHost();
      if (!host) return;
      const range = liveTextRangeIn(host);
      const before = host.innerHTML;
      if (range) {
        if (absolute) styleAcross(range, { fontSize: absolute + 'px' });
        else stepSizeAcross(host, range, dir);
      } else {
        const now = parseFloat(getComputedStyle(host).fontSize) || 16;
        host.style.fontSize = (absolute || nextSize(now, dir)) + 'px';
      }
      const after = host.innerHTML === before ? null : host.innerHTML;
      const beforeStyle = before;
      if (after !== null) {
        history.push({
          undo: function () { host.innerHTML = beforeStyle; lastTextRange = null; paintSize(); },
          redo: function () { host.innerHTML = after; lastTextRange = null; paintSize(); }
        });
        updateUndoRedoChrome();
      } else if (host.style.fontSize) {
        /* Whole-block change: the markup did not move, the style did. */
        updateUndoRedoChrome();
      }
      paintSize();
    }

    function paintSize() {
      if (!sizeField || document.activeElement === sizeField) return;
      const host = sizeHost();
      if (!host) return;
      const range = liveTextRangeIn(host);
      const from = range ? (elementAtRangeStart(range) || host) : host;
      const px = parseFloat(getComputedStyle(from).fontSize);
      sizeField.value = isNaN(px) ? '' : Math.round(px);
    }
    bar._paintSize = paintSize;

    bar.querySelectorAll('button[data-size-step]').forEach(function (btn) {
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', function () {
        commitSize(parseInt(btn.getAttribute('data-size-step'), 10) > 0 ? 1 : -1);
      });
    });
    if (sizeField) {
      sizeField.addEventListener('change', function () {
        const v = parseFloat(sizeField.value);
        if (isNaN(v)) { paintSize(); return; }
        commitSize(0, Math.min(FONT_MAX, Math.max(FONT_MIN, v)));
      });
    }

    const colour = bar.querySelector('[data-rte-colour]');
    if (colour) {
      colour.addEventListener('input', function () {
        styleTextEl(target(), { color: colour.value }, 'selection');
      });
    }
    const reset = bar.querySelector('[data-rte-colour-reset]');
    if (reset) {
      reset.addEventListener('mousedown', function (e) { e.preventDefault(); });
      reset.addEventListener('click', function () {
        const el = target();
        if (!el) return;
        const range = liveTextRangeIn(el);
        if (!range) { setStyle(el, 'color', ''); return; }
        /* Putting the design's colour back over a few words means dropping
         * the override, not painting another colour on top.
         *
         * The usual case is undoing a colour you just applied, and there the
         * selection is exactly the span that carries it — so clear it there
         * and the markup goes back to what it was, rather than gaining a
         * second wrapper cancelling the first. */
        const before = el.innerHTML;
        const holder = range.commonAncestorContainer.nodeType === 1
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
        const exact = holder && holder !== el && el.contains(holder) &&
          holder.style && holder.style.color &&
          holder.textContent === range.toString() ? holder : null;
        if (exact) {
          exact.style.color = '';
          if (!exact.getAttribute('style')) {
            const parent = exact.parentNode;
            while (exact.firstChild) parent.insertBefore(exact.firstChild, exact);
            exact.remove();
          }
          const afterExact = el.innerHTML;
          history.push({
            undo: function () { el.innerHTML = before; lastTextRange = null; },
            redo: function () { el.innerHTML = afterExact; lastTextRange = null; }
          });
          updateUndoRedoChrome();
          return;
        }
        /* Otherwise dropping our own override is not always enough — reset
         * inside a stretch that was already coloured leaves the words
         * inheriting it — so anything still tinting them from above is
         * answered by naming the paragraph's own colour. */
        const span = wrapRange(range, {});
        span.querySelectorAll('*').forEach(function (inner) {
          if (inner.style) inner.style.color = '';
        });
        span.style.color = '';
        const own = getComputedStyle(el).color;
        if (getComputedStyle(span).color !== own) span.style.color = own;
        if (!span.getAttribute('style')) span.removeAttribute('style');
        const after = el.innerHTML;
        history.push({
          undo: function () { el.innerHTML = before; lastTextRange = null; },
          redo: function () { el.innerHTML = after; lastTextRange = null; }
        });
        updateUndoRedoChrome();
      });
    }
  })();


  /* === Lists ===
   *
   * A text object could not become a list at all. The bullets in the decks
   * this runtime edits are whatever <ul> their author wrote; anything typed
   * here stayed a run of lines.
   *
   * Two ways in, along the same line as the rest: the bar over a selection
   * turns those lines into a list, and the panel turns the whole block into
   * one. */

  /* A new list should look like the lists this deck already has rather than
   * like a browser default — 40px of page indent is a document convention and
   * wrong on a slide. So measure one the deck already draws, if it has any. */
  let listMetrics = null;
  function listLook() {
    if (listMetrics) return listMetrics;
    const found = document.querySelector('.slides-offset ul, .slides-offset ol');
    if (found) {
      const cs = getComputedStyle(found);
      listMetrics = 'margin:' + cs.marginTop + ' 0 ' + cs.marginBottom + ' 0;padding-left:' + cs.paddingLeft + ';';
    } else {
      listMetrics = 'margin:0;padding-left:1.25em;';
    }
    return listMetrics;
  }

  function escapeText(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* What the block reads as, line by line, whether it is currently a list, a
   * run of <br>-separated text, or a stack of paragraphs. */
  function blockLines(el) {
    const list = el.querySelector(':scope > ul, :scope > ol');
    if (list) {
      return Array.prototype.map.call(list.children, function (li) { return li.innerHTML; });
    }
    const out = [];
    let buf = '';
    Array.prototype.forEach.call(el.childNodes, function (n) {
      if (n.nodeType === 1 && n.tagName === 'BR') { out.push(buf); buf = ''; return; }
      if (n.nodeType === 1 && /^(P|DIV|LI|H[1-6])$/.test(n.tagName)) {
        if (buf.trim()) out.push(buf);
        buf = '';
        out.push(n.innerHTML);
        return;
      }
      buf += n.nodeType === 3 ? escapeText(n.nodeValue) : (n.outerHTML || '');
    });
    if (buf.trim() || !out.length) out.push(buf);
    return out;
  }

  function currentBlockList(el) {
    const list = el && el.querySelector(':scope > ul, :scope > ol');
    return list ? list.tagName.toLowerCase() : 'none';
  }

  function setBlockList(obj, kind) {
    const el = textEl(obj);
    if (!el) return;
    if (currentBlockList(el) === kind) return;
    const before = el.innerHTML;
    stripBlockWhitespace(el);
    const lines = blockLines(el).map(function (l) { return l.trim() ? l : '<br>'; });
    const after = kind === 'none'
      ? lines.map(function (l) { return l === '<br>' ? '' : l; }).join('<br>')
      : '<' + kind + ' style="' + listLook() + '">' +
        lines.map(function (l) { return '<li>' + l + '</li>'; }).join('') +
        '</' + kind + '>';
    pushAttr(function (v) { el.innerHTML = v; lastTextRange = null; }, before, after);
    syncInspector();
  }

  /* Chrome's indent leaves the nested list as a sibling of the item it belongs
   * to, directly inside the outer list. It renders, but a <ul> is not allowed
   * there and the file is what gets sent to people, so put it where it goes. */
  function tidyNestedLists(host) {
    host.querySelectorAll('ul > ul, ul > ol, ol > ul, ol > ol').forEach(function (inner) {
      let prev = inner.previousElementSibling;
      while (prev && prev.tagName !== 'LI') prev = prev.previousElementSibling;
      if (prev) prev.appendChild(inner);
      else {
        const li = document.createElement('li');
        li.style.listStyle = 'none';
        inner.parentNode.insertBefore(li, inner);
        li.appendChild(inner);
      }
    });
  }

  document.addEventListener('click', function (e) {
    const b = e.target.closest && e.target.closest('[data-block-list]');
    if (!b) return;
    const obj = selectedObject();
    if (obj) setBlockList(obj, b.getAttribute('data-block-list'));
  });

  /* Tab moves an item in, Shift+Tab out — the one gesture everybody tries on a
   * list. Without it Tab left the text entirely.
   *
   * The item has to come from the selection, not from the event's target: with
   * a caret inside editable text the target is the editable element itself, so
   * looking upward from it never reaches the <li> the caret is actually in. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    let node = sel.getRangeAt(0).startContainer;
    if (node && node.nodeType !== 1) node = node.parentElement;
    const li = node && node.closest && node.closest('li');
    if (!li) return;
    const host = li.closest('.slide-object-text');
    if (!host || host.getAttribute('contenteditable') !== 'true') return;
    e.preventDefault();
    const before = host.innerHTML;
    document.execCommand(e.shiftKey ? 'outdent' : 'indent', false, null);
    tidyNestedLists(host);
    const after = host.innerHTML;
    if (before !== after) {
      history.push({
        undo: function () { host.innerHTML = before; },
        redo: function () { host.innerHTML = after; }
      });
      updateUndoRedoChrome();
    }
  }, true);


  /* === Links ===
   *
   * There was a link, but only one kind of it: a whole object could carry a
   * destination, and only while presenting. You could not link three words,
   * and a deck sent to someone as something to read had dead links in it —
   * which is most of what a link is for.
   *
   * A link on text is an ordinary <a>, so it exports, prints and survives
   * being opened by anything. A destination inside the deck is a slide number
   * kept on the element, because a deck's slide ids are not stable across an
   * edit and a number is what someone means when they say "page 4". */

  function normaliseLink(raw) {
    const to = String(raw || '').trim();
    if (!to) return null;
    if (/^\d+$/.test(to)) return { slide: parseInt(to, 10) };
    if (/^(https?:|mailto:|tel:)/i.test(to)) return { href: to };
    /* A bare host is what people type. Treat it as the web, not as a file
     * beside the deck, which would silently 404. */
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(to)) return { href: 'https://' + to };
    return { href: to };
  }

  function linkTargetFor(el) {
    const slide = el.getAttribute('data-link-slide');
    if (slide) return { slide: parseInt(slide, 10) };
    const href = el.getAttribute('href') || el.getAttribute('data-link');
    if (!href) return null;
    return normaliseLink(href);
  }

  function follow(target) {
    if (!target) return;
    if (target.slide) deck.goTo(Math.max(0, target.slide - 1));
    else if (target.href) window.open(target.href, '_blank', 'noopener');
  }

  (function () {
    const bar = document.getElementById('rteToolbar');
    if (!bar) return;

    const add = bar.querySelector('[data-text-link]');
    if (add) {
      add.addEventListener('mousedown', function (e) { e.preventDefault(); });
      add.addEventListener('click', function () {
        const el = editor._activeTextEl ? editor._activeTextEl() : null;
        const host = el || textEl(selectedObject());
        if (!host) return;
        const range = liveTextRangeIn(host);
        if (!range) { window.alert('Select the words you want to link first.'); return; }
        const existing = range.commonAncestorContainer.nodeType === 1
          ? range.commonAncestorContainer.closest('a')
          : range.commonAncestorContainer.parentElement.closest('a');
        const now = existing ? (existing.getAttribute('data-link-slide') || existing.getAttribute('href') || '') : '';
        const to = normaliseLink(window.prompt('Where should these words go? A page number, or an address.', now));
        if (!to) return;
        const before = host.innerHTML;
        if (existing && host.contains(existing)) {
          applyLink(existing, to);
        } else {
          /* One anchor per line. An <a> cannot hold an <li> any more than a
           * <span> can, and a selection dragged down a list crosses several. */
          const spans = styleAcross(range, {});
          const made = [];
          spans.forEach(function (span) {
            if (!span || !span.parentNode) return;
            const a = document.createElement('a');
            applyLink(a, to);
            while (span.firstChild) a.appendChild(span.firstChild);
            span.parentNode.replaceChild(a, span);
            made.push(a);
          });
          if (made.length) {
            const back = document.createRange();
            /* One wrapper: select its contents so the next press recognises it. */
            if (made.length === 1) back.selectNodeContents(made[0]);
            else {
              back.setStartBefore(made[0]);
              back.setEndAfter(made[made.length - 1]);
            }
            const sel = window.getSelection();
            sel.removeAllRanges(); sel.addRange(back);
            lastTextRange = back.cloneRange();
          }
        }
        const after = host.innerHTML;
        history.push({
          undo: function () { host.innerHTML = before; lastTextRange = null; },
          redo: function () { host.innerHTML = after; lastTextRange = null; }
        });
        updateUndoRedoChrome();
      });
    }

    const off = bar.querySelector('[data-text-unlink]');
    if (off) {
      off.addEventListener('mousedown', function (e) { e.preventDefault(); });
      off.addEventListener('click', function () {
        const el = editor._activeTextEl ? editor._activeTextEl() : null;
        const host = el || textEl(selectedObject());
        if (!host) return;
        const range = liveTextRangeIn(host);
        if (!range) return;
        /* Every link the selection touches, not only the one its common
         * ancestor happens to sit in — a selection that starts just before a
         * link and ends inside it is still a selection of that link. */
        const hits = Array.prototype.slice.call(host.querySelectorAll('a')).filter(function (a) {
          try { return range.intersectsNode(a); } catch (e) { return false; }
        });
        const node = range.commonAncestorContainer.nodeType === 1
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
        const own = node && node.closest ? node.closest('a') : null;
        if (own && host.contains(own) && hits.indexOf(own) === -1) hits.push(own);
        if (!hits.length) return;
        const before = host.innerHTML;
        hits.forEach(function (a) {
          const parent = a.parentNode;
          while (a.firstChild) parent.insertBefore(a.firstChild, a);
          a.remove();
        });
        lastTextRange = null;
        const after = host.innerHTML;
        history.push({
          undo: function () { host.innerHTML = before; lastTextRange = null; },
          redo: function () { host.innerHTML = after; lastTextRange = null; }
        });
        updateUndoRedoChrome();
      });
    }
  })();

  function applyLink(a, to) {
    if (to.slide) {
      a.setAttribute('data-link-slide', String(to.slide));
      a.setAttribute('href', '#');
      a.removeAttribute('target');
      a.removeAttribute('rel');
    } else {
      a.setAttribute('href', to.href);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
      a.removeAttribute('data-link-slide');
    }
  }

  /* Following a link is a reading action, so it works whenever the deck is not
   * being edited — presenting or simply being read. While editing, a click is
   * how you put a caret in the words, so it is held back unless asked for with
   * the modifier every editor uses for exactly this. */
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    const a = e.target.closest('.slides-offset a[href]');
    const obj = a ? null : e.target.closest('.slides-offset [data-link]');
    const hit = a || obj;
    if (!hit) return;
    const editing = document.body.classList.contains('deck-edit-mode');
    if (editing && !(e.metaKey || e.ctrlKey)) {
      if (a) e.preventDefault();
      return;
    }
    e.preventDefault();
    follow(linkTargetFor(hit));
  }, true);

  function syncInspector() {
    const obj = selectedObject();
    const type = obj ? obj.getAttribute('data-object-type') : null;

    const show = function (id, on) {
      const el = document.getElementById(id);
      if (el) el.hidden = !on;
    };
    show('sectSelection', !!obj);
    show('sectGeometry', !!obj);
    show('sectMotion', !!obj);
    /* Aligning objects to one another means nothing with one object, so the
     * row is not offered until there are two. */
    const alignRow = document.getElementById('alignRow');
    if (alignRow) alignRow.hidden = selectedObjects().length < 2;
    show('sectText', type === 'text');
    show('sectTable', type === 'table');
    show('sectChart', type === 'chart');
    show('sectShape', type === 'shape');
    show('sectImage', type === 'graphic');
    show('sectMedia', type === 'media');

    const name = document.getElementById('sectSelectionName');
    if (name) name.textContent = type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Selection';

    document.querySelectorAll('[data-role-set]').forEach(function (b) {
      b.classList.toggle('active', !!obj && b.getAttribute('data-role-set') === obj.getAttribute('data-role'));
    });
    const fx = document.querySelector('[data-fx-enter-set]');
    if (fx) fx.value = (obj && obj.getAttribute('data-fx-enter')) || '';
    const cu = document.querySelector('[data-fx-countup-toggle]');
    if (cu) cu.classList.toggle('active', !!obj && obj.hasAttribute('data-fx-countup'));

    if (obj) {
      ['width', 'height'].forEach(function (k) {
        const f = document.querySelector('[data-geom="' + k + '"]');
        if (f && document.activeElement !== f) {
          const v = pct(obj, k);
          f.value = v === null ? '' : Math.round(v * 10) / 10;
        }
      });
      const rot = document.querySelector('[data-geom="rotate"]');
      if (rot && document.activeElement !== rot) {
        const m = (obj.style.transform || '').match(/rotate\(\s*(-?[\d.]+)deg/);
        rot.value = m ? parseFloat(m[1]) : 0;
      }
      const sh = document.querySelector('[data-obj-shadow]');
      if (sh && document.activeElement !== sh) {
        const cur = obj.style.filter || '';
        sh.value = Object.keys(SHADOWS).filter(function (k) { return SHADOWS[k] === cur; })[0] || '';
      }
      const lk = document.querySelector('[data-obj-link]');
      if (lk && document.activeElement !== lk) lk.value = obj.getAttribute('data-link') || '';
      const op = document.querySelector('[data-geom="opacity"]');
      const opv = Math.round((parseFloat(obj.style.opacity || '1')) * 100);
      if (op && document.activeElement !== op) op.value = opv;
      const opo = document.querySelector('[data-geom-out="opacity"]');
      if (opo) opo.textContent = opv;

      if (type === 'chart') {
        const di = document.querySelector('[data-chart-data-input]');
        if (di && document.activeElement !== di) di.value = obj.getAttribute('data-chart-data') || '';
        document.querySelectorAll('[data-chart-type]').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-chart-type') === obj.getAttribute('data-chart'));
        });
        document.querySelectorAll('[data-chart-flag]').forEach(function (b) {
          b.classList.toggle('active', obj.hasAttribute('data-chart-' + b.getAttribute('data-chart-flag')));
        });
        const nm = document.querySelector('[data-chart-names]');
        if (nm && document.activeElement !== nm) nm.value = obj.getAttribute('data-chart-names') || '';
        const cc = document.querySelector('[data-chart-colour]');
        if (cc && document.activeElement !== cc) {
          cc.value = obj.getAttribute('data-chart-colour') ||
            hexOf(obj.querySelector('.slide-object-chart svg rect, .slide-object-chart svg path, .slide-object-chart svg polyline'), 'fill') ||
            '#000000';
        }
      }
      if (type === 'shape') {
        const svg = shapeSvg(obj);
        const fillAttr = svg ? (svg.getAttribute('fill') || '') : '';
        const f = document.querySelector('[data-shape-fill]');
        if (f && document.activeElement !== f) {
          f.value = fillAttr === 'none' ? '#000000' : (hexOf(svg, 'fill') || '#000000');
        }
        const st = document.querySelector('[data-shape-stroke]');
        if (st && document.activeElement !== st) st.value = hexOf(svg, 'stroke') || '#000000';
        const sw = document.querySelector('[data-shape-stroke-width]');
        if (sw && svg && document.activeElement !== sw) sw.value = svg.getAttribute('stroke-width') || 0;
        const da = document.querySelector('[data-shape-dash]');
        if (da && svg && document.activeElement !== da) da.value = svg.getAttribute('stroke-dasharray') || '';
        /* Only a rectangle has corners to round, so the row goes away rather
         * than sitting there doing nothing on an ellipse or a line. */
        const rect = svg && svg.querySelector('rect');
        const rr = document.getElementById('shapeRadiusRow');
        if (rr) rr.hidden = !rect;
        const ri = document.querySelector('[data-shape-radius]');
        if (ri && rect && document.activeElement !== ri) ri.value = parseFloat(rect.getAttribute('rx') || 0);
      }
      if (type === 'graphic') {
        const img = imageEl(obj);
        const fit = document.querySelector('[data-img-fit]');
        if (img && fit && document.activeElement !== fit) fit.value = img.style.objectFit || 'contain';
        const rad = document.querySelector('[data-img-radius]');
        if (img && rad && document.activeElement !== rad) rad.value = parseFloat(img.style.borderRadius) || 0;
      }
      if (type === 'media') {
        const m = mediaEl(obj);
        const isVideo = !!m && m.tagName === 'VIDEO';
        /* Audio has no picture, so fit, corners and a cover still are rows
         * that could only mislead. */
        ['mediaFitRow', 'mediaRadiusRow', 'mediaPosterRow'].forEach(function (id) {
          const row = document.getElementById(id);
          if (row) row.hidden = !isVideo;
        });
        const fit = document.querySelector('[data-media-fit]');
        if (isVideo && fit && document.activeElement !== fit) fit.value = m.style.objectFit || 'contain';
        const rad = document.querySelector('[data-media-radius]');
        if (m && rad && document.activeElement !== rad) rad.value = parseFloat(m.style.borderRadius) || 0;
        document.querySelectorAll('[data-media-flag]').forEach(function (b) {
          b.classList.toggle('active', !!m && m.hasAttribute(b.getAttribute('data-media-flag')));
        });
      }
      if (type === 'table') {
        const tbl = tableEl(obj);
        const hd = document.querySelector('[data-table-header]');
        if (hd && document.activeElement !== hd) hd.checked = !!tbl && tbl.hasAttribute('data-head');
        const cols = document.querySelector('[data-table-cols]');
        const rws = document.querySelector('[data-table-rows]');
        if (tbl && cols) cols.textContent = tbl.rows[0] ? tbl.rows[0].cells.length : 0;
        if (tbl && rws) rws.textContent = tbl.rows.length;
        const num = function (sel, attr, dflt) {
          const el = document.querySelector(sel);
          if (el && tbl && document.activeElement !== el) {
            const v = tbl.getAttribute(attr);
            el.value = v === null ? dflt : v;
          }
        };
        num('[data-table-pad-x]', 'data-pad-x', 0.6);
        num('[data-table-pad-y]', 'data-pad-y', 0.35);
        num('[data-table-radius]', 'data-radius', 0);
        const fs = document.querySelector('[data-table-font]');
        if (fs && tbl && document.activeElement !== fs) {
          fs.value = tbl.getAttribute('data-font') || Math.round(parseFloat(getComputedStyle(tbl).fontSize) || 0);
        }
        const ps = document.querySelector('[data-table-preset]');
        if (ps && tbl && document.activeElement !== ps) ps.value = tbl.getAttribute('data-preset') || 'boxed';
        const gl = document.querySelector('[data-table-lines]');
        if (gl && tbl && document.activeElement !== gl) {
          const preset = TABLE_PRESETS[tbl.getAttribute('data-preset')];
          gl.value = tbl.getAttribute('data-grid') || (preset ? preset.grid : 'all');
        }
        /* A colour input cannot hold "unset", so it shows what is drawn and
         * Clear is the way back to the design's own. */
        const cell = tbl && tbl.querySelector('th, td');
        const headCell = tbl && tbl.rows[0] && tbl.rows[0].cells[0];
        const col = function (sel, attr, from, prop) {
          const el = document.querySelector(sel);
          if (!el || !tbl || document.activeElement === el) return;
          el.value = tbl.getAttribute(attr) || hexOf(from, prop) || '#000000';
        };
        col('[data-table-head-fill]', 'data-head-fill', headCell, 'backgroundColor');
        col('[data-table-head-text]', 'data-head-text', headCell, 'color');
        col('[data-table-text]', 'data-text', cell, 'color');
        col('[data-table-line]', 'data-line', cell, 'borderBottomColor');
      }
      if (type === 'text') {
        const c = document.querySelector('[data-text-colour]');
        const t = obj.querySelector('.slide-object-text');
        const fs = document.querySelector('[data-text-size]');
        if (fs && t && document.activeElement !== fs) {
          fs.value = Math.round(parseFloat(getComputedStyle(t).fontSize) || 0);
        }
        const ff = document.querySelector('[data-text-font]');
        if (ff && t && document.activeElement !== ff) {
          /* Match against what the list actually offers. Checking only the
           * deck's own fonts meant a system or packed face read back as
           * "Inherit" the moment you clicked away from it. */
          const inline = (t.style.fontFamily || '').trim();
          const known = Array.prototype.some.call(ff.options, function (o) { return o.value === inline; });
          ff.value = known ? inline : '';
        }
        const wt = document.querySelector('[data-text-weight]');
        if (wt && t && document.activeElement !== wt) wt.value = t.style.fontWeight || '';
        document.querySelectorAll('[data-text-align]').forEach(function (b) {
          const cur = t ? (t.style.textAlign || getComputedStyle(t).textAlign) : '';
          b.classList.toggle('active', b.getAttribute('data-text-align') === cur);
        });
        document.querySelectorAll('[data-text-valign]').forEach(function (b) {
          const cur = t && t.style.display === 'flex' ? t.style.justifyContent : '';
          b.classList.toggle('active', b.getAttribute('data-text-valign') === cur);
        });
        const kind = currentBlockList(t);
        document.querySelectorAll('[data-block-list]').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-block-list') === kind);
        });
        const lh = document.querySelector('[data-text-leading]');
        if (lh && t && document.activeElement !== lh) {
          const inline = parseFloat(t.style.lineHeight);
          if (!isNaN(inline)) lh.value = inline;
          else {
            const cs = getComputedStyle(t);
            const ratio = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
            lh.value = isNaN(ratio) ? '' : Math.round(ratio * 100) / 100;
          }
        }
        if (c && t) {
          const rgb = getComputedStyle(t).color.match(/\d+/g);
          if (rgb) c.value = '#' + rgb.slice(0, 3).map(function (n) {
            return ('0' + parseInt(n, 10).toString(16)).slice(-2);
          }).join('');
        }
      }
      // Ours morphs by shared oid, so the panel can simply say when it will.
      const hint = document.getElementById('morphHint');
      if (hint) {
        const oid = obj.getAttribute('data-oid');
        const slides = deck.slides || [];
        const twins = [];
        slides.forEach(function (sl, i) {
          if (i !== deck.current && sl.querySelector('[data-oid="' + CSS.escape(oid) + '"]')) twins.push(i + 1);
        });
        hint.hidden = !twins.length;
        hint.textContent = twins.length
          ? 'Shares an id with slide ' + twins.join(', ') + ' — it will morph between them.'
          : '';
      }
    }

    const slide = currentSlide();
    const pos = document.getElementById('slidePos');
    if (pos && slide) {
      const all = deck.slides || [];
      const shown = all.filter(function (s) { return !s.hasAttribute('data-skip'); });
      const at = shown.indexOf(slide);
      pos.textContent = at === -1
        ? 'Slide ' + (deck.current + 1) + ' in the file · skipped when presenting'
        : 'Slide ' + (at + 1) + ' of ' + shown.length;
    }
    const tr = document.querySelector('[data-slide-transition]');
    if (tr && slide && document.activeElement !== tr) tr.value = slide.getAttribute('data-transition') || '';
    const sk = document.querySelector('[data-slide-skip]');
    if (sk && slide && document.activeElement !== sk) sk.checked = slide.hasAttribute('data-skip');

    const layer = slide ? slide.querySelector(':scope > .slide-bg-container') : null;
    const hasImage = !!(layer && layer.style.backgroundImage && layer.style.backgroundImage !== 'none');
    const imgRow = document.getElementById('bgImageRow');
    if (imgRow) imgRow.hidden = !hasImage;
    if (hasImage) {
      const op = document.querySelector('[data-bg-opacity]');
      const v = Math.round((parseFloat(layer.style.opacity || '1')) * 100);
      if (op && document.activeElement !== op) op.value = v;
      const out = document.querySelector('[data-bg-opacity-out]');
      if (out) out.textContent = v;
      const sz = document.querySelector('[data-bg-size]');
      if (sz && document.activeElement !== sz) sz.value = layer.style.backgroundSize || 'cover';
    }
    const bg = document.querySelector('[data-slide-bg]');
    if (bg && slide && document.activeElement !== bg) {
      const rgb = getComputedStyle(slide).backgroundColor.match(/\d+/g);
      if (rgb) bg.value = '#' + rgb.slice(0, 3).map(function (n) {
        return ('0' + parseInt(n, 10).toString(16)).slice(-2);
      }).join('');
    }
  }

  // Geometry fields write straight to the inline percentages the runtime uses.
  document.addEventListener('input', function (e) {
    const f = e.target.closest && e.target.closest('[data-geom]');
    if (!f) return;
    const obj = selectedObject();
    if (!obj) return;
    const k = f.getAttribute('data-geom');
    if (k === 'opacity') {
      obj.style.opacity = String((parseFloat(f.value) || 0) / 100);
      const out = document.querySelector('[data-geom-out="opacity"]');
      if (out) out.textContent = f.value;
    } else {
      const v = parseFloat(f.value);
      if (!isNaN(v)) obj.style[k] = v + '%';
    }
  });

  document.addEventListener('click', function (e) {
    const b = e.target.closest && e.target.closest('[data-arrange]');
    if (!b) return;
    const obj = selectedObject();
    if (!obj) return;
    const what = b.getAttribute('data-arrange');
    const parent = obj.parentNode;
    const before = { next: obj.nextElementSibling, left: obj.style.left, top: obj.style.top };
    const apply = function (state) {
      if (state.hasOwnProperty('next')) {
        if (state.next) parent.insertBefore(obj, state.next); else parent.appendChild(obj);
      }
      if (state.left !== undefined) obj.style.left = state.left;
      if (state.top !== undefined) obj.style.top = state.top;
    };
    let after;
    if (what === 'front') { parent.appendChild(obj); after = { next: null }; }
    else if (what === 'back') { parent.insertBefore(obj, parent.firstElementChild); after = { next: parent.children[1] }; }
    else if (what === 'hcenter') { const w = pct(obj, 'width') || 0; obj.style.left = ((100 - w) / 2) + '%'; after = { left: obj.style.left }; }
    else { const h = pct(obj, 'height') || 0; obj.style.top = ((100 - h) / 2) + '%'; after = { top: obj.style.top }; }
    history.push({ undo: function () { apply(before); syncInspector(); }, redo: function () { apply(after); syncInspector(); } });
    updateUndoRedoChrome();
    syncInspector();
  });

  document.addEventListener('input', function (e) {
    const c = e.target.closest && e.target.closest('[data-text-colour]');
    if (!c) return;
    const obj = selectedObject();
    if (obj) styleText(obj, { color: c.value }, 'block');
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('[data-text-colour-reset]')) return;
    const obj = selectedObject();
    const t = textEl(obj);
    if (!t) return;
    setStyle(t, 'color', '');
    syncInspector();
  });

  // One place flips the flag, so the eye on the thumbnail and the checkbox in
  // the panel can never disagree about a slide.
  function setSkip(slide, on) {
    if (!slide) return;
    const before = slide.hasAttribute('data-skip');
    if (before === !!on) return;
    const apply = function (v) {
      if (v) slide.setAttribute('data-skip', ''); else slide.removeAttribute('data-skip');
      refreshFields();
      sidebar.refresh();
      syncInspector();
    };
    apply(!!on);
    history.push({ undo: function () { apply(before); }, redo: function () { apply(!!on); } });
    updateUndoRedoChrome();
  }

  document.addEventListener('change', function (e) {
    const c = e.target.closest && e.target.closest('[data-slide-skip]');
    if (!c) return;
    setSkip(currentSlide(), c.checked);
  });

  document.addEventListener('input', function (e) {
    const c = e.target.closest && e.target.closest('[data-slide-bg]');
    if (!c) return;
    const slide = currentSlide();
    if (slide) slide.style.backgroundColor = c.value;
  });

  /* --- background image ---------------------------------------------------
   * The image goes on its own layer, not on the slide: opacity applied to the
   * slide would fade the words with it. Templates that ship a
   * .slide-bg-container already work this way; one is created when a deck has
   * none, behind everything and never selectable. */
  function bgLayer(slide, make) {
    let el = slide.querySelector(':scope > .slide-bg-container');
    if (!el && make) {
      el = document.createElement('div');
      el.className = 'slide-bg-container';
      el.style.cssText = 'position:absolute;inset:0;background-size:cover;background-position:center;' +
        'background-repeat:no-repeat;pointer-events:none;z-index:0;';
      slide.insertBefore(el, slide.firstChild);
    }
    return el;
  }

  (function () {
    const inp = document.getElementById('deckBgInput');
    if (!inp) return;
    document.querySelectorAll('[data-slide-bg-image]').forEach(function (b) {
      b.addEventListener('click', function () { if (editor.active) inp.click(); });
    });
    inp.addEventListener('change', function (e) {
      const file = e.target.files[0];
      inp.value = '';
      if (!file) return;
      const slide = currentSlide();
      if (!slide) return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        const layer = bgLayer(slide, true);
        const before = layer.style.backgroundImage;
        const after = 'url("' + ev.target.result + '")';
        const apply = function (v) { layer.style.backgroundImage = v; syncInspector(); };
        apply(after);
        history.push({ undo: function () { apply(before); }, redo: function () { apply(after); } });
        updateUndoRedoChrome();
      };
      reader.readAsDataURL(file);
    });
  })();

  document.addEventListener('input', function (e) {
    const f = e.target.closest && e.target.closest('[data-bg-opacity]');
    if (!f) return;
    const slide = currentSlide();
    const layer = slide && bgLayer(slide, false);
    if (layer) layer.style.opacity = String((parseFloat(f.value) || 0) / 100);
    const out = document.querySelector('[data-bg-opacity-out]');
    if (out) out.textContent = f.value;
  });
  document.addEventListener('change', function (e) {
    const sel = e.target.closest && e.target.closest('[data-bg-size]');
    if (!sel) return;
    const slide = currentSlide();
    const layer = slide && bgLayer(slide, false);
    if (layer) layer.style.backgroundSize = sel.value;
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('[data-bg-image-clear]')) return;
    const slide = currentSlide();
    const layer = slide && bgLayer(slide, false);
    if (!layer) return;
    const before = layer.style.backgroundImage;
    const apply = function (v) { layer.style.backgroundImage = v; syncInspector(); };
    apply('');
    history.push({ undo: function () { apply(before); }, redo: function () { apply(''); } });
    updateUndoRedoChrome();
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('[data-slide-bg-reset]')) return;
    const slide = currentSlide();
    if (slide) { slide.style.background = ''; syncInspector(); }
  });

  document.addEventListener('input', function (e) {
    const i = e.target.closest && e.target.closest('[data-chart-data-input]');
    if (!i) return;
    const obj = selectedObject();
    if (!obj || obj.getAttribute('data-object-type') !== 'chart') return;
    obj.setAttribute('data-chart-data', i.value);
    paintChart(obj);
  });

  document.addEventListener('click', function (e) {
    const b = e.target.closest && e.target.closest('[data-obj]');
    if (!b) return;
    const obj = selectedObject();
    if (!obj) return;
    const parent = obj.parentNode;
    if (b.getAttribute('data-obj') === 'delete') {
      const next = obj.nextElementSibling;
      obj.remove();
      history.push({ undo: function () { parent.insertBefore(obj, next); }, redo: function () { obj.remove(); } });
    } else {
      const copy = obj.cloneNode(true);
      copy.setAttribute('data-oid', mintOid(obj.getAttribute('data-object-type') || 'obj'));
      copy.style.left = ((pct(obj, 'left') || 0) + 3) + '%';
      copy.style.top = ((pct(obj, 'top') || 0) + 3) + '%';
      parent.appendChild(copy);
      ensureResizeHandles(parent);
      ensureObjectControls(parent);
      repaintCharts(parent);
      history.push({ undo: function () { copy.remove(); }, redo: function () { parent.appendChild(copy); } });
    }
    updateUndoRedoChrome();
    syncInspector();
  });

  /* === Canvas zoom === */

  // The slide keeps its full size and the canvas scales it, the way Bento and
  // Slides both do — so "smaller" is a view setting rather than a change to
  // the deck. Fit is the default and recomputes on resize.
  const ZOOM_STEPS = [0.25, 0.35, 0.5, 0.65, 0.8, 0.9, 1, 1.25, 1.5, 2];
  let zoomFit = true;
  let zoomLevel = 1;

  function applyZoom() {
    document.body.style.setProperty('--canvas-zoom', String(zoomLevel));
    const label = document.getElementById('deckZoomLevel');
    if (label) label.textContent = zoomFit ? 'Fit' : Math.round(zoomLevel * 100) + '%';
  }

  function fitZoom() {
    const canvas = document.querySelector('.slides-offset');
    const slide = (deck.slides || [])[0];
    if (!canvas || !slide) return;
    const avail = canvas.clientWidth - 96;
    const natural = parseFloat(getComputedStyle(document.body).getPropertyValue('--slide-natural-w')) || 1280;
    zoomLevel = Math.max(0.2, Math.min(1, avail / natural));
    applyZoom();
  }

  document.addEventListener('click', function (e) {
    const b = e.target.closest && e.target.closest('[data-zoom]');
    if (!b) return;
    const what = b.getAttribute('data-zoom');
    if (what === 'fit') { zoomFit = true; fitZoom(); return; }
    zoomFit = false;
    let i = ZOOM_STEPS.findIndex(function (z) { return z >= zoomLevel - 0.001; });
    if (i === -1) i = ZOOM_STEPS.length - 1;
    i = Math.max(0, Math.min(ZOOM_STEPS.length - 1, i + (what === '+' ? 1 : -1)));
    zoomLevel = ZOOM_STEPS[i];
    applyZoom();
  });

  window.addEventListener('resize', function () { if (zoomFit) fitZoom(); });

  /* === Slide actions === */

  (function () {
    const add = document.getElementById('btnNewSlide');
    const dup = document.getElementById('btnDuplicateSlide');
    // Slide operations belong to the sidebar, which owns the filmstrip — the
    // editor owns objects within a slide.
    if (add) add.addEventListener('click', function () { sidebar._addSlide(deck.current, false); });
    if (dup) dup.addEventListener('click', function () { sidebar._addSlide(deck.current, true); });
  })();

  /* === Deck title === */

  // The bar needs the document's name on it — that is what fills the left in
  // every editor of this shape, and it was the missing piece that left a gap.
  (function () {
    const el = document.getElementById('deckTitle');
    if (!el) return;
    el.setAttribute('contenteditable', 'false');
    const initial = (document.title || '').trim();
    if (initial) el.textContent = initial;
    el.addEventListener('input', function () {
      document.title = el.textContent.trim() || 'Untitled deck';
      refreshFields();
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    });
  })();

  /* === Insert toolbar wiring === */

  (function () {
    document.querySelectorAll('[data-shape]').forEach(function (btn) {
      if (isDeckChromeNode(btn)) {
        btn.addEventListener('click', function () {
          if (editor.active) insertShape(btn.getAttribute('data-shape'));
        });
      }
    });
    document.querySelectorAll('[data-insert]').forEach(function (btn) {
      const kind = btn.getAttribute('data-insert');
      if (kind === 'image') return; // handled with the file input below
      btn.addEventListener('click', function () {
        if (!editor.active) return;
        if (kind === 'text') insertText();
        else if (kind === 'table') insertTable();
        else if (kind === 'chart') insertChart();
      });
    });
    // Fields and roles sit on the text toolbar: mousedown, not click, so the
    // text selection survives the button press.
    document.querySelectorAll('[data-present]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const what = btn.getAttribute('data-present');
        if (what === 'start') setPresenting(true);
        else if (what === 'exit') setPresenting(false);
        else if (what === 'speaker') openSpeaker();
        else if (what === 'prev') deck.goTo(deck.current - 1);
        else if (what === 'next') deck.goTo(deck.current + 1);
      });
    });
    document.querySelectorAll('[data-field-insert]').forEach(function (btn) {
      btn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        if (editor.active) insertField(btn.getAttribute('data-field-insert'));
      });
    });
    document.querySelectorAll('[data-role-set]').forEach(function (btn) {
      btn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        if (editor.active) applyRole(btn.getAttribute('data-role-set'));
      });
    });

    // Motion controls act on the selected object and are undoable, like roles.
    function setObjAttr(obj, name, value) {
      const before = obj.getAttribute(name);
      if (before === value) return;
      const apply = function (v) {
        if (v) obj.setAttribute(name, v); else obj.removeAttribute(name);
        syncMotionControls();
      };
      apply(value);
      history.push({ undo: function () { apply(before); }, redo: function () { apply(value); } });
      updateUndoRedoChrome();
    }

    const fxSelect = document.querySelector('[data-fx-enter-set]');
    if (fxSelect) {
      fxSelect.addEventListener('change', function () {
        const obj = document.querySelector('.slide-object.is-selected');
        if (obj && editor.active) setObjAttr(obj, 'data-fx-enter', fxSelect.value || null);
      });
    }
    const countBtn = document.querySelector('[data-fx-countup-toggle]');
    if (countBtn) {
      countBtn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        const obj = document.querySelector('.slide-object.is-selected');
        if (obj && editor.active) {
          setObjAttr(obj, 'data-fx-countup', obj.hasAttribute('data-fx-countup') ? null : 'true');
        }
      });
    }
  })();

  function syncMotionControls() {
    syncInspector();
    const obj = document.querySelector('.slide-object.is-selected');
    const sel = document.querySelector('[data-fx-enter-set]');
    const btn = document.querySelector('[data-fx-countup-toggle]');
    if (sel) sel.value = (obj && obj.getAttribute('data-fx-enter')) || '';
    if (btn) btn.classList.toggle('active', !!(obj && obj.hasAttribute('data-fx-countup')));
  }
  document.addEventListener('click', function (e) {
    // Not for clicks inside the inspector: a checkbox updates on click and
    // only reports on change, so re-reading the document in between would put
    // the control back where it was and swallow the click.
    if (e.target.closest && e.target.closest('.deck-inspector')) return;
    syncMotionControls();
    if (editor.active) editor._updateRteToolbar();
  }, true);

  // Insert menu open/close.
  (function () {
    const menus = Array.prototype.slice.call(document.querySelectorAll('.deck-menu'));
    if (!menus.length) return;
    function closeAll(except) {
      menus.forEach(function (m) {
        if (m !== except) {
          m.classList.remove('open');
          const b = m.querySelector('[data-menu-toggle]');
          if (b) b.setAttribute('aria-expanded', 'false');
        }
      });
    }
    menus.forEach(function (menu) {
      const btn = menu.querySelector('[data-menu-toggle]');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const open = !menu.classList.contains('open');
        closeAll(menu);
        menu.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', String(open));
      });
      menu.addEventListener('click', function (e) {
        if (e.target.closest('[data-insert], [data-shape]')) closeAll(null);
      });
    });
    document.addEventListener('click', function () { closeAll(null); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(null); });
  })();

  /* === Image features === */

  // 1. Add image object to current slide
  (function () {
    var inp = document.getElementById('deckImgInput');
    if (!inp) return;
    var triggers = Array.prototype.slice.call(document.querySelectorAll('[data-insert="image"]'));
    triggers.forEach(function (btn) {
      if (btn) btn.addEventListener('click', function () { inp.click(); });
    });
    inp.addEventListener('change', function (e) {
      var file = e.target.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        insertObject('graphic',
          '<div class="slide-object-graphic" style="width:100%;height:100%;">' +
          '<img src="' + ev.target.result + '" alt="" style="max-height:none;width:100%;height:100%;object-fit:contain;pointer-events:none;display:block;">' +
          '</div>');
      };
      reader.readAsDataURL(file);
      inp.value = '';
    });
  })();

  // 2. Double-click graphic object → replace its image
  document.addEventListener('dblclick', function (e) {
    if (!editor.active) return;
    var obj = e.target.closest && e.target.closest('[data-slide-object][data-object-type="graphic"]');
    if (!obj) return;
    var imgEl = obj.querySelector('img'); if (!imgEl) return;
    var tmp = document.createElement('input');
    tmp.type = 'file'; tmp.accept = 'image/*'; tmp.style.display = 'none';
    document.body.appendChild(tmp);
    tmp.click();
    tmp.addEventListener('change', function (ev) {
      var file = ev.target.files[0]; if (!file) { tmp.remove(); return; }
      var reader = new FileReader();
      reader.onload = function (re) {
        var prev = imgEl.getAttribute('src');
        var next = re.target.result;
        imgEl.src = next;
        history.push({
          undo: function () { imgEl.src = prev; },
          redo: function () { imgEl.src = next; }
        });
        updateUndoRedoChrome();
        tmp.remove();
      };
      reader.readAsDataURL(file);
    });
  });

  // 3. Slide background replace — reads data-bg-target="selector" on .slide-bg-replace-btn
  document.addEventListener('click', function (e) {
    if (!editor.active) return;
    var btn = e.target.closest && e.target.closest('.slide-bg-replace-btn[data-bg-target]');
    if (!btn) return;
    var inp2 = document.getElementById('deckBgInput'); if (!inp2) return;
    inp2._bgTarget = btn.getAttribute('data-bg-target');
    inp2.click();
  });
  (function () {
    var inp2 = document.getElementById('deckBgInput'); if (!inp2) return;
    inp2.addEventListener('change', function (e) {
      var file = e.target.files[0]; if (!file) return;
      var sel = inp2._bgTarget; if (!sel) return;
      var el = document.querySelector(sel); if (!el) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        var prev = el.style.backgroundImage;
        var next = "url('" + ev.target.result + "')";
        el.style.backgroundImage = next;
        history.push({
          undo: function () { el.style.backgroundImage = prev; },
          redo: function () { el.style.backgroundImage = next; }
        });
        updateUndoRedoChrome();
      };
      reader.readAsDataURL(file);
      inp2.value = '';
    });
  })();

  deck._updateChrome();

  // Startup self-check: warn if any critical runtime element is absent
  (['editToggle','deckEditChrome','btnSaveCopy','btnExportPdf','rteToolbar','filmstripList'])
    .filter((id) => !document.getElementById(id))
    .forEach((id) => console.error('[deck-runtime] Missing required element: #' + id));
})();
