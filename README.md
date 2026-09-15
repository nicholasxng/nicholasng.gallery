# Nicholas Ng Photography Gallery

A minimalist, high-impact personal photography portfolio built with [Hugo](https://gohugo.io) and [PhotoSwipe](https://photoswipe.com).

Live site: [gallery.nicholasng.me](https://gallery.nicholasng.me/)  
Media CDN: `https://media.nicholasng.me`

---

## 🎨 Design: Amber Tech Narrative

This site implements the **Amber Tech Narrative** design language:
- **Palette**: Warm light surfaces (`#fcf9f8`, `#f1eded`) with high-contrast text (`#1d1b1a`) and bold amber accents (`#dfa129`).
- **Typography**: [Epilogue](https://fonts.google.com/specimen/Epilogue), a contemporary sans-serif providing strong typographic structure.
- **Layout**: Bento-style album cards with fluid hover transitions, justified photo layout with aspect ratio preservation, and full-screen lightbox viewing.

---

## 🚀 Local Development

### Prerequisites
- [Node.js](https://nodejs.org) (>= 20.9.0, specified in `.nvmrc`)
- [Hugo Extended](https://gohugo.io/installation/) (v0.125+)

### Install Dependencies
```bash
npm ci
```

### Run Development Server
```bash
npm run dev
```
Visit `http://localhost:1313` in your browser.

- **Offline editing**: Drop local image files (`.jpg`, `.png`) directly into `content/<album>/`. When local images are present, Hugo automatically prioritizes them over manifests for local editing.
- **R2 Ingestion**: If `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are provided in your environment, `npm run dev` and `npm run build` will connect to Cloudflare R2, generate missing derivatives, extract metadata, and update manifests. Without credentials, it gracefully falls back to committed static manifests.

### Build Production Site
```bash
npm run build
```

---

## ☁️ Media Pipeline: Cloudflare R2

All raw photography assets live in Cloudflare R2 (`nicholasng-gallery`). Git contains zero image binaries.

### Operator Workflow
1. Upload full-resolution originals into `<album>/original/` or `<album>/general/` in Cloudflare R2 (e.g. `nature/original/photo.jpg` or `2013 Ecuador/general/photo.jpg`).
2. Cloudflare Pages runs `npm run build` at deploy time:
   - Discovers new photos and checks existing derivatives idempotently via `HeadObjectCommand`.
   - Generates 1600px display and 600px thumbnail WebP derivatives with Sharp.
   - Saves dominant color hex, dimensions, and EXIF title directly into S3 metadata headers (`x-amz-meta-*`).
   - If an original photo is replaced in R2 with the same name, ETag change detection automatically triggers derivative regeneration. (You can also force re-processing via `npm run ingest -- --force` or `R2_FORCE=1 npm run build`).
   - Note on deletions: Removing an original photo from R2 removes it from the manifest on subsequent builds; existing derivatives remain in R2 unless manually pruned.
   - Builds static site with Hugo and deploys via Cloudflare edge CDN (`media.nicholasng.me`).
3. (Optional) Customize the album in Git:
   - In `content/<album>/index.md`, set `title`, `description`, `weight` (determines homepage card order, e.g. `1`, `2`, `3`), and `featured_image` (the filename to use as the cover image).

### Environment Variables (Cloudflare Pages Production)
- `NODE_VERSION`: `20`
- `R2_ACCOUNT_ID`: Cloudflare Account ID
- `R2_BUCKET`: `nicholasng-gallery`
- `R2_PUBLIC_URL`: `https://media.nicholasng.me`
- `R2_ACCESS_KEY_ID`: Cloudflare R2 API Token Access Key ID
- `R2_SECRET_ACCESS_KEY`: Cloudflare R2 API Token Secret Access Key (Encrypted Secret)

---

## 📁 Content Structure

- `content/animals/`: Wildlife and pet photography (`weight: 2`).
- `content/nature/`: Landscape and outdoor photography (`weight: 3`).
- `content/2008 October Eastern Europe/`: Eastern Europe travel collection (`weight: 4`).
- `content/featured-album/`: Featured visual captures showcase (hero section, `private: true`).
- `content/about.md`: About page & bio.
- `content/imprint.md`: Colophon & copyright information.

---

## 📄 License

Code is licensed under the [MIT License](LICENSE).
All photography and media are © Nicholas Ng. All rights reserved.
