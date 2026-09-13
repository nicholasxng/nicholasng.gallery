const el = document.getElementById("menu-toggle");
const menu = document.getElementById("menu");

if (el && menu) {
  const closeMenu = () => {
    menu.classList.add("hidden");
    el.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    menu.classList.remove("hidden");
    el.setAttribute("aria-expanded", "true");
  };

  el.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (menu.classList.contains("hidden")) {
      openMenu();
    } else {
      closeMenu();
    }
  });

  // Close on Escape key
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.classList.contains("hidden")) {
      closeMenu();
      el.focus();
    }
  });

  // Close on click outside
  document.addEventListener("click", (event) => {
    if (
      !menu.classList.contains("hidden") &&
      !menu.contains(event.target) &&
      !el.contains(event.target)
    ) {
      closeMenu();
    }
  });
}
