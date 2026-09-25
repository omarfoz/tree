/**
 * Al-Suwailem Tree Analytics — Shared Application Logic
 */

(function () {
  'use strict';

  const THEME_KEY = 'suwailem-theme';
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  // ─── Theme ───
  function getTheme() {
    return localStorage.getItem(THEME_KEY) || (prefersDark ? 'dark' : 'light');
  }
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    const btn = document.getElementById('theme-btn');
    if (btn) btn.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
  }
  function toggleTheme() {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }
  window.toggleTheme = toggleTheme;

  // ─── Mobile menu ───
  function toggleMobileMenu() {
    const overlay = document.getElementById('mobile-overlay');
    if (overlay) overlay.classList.toggle('is-open');
  }
  window.toggleMobileMenu = toggleMobileMenu;

  // ─── Icons ───
  const ICON_MOON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const ICON_SUN  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
  const ICON_SEARCH = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
  const ICON_X = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const ICON_MENU = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
  const ICON_ARROW = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

  // ─── Active nav link ───
  function setActiveNav() {
    const path = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.main-nav a, .mobile-menu a').forEach(a => {
      const href = a.getAttribute('href');
      if (href === path || (path === 'index.html' && (href === 'index.html' || href === './'))) {
        a.classList.add('is-active');
      } else {
        a.classList.remove('is-active');
      }
    });
  }

  // ─── Header injection ───
  function injectHeader() {
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.type = 'image/png';
    favicon.href = 'assets/logo.png';
    document.head.appendChild(favicon);

    const header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = `
      <div class="container site-header-inner">
        <a href="./" class="brand" dir="rtl">
          <img src="assets/logo.png" alt="شعار شجرة عائلة السويلم" class="brand-logo">
          <span>شجرة عائلة السويلم</span>
        </a>
        <nav class="main-nav" dir="rtl">
          <a href="./">الرئيسية</a>
          <a href="tree.html">الشجرة</a>
          <a href="names.html">الأسماء</a>
          <a href="generations.html">الأجيال</a>
          <a href="branches.html">الفروع</a>
          <a href="analytics.html">الإحصائيات</a>
          <a href="about.html">عن الشجرة</a>
        </nav>
        <div class="header-actions">
          <button id="theme-btn" class="theme-toggle" onclick="toggleTheme()" aria-label="تبديل الوضع">${ICON_MOON}</button>
          <button class="mobile-menu-btn theme-toggle" onclick="toggleMobileMenu()" aria-label="القائمة">${ICON_MENU}</button>
        </div>
      </div>
    `;
    document.body.prepend(header);

    const overlay = document.createElement('div');
    overlay.id = 'mobile-overlay';
    overlay.className = 'mobile-overlay';
    overlay.setAttribute('onclick', 'toggleMobileMenu()');
    overlay.innerHTML = `
      <div class="mobile-menu" dir="rtl" onclick="event.stopPropagation()">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <span class="brand" style="font-weight:700;font-size:1.1rem;">القائمة</span>
          <button class="theme-toggle" onclick="toggleMobileMenu()">${ICON_X}</button>
        </div>
        <a href="./">الرئيسية</a>
        <a href="tree.html">الشجرة</a>
        <a href="names.html">الأسماء</a>
        <a href="generations.html">الأجيال</a>
        <a href="branches.html">الفروع</a>
        <a href="analytics.html">الإحصائيات</a>
        <a href="about.html">عن الشجرة</a>
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--color-border);">
          <button class="btn btn-ghost w-full" onclick="toggleTheme();toggleMobileMenu();">
            <span id="mobile-theme-label">الوضع الداكن</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    setTheme(getTheme());
    setActiveNav();

    // Sync mobile theme label
    const observer = new MutationObserver(() => {
      const label = document.getElementById('mobile-theme-label');
      if (label) label.textContent = getTheme() === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن';
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  // ─── Footer injection ───
  function injectFooter() {
    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML = `
      <div class="container site-footer-inner" dir="rtl">
        <div>جميع الحقوق محفوظة لصندوق أسرة السويلم.</div>
        <div>الإصدار الثالث، الطبعة الثانية ١٤٤٨هـ</div>
      </div>
    `;
    document.body.appendChild(footer);
  }

  // ─── Number counter animation ───
  function animateCounters() {
    document.querySelectorAll('[data-count]').forEach(el => {
      const target = parseInt(el.dataset.count, 10);
      const duration = parseInt(el.dataset.duration || '1200', 10);
      const start = performance.now();
      const step = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased).toLocaleString('ar-SA');
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  window.animateCounters = animateCounters;

  // ─── Intersection observer for animations ───
  function observeAnimations() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.card, .chart-container, .section').forEach(el => observer.observe(el));
  }

  // ─── Keyboard shortcut for search ───
  function setupSearchShortcut() {
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        const searchInput = document.querySelector('.search-input');
        if (searchInput) searchInput.focus();
      }
    });
  }

  // ─── Arabic normalization for search ───
  // Normalizes spelling variants (أ/إ/آ → ا, ة → ه, ى → ي), strips diacritics,
  // and removes tatweel. Spaces are collapsed but kept, so callers can use
  // arCompact() for space-insensitive matching (عبدالعزيز == عبد العزيز).
  window.arNormalize = function (text) {
    if (!text) return '';
    return text
      .replace(/[\u0640\u064B-\u0652\u0670\u06D6-\u06ED]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/[ىئي]/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  // Space-insensitive form: عبدالعزيز and عبد العزيز both → عبدالعزيز
  window.arCompact = function (text) {
    return window.arNormalize(text).replace(/\s+/g, '');
  };

  // ─── Init ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    injectHeader();
    injectFooter();
    setupSearchShortcut();
    setTimeout(() => {
      animateCounters();
      observeAnimations();
    }, 100);
  }
})();
