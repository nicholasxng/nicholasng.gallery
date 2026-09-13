# Nicholas Ng Photography Gallery

A minimalist, high-impact personal photography portfolio built with [Hugo](https://gohugo.io) and [PhotoSwipe](https://photoswipe.com).

Live site: [nicholasng.gallery](https://nicholasng.gallery/)

---

## 🎨 Design: Amber Tech Narrative

This site implements the **Amber Tech Narrative** design language:
- **Palette**: Warm light surfaces (`#fcf9f8`, `#f1eded`) with high-contrast text (`#1d1b1a`) and bold amber accents (`#dfa129`).
- **Typography**: [Epilogue](https://fonts.google.com/specimen/Epilogue), a contemporary sans-serif providing strong typographic structure.
- **Layout**: Bento-style album cards with fluid hover transitions, justified photo layout with aspect ratio preservation, and full-screen lightbox viewing.

---

## 🚀 Local Development

### Prerequisites
- [Hugo Extended](https://gohugo.io/installation/) (v0.125+)

### Run Development Server
```bash
npm run dev
# or
hugo server -D
```
Visit `http://localhost:1313` in your browser.

### Build Production Site
```bash
npm run build
# or
hugo --gc --minify
```

---

## 📁 Content Structure

- `content/nature/`: Landscape and outdoor photography albums.
- `content/featured-album/`: Featured visual captures and showcases.
- `content/animals/`: Wildlife and pet photography.
- `content/about.md`: About page & bio.
- `content/imprint.md`: Colophon & copyright information.

---

## 📄 License

Code is licensed under the [MIT License](LICENSE).
All photography and media are © Nicholas Ng. All rights reserved.
