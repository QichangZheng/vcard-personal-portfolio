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
  const EASE = 'cubic-bezier(.16, 1, .3, 1)';
  const GROUP = { w1: 'g-nac', w2: 'g-sbx', w3: 'g-fw', w4: 'g-team' };
  // viewBox crops of the drawing, one per chapter, for narrow screens
  const CROPS = { w1: '-8 150 470 240', w2: '296 128 358 336', w3: '470 128 440 262', w4: '14 516 684 196' };

  let reduced = rmQuery.matches;
  let pinned = false;
  let active = null;

  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };
  const canAnimate = () => !reduced && typeof Element.prototype.animate === 'function';
  const lang = () => (root.getAttribute('data-lang') === 'zh' ? 'zh' : 'en');

  /* ---------- Per-chapter drawings (shown only on narrow screens) ---------- */
  if (drawing) {
    scenes.forEach((s) => {
      const crop = CROPS[s.dataset.scene];
      if (!crop) return;
      const box = document.createElement('div');
      box.className = 'mini r';
      box.dataset.hl = s.dataset.scene;
      box.setAttribute('aria-hidden', 'true');
      const svg = drawing.cloneNode(true);
      svg.setAttribute('viewBox', crop);
      box.appendChild(svg);
      const col = s.querySelector('.col');
      col.insertBefore(box, col.firstChild);
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
    return { num: scene.dataset.num || '', text: scene.dataset[lang()] || '' };
  }
  function paintChapter() {
    const l = labelOf(active);
    chapter.classList.toggle('show', Boolean(l));
    if (!l) return;
    chapterT.textContent = '';
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

  /* ---------- Highlighted part of the drawing redraws itself once per chapter ---------- */
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
      if (prev) prev.classList.remove('is-active');
      scene.classList.add('is-active');
      if (!instant) enter(scene, dir, 220);
    }
    if (!instant && prev) redraw(scene);
    swapChapter(prev, instant);
  }

  function currentScene() {
    const probe = window.innerHeight * (pinned ? 0.5 : 0.55);
    let cur = scenes[0];
    for (const s of scenes) {
      if (s.getBoundingClientRect().top <= probe) cur = s;
    }
    return cur;
  }

  function scrollToScene(scene) {
    window.scrollTo({ top: scene.getBoundingClientRect().top + window.scrollY, behavior: 'instant' });
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
  function frame() {
    ticking = false;
    setScene(currentScene(), false);
    exitFade();
  }
  function requestFrame() {
    if (!ticking) { ticking = true; window.requestAnimationFrame(frame); }
  }
  window.addEventListener('scroll', requestFrame, { passive: true });

  /* ---------- Layout mode: pin scenes when every scene fits on one screen ---------- */
  function fitsPinned() {
    if (reduced || window.innerWidth < 1024 || window.innerHeight < 620) return false;
    const room = window.innerHeight - 120 - 64;
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
    if (want === pinned) return;
    pinned = want;
    root.classList.toggle('pinned', pinned);
    scenes.forEach((s) => s.classList.remove('is-active'));
    if (pinned) scenes.forEach((s) => s.classList.add('is-in'));
    if (active) {
      scrollToScene(active);
      if (pinned) active.classList.add('is-active');
    }
  }
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    if (window.innerWidth > 720) openMenu(false);
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { setMode(); requestFrame(); }, 150);
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
    return t.classList.contains('scene') ? t : t.querySelector('.scene');
  }
  function hashId() {
    const raw = window.location.hash.slice(1);
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
  }

  function go(id, push) {
    const scene = sceneOf(id);
    if (!scene) return;
    const jump = () => {
      scrollToScene(scene);
      if (!pinned) reveal(scene, false);
      setScene(scene, !pinned);
      exitFade();
    };
    // pinned: the scene change is itself the transition
    if (pinned || scene === active) jump();
    else crossfade(jump);
    if (push) {
      const url = id === 'top' ? window.location.pathname + window.location.search : '#' + id;
      history.pushState(null, '', url);
    }
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

  // keyboard focus landing in a scene that is not on screen brings that scene forward
  document.addEventListener('focusin', (ev) => {
    if (!pinned) return;
    const s = ev.target.closest && ev.target.closest('.scene');
    if (s && s !== active) { scrollToScene(s); setScene(s, false); }
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
        applyLang(l);
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
  setMode();
  const start = sceneOf(hashId());
  if (start) scrollToScene(start);
  const first = currentScene();
  setScene(first, true);
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
