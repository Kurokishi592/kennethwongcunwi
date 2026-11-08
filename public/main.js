(() => {
  const storageKey = 'kwcw-theme';

  const applyTheme = (theme) => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
      root.removeAttribute('data-theme');
    } else {
      root.removeAttribute('data-theme');
    }
  };

  const getPreferredTheme = () => {
    const stored = localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark') return stored;
    return 'system';
  };

  const cycleTheme = () => {
    const current = getPreferredTheme();
    const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
    if (next === 'system') {
      localStorage.removeItem(storageKey);
      applyTheme('system');
    } else {
      localStorage.setItem(storageKey, next);
      applyTheme(next);
    }
    return next;
  };

  const initTheme = () => {
    const theme = getPreferredTheme();
    applyTheme(theme);

    const toggle = document.getElementById('themeToggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const next = cycleTheme();
        toggle.setAttribute('aria-label', `Toggle theme (now: ${next})`);
      });
    }

    if (theme === 'system') {
      const mq = window.matchMedia?.('(prefers-color-scheme: light)');
      mq?.addEventListener?.('change', () => {
        if (getPreferredTheme() === 'system') applyTheme('system');
      });
    }
  };

  const initMenu = () => {
    const nav = document.getElementById('primaryNav');
    const toggle = document.getElementById('menuToggle');
    if (!nav || !toggle) return;

    const close = () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    };

    const open = () => {
      nav.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
    };

    const isOpen = () => nav.classList.contains('is-open');

    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      isOpen() ? close() : open();
    });

    nav.addEventListener('click', (e) => {
      const target = e.target;
      if (target instanceof HTMLAnchorElement) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    document.addEventListener('click', (e) => {
      if (!isOpen()) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (nav.contains(target) || toggle.contains(target)) return;
      close();
    });
  };

  const initContactMenu = () => {
    const toggle = document.getElementById('contactToggle');
    const menu = document.getElementById('contactMenu');
    if (!toggle || !menu) return;

    const close = () => {
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    };

    const open = () => {
      menu.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
    };

    const isOpen = () => menu.classList.contains('is-open');

    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      isOpen() ? close() : open();
    });

    menu.addEventListener('click', (e) => {
      const target = e.target;
      if (target instanceof HTMLAnchorElement) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    document.addEventListener('click', (e) => {
      if (!isOpen()) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (menu.contains(target) || toggle.contains(target)) return;
      close();
    });
  };

  const initYear = () => {
    const el = document.getElementById('year');
    if (el) el.textContent = String(new Date().getFullYear());
  };

  const initCopyEmail = () => {
    const btn = document.getElementById('copyEmail');
    if (!btn) return;

    const email = 'kennethwongcunwi@outlook.com';
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(email);
        const previous = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => (btn.textContent = previous), 1200);
      } catch {
        window.location.href = `mailto:${email}`;
      }
    });
  };

  // Sections fade up as they scroll into view. Without JS, or with reduced motion, they just show.
  const initReveal = () => {
    const items = document.querySelectorAll('.reveal');
    if (!items.length || !('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -6% 0px' }
    );
    document.documentElement.classList.add('js-reveal');
    items.forEach((el) => io.observe(el));
  };

  // "ls -a" buttons under the About timelines: show or hide entries without `current: true`.
  const initEraToggle = () => {
    const toggles = document.querySelectorAll('[data-era-toggle]');
    const set = (on) => {
      document.documentElement.classList.toggle('show-legacy', on);
      toggles.forEach((t) => {
        t.setAttribute('aria-pressed', String(on));
        const label = t.querySelector('.era-toggle-label');
        if (label) label.textContent = on ? 'Hide earlier' : `Show ${t.dataset.count} earlier`;
      });
    };
    toggles.forEach((t) =>
      t.addEventListener('click', () => set(!document.documentElement.classList.contains('show-legacy')))
    );
  };

  // In-page nav (About): sits under the sticky header and marks the section being read.
  const initPageNav = () => {
    const nav = document.querySelector('.page-nav');
    const header = document.querySelector('.site-header');
    if (!nav) return;
    const setOffset = () => {
      if (header) document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
    };
    setOffset();
    window.addEventListener('resize', setOffset);

    const links = [...nav.querySelectorAll('a[href^="#"]')];
    const targets = links.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
    if (!targets.length || !('IntersectionObserver' in window)) return;
    const row = nav.querySelector('.page-nav-row');
    const mark = (id) => {
      links.forEach((a) => {
        const on = a.getAttribute('href') === `#${id}`;
        if (on) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
        // Phones: the row scrolls sideways; keep the marked link in view.
        if (on && row) row.scrollTo({ left: a.offsetLeft - (row.clientWidth - a.offsetWidth) / 2, behavior: 'smooth' });
      });
    };
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) mark(hit.target.id);
      },
      { rootMargin: '-30% 0px -60% 0px' }
    );
    targets.forEach((t) => io.observe(t));
  };

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMenu();
    initContactMenu();
    initYear();
    initCopyEmail();
    initReveal();
    initEraToggle();
    initPageNav();
  });
})();
