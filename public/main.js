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

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMenu();
    initContactMenu();
    initYear();
    initCopyEmail();
  });
})();
