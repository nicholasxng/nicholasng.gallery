import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import exifr from "exifr";
import pLimit from "p-limit";
import { S3Client, ListObjectsV2Command, HeadObjectCommand, GetObjectCommand, PutObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";

const CONTENT_DIR = path.resolve(process.cwd(), "content");
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_URL || "https://media.nicholasng.me").replace(/\/+$/, "");
const R2_BUCKET = process.env.R2_BUCKET || "nicholasng-gallery";
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "49e11352d05de6bed87d3c5765cb89d5";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

// 1. Check Credentials
const isProductionPages =
  process.env.CF_PAGES === "1" &&
  process.env.CF_PAGES_BRANCH === (process.env.PRODUCTION_BRANCH || "master");
const isIngestRequired = process.env.R2_INGEST_REQUIRED === "true" || isProductionPages;

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  if (isIngestRequired) {
    console.error("❌ Fatal error: R2 credentials missing in production build environment (R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY).");
    process.exit(1);
  }
  console.log("ℹ️  No R2 credentials detected in environment. Falling back to existing committed static manifests.");
  process.exit(0);
}

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const limit = pLimit(3);

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function listAllObjectsWithPrefix(prefix) {
  let continuationToken = undefined;
  const objects = [];
  do {
    const res = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    if (res.Contents) {
      objects.push(...res.Contents);
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

async function listTopLevelAlbums() {
  let continuationToken = undefined;
  const albumPrefixes = new Set();
  do {
    const res = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Delimiter: "/",
        ContinuationToken: continuationToken,
      }),
    );
    if (res.CommonPrefixes) {
      for (const cp of res.CommonPrefixes) {
        const clean = cp.Prefix.replace(/\/+$/, "");
        if (clean) albumPrefixes.add(clean);
      }
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return Array.from(albumPrefixes);
}

async function headObjectSafe(key) {
  try {
    return await s3Client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      }),
    );
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

async function conditionallyWriteFile(filePath, newContent) {
  try {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing.trim() === newContent.trim()) {
      return false; // unchanged
    }
  } catch (e) {
    // File doesn't exist yet
  }
  await fs.writeFile(filePath, newContent + "\n");
  return true;
}

const IS_FORCE = process.env.R2_FORCE === "1" || process.argv.includes("--force");

// Backfill metadata for existing derivatives if missing
async function ensureMetadataBackfilled(album, origObj, baseName, existingManifestItem) {
  if (!existingManifestItem) return;

  const fullKey = `${album}/1600/${baseName}.webp`;
  const thumbKey = `${album}/600/${baseName}.webp`;
  const cleanOrigEtag = origObj?.ETag ? origObj.ETag.replace(/["']/g, "") : "";

  const [thumbHead, fullHead] = await Promise.all([headObjectSafe(thumbKey), headObjectSafe(fullKey)]);

  const copySource = (key) => encodeURIComponent(`${R2_BUCKET}/${key}`);

  if (thumbHead && (!thumbHead.Metadata || !thumbHead.Metadata.width)) {
    console.log(`  🏷️  Backfilling metadata for ${thumbKey}`);
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: R2_BUCKET,
        Key: thumbKey,
        CopySource: copySource(thumbKey),
        MetadataDirective: "REPLACE",
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: {
          width: String(existingManifestItem.thumbWidth || 600),
          height: String(existingManifestItem.thumbHeight || 400),
          color: existingManifestItem.color || "#1a1a1a",
          basename: baseName,
          title: encodeURIComponent(existingManifestItem.title || baseName),
          origetag: cleanOrigEtag,
        },
      }),
    );
  }

  if (fullHead && (!fullHead.Metadata || !fullHead.Metadata.width)) {
    console.log(`  🏷️  Backfilling metadata for ${fullKey}`);
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: R2_BUCKET,
        Key: fullKey,
        CopySource: copySource(fullKey),
        MetadataDirective: "REPLACE",
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: {
          width: String(existingManifestItem.fullWidth || 1600),
          height: String(existingManifestItem.fullHeight || 1067),
          basename: baseName,
          origetag: cleanOrigEtag,
        },
      }),
    );
  }
}

