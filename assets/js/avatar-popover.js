// Header Avatar Popover Controller
(function initAvatarPopover() {
  const container = document.getElementById("brand-popover-container");
  const trigger = document.getElementById("avatar-trigger");
  const card = document.getElementById("brand-popover-card");

  if (!container || !trigger || !card) return;

  let closeTimer = null;

  function openPopover() {
    clearTimeout(closeTimer);
    container.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
  }

  function closePopover() {
    clearTimeout(closeTimer);
    container.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
  }

  function togglePopover(e) {
    if (e) e.preventDefault();
    if (container.classList.contains("is-open")) {
      closePopover();
    } else {
      openPopover();
    }
  }

  // Click / Tap on trigger
  trigger.addEventListener("click", togglePopover);

  // Hover with grace period for smooth mouse movement
  container.addEventListener("mouseenter", () => {
    openPopover();
  });

  container.addEventListener("mouseleave", () => {
    closeTimer = setTimeout(closePopover, 220);
  });

  // Close when clicking outside
  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) {
      closePopover();
    }
  });

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && container.classList.contains("is-open")) {
      closePopover();
      trigger.focus();
    }
  });
})();
