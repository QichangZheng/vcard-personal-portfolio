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
    hero: ['122 10 784 420', 9, 18],   // Clients (.ph-x) is left out, so the platform can be larger
    w1: ['-4 84 480 300', 12, 17],
    w2: ['342 100 468 292', 12, 18],
    w3: ['500 6 556 348', 12, 19],
    w4: ['318 452 504 315', 12, 17],
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
  // the chapter-04 crop runs its loop while it is on screen (not while its chapter is current: on phones the
  // chapter changes when its top passes 30% of the screen, so the crop can be in view under another chapter)
  const teamMini = minis.find((m) => m.box.dataset.hl === 'w4');
  if (teamMini) {
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('run', e.isIntersecting)), { threshold: 0.01 })
        .observe(teamMini.box);
    } else teamMini.box.classList.add('run');
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

  /* ---------- Scene motion: each scene moves as one block, in depth ---------- */
  // scale and opacity only: a blur on two full-screen layers costs about half the frames
  const IN = { down: 0.9, up: 1.1 };    // where the arriving scene comes from
  const OUT = { down: 1.1, up: 0.9 };   // where the leaving scene goes
  const LEAD = 370;                     // how long a fully visible leaving scene has before the next one starts
  function layerOf(scene) { return scene.querySelector('.layer'); }
  function zoomIn(scene, from, delay, duration) {
    if (!canAnimate()) return 0;
    const l = layerOf(scene);
    l._exitAt = 0;
    let first = { opacity: 0, transform: 'scale(' + from + ')' };
    const cs = getComputedStyle(l);
    if (l.getAnimations().length && +cs.opacity > 0.02) {
      // coming back to a scene that has not finished leaving: carry on from where it is, no blink
      first = { opacity: cs.opacity, transform: cs.transform === 'none' ? 'scale(1)' : cs.transform };
      delay = 0;
    }
    l.getAnimations().forEach((x) => x.cancel());
    l.animate([first, { opacity: 1, transform: 'scale(1)' }],
      { duration: duration || 1100, delay, easing: EASE, fill: 'backwards' });
    return delay;
  }
  function zoomOut(scene, to) {
    if (!canAnimate()) return;
    const l = layerOf(scene);
    const cs = getComputedStyle(l);
    const o = +cs.opacity;
    const t0 = cs.transform === 'none' ? 'scale(1)' : cs.transform;
    l.getAnimations().forEach((x) => x.cancel());
    l._exitAt = 0;
    if (o < 0.02) return;
    l._exitAt = window.performance.now();
    l._exitLead = LEAD * Math.min(1, o);
    // the block moves in depth while it is still readable, then fades
    l.animate(
      [
        { opacity: o, transform: t0, offset: 0 },
        { opacity: 0.8 * o, transform: 'scale(' + (1 + (to - 1) * 0.55) + ')', offset: 0.45 },
        { opacity: 0, transform: 'scale(' + to + ')', offset: 1 },
      ],
      { duration: Math.round(560 * Math.max(0.4, o)), easing: 'cubic-bezier(.33, 0, .67, 1)' }
    );
  }
  // the arriving scene waits for whichever scenes are still visibly leaving
  function arrivalDelay(scene) {
    const now = window.performance.now();
    let d = 0;
    scenes.forEach((s) => {
      if (s === scene) return;
      const l = layerOf(s);
      if (+getComputedStyle(l).opacity <= 0.3) return;
      d = Math.max(d, l._exitAt ? Math.max(0, l._exitLead - (now - l._exitAt)) : LEAD);
    });
    return Math.round(d);
  }

  function reveal(scene, animate, baseDelay) {
    if (scene.classList.contains('is-in')) return;
    scene.classList.add('is-in');
    if (animate) zoomIn(scene, 0.94, baseDelay == null ? 60 : baseDelay, 1000);
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

  /* ---------- Chapter 04 opens the Agent Team story at its start ---------- */
  // The loop also runs in the hero and is paused in 01-03, so without this chapter 04 would open anywhere in it.
  // The moving parts fade out for 200 ms (the camera is moving), every loop animation jumps to the loop's last
  // breath of rest (data-fx-entry, written by gen.py) and they fade back in: the lease starts about 1 s later.
  const FX_ENTRY = drawing ? parseFloat(drawing.getAttribute('data-fx-entry') || '0') * 1000 : 0;
  let fxTimer = 0;
  function restartStory() {
    if (!drawing || reduced) return;
    root.classList.add('fx-reset');
    window.clearTimeout(fxTimer);
    fxTimer = window.setTimeout(() => {
      if (root.getAttribute('data-scene') === 'w4') {
        drawing.querySelectorAll('.fx').forEach((el) => el.getAnimations().forEach((a) => { a.currentTime = FX_ENTRY; }));
      }
      root.classList.remove('fx-reset');
    }, 200);
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
    // an invisible drawing takes its new framing at once and only fades in
    if (drawing) root.classList.toggle('dg-cut', +getComputedStyle(drawing).opacity < 0.05);
    root.setAttribute('data-scene', scene.dataset.scene);
    const target = scene.dataset.nav || '';
    navLinks.forEach((a) => {
      if (a.dataset.go === target) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    if (pinned) {
      if (prev) {
        if (!instant) zoomOut(prev, OUT[dir]); // before the class change: it must start from what is on screen
        prev.classList.remove('is-active', 'is-live');
      }
      scene.classList.add('is-active');
      if (instant) scene.classList.add('is-live');
      else {
        const delay = zoomIn(scene, IN[dir], arrivalDelay(scene));
        // clickable once it is about half visible
        later(scene, () => { if (scene === active) scene.classList.add('is-live'); }, delay + 120);
      }
    }
    if (!instant && prev) redraw(scene);
    if (prev && scene.dataset.scene === 'w4') restartStory();
    swapChapter(prev, instant);
  }

  // a scene chosen by a click or a deep link is kept until the visitor scrolls
  let held = null;
  function currentScene() {
    if (held && Math.abs(window.scrollY - held.y) < 4) return held.scene;
    held = null;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (window.scrollY >= max - 2) return scenes[scenes.length - 1];
    const probe = window.innerHeight * (pinned ? 0.5 : 0.3);
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
  let lastKeyStep = 0;
  function step(delta) {
    const i = Math.max(0, Math.min(scenes.length - 1, scenes.indexOf(active) + delta));
    const s = scenes[i];
    if (s === active) return;
    scrollToScene(s);
    setScene(s, false);
    const url = s === scenes[0] ? window.location.pathname + window.location.search : '#' + s.id;
    history.replaceState(null, '', url);
    const f = document.activeElement;
    if (f && f !== document.body && f.closest && f.closest('.scene')) {
      s.setAttribute('tabindex', '-1');
      s.focus({ preventScroll: true });
    }
  }
  let lastWheel = 0;
  let lastStep = 0;
  let prevAbs = 0;
  let peak = 0;
  let ups = 0;
  let bigRise = 0;
  let prevSign = 0;
  let travel = 0;
  let gestureUsed = false;
  window.addEventListener('wheel', (ev) => {
    // sideways swipes stay with the browser (two-finger back/forward)
    if (!pinned || ev.ctrlKey || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
    ev.preventDefault();
    // the intro owns the wheel while it plays, and the rest of a flick that skipped it is not a new gesture
    if (introOn || window.performance.now() - introWheel < 200) {
      introWheel = window.performance.now();
      if (introOn && introNext) introNext();
      return;
    }
    const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? window.innerHeight : 1;
    const dy = ev.deltaY * unit;
    const a = Math.abs(dy);
    const sign = Math.sign(dy);
    const now = window.performance.now();
    // a new gesture starts after a pause, or when a fresh flick rises out of a momentum tail:
    // two rises in a row, or one big rise that holds (Chrome merges the first frames of a flick
    // when a frame is dropped); one merged event inside a tail drops straight back and does not count
    ups = a > prevAbs * 1.3 && a > 2 ? ups + 1 : 0;
    const held = bigRise > 0 && a >= bigRise * 0.9;
    bigRise = peak > 0 && a > 8 && a > prevAbs * 2.5 && prevAbs < peak * 0.35 ? a : 0;
    const rising = peak > 0 && ((ups >= 2 && a > 8 && prevAbs < peak * 0.7) || held) && now - lastStep > 300;
    const flip = sign !== 0 && prevSign !== 0 && sign !== prevSign && a > 2; // a momentum tail never turns round
    const notch = a >= 40 && Math.abs(a - prevAbs) < 1 && now - lastStep > 600;  // a mouse wheel rolled steadily
    if (now - lastWheel > 200 || rising || flip || notch) { gestureUsed = false; peak = 0; travel = 0; }
    peak = Math.max(peak, a);
    lastWheel = now;
    prevAbs = a;
    if (sign) prevSign = sign;
    if (gestureUsed) return;
    travel += dy;
    if (Math.abs(travel) < 30) return;
    gestureUsed = true;
    lastStep = now;
    step(travel > 0 ? 1 : -1);
  }, { passive: false });
  // native scrolling (scrollbar drag, Space on a link) settles back onto a scene
  let settleTimer = 0;
  window.addEventListener('scroll', () => {
    if (!pinned) return;
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      if (resizing) return;
      const s = currentScene();
      if (Math.abs(s.getBoundingClientRect().top) > 2) { scrollToScene(s); setScene(s, false); }
    }, 160);
  }, { passive: true });
  document.addEventListener('keydown', (ev) => {
    if (!pinned || introOn || ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const t = ev.target;
    if (t.closest && t.closest('input, textarea, select, [contenteditable]')) return;
    const onControl = t.closest && t.closest('button, a, summary');
    let d = 0;
    if (ev.repeat && window.performance.now() - lastKeyStep < 700) {
      if (['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', ' '].includes(ev.key)) ev.preventDefault();
      return;
    }
    if (ev.key === 'PageDown' || ev.key === 'ArrowDown') d = 1;
    else if (ev.key === 'PageUp' || ev.key === 'ArrowUp') d = -1;
    else if (ev.key === ' ' && !onControl) d = ev.shiftKey ? -1 : 1;
    if (!d) return;
    ev.preventDefault();
    lastKeyStep = window.performance.now();
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
      scenes.forEach((s) => { s.classList.remove('is-active', 'is-live'); layerOf(s).getAnimations().forEach((a) => a.cancel()); });
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
    window.clearTimeout(settleTimer);
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
    if (!pinned || !node || introOn) return;
    const el = node.nodeType === 1 ? node : node.parentElement;
    const s = el && el.closest && el.closest('.scene');
    if (s && s !== active) {
      scrollToScene(s);
      setScene(s, false);
      history.replaceState(null, '', s === scenes[0] ? window.location.pathname + window.location.search : '#' + s.id);
    }
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

  /* ---------- Intro: a few greetings, then "我是郑其昌"; the name travels into the hero ---------- */
  const introEl = document.querySelector('.intro');
  let introOn = root.classList.contains('intro-on') && Boolean(introEl) && canAnimate();
  let introNext = null;
  let introWheel = 0;
  // while the intro plays, input does not scroll the page: it moves the intro straight to the name
  function introInput(ev) {
    if (!introOn) {
      // the rest of a flick that skipped the intro is not a new gesture
      if (ev.type === 'wheel' && window.performance.now() - introWheel < 200) {
        introWheel = window.performance.now();
        if (ev.cancelable) ev.preventDefault();
        ev.stopImmediatePropagation();
      }
      return;
    }
    if (ev.type === 'wheel') introWheel = window.performance.now();
    if (ev.type === 'keydown' && ['Tab', 'Shift', 'Alt', 'Control', 'Meta'].includes(ev.key)) return;
    if (ev.cancelable) ev.preventDefault();
    ev.stopImmediatePropagation();
    if (introNext) introNext();
  }
  ['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach((t) => window.addEventListener(t, introInput, { capture: true, passive: false }));

  // each intro word travels in a straight line onto the same word of the hero title,
  // slow at both ends and quicker in the middle (the owner's call: no corner in the path)
  let gliding = false;
  const GLIDE_MS = 1300;
  function glide(from, to, delay, onEnd) {
    let last = null;
    // a name that lands on two lines: the second word sets off a little later, so it passes under
    // the first instead of through it; on one line both words travel together
    const tops = to.map((t) => t.getBoundingClientRect().top);
    const stagger = tops.length > 1 && Math.abs(tops[1] - tops[0]) > 4 ? 140 : 0;
    from.forEach((w, i) => {
      const target = to[i];
      if (!target) return;
      const a = w.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const k = a.width ? b.width / a.width : 1;
      last = w.animate(
        [{ transform: 'translate(0px, 0px) scale(1)' }, { transform: 'translate(' + (b.left - a.left) + 'px, ' + (b.top - a.top) + 'px) scale(' + k + ')' }],
        { duration: GLIDE_MS, delay: delay + i * stagger, easing: 'cubic-bezier(.65, 0, .35, 1)', fill: 'forwards' }
      );
    });
    gliding = true;
    const end = () => { gliding = false; onEnd(); };
    if (last) last.finished.then(end, end);
    else window.setTimeout(end, GLIDE_MS + 200);
  }
  // the hero title must be on screen for the glide to mean anything (a scroll leak or a text-fragment link)
  function canGlide(targets) {
    if (window.scrollY > 2 || active !== scenes[0] || !targets.length) return false;
    const r = targets[0].getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  }
  window.addEventListener('resize', () => {
    // a resize mid-glide would land the name on stale coordinates: finish it now
    if (introOn && gliding) introEl.getAnimations({ subtree: true }).forEach((a) => a.finish());
  });

  // three lines typed out; then everything but the name leaves and the name travels (and grows)
  // into the hero title
  function playTypeIntro(onMove, onDone) {
    const zh = lang() === 'zh';
    const block = introEl.querySelector('.typer');
    const rows = Array.from(block.querySelectorAll('.ty'));
    // line 1 is split so the name can be handed over word by word
    const first = zh ? [['pre', '你好，我是'], ['w', '郑其昌']] : [['pre', 'Hi, I’m'], ['sp', ' '], ['w', 'Qichang'], ['sp', ' '], ['w', 'Zheng']];
    // lines 2 and 3; 'hl' parts are set in the drawing's blue
    const rest = zh
      ? [[['', '一名 '], ['hl', 'Agent 工程师']], [['', '欢迎来到我的主页']]]
      : [[['', 'An '], ['hl', 'AI agent engineer']], [['', 'Welcome to my homepage']]];
    const perChar = zh ? 80 : 38;
    const chars = [];
    const addChars = (parent, text, r) => Array.from(text).forEach((ch) => {
      const c = document.createElement('span');
      c.className = 'c';
      c.textContent = ch;
      parent.appendChild(c);
      chars.push({ r, el: c });
    });
    // every character is laid out from the start (invisible), so nothing shifts while it types
    rows.forEach((row) => { row.textContent = ''; });
    let nm = null;
    first.forEach(([kind, text]) => {
      if (kind === 'sp') { addChars(nm || rows[0], text, 0); return; }
      if (kind === 'pre') { const pre = document.createElement('span'); pre.className = 'pre'; rows[0].appendChild(pre); addChars(pre, text, 0); return; }
      if (!nm) { nm = document.createElement('span'); nm.className = 'nm'; rows[0].appendChild(nm); }
      const w = document.createElement('span');
      w.className = 'w';
      nm.appendChild(w);
      addChars(w, text, 0);
    });
    rest.forEach((parts, k) => parts.forEach(([kind, text]) => {
      let parent = rows[k + 1];
      if (kind === 'hl') { parent = document.createElement('span'); parent.className = 'hl'; rows[k + 1].appendChild(parent); }
      addChars(parent, text, k + 1);
    }));
    const caret = document.createElement('span');
    caret.className = 'caret';
    rows[0].insertBefore(caret, rows[0].firstChild);
    block.classList.add('typing');
    const timers = [];
    let i = 0;
    let typed = false;
    let moving = false;
    function tick() {
      if (i >= chars.length) { finish(); return; }
      const c = chars[i];
      c.el.classList.add('on');
      c.el.after(caret);
      i += 1;
      const next = chars[i];
      let d = perChar;
      if (next && next.r !== c.r) d = 380;                         // a breath at the end of each line
      else if ('，,'.includes(c.el.textContent)) d = perChar * 3;
      timers.push(window.setTimeout(tick, d));
    }
    function finish(hold) {
      if (typed) return;
      typed = true;
      timers.forEach((x) => window.clearTimeout(x));
      chars.forEach((c) => c.el.classList.add('on'));
      chars[chars.length - 1].el.after(caret);
      block.classList.remove('typing');
      timers.push(window.setTimeout(move, hold == null ? 750 : hold));
    }
    function move() {
      if (moving) return;
      moving = true;
      timers.forEach((x) => window.clearTimeout(x));
      onMove();
      const out = [caret, rows[0].querySelector('.pre'), rows[1], rows[2]];
      out.forEach((el) => el.animate([{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(4px)' }], { duration: 420, easing: 'ease-out', fill: 'forwards' }));
      const from = Array.from(rows[0].querySelectorAll('.w'));
      const to = Array.from(document.querySelectorAll('#name > ' + (zh ? '.zh' : '.en') + ' .w'));
      if (!canGlide(to)) {
        introEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease', fill: 'forwards' }).finished.then(onDone, onDone);
        return;
      }
      introEl.querySelector('.curtain').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, delay: 300, easing: 'ease', fill: 'forwards' });
      glide(from, to, 200, onDone);
    }
    timers.push(window.setTimeout(tick, 350));
    introNext = () => { if (!typed) finish(300); else move(); };  // input completes the lines and moves on
  }

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
  if (!(introOn && first === scenes[0])) {
    introOn = false;
    root.classList.remove('intro-on');
  }
  // while the intro runs, the page behind the curtain can be neither clicked nor tabbed into
  const behind = [nav, document.getElementById('main'), document.querySelector('.skip')].filter(Boolean);
  const setBehind = (on) => behind.forEach((el) => { el.inert = on; });
  function introDone() {
    introOn = false;
    setBehind(false);
    root.classList.remove('intro-on', 'intro-out', 'intro-run');
    introEl.remove();
    const alt = document.querySelector('#name .alt');
    if (alt && canAnimate()) alt.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: EASE });
    window.setTimeout(() => root.classList.add('settled'), 2600);
  }
  if (reduced) {
    scenes.forEach((s) => s.classList.add('is-in'));
    root.classList.add('drawn', 'settled');
  } else if (introOn) {
    root.classList.add('intro-run');
    setBehind(true);
    first.classList.add('is-in');
    // the drawing and the rest of the hero arrive while the name moves
    const onMove = () => root.classList.add('drawn', 'intro-out');
    playTypeIntro(onMove, introDone);
  } else {
    if (pinned) zoomIn(first, 0.96, 150, 1200);
    else reveal(first, true, 150);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => root.classList.add('drawn')));
    window.setTimeout(() => root.classList.add('settled'), 3600);
  }
  exitFade();
})();
