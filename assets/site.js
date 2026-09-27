(() => {
  const root = document.documentElement;
  const nav = document.getElementById('nav');
  const menu = nav.querySelector('.menu');
  const links = document.getElementById('links');
  const navLinks = Array.from(links.querySelectorAll('a'));
  const langButtons = Array.from(nav.querySelectorAll('.lang button'));
  const scenes = Array.from(document.querySelectorAll('.scene'));
  const chapter = document.querySelector('.chapter');
  const chapterT = chapter.querySelector('.chapter-t');
  const drawing = document.querySelector('.backdrop .diagram');
  const rmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const shortQuery = window.matchMedia('(max-height: 760px)');
  const EASE = 'cubic-bezier(.16, 1, .3, 1)';
  const GROUP = { w1: 'g-nac', w2: 'g-sbx', w3: 'g-fw', w4: 'g-team' };
  // viewBox crops of the drawing for narrow screens:
  // [viewBox, smallest label size on screen in px, largest label size in drawing units so labels fit their boxes]
  const CROPS = {
    hero: ['100 76 820 404', 9, 19],
    w1: ['-8 122 470 294', 12, 20],
    w2: ['250 128 528 330', 12, 20],
    w3: ['590 180 330 206', 12, 20],
    w4: ['150 390 560 350', 12, 20],
  };
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  let reduced = rmQuery.matches;
  let pinned = root.classList.contains('pinned');
  let active = null;

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };
  const canAnimate = () => !reduced && typeof Element.prototype.animate === 'function';
  const lang = () => (root.getAttribute('data-lang') === 'zh' ? 'zh' : 'en');

  /* ---------- Narrow screens: the hero and each chapter carry their own crop of the drawing ---------- */
  const minis = [];
  if (drawing) {
    scenes.forEach((s) => {
      const crop = CROPS[s.dataset.scene];
      if (!crop) return;
      const box = document.createElement('div');
      box.className = s.dataset.scene === 'hero' ? 'mini hero-mini' : 'mini r';
      box.dataset.hl = s.dataset.scene;
      box.setAttribute('aria-hidden', 'true');
      const svg = drawing.cloneNode(true);
      svg.setAttribute('viewBox', crop[0]);
      box.appendChild(svg);
      const col = s.querySelector('.col');
      // chapters: the drawing sits between the subtitle and the points, so the scene starts at its heading
      const list = col.querySelector('ul');
      if (list) col.insertBefore(box, list);
      else col.insertBefore(box, col.firstChild);
      minis.push({ box, svg, width: parseFloat(crop[0].split(' ')[2]), px: crop[1], cap: crop[2] });
    });
  }
  function sizeMiniLabels() {
    minis.forEach((m) => {
      const w = m.svg.getBoundingClientRect().width;
      if (!w) return;
      const scale = w / m.width;
      m.svg.style.setProperty('--lbl', Math.min(m.cap, Math.max(13, m.px / scale)).toFixed(1) + 'px');
    });
  }

  const lines = Array.from(document.querySelectorAll('.scene .r'));
  lines.forEach((el) => { el._scene = el.closest('.scene'); });

  /* ---------- Entrances ---------- */
  function enter(scene, dir, baseDelay) {
    if (!canAnimate()) return;
    const from = dir === 'up' ? -12 : 12;
    let i = 0;
    scene.querySelectorAll('.r').forEach((el) => {
      if (el.offsetParent === null) return;
      el.getAnimations().forEach((a) => a.cancel());
      el.animate(
        [
          { opacity: 0, transform: 'translateY(' + from + 'px)', filter: 'blur(6px)' },
          { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' },
        ],
        { duration: 750, delay: baseDelay + Math.min(i, 5) * 80, easing: EASE, fill: 'backwards' }
      );
      i += 1;
    });
  }

  function reveal(scene, animate, baseDelay) {
    if (scene.classList.contains('is-in')) return;
    scene.classList.add('is-in');
    if (animate) enter(scene, 'down', baseDelay == null ? 60 : baseDelay);
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { reveal(entry.target, true); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
    scenes.forEach((s) => io.observe(s));
  } else {
    scenes.forEach((s) => s.classList.add('is-in'));
  }

  /* ---------- Chapter pill ---------- */
  function labelOf(scene) {
    if (!scene || scene.dataset.scene === 'hero') return null;
    return { part: scene.dataset.num ? (lang() === 'zh' ? '作品' : 'Work') : '', num: scene.dataset.num || '', text: scene.dataset[lang()] || '' };
  }
  function paintChapter() {
    const l = labelOf(active);
    chapter.classList.toggle('show', Boolean(l));
    if (!l) return;
    chapterT.textContent = '';
    if (l.part) {
      const w = document.createElement('span');
      w.className = 'part';
      w.textContent = l.part;
      chapterT.appendChild(w);
    }
    if (l.num) {
      const n = document.createElement('span');
      n.className = 'num';
      n.textContent = l.num;
      chapterT.appendChild(n);
    }
    chapterT.appendChild(document.createTextNode(l.text));
  }
  let swapTimer = 0;
  function swapChapter(prev, instant) {
    window.clearTimeout(swapTimer);
    if (instant || reduced || !labelOf(prev)) {
      chapter.classList.remove('swap');
      paintChapter();
      return;
    }
    chapter.classList.add('swap');
    swapTimer = window.setTimeout(() => { paintChapter(); chapter.classList.remove('swap'); }, 260);
  }

  /* ---------- The highlighted part of the drawing redraws itself once per chapter ---------- */
  function redraw(scene) {
    const g = GROUP[scene.dataset.scene];
    if (!g || !drawing || !canAnimate() || !root.classList.contains('settled')) return;
    drawing.querySelectorAll('.' + g + ' .e.draw').forEach((p, i) => {
      p.getAnimations().forEach((a) => a.cancel());
      p.animate(
        [
          { strokeDasharray: '1 1', strokeDashoffset: 1 },
          { strokeDasharray: '1 1', strokeDashoffset: 0 },
        ],
        { duration: 1000, delay: 250 + Math.min(i, 6) * 60, easing: EASE, fill: 'backwards' }
      );
    });
  }

  /* ---------- Current scene ---------- */
  const timers = new WeakMap();
  function later(scene, fn, ms) {
    window.clearTimeout(timers.get(scene));
    timers.set(scene, window.setTimeout(fn, ms));
  }

  function setScene(scene, instant) {
    if (scene === active) return;
    const prev = active;
    active = scene;
    const dir = prev && scenes.indexOf(scene) < scenes.indexOf(prev) ? 'up' : 'down';
    root.setAttribute('data-dir', dir);
    root.setAttribute('data-scene', scene.dataset.scene);
    const target = scene.dataset.nav || '';
    navLinks.forEach((a) => {
      if (a.dataset.go === target) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    if (pinned) {
      if (prev) {
        prev.classList.remove('is-active', 'is-live');
        if (!instant) {
          prev.classList.add('leaving');
          later(prev, () => prev.classList.remove('leaving'), 650);
        }
      }
      scene.classList.remove('leaving');
      scene.classList.add('is-active');
      if (instant) scene.classList.add('is-live');
      else later(scene, () => { if (scene === active) scene.classList.add('is-live'); }, 220);
      if (!instant) enter(scene, dir, 220);
    }
    if (!instant && prev) redraw(scene);
    swapChapter(prev, instant);
  }

  // a scene chosen by a click or a deep link is kept until the visitor scrolls
  let held = null;
  function currentScene() {
    if (held && Math.abs(window.scrollY - held.y) < 4) return held.scene;
    held = null;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (window.scrollY >= max - 2) return scenes[scenes.length - 1];
    const probe = window.innerHeight * (pinned ? 0.5 : 0.55);
    let cur = scenes[0];
    for (const s of scenes) {
      if (s.getBoundingClientRect().top <= probe) cur = s;
    }
    return cur;
  }

  function scrollToScene(scene) {
    window.scrollTo({ top: scene.getBoundingClientRect().top + window.scrollY, behavior: 'instant' });
    held = { scene, y: window.scrollY };
  }

  /* ---------- Flowing layout: text passing under the nav softens and fades ---------- */
  function clearFade(el) {
    if (el._x) { el.style.opacity = ''; el.style.filter = ''; el._x = false; }
  }
  function exitFade() {
    if (pinned || reduced) { lines.forEach(clearFade); return; }
    const navBottom = nav.getBoundingClientRect().bottom;
    const fadeEnd = navBottom - 4;
    const fadeStart = navBottom + 40;
    for (const el of lines) {
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom < -40 || r.top > window.innerHeight || !el._scene.classList.contains('is-in')) { clearFade(el); continue; }
      // measured at the block's last line: taller blocks stay sharp while the veil covers their upper lines
      const c = r.bottom - Math.min(r.height, 48) * 0.5;
      let t = (c - fadeEnd) / (fadeStart - fadeEnd);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (t >= 1) { clearFade(el); continue; }
      const e = t * t * (3 - 2 * t);
      el.style.opacity = e.toFixed(3);
      el.style.filter = 'blur(' + ((1 - e) * 5).toFixed(2) + 'px)';
      el._x = true;
    }
  }

  let ticking = false;
  let resizing = false;
  function frame() {
    ticking = false;
    if (resizing) return;
    setScene(currentScene(), false);
    exitFade();
  }
  function requestFrame() {
    if (!ticking) { ticking = true; window.requestAnimationFrame(frame); }
  }
  window.addEventListener('scroll', requestFrame, { passive: true });

  /* ---------- Pinned layout: one gesture or key press moves exactly one scene ---------- */
  function step(delta) {
    const i = Math.max(0, Math.min(scenes.length - 1, scenes.indexOf(active) + delta));
    const s = scenes[i];
    if (s === active) return;
    scrollToScene(s);
    setScene(s, false);
    const url = s === scenes[0] ? window.location.pathname + window.location.search : '#' + s.id;
    history.replaceState(null, '', url);
  }
  let lastWheel = 0;
  let lastStep = 0;
  let prevAbs = 0;
  let decayed = false;
  let gestureUsed = false;
  window.addEventListener('wheel', (ev) => {
    if (!pinned || ev.ctrlKey) return;
    ev.preventDefault();
    const a = Math.abs(ev.deltaY);
    if (Math.abs(ev.deltaX) > a || a < 4) return; // sideways swipes and the faint end of momentum never move scenes
    const now = window.performance.now();
    // a new gesture: after a pause, or a fresh flick that rises out of a decaying momentum tail
    const rising = decayed && a > 8 && a > prevAbs * 1.4 && now - lastStep > 400;
    if (now - lastWheel > 200 || rising) { gestureUsed = false; decayed = false; }
    if (a < prevAbs * 0.9) decayed = true;
    lastWheel = now;
    prevAbs = a;
    if (gestureUsed) return;
    gestureUsed = true;
    lastStep = now;
    step(ev.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  // native scrolling (scrollbar drag, Space on a link) settles back onto a scene
  let settleTimer = 0;
  window.addEventListener('scroll', () => {
    if (!pinned) return;
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      const s = currentScene();
      if (Math.abs(s.getBoundingClientRect().top) > 2) { scrollToScene(s); setScene(s, false); }
    }, 160);
  }, { passive: true });
  document.addEventListener('keydown', (ev) => {
    if (!pinned || ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const t = ev.target;
    if (t.closest && t.closest('input, textarea, select, [contenteditable]')) return;
    const onControl = t.closest && t.closest('button, a, summary');
    let d = 0;
    if (ev.key === 'PageDown' || ev.key === 'ArrowDown') d = 1;
    else if (ev.key === 'PageUp' || ev.key === 'ArrowUp') d = -1;
    else if (ev.key === ' ' && !onControl) d = ev.shiftKey ? -1 : 1;
    if (!d) return;
    ev.preventDefault();
    step(d);
  });

  /* ---------- Layout mode: pin scenes when every scene fits on one screen ---------- */
  function fitsPinned() {
    if (reduced || !finePointer.matches || window.innerWidth < 1024 || window.innerHeight < 560) return false;
    const room = window.innerHeight - (shortQuery.matches ? 136 : 184);
    return scenes.every((s) => {
      let h = 0;
      for (const c of s.querySelector('.layer').children) {
        if (c.classList.contains('foot') || c.offsetParent === null) continue;
        h = Math.max(h, c.getBoundingClientRect().height);
      }
      return h <= room;
    });
  }
  function setMode() {
    const want = fitsPinned();
    if (want !== pinned) {
      // switch without animating every layer between the two layouts
      root.classList.add('mode-switch');
      pinned = want;
      root.classList.toggle('pinned', pinned);
      scenes.forEach((s) => s.classList.remove('is-active', 'is-live', 'leaving'));
      if (pinned) scenes.forEach((s) => s.classList.add('is-in'));
      if (active && pinned) active.classList.add('is-active', 'is-live');
      void root.offsetHeight;
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => root.classList.remove('mode-switch')));
    }
    sizeMiniLabels();
    if (active) scrollToScene(active);
  }
  let resizeTimer = 0;
  let resizeWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth > 720) openMenu(false);
    // mobile browser bars change the height while scrolling; only a real resize re-anchors
    if (window.innerWidth < 1024 && window.innerWidth === resizeWidth) { requestFrame(); return; }
    resizeWidth = window.innerWidth;
    resizing = true;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      setMode();
      resizing = false;
      requestFrame();
    }, 150);
  });

  /* ---------- Cross-fade for language changes and flowing-layout jumps ---------- */
  let vt = null;
  let fadeTimer = 0;
  function crossfade(change) {
    if (reduced) { change(); return; }
    if (document.startViewTransition) {
      if (vt) { try { vt.skipTransition(); } catch (e) { /* already done */ } }
      const t = document.startViewTransition(change);
      vt = t;
      t.finished.catch(() => {}).then(() => { if (vt === t) vt = null; });
      return;
    }
    document.body.classList.add('swapping');
    window.clearTimeout(fadeTimer);
    fadeTimer = window.setTimeout(() => {
      change();
      window.requestAnimationFrame(() => document.body.classList.remove('swapping'));
    }, 300);
  }

  function sceneOf(id) {
    const t = id && document.getElementById(id);
    if (!t) return null;
    return t.closest('.scene') || t.querySelector('.scene');
  }
  function hashId() {
    const raw = window.location.hash.slice(1);
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
  }

  function go(id, push) {
    const scene = sceneOf(id);
    if (!scene) return;
    if (push) {
      const url = id === 'top' ? window.location.pathname + window.location.search : '#' + id;
      history.pushState(null, '', url);
    }
    const target = document.getElementById(id);
    const jump = () => {
      scrollToScene(scene);
      if (!pinned && target && target !== scene && !target.contains(scene)) {
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 110, behavior: 'instant' });
        held = { scene, y: window.scrollY };
      }
      if (!pinned) reveal(scene, false);
      setScene(scene, !pinned);
      exitFade();
    };
    // pinned: the scene change is itself the transition
    if (pinned || scene === active) jump();
    else crossfade(jump);
    scene.setAttribute('tabindex', '-1');
    scene.focus({ preventScroll: true });
  }

  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('a[data-go]');
    if (!a || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
    ev.preventDefault();
    openMenu(false);
    go(a.dataset.go, true);
  });
  window.addEventListener('popstate', () => go(hashId() || 'top', false));

  // keyboard focus, find-in-page or a text fragment landing in a hidden scene brings that scene forward
  function bringForward(node) {
    if (!pinned || !node) return;
    const el = node.nodeType === 1 ? node : node.parentElement;
    const s = el && el.closest && el.closest('.scene');
    if (s && s !== active) { scrollToScene(s); setScene(s, false); }
  }
  document.addEventListener('focusin', (ev) => bringForward(ev.target));
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) bringForward(sel.anchorNode);
  });

  /* ---------- Language ---------- */
  function applyLang(l) {
    root.setAttribute('data-lang', l);
    root.lang = l === 'zh' ? 'zh-CN' : 'en';
    document.title = l === 'zh' ? '郑其昌' : 'Qichang Zheng';
    langButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
    document.querySelectorAll('img[data-alt-en]').forEach((img) => {
      img.alt = l === 'zh' ? img.dataset.altZh : img.dataset.altEn;
    });
    links.setAttribute('aria-label', l === 'zh' ? '页面章节' : 'Sections');
    document.querySelectorAll('.diagram .lbl[data-zh]').forEach((t) => {
      if (!t.dataset.en) t.dataset.en = t.textContent;
      t.textContent = l === 'zh' ? t.dataset.zh : t.dataset.en;
    });
    paintChapter();
    tick();
  }
  let pendingLang = null;
  langButtons.forEach((b) => {
    b.addEventListener('click', () => {
      const l = b.dataset.lang;
      if (l === (pendingLang || lang())) return;
      pendingLang = l;
      store.set('lang', l);
      crossfade(() => {
        if (pendingLang === l) pendingLang = null;
        // keep the reading position: the current scene's heading stays where it was
        const ref = active && active.querySelector('h1, h2:not(.sr), h3, .big');
        const before = ref ? ref.getBoundingClientRect().top : 0;
        applyLang(l);
        setMode();
        if (!pinned && ref) window.scrollBy(0, ref.getBoundingClientRect().top - before);
        held = active ? { scene: active, y: window.scrollY } : null;
        frame();
      });
    });
  });

  /* ---------- Small-screen menu ---------- */
  function openMenu(open, focusFirst) {
    if (!open && !nav.classList.contains('open')) return;
    nav.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
    if (open && focusFirst) navLinks[0].focus();
  }
  menu.addEventListener('click', (ev) => openMenu(!nav.classList.contains('open'), ev.detail === 0));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && nav.classList.contains('open')) { openMenu(false); menu.focus(); }
  });
  document.addEventListener('click', (ev) => { if (!nav.contains(ev.target)) openMenu(false); });
  nav.addEventListener('focusout', (ev) => { if (!nav.contains(ev.relatedTarget)) openMenu(false); });

  /* ---------- Shanghai local time ---------- */
  const clock = document.querySelector('.clock');
  const time = clock && clock.querySelector('.time');
  function tick() {
    if (!time) return;
    try {
      time.textContent = new Intl.DateTimeFormat(lang() === 'zh' ? 'zh-CN' : 'en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai',
      }).format(new Date());
      clock.hidden = false;
    } catch (e) { clock.hidden = true; }
  }
  window.setInterval(tick, 30000);

  /* ---------- Reduced motion can change at runtime ---------- */
  const onRm = () => {
    reduced = rmQuery.matches;
    if (reduced) {
      scenes.forEach((s) => s.classList.add('is-in'));
      lines.forEach(clearFade);
      root.classList.add('drawn', 'settled');
    }
    setMode();
    requestFrame();
  };
  if (rmQuery.addEventListener) rmQuery.addEventListener('change', onRm);

  /* ---------- First paint ---------- */
  root.setAttribute('data-dir', 'down');
  applyLang(lang());
  if (pinned) scenes.forEach((s) => s.classList.add('is-in'));
  const start = sceneOf(hashId());
  function land() {
    if (!start) return;
    scrollToScene(start);
    const t = document.getElementById(hashId());
    if (!pinned && t && t !== start && !t.contains(start)) {
      window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 110, behavior: 'instant' });
      held = { scene: start, y: window.scrollY };
    }
  }
  if (start) land();
  else window.scrollTo(0, 0);
  // the browser's own jump to #fragment can arrive after this script; land again unless the visitor has moved
  let touched = false;
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((t) => window.addEventListener(t, () => { touched = true; }, { once: true, passive: true }));
  window.addEventListener('load', () => { if (start && !touched) { land(); frame(); exitFade(); } });
  const first = start || currentScene();
  setScene(first, true);
  setMode();
  if (reduced) {
    scenes.forEach((s) => s.classList.add('is-in'));
    root.classList.add('drawn', 'settled');
  } else {
    if (pinned) enter(first, 'down', 150);
    else reveal(first, true, 150);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => root.classList.add('drawn')));
    window.setTimeout(() => root.classList.add('settled'), 3600);
  }
  exitFade();
})();
