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
    push(record) {
      this._u.push(record);
      if (this._u.length > MAX_HISTORY) this._u.shift();
      this._r.length = 0;
      this._onChange();
    }
    undo() {
      const r = this._u.pop();
      if (r && r.undo) r.undo();
      if (r) this._r.push(r);
      this._onChange();
    }
    redo() {
      const r = this._r.pop();
      if (r && r.redo) r.redo();
      if (r) this._u.push(r);
      this._onChange();
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
    goTo(i) {
      this.refreshSlides();
      i = Math.max(0, Math.min(this.slides.length - 1, i));
      this.slides[i].scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
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
      if (document.body.classList.contains('deck-edit-mode')) {
        if (e.target.closest('.slide-object-text[contenteditable="true"]')) return;
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
      if (document.body.classList.contains('deck-edit-mode')) return;
      if (Math.abs(e.deltaY) < 8) return;
      e.preventDefault();
      if (e.deltaY > 0) this.goTo(this.current + 1);
      else this.goTo(this.current - 1);
    }
  }

  function ensureResizeHandles(root) {
    const el = root || document;
    el.querySelectorAll('[data-slide-object]').forEach((obj) => {
      if (obj.querySelector('.slide-object-resize')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slide-object-resize';
      btn.setAttribute('aria-label', 'Resize');
      obj.appendChild(btn);
    });
  }

  // Tables and charts carry their own control strips. Those are editor
  // furniture, stripped on save and export (see sanitizeEditableState), so they
  // are rebuilt here whenever a document is loaded or restored — the same
  // contract ensureResizeHandles has.
  function ensureObjectControls(root) {
    const el = root || document;
    el.querySelectorAll('[data-object-type="table"]').forEach((obj) => {
      if (obj.querySelector('.slide-object-tablectl')) return;
      obj.insertAdjacentHTML('beforeend',
        '<div class="slide-object-tablectl" contenteditable="false">' +
        '<button type="button" data-table="row+" title="Add row">+ Row</button>' +
        '<button type="button" data-table="row-" title="Remove last row">− Row</button>' +
        '<button type="button" data-table="col+" title="Add column">+ Col</button>' +
        '<button type="button" data-table="col-" title="Remove last column">− Col</button>' +
        '</div>');
    });
    el.querySelectorAll('[data-object-type="chart"]').forEach((obj) => {
      if (obj.querySelector('.slide-object-chartctl')) return;
      const data = obj.getAttribute('data-chart-data') || '';
      obj.insertAdjacentHTML('beforeend',
        '<div class="slide-object-chartctl" contenteditable="false">' +
        '<button type="button" data-chart-type="bar">Bar</button>' +
        '<button type="button" data-chart-type="line">Line</button>' +
        '<button type="button" data-chart-type="pie">Pie</button>' +
        '<span class="slide-object-chartdata" contenteditable="true" ' +
        'title="Label value, label value…">' + data.replace(/[<&]/g, '') + '</span>' +
        '</div>');
    });
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
      this._onSelectionChange = this._onSelectionChange.bind(this);
      this._onFocusIn = this._onFocusIn.bind(this);
    }
    setActive(on) {
      this.active = !!on;
      document.body.classList.toggle('deck-edit-mode', on);
      document.body.classList.toggle('slide-anim-paused', on);
      if (on) {
        ensureResizeHandles(document);
        ensureObjectControls(document);
        repaintCharts(document);
      refreshFields();
      } else {
        this.clearSelection();
        this.toolbar.classList.remove('visible');
        document.querySelectorAll('.slide-object-text[contenteditable="true"]').forEach((el) => {
          el.contentEditable = 'false';
        });
      }
    }
    toggle() { this.setActive(!this.active); }

    clearSelection() {
      this.selected.forEach((el) => el.classList.remove('is-selected'));
      this.selected.clear();
    }
    _addSel(el) {
      el.classList.add('is-selected');
      this.selected.add(el);
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

      if (obj && e.ctrlKey) {
        e.preventDefault();
        this._toggleSel(obj);
        return;
      }

      if (obj && !e.ctrlKey) {
        const onResize = e.target.closest('.slide-object-resize');
        if (onResize) {
          e.preventDefault();
          e.stopPropagation();
          if (!this.selected.has(obj)) this._selectOnly(obj);
          if (this.selected.size === 1) this._startResize(e, obj);
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

      const starts = moving.map((o) => ({
        el: o,
        l: this._positionPct(o, slide, 'left'),
        t: this._positionPct(o, slide, 'top'),
        w: o.offsetWidth,
        h: o.offsetHeight
      }));

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
      const r = obj.getBoundingClientRect();
      const wPct = this._parsePct(obj, 'width');
      const hPct = this._parsePct(obj, 'height');
      this._resizeState = {
        slide,
        el: obj,
        sr,
        startX: e.clientX,
        startY: e.clientY,
        startW: r.width,
        startH: r.height,
        beforeW: obj.style.width,
        beforeH: obj.style.height,
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
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      const minPx = Math.min(sr.width, sr.height) * RESIZE_MIN_FRAC;
      let nw = Math.max(minPx, st.startW + dx);
      let nh = Math.max(minPx, st.startH + dy);
      st.el.style.width = (nw / sr.width * 100) + '%';
      st.el.style.height = (nh / sr.height * 100) + '%';
    }

    _onResizeUp() {
      if (!this._resizeState) return;
      const st = this._resizeState;
      const el = st.el;
      const afterW = el.style.width;
      const afterH = el.style.height;
      const beforeW = st.beforeW;
      const beforeH = st.beforeH;
      const changed = afterW !== beforeW || afterH !== beforeH;
      if (changed) {
        this.history.push({
          undo: () => {
            el.style.width = beforeW;
            el.style.height = beforeH;
          },
          redo: () => {
            el.style.width = afterW;
            el.style.height = afterH;
          }
        });
      }
      this._resizeState = null;
      document.removeEventListener('pointermove', this._onResizeMove);
      document.removeEventListener('pointerup', this._onResizeUp);
      document.removeEventListener('pointercancel', this._onResizeUp);
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
        const nl = m.l + (dx / sr.width) * 100;
        const nt = m.t + (dy / sr.height) * 100;
        const maxL = 100 - (m.w / sr.width) * 100;
        const maxT = 100 - (m.h / sr.height) * 100;
        this._setPct(m.el, Math.max(0, Math.min(maxL, nl)), Math.max(0, Math.min(maxT, nt)));
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
      const boldBtn = this.toolbar.querySelector('button[data-cmd="bold"]');
      try {
        if (boldBtn) boldBtn.classList.toggle('is-active', document.queryCommandState('bold'));
      } catch (_) {}
      const italicBtn = this.toolbar.querySelector('button[data-cmd="italic"]');
      try {
        if (italicBtn) italicBtn.classList.toggle('is-active', document.queryCommandState('italic'));
      } catch (_) {}
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
      const inside = this._activeTextEl();
      if (!inside) {
        this.toolbar.classList.remove('visible');
        return;
      }
      const sel = document.getSelection();
      let rr = inside.getBoundingClientRect();
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
      this.toolbar.querySelectorAll('button[data-size-step]').forEach((btn) => {
        btn.addEventListener('mousedown', (ev) => ev.preventDefault());
        btn.addEventListener('click', () => {
          const step = parseInt(btn.getAttribute('data-size-step'), 10);
          const textEl = this._activeTextEl();
          if (!textEl) return;
          const beforeStyle = textEl.style.fontSize;
          const cur = parseFloat(getComputedStyle(textEl).fontSize) || 16;
          textEl.style.fontSize = Math.max(8, cur + step) + 'px';
          const afterStyle = textEl.style.fontSize;
          if (beforeStyle !== afterStyle) {
            this.history.push({
              undo: () => { textEl.style.fontSize = beforeStyle; },
              redo: () => { textEl.style.fontSize = afterStyle; }
            });
          }
          this._updateRteToolbar();
        });
      });
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
      document.execCommand(cmd, false, null);
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
      document.getElementById('pagesToggle').classList.toggle('active', on);
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
        num.textContent = 'Slide ' + (idx + 1);
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = 'Delete';
        del.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this._deleteSlide(idx);
        });
        actions.appendChild(num);
        actions.appendChild(del);

        item.appendChild(lineTop);
        item.appendChild(host);
        item.appendChild(lineBot);
        item.appendChild(actions);

        item.addEventListener('click', (ev) => {
          if (ev.target.closest('button')) return;
          this.deck.goTo(idx);
          this.refresh();
        });

        this._fillThumb(slide, host);

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
      cl.querySelectorAll('.slide-object-move, .slide-object-resize').forEach((n) => n.remove());
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
    root.querySelectorAll('.slide-object-text').forEach((el) => {
      if (el.getAttribute('contenteditable') === 'true') {
        el.setAttribute('contenteditable', 'false');
      }
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
    const filmstrip = docEl.querySelector('#filmstripList');
    if (filmstrip) filmstrip.innerHTML = '';
    ['#editToggle', '#pagesToggle', '#btnSave', '#deckEditChrome', '#rteToolbar'].forEach((selector) => {
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
    const data = {
      v: 2,
      deckHtml: serializeSlidesRoot(root)
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { console.warn(e); }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data) return;
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

  function exportHtml() {
    const clone = document.documentElement.cloneNode(true);
    sanitizeExportDocument(clone);
    const html = '<!DOCTYPE html>\n' + clone.outerHTML;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (document.title || 'deck') + '.html';
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
       '.slide-bg-replace-anchor','.slide-object-move','.slide-object-resize',
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
  const pagesToggle = document.getElementById('pagesToggle');
  const btnSave = document.getElementById('btnSave');

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

  const history = new HistoryStack(updateUndoRedoChrome);
  const deck = new SlideDeck();
  const editor = new SlideObjectEditor(deck, history);
  const sidebar = new SlideSidebar(deck, history);

  ensureResizeHandles(document);
  ensureObjectControls(document);
  repaintCharts(document);
      refreshFields();
  editor.bind();
  updateUndoRedoChrome();

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
    pagesToggle.classList.remove('active');
    sidebar.setOpen(false);
    editToggle.classList.remove('show');
    pagesToggle.classList.remove('show');
    if (deckEditChromeEl) deckEditChromeEl.classList.remove('show');
    if (btnSave) btnSave.classList.remove('show');
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

  /* Top-left cluster: hover reveals controls (Edit / Pages / in edit mode Undo·Redo·Done) */
  let hideT = null;
  function showToggles() {
    clearTimeout(hideT);
    editToggle.classList.add('show');
    pagesToggle.classList.add('show');
    if (document.body.classList.contains('deck-edit-mode')) {
      if (btnSave) btnSave.classList.add('show');
      if (deckEditChromeEl) deckEditChromeEl.classList.add('show');
    }
  }
  function scheduleHide() {
    hideT = setTimeout(() => {
      editToggle.classList.remove('show');
      pagesToggle.classList.remove('show');
      if (btnSave) btnSave.classList.remove('show');
      if (deckEditChromeEl) deckEditChromeEl.classList.remove('show');
    }, 400);
  }
  if (deckLeftHover) {
    deckLeftHover.addEventListener('mouseenter', showToggles);
    deckLeftHover.addEventListener('mouseleave', scheduleHide);
  }
  editToggle.addEventListener('mouseenter', () => clearTimeout(hideT));
  editToggle.addEventListener('mouseleave', scheduleHide);
  pagesToggle.addEventListener('mouseenter', () => clearTimeout(hideT));
  pagesToggle.addEventListener('mouseleave', scheduleHide);
  if (deckEditChromeEl) {
    deckEditChromeEl.addEventListener('mouseenter', () => clearTimeout(hideT));
    deckEditChromeEl.addEventListener('mouseleave', scheduleHide);
  }
  if (btnSave) {
    btnSave.addEventListener('mouseenter', () => clearTimeout(hideT));
    btnSave.addEventListener('mouseleave', scheduleHide);
  }

  editToggle.addEventListener('click', () => {
    if (!editor.active) enterEditMode();
  });

  pagesToggle.addEventListener('click', () => {
    sidebar.toggle();
    pagesToggle.classList.toggle('active', sidebar.open);
    if (sidebar.open) sidebar.refresh();
  });

  if (btnSave) btnSave.addEventListener('click', saveState);
  document.getElementById('btnExport').addEventListener('click', exportHtml);
  document.getElementById('btnExportPdf').addEventListener('click', exportPdf);

  document.addEventListener('keydown', (e) => {
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
    if ((e.key === 'e' || e.key === 'E') && !ce) {
      e.preventDefault();
      if (editor.active) exitEditMode();
      else enterEditMode();
    }
    if (editor.active && (e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      saveState();
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
      '<button type="button" class="slide-object-resize" aria-label="Resize"></button>' +
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

  // Row/column controls, undoable. The buttons live inside the object and are
  // revealed by CSS only while it is selected.
  document.addEventListener('click', function (e) {
    const btn = e.target.closest && e.target.closest('.slide-object-tablectl [data-table]');
    if (!btn || !editor.active) return;
    e.preventDefault();
    e.stopPropagation();
    const obj = btn.closest('[data-object-type="table"]');
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

    const after = table.innerHTML;
    history.push({
      undo: function () { table.innerHTML = before; },
      redo: function () { table.innerHTML = after; }
    });
    updateUndoRedoChrome();
  });

  /* === Charts === */

  // Rendered as inline SVG with no dependency. A deck is a single file that
  // gets emailed around, so inlining a charting library would put ~200 KB into
  // every copy — the same reason Bento wrote their own instead of shipping
  // ECharts. Bar, line and pie cover what a review deck actually needs.

  function parseSeries(text) {
    return String(text || '').split(',').map(function (pair) {
      const m = pair.trim().match(/^(.*?)[\s:]+(-?[\d.]+)$/);
      return m ? { label: m[1].trim(), value: parseFloat(m[2]) || 0 } : null;
    }).filter(Boolean);
  }

  function seriesText(series) {
    return series.map(function (d) { return d.label + ' ' + d.value; }).join(', ');
  }

  function renderChart(type, series) {
    if (!series.length) return '';
    const W = 100, H = 62, PAD = 2;
    const max = Math.max.apply(null, series.map(function (d) { return d.value; })).valueOf() || 1;
    let body = '';

    if (type === 'pie') {
      const total = series.reduce(function (s, d) { return s + d.value; }, 0) || 1;
      let a0 = -Math.PI / 2;
      const cx = 50, cy = 31, r = 28;
      series.forEach(function (d, i) {
        const a1 = a0 + (d.value / total) * Math.PI * 2;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        body += '<path d="M' + cx + ',' + cy + ' L' + x0.toFixed(2) + ',' + y0.toFixed(2) +
          ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ',' + y1.toFixed(2) + ' Z" ' +
          'fill="' + CHART_FILL + '" fill-opacity="' + (1 - i * 0.16).toFixed(2) + '" ' +
          'stroke="' + CHART_INK + '" stroke-width="0.4"/>';
        a0 = a1;
      });
      return body;
    }

    const step = (W - PAD * 2) / series.length;
    if (type === 'line') {
      const pts = series.map(function (d, i) {
        const x = PAD + step * (i + 0.5);
        const y = H - PAD - (d.value / max) * (H - PAD * 3);
        return x.toFixed(2) + ',' + y.toFixed(2);
      }).join(' ');
      body += '<polyline points="' + pts + '" fill="none" stroke="' + CHART_FILL +
        '" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>';
      series.forEach(function (d, i) {
        const x = PAD + step * (i + 0.5);
        const y = H - PAD - (d.value / max) * (H - PAD * 3);
        body += '<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="1.4" fill="' + CHART_FILL + '"/>';
      });
    } else {
      series.forEach(function (d, i) {
        const bw = step * 0.62;
        const x = PAD + step * i + (step - bw) / 2;
        const h = (d.value / max) * (H - PAD * 3);
        body += '<rect x="' + x.toFixed(2) + '" y="' + (H - PAD - h).toFixed(2) +
          '" width="' + bw.toFixed(2) + '" height="' + Math.max(h, 0.4).toFixed(2) +
          '" fill="' + CHART_FILL + '" fill-opacity="' + (1 - i * 0.1).toFixed(2) + '"/>';
      });
    }

    body += '<line x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) +
      '" stroke="' + CHART_INK + '" stroke-width="0.4" vector-effect="non-scaling-stroke"/>';
    series.forEach(function (d, i) {
      const x = PAD + step * (i + 0.5);
      body += '<text x="' + x.toFixed(2) + '" y="' + (H + 4) + '" text-anchor="middle" ' +
        'font-size="4" fill="' + CHART_INK + '" font-family="var(--font-body)">' +
        String(d.label).replace(/[<&]/g, '') + '</text>';
    });
    return body;
  }

  function paintChart(obj) {
    const svg = obj.querySelector('.slide-object-chart svg');
    if (!svg) return;
    const type = obj.getAttribute('data-chart') || 'bar';
    const series = parseSeries(obj.getAttribute('data-chart-data'));
    svg.innerHTML = renderChart(type, series);
  }

  function chartMarkup() {
    return '<div class="slide-object-chart" style="width:100%;height:100%;pointer-events:none;">' +
      '<svg viewBox="0 0 100 70" preserveAspectRatio="none" width="100%" height="100%" ' +
      'style="display:block;overflow:visible;"></svg></div>';
  }

  function insertChart() {
    const obj = insertObject('chart', chartMarkup());
    if (!obj) return null;
    obj.setAttribute('data-chart', 'bar');
    obj.setAttribute('data-chart-data', 'Q1 12, Q2 18, Q3 9, Q4 22');
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
    const obj = btn.closest('[data-object-type="chart"]');
    if (!obj) return;
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
    slides.forEach(function (slide, i) {
      slide.querySelectorAll('[data-field]').forEach(function (el) {
        el.textContent = resolveField(el.getAttribute('data-field'), i, slides.length);
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
          { transformOrigin: 'top left', transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')' },
          { transformOrigin: 'top left', transform: 'none' }
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
      const frames = FX_ENTER[obj.getAttribute('data-fx-enter')] || FX_ENTER.fade;
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

  (function () {
    let previous = deck.current;
    const already = deck.onSlideChange;
    deck.onSlideChange = function (i) {
      if (typeof already === 'function') already(i);
      const slide = (deck.slides || [])[i];
      // Motion belongs to viewing, not editing: it would fight a drag.
      if (!editor.active) {
        morphInto(i, previous);
        playEntrances(slide);
        playCountUps(slide);
      }
      previous = i;
    };
  })();

  /* === Media === */

  // Embedding is what keeps a deck one file, but a clip embeds as base64 at
  // roughly 4/3 its size — so warn at the point of choosing, the way Bento's
  // "embed short, link long" rule does, rather than after the file is huge.
  const MEDIA_INLINE_WARN = 8 * 1024 * 1024;

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
    const obj = document.querySelector('.slide-object.is-selected');
    const sel = document.querySelector('[data-fx-enter-set]');
    const btn = document.querySelector('[data-fx-countup-toggle]');
    if (sel) sel.value = (obj && obj.getAttribute('data-fx-enter')) || '';
    if (btn) btn.classList.toggle('active', !!(obj && obj.hasAttribute('data-fx-countup')));
  }
  document.addEventListener('click', syncMotionControls, true);

  /* === Image features === */

  // 1. Add image object to current slide
  (function () {
    var inp = document.getElementById('deckImgInput');
    if (!inp) return;
    var triggers = [document.getElementById('btnAddImage')]
      .concat(Array.prototype.slice.call(document.querySelectorAll('[data-insert="image"]')));
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
  (['editToggle','pagesToggle','deckEditChrome','btnExport','btnExportPdf','rteToolbar','filmstripList'])
    .filter((id) => !document.getElementById(id))
    .forEach((id) => console.error('[deck-runtime] Missing required element: #' + id));
})();
