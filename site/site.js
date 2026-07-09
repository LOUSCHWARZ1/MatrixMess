/* MatrixMess Landing Page – kleine Interaktionen (Theme-Toggle) */
(function () {
  "use strict";

  var STORAGE_KEY = "matrixmess-theme";
  var root = document.documentElement;

  function storedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function storeTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* localStorage nicht verfügbar – Theme gilt nur für diese Seite */
    }
  }

  function systemPrefersDark() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }

  function currentTheme() {
    var explicit = root.getAttribute("data-theme");
    if (explicit === "dark" || explicit === "light") {
      return explicit;
    }
    return systemPrefersDark() ? "dark" : "light";
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
  }

  // Gespeichertes Theme so früh wie möglich anwenden (Script ist "defer",
  // läuft also vor dem ersten Paint-relevanten Nutzer-Interaktionsfenster).
  var saved = storedTheme();
  if (saved === "dark" || saved === "light") {
    applyTheme(saved);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.getElementById("theme-toggle");
    if (!toggle) {
      return;
    }

    toggle.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      storeTheme(next);
    });
  });
})();