async function processOriginalImage(album, origObj, existingManifestItem) {
  const fileKey = origObj.Key;
  const fileName = path.basename(fileKey);
  const fileBase = path.parse(fileName).name;
  const fullKey = `${album}/1600/${fileBase}.webp`;
  const thumbKey = `${album}/600/${fileBase}.webp`;
  const cleanOrigEtag = origObj.ETag ? origObj.ETag.replace(/["']/g, "") : "";

  // Idempotent check
  let [thumbHead, fullHead] = await Promise.all([headObjectSafe(thumbKey), headObjectSafe(fullKey)]);

  // Backfill if needed
  if (thumbHead && fullHead && (!thumbHead.Metadata?.width || !fullHead.Metadata?.width)) {
    await ensureMetadataBackfilled(album, origObj, fileBase, existingManifestItem);
    [thumbHead, fullHead] = await Promise.all([headObjectSafe(thumbKey), headObjectSafe(fullKey)]);
  }

  const thumbOrigEtag = thumbHead?.Metadata?.origetag;
  const isEtagMatch = !thumbOrigEtag || !cleanOrigEtag || thumbOrigEtag === cleanOrigEtag;

  if (!IS_FORCE && thumbHead && fullHead && thumbHead.Metadata?.width && fullHead.Metadata?.width && isEtagMatch) {
    const thumbMeta = thumbHead.Metadata;
    const fullMeta = fullHead.Metadata;
    const decodedTitle = thumbMeta.title ? decodeURIComponent(thumbMeta.title) : existingManifestItem?.title || fileBase;

    return {
      name: fileName,
      baseName: fileBase,
      title: decodedTitle,
      thumbUrl: `${R2_PUBLIC_BASE}/${thumbKey}`,
      thumbWidth: parseInt(thumbMeta.width, 10),
      thumbHeight: parseInt(thumbMeta.height, 10),
      fullUrl: `${R2_PUBLIC_BASE}/${fullKey}`,
      fullWidth: parseInt(fullMeta.width, 10),
      fullHeight: parseInt(fullMeta.height, 10),
      origUrl: `${R2_PUBLIC_BASE}/${fileKey}`,
      color: thumbMeta.color || existingManifestItem?.color || "#1a1a1a",
    };
  }

  // Need to generate derivatives
  console.log(`  ⚙️  Generating derivatives for ${fileKey}...`);
  const getObj = await s3Client.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: fileKey,
    }),
  );
  const fileBuffer = await streamToBuffer(getObj.Body);

  // 1. Read EXIF
  let title = "";
  try {
    const exifData = await exifr.parse(fileBuffer, ["ImageDescription", "Title", "DateTimeOriginal"]);
    if (exifData) {
      title = exifData.ImageDescription || exifData.Title || "";
    }
  } catch (e) {
    // ignore
  }
  if (!title && existingManifestItem?.title) {
    title = existingManifestItem.title;
  }
  if (!title) {
    title = fileBase;
  }

  // 2. Full 1600 WebP
  const fullSharp = sharp(fileBuffer).rotate();
  const fullBuffer = await fullSharp.resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  const fullMetaInfo = await sharp(fullBuffer).metadata();

  // 3. Thumb 600 WebP
  const thumbSharp = sharp(fileBuffer).rotate();
  const thumbBuffer = await thumbSharp.resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const thumbMetaInfo = await sharp(thumbBuffer).metadata();

  // 4. Dominant color
  const stats = await sharp(thumbBuffer).stats();
  const color = rgbToHex(stats.dominant.r, stats.dominant.g, stats.dominant.b);

  // 5. Upload with metadata headers
  console.log(`  ☁️  Uploading derivatives with metadata: ${fullKey}, ${thumbKey}`);
  await Promise.all([
    s3Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: fullKey,
        Body: fullBuffer,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: {
          width: String(fullMetaInfo.width),
          height: String(fullMetaInfo.height),
          basename: fileBase,
          origetag: cleanOrigEtag,
        },
      }),
    ),
    s3Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: thumbKey,
        Body: thumbBuffer,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: {
          width: String(thumbMetaInfo.width),
          height: String(thumbMetaInfo.height),
          color: color,
          basename: fileBase,
          title: encodeURIComponent(title),
          origetag: cleanOrigEtag,
        },
      }),
    ),
  ]);

  return {
    name: fileName,
    baseName: fileBase,
    title: title,
    thumbUrl: `${R2_PUBLIC_BASE}/${thumbKey}`,
    thumbWidth: thumbMetaInfo.width,
    thumbHeight: thumbMetaInfo.height,
    fullUrl: `${R2_PUBLIC_BASE}/${fullKey}`,
    fullWidth: fullMetaInfo.width,
    fullHeight: fullMetaInfo.height,
    origUrl: `${R2_PUBLIC_BASE}/${fileKey}`,
    color: color,
  };
}

