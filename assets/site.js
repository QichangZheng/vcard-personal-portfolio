(() => {
  const root = document.documentElement;
  const nav = document.getElementById('nav');
  const scenes = Array.from(document.querySelectorAll('.scene'));
  const lines = Array.from(document.querySelectorAll('.scene .r'));
  const chapter = document.querySelector('.chapter');
  const chapterT = chapter.querySelector('.chapter-t');
  const navLinks = Array.from(document.querySelectorAll('.links a'));
  const menu = nav.querySelector('.menu');
  const rmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = rmQuery.matches;
  let active = null;

  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };

  lines.forEach((el) => { el._scene = el.closest('.scene'); });

  /* ---------- Entrances ---------- */
  function reveal(scene, animate) {
    if (scene.classList.contains('is-in')) return;
    scene.classList.add('is-in');
    if (!animate || reduced || !Element.prototype.animate) return;
    scene.querySelectorAll('.r').forEach((el, i) => {
      el.animate(
        [
          { opacity: 0, transform: 'translateY(16px)', filter: 'blur(6px)' },
          { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' },
        ],
        { duration: 1000, delay: 80 + i * 95, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards' }
      );
    });
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { reveal(entry.target, true); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -22% 0px', threshold: 0 });
    scenes.slice(1).forEach((s) => io.observe(s));
  } else {
    scenes.forEach((s) => s.classList.add('is-in'));
  }

  /* ---------- Current scene: drawing state, chapter label, nav ---------- */
  function sceneLabel(scene) {
    if (!scene) return '';
    const lang = root.getAttribute('data-lang') === 'zh' ? 'zh' : 'en';
    return scene.dataset.num ? scene.dataset[lang] || '' : '';
  }

  function paintChapter(scene) {
    const text = sceneLabel(scene);
    chapter.classList.toggle('show', Boolean(text));
    if (!text) return;
    const num = scene.dataset.num;
    chapterT.textContent = '';
    if (num) {
      const n = document.createElement('span');
      n.className = 'num';
      n.textContent = num;
      chapterT.appendChild(n);
    }
    chapterT.appendChild(document.createTextNode(text));
  }

  let swapTimer = 0;
  function setScene(scene, instant) {
    if (scene === active) return;
    const hadText = Boolean(sceneLabel(active));
    active = scene;
    root.setAttribute('data-scene', scene.dataset.scene);
    const target = scene.closest('#work') ? 'work' : scene.id;
    navLinks.forEach((a) => {
      if (a.dataset.go === target) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    window.clearTimeout(swapTimer);
    if (instant || reduced || !hadText) {
      chapter.classList.remove('swap');
      paintChapter(scene);
      return;
    }
    chapter.classList.add('swap');
    swapTimer = window.setTimeout(() => {
      paintChapter(active);
      chapter.classList.remove('swap');
    }, 260);
  }

  /* ---------- Scroll: pick the scene, soften text passing under the nav ---------- */
  let ticking = false;
  function frame() {
    ticking = false;
    const vh = window.innerHeight;
    const probe = vh * 0.5;
    let current = scenes[0];
    for (const s of scenes) {
      if (s.getBoundingClientRect().top <= probe) current = s;
    }
    setScene(current);

    if (reduced) return;
    const fadeEnd = nav.getBoundingClientRect().bottom + 6;
    const fadeStart = fadeEnd + Math.min(140, vh * 0.17);
    for (const el of lines) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -40 || r.top > fadeStart + 40 || !el._scene.classList.contains('is-in')) {
        if (el._x) { el.style.opacity = ''; el.style.filter = ''; el._x = false; }
        continue;
      }
      const c = r.top + Math.min(r.height, 140) * 0.5;
      let t = (c - fadeEnd) / (fadeStart - fadeEnd);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (t >= 1) {
        if (el._x) { el.style.opacity = ''; el.style.filter = ''; el._x = false; }
      } else {
        const e = t * t * (3 - 2 * t);
        el.style.opacity = e.toFixed(3);
        el.style.filter = 'blur(' + ((1 - e) * 6).toFixed(2) + 'px)';
        el._x = true;
      }
    }
  }
  function requestFrame() {
    if (!ticking) { ticking = true; window.requestAnimationFrame(frame); }
  }
  window.addEventListener('scroll', requestFrame, { passive: true });
  window.addEventListener('resize', requestFrame);

  /* ---------- Blur cross-fade for jumps and language changes ---------- */
  function crossfade(change) {
    if (reduced) { change(); return; }
    if (document.startViewTransition) {
      document.startViewTransition(change);
      return;
    }
    document.body.classList.add('swapping');
    window.setTimeout(() => {
      change();
      window.requestAnimationFrame(() => document.body.classList.remove('swapping'));
    }, 350);
  }

  function go(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const scene = target.classList.contains('scene') ? target : target.querySelector('.scene');
    crossfade(() => {
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY, behavior: 'instant' });
      if (scene) { reveal(scene, false); setScene(scene, true); }
      frame();
    });
    history.replaceState(null, '', id === 'top' ? location.pathname + location.search : '#' + id);
    const heading = (scene || target).querySelector('h1, h2:not(.sr), h3') || target.querySelector('h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }

  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[data-go]');
    if (!a || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
    ev.preventDefault();
    closeMenu();
    go(a.dataset.go);
  });

  /* ---------- Language ---------- */
  const langButtons = Array.from(document.querySelectorAll('.lang button'));
  function applyLang(lang) {
    root.setAttribute('data-lang', lang);
    root.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? '郑其昌' : 'Qichang Zheng';
    langButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    paintChapter(active);
    tick();
  }
  langButtons.forEach((b) => {
    b.addEventListener('click', () => {
      const lang = b.dataset.lang;
      if (lang === root.getAttribute('data-lang')) return;
      store.set('lang', lang);
      crossfade(() => { applyLang(lang); frame(); });
    });
  });

  /* ---------- Small-screen menu ---------- */
  function closeMenu() {
    nav.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
  }
  menu.addEventListener('click', () => {
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeMenu(); });
  document.addEventListener('click', (ev) => { if (!nav.contains(ev.target)) closeMenu(); });

  /* ---------- Shanghai local time ---------- */
  const clock = document.querySelector('.clock');
  const time = clock && clock.querySelector('.time');
  function tick() {
    if (!time) return;
    try {
      const lang = root.getAttribute('data-lang') === 'zh' ? 'zh-CN' : 'en-GB';
      time.textContent = new Intl.DateTimeFormat(lang, {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai',
      }).format(new Date());
      clock.hidden = false;
    } catch (e) { clock.hidden = true; }
  }
  tick();
  window.setInterval(tick, 30000);

  /* ---------- Reduced motion can change at runtime ---------- */
  const onRm = () => {
    reduced = rmQuery.matches;
    if (reduced) {
      scenes.forEach((s) => s.classList.add('is-in'));
      lines.forEach((el) => { el.style.opacity = ''; el.style.filter = ''; el._x = false; });
    }
  };
  if (rmQuery.addEventListener) rmQuery.addEventListener('change', onRm);

  /* ---------- First paint ---------- */
  applyLang(root.getAttribute('data-lang') === 'zh' ? 'zh' : 'en');
  const hash = decodeURIComponent(location.hash.slice(1));
  const first = hash && document.getElementById(hash);
  if (first && first !== scenes[0]) {
    const s = first.classList.contains('scene') ? first : first.querySelector('.scene');
    if (s) reveal(s, false);
  }
  frame();
  if (reduced) {
    scenes.forEach((s) => s.classList.add('is-in'));
    root.classList.add('drawn', 'settled');
  } else {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      root.classList.add('drawn');
      window.setTimeout(() => reveal(scenes[0], true), 450);
      window.setTimeout(() => root.classList.add('settled'), 3600);
    }));
  }
})();
