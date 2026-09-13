import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import exifr from 'exifr';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const CONTENT_DIR = path.resolve(process.cwd(), 'content');
const R2_PUBLIC_BASE = process.env.R2_PUBLIC_URL || 'https://media.nicholasng.me';
const R2_BUCKET = process.env.R2_BUCKET || 'nicholasng-gallery';
const UPLOAD_TO_R2 = process.env.UPLOAD_TO_R2 === 'true';

let s3Client = null;
if (UPLOAD_TO_R2) {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    console.warn('⚠️  R2 credentials missing (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY). Skipping remote upload.');
  } else {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
}

async function uploadFile(key, body, contentType) {
  if (!s3Client) return;
  console.log(`  ☁️  Uploading to R2: ${key}`);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}

async function processAlbum(albumDirName) {
  const albumPath = path.join(CONTENT_DIR, albumDirName);
  const stat = await fs.stat(albumPath);
  if (!stat.isDirectory()) return;

  const entries = await fs.readdir(albumPath);
  const imageFiles = entries.filter(f => /\.(jpe?g|png|webp|avif)$/i.test(f));

  if (imageFiles.length === 0) return;

  console.log(`\n📸 Processing album: "${albumDirName}" (${imageFiles.length} images)...`);

  const manifestImages = [];

  for (const file of imageFiles) {
    const filePath = path.join(albumPath, file);
    const fileBuffer = await fs.readFile(filePath);
    const fileBase = path.parse(file).name;

    // 1. Read EXIF
    let title = '';
    try {
      const exifData = await exifr.parse(fileBuffer, ['ImageDescription', 'Title', 'DateTimeOriginal']);
      if (exifData) {
        title = exifData.ImageDescription || exifData.Title || '';
      }
    } catch (e) {
      // ignore
    }

    // 2. Process Full Display Image (Max 1600x1600, WebP, quality 85)
    const fullSharp = sharp(fileBuffer).rotate(); // auto-orient
    const fullBuffer = await fullSharp
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    const fullMeta = await sharp(fullBuffer).metadata();

    // 3. Process Thumbnail (Max 600x600, WebP, quality 80)
    const thumbSharp = sharp(fileBuffer).rotate();
    const thumbBuffer = await thumbSharp
      .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const thumbMeta = await sharp(thumbBuffer).metadata();

    // 4. Extract dominant color from thumbnail stats
    const stats = await sharp(thumbBuffer).stats();
    const color = rgbToHex(stats.dominant.r, stats.dominant.g, stats.dominant.b);

    const ext = path.extname(file).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
    const origKey = `${albumDirName}/original/${file}`;
    const fullKey = `${albumDirName}/1600/${fileBase}.webp`;
    const thumbKey = `${albumDirName}/600/${fileBase}.webp`;

    if (s3Client) {
      await uploadFile(origKey, fileBuffer, contentType);
      await uploadFile(fullKey, fullBuffer, 'image/webp');
      await uploadFile(thumbKey, thumbBuffer, 'image/webp');
    }

    manifestImages.push({
      name: file,
      baseName: fileBase,
      title: title || fileBase,
      thumbUrl: `${R2_PUBLIC_BASE}/${thumbKey}`,
      thumbWidth: thumbMeta.width,
      thumbHeight: thumbMeta.height,
      fullUrl: `${R2_PUBLIC_BASE}/${fullKey}`,
      fullWidth: fullMeta.width,
      fullHeight: fullMeta.height,
      origUrl: `${R2_PUBLIC_BASE}/${origKey}`,
      color,
    });
  }

  // Sort by Name asc default
  manifestImages.sort((a, b) => a.name.localeCompare(b.name));

  const manifest = {
    album: albumDirName,
    count: manifestImages.length,
    updatedAt: new Date().toISOString(),
    images: manifestImages,
  };

  const manifestFile = path.join(albumPath, 'manifest.json');
  await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✅ Generated ${manifestFile} with ${manifestImages.length} items`);
}

async function main() {
  const contentDirs = await fs.readdir(CONTENT_DIR);
  for (const dir of contentDirs) {
    if (dir.startsWith('.')) continue;
    await processAlbum(dir);
  }
  console.log('\n🎉 Finished generating all album manifests!\n');
}

main().catch(err => {
  console.error('Fatal error generating manifests:', err);
  process.exit(1);
});
