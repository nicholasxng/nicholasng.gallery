const themeToggle = document.getElementById("theme-toggle");

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getEffectiveTheme() {
  if (document.documentElement.classList.contains("dark")) return "dark";
  if (document.documentElement.classList.contains("light")) return "light";
  return getSystemTheme();
}

function applyTheme(theme, save = true) {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
    document.documentElement.classList.remove("light");
    if (save) {
      try {
        localStorage.setItem("theme", "dark");
      } catch (e) {}
    }
  } else if (theme === "light") {
    document.documentElement.classList.add("light");
    document.documentElement.classList.remove("dark");
    if (save) {
      try {
        localStorage.setItem("theme", "light");
      } catch (e) {}
    }
  }
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const current = getEffectiveTheme();
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next, true);
  });
}

// React dynamically to OS system preference changes if user hasn't overridden
try {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    const stored = localStorage.getItem("theme");
    if (!stored) {
      document.documentElement.classList.remove("dark", "light");
    }
  });
} catch (e) {}
