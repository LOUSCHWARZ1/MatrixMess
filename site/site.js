/* MatrixMess Landing Page – Interaktionen
   (Scroll-Reveal, Nav-Zustand, mobiles Menü; ohne Abhängigkeiten) */
(function () {
  'use strict';

  // Jahr im Footer
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  // Nav bekommt Schatten, sobald gescrollt wurde
  var nav = document.getElementById('topnav');
  function onScroll() {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobiles Menü
  var burger = document.getElementById('nav-burger');
  var links = document.getElementById('nav-links');
  if (burger && links) {
    burger.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
    });
    // Nach Klick auf einen Link schließen
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        links.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Scroll-Reveal (respektiert prefers-reduced-motion via CSS)
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (elm) { io.observe(elm); });
  } else {
    revealEls.forEach(function (elm) { elm.classList.add('in'); });
  }
})();