async function ingestAlbum(albumName) {
  console.log(`\n📂 Ingesting album from R2: "${albumName}"...`);
  const originalObjects = await listAllObjectsWithPrefix(`${albumName}/original/`);
  const imageObjects = originalObjects.filter((o) => /\.(jpe?g|png|webp|avif)$/i.test(o.Key));

  if (imageObjects.length === 0) {
    console.log(`  ℹ️  No original images found under "${albumName}/original/". Skipping.`);
    return;
  }

  // Load existing manifest if present to seed backfill
  const albumDir = path.join(CONTENT_DIR, albumName);
  await fs.mkdir(albumDir, { recursive: true });

  const manifestPath = path.join(albumDir, "manifest.json");
  let existingManifest = null;
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    existingManifest = JSON.parse(raw);
  } catch (e) {
    // none
  }

  const manifestMap = new Map();
  if (existingManifest && Array.isArray(existingManifest.images)) {
    for (const img of existingManifest.images) {
      manifestMap.set(img.name, img);
      manifestMap.set(img.baseName, img);
    }
  }

  const tasks = imageObjects.map((obj) => limit(() => processOriginalImage(albumName, obj, manifestMap.get(path.basename(obj.Key)))));

  const images = await Promise.all(tasks);

  // Preserve neutral ordering
  const manifest = {
    album: albumName,
    count: images.length,
    images: images,
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  const changed = await conditionallyWriteFile(manifestPath, manifestJson);
  if (changed) {
    console.log(`  ✅ Updated ${manifestPath} with ${images.length} items.`);
  } else {
    console.log(`  ✨ Manifest ${manifestPath} is up-to-date. Skipped write.`);
  }

  // Ensure index.md exists
  const indexPath = path.join(albumDir, "index.md");
  try {
    await fs.access(indexPath);
  } catch (e) {
    const capitalized = albumName.charAt(0).toUpperCase() + albumName.slice(1);
    const defaultIndex = `---
title: "${capitalized}"
description: "Photographs from the ${capitalized} collection."
---
`;
    await fs.writeFile(indexPath, defaultIndex);
    console.log(`  📝 Created default ${indexPath}`);
  }
}

async function main() {
  console.log(`🚀 Starting Cloudflare R2 Ingestion (Bucket: ${R2_BUCKET})...`);
  const albums = await listTopLevelAlbums();
  console.log(`Found ${albums.length} album prefix(es): ${albums.join(", ")}`);

  for (const album of albums) {
    await ingestAlbum(album);
  }
  console.log("\n🎉 R2 ingestion complete!\n");
}

main().catch((err) => {
  console.error("❌ Fatal error during R2 ingestion:", err);
  process.exit(1);
});
