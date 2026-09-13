import justifiedLayout from "./justified-layout/index.js";

const gallery = document.getElementById("gallery");

if (gallery) {
  let containerWidth = 0;
  const items = gallery.querySelectorAll(".gallery-item");

  if (items.length > 0) {
    const input = Array.from(items).map((item) => {
      const img = item.querySelector("img");
      if (img) {
        img.style.width = "100%";
        img.style.height = "auto";
        return {
          width: parseFloat(img.getAttribute("width")) || 600,
          height: parseFloat(img.getAttribute("height")) || 400,
        };
      }
      return { width: 600, height: 400 };
    });

    function updateGallery() {
      const currentWidth = gallery.getBoundingClientRect().width;
      if (!currentWidth || Math.abs(containerWidth - currentWidth) < 1) return;
      containerWidth = currentWidth;

      const geometry = justifiedLayout(input, {
        containerWidth,
        containerPadding: 0,
        boxSpacing: 12,
        targetRowHeight: 288,
        targetRowHeightTolerance: 0.25,
      });

      if (geometry && geometry.boxes) {
        items.forEach((item, i) => {
          if (geometry.boxes[i]) {
            const { width, height, top, left } = geometry.boxes[i];
            item.style.position = "absolute";
            item.style.width = width + "px";
            item.style.height = height + "px";
            item.style.top = top + "px";
            item.style.left = left + "px";
            item.style.overflow = "hidden";
          }
        });

        gallery.style.position = "relative";
        gallery.style.height = geometry.containerHeight + "px";
        gallery.style.visibility = "";
      }
    }

    let resizeTimer = null;
    const debouncedUpdate = () => {
      if (resizeTimer) cancelAnimationFrame(resizeTimer);
      resizeTimer = requestAnimationFrame(updateGallery);
    };

    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => {
        debouncedUpdate();
      });
      ro.observe(gallery.parentElement || gallery);
    } else {
      window.addEventListener("resize", debouncedUpdate, { passive: true });
      window.addEventListener("orientationchange", debouncedUpdate, { passive: true });
    }

    // Initial render
    updateGallery();
  }
}
