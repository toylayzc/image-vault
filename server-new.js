const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const sharp = require("sharp");
const AdmZip = require("adm-zip");
const heicDecode = require("heic-decode");

/**
 * Convert a HEIC/HEIF file buffer to JPEG using heic-decode + sharp
 */
async function convertHeicToJpeg(inputPath, outputPath) {
  const buf = fs.readFileSync(inputPath);
  const result = await heicDecode({ buffer: buf });
  await sharp(result.data, {
    raw: { width: result.width, height: result.height, channels: 4 }
  }).jpeg({ quality: 90 }).toFile(outputPath);
}

const app = express();
const PORT = 3000;

// 上传目录
const UPLOAD_DIR = "/www/wwwroot/api/uploads";
const SHARES_DIR = path.join(UPLOAD_DIR, "shares");
const THUMBS_DIR = path.join(UPLOAD_DIR, "thumbs");
const DATA_DIR = path.join(UPLOAD_DIR, "data");
const META_FILE = path.join(DATA_DIR, "meta.json");

// 确保目录存在
if (!fs.existsSync(SHARES_DIR)) {
  fs.mkdirSync(SHARES_DIR, { recursive: true });
}
if (!fs.existsSync(THUMBS_DIR)) {
  fs.mkdirSync(THUMBS_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 加载/保存元数据
function loadMeta() {
  try {
    if (!fs.existsSync(META_FILE)) return [];
    return JSON.parse(fs.readFileSync(META_FILE, "utf-8"));
  } catch { return []; }
}

function saveMeta(data) {
  fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// 向 meta.json 添加一条记录（上传成功时调用）
function addMetaEntry(key, originalname) {
  const meta = loadMeta();
  const existing = meta.find(m => m.key === key);
  if (!existing) {
    meta.push({
      key,
      filename: originalname || key,
      hash: "",
      groupIndex: -1,
      timestamp: Date.now(),
      downloaded: false
    });
    saveMeta(meta);
  }
}

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueName = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, uniqueName + ext);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB 限制（livp 可能较大）
});

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => res.json({ status: "ok", message: "API running" }));

/**
 * 处理上传文件：
 * - .heic/.heif → 用 sharp 转成 JPEG，保留原文件
 * - .livp → 解压 ZIP 取出里面的 HEIC，转成 JPEG，保留原 livp
 * - 其他格式 → 原样保存
 */
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no file" });

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    const baseName = path.basename(filePath, path.extname(filePath));

    // 处理 HEIC/HEIF → 转 JPEG
    if (fileExt === ".heic" || fileExt === ".heif") {
      try {
        const jpegPath = path.join(UPLOAD_DIR, baseName + ".jpg");
        await convertHeicToJpeg(filePath, jpegPath);

        // 删除原始 HEIC 文件
        try { fs.unlinkSync(filePath); } catch {}

        // 返回 JPEG 的 key
        res.json({
          key: baseName + ".jpg",
          url: "/uploads/" + baseName + ".jpg",
          fsize: fs.statSync(jpegPath).size,
          originalname: req.file.originalname
        });
        addMetaEntry(baseName + ".jpg", req.file.originalname);
      } catch (convErr) {
        console.error("HEIC convert failed:", convErr);
        // 转码失败则返回原文件
        res.json({
          key: req.file.filename,
          url: "/uploads/" + req.file.filename,
          fsize: req.file.size,
          originalname: req.file.originalname
        });
        addMetaEntry(req.file.filename, req.file.originalname);
      }
      return;
    }

    // 处理 LIVP (Apple Live Photo) → 解压 → 提取 HEIC → 转 JPEG
    if (fileExt === ".livp") {
      try {
        const zip = new AdmZip(filePath);
        const zipEntries = zip.getEntries();

        // 找到第一个 HEIC/HEIF 文件
        let photoEntry = null;
        for (const entry of zipEntries) {
          const entryName = entry.entryName.toLowerCase();
          if (entryName.endsWith(".heic") || entryName.endsWith(".heif")) {
            photoEntry = entry;
            break;
          }
        }

        if (photoEntry) {
          // 提取 HEIC 到临时文件
          const heicTempPath = path.join(UPLOAD_DIR, baseName + "_temp.heic");
          fs.writeFileSync(heicTempPath, photoEntry.getData());

          // 用 heicDecode + sharp 转成 JPEG
          const jpegPath = path.join(UPLOAD_DIR, baseName + ".jpg");
          await convertHeicToJpeg(heicTempPath, jpegPath);

          // 删除临时 HEIC 文件和原始 LIVP 文件
          try { fs.unlinkSync(heicTempPath); } catch {}
          try { fs.unlinkSync(filePath); } catch {}

          res.json({
            key: baseName + ".jpg",
            url: "/uploads/" + baseName + ".jpg",
            fsize: fs.statSync(jpegPath).size,
            originalname: req.file.originalname
          });
          addMetaEntry(baseName + ".jpg", req.file.originalname);
        } else {
          // livp 中没有找到 HEIC，返回原文件
          res.json({
            key: req.file.filename,
            url: "/uploads/" + req.file.filename,
            fsize: req.file.size,
            originalname: req.file.originalname
          });
          addMetaEntry(req.file.filename, req.file.originalname);
        }
      } catch (livpErr) {
        console.error("LIVP extract failed:", livpErr);
        // 解压失败则返回原文件
        res.json({
          key: req.file.filename,
          url: "/uploads/" + req.file.filename,
          fsize: req.file.size,
          originalname: req.file.originalname
        });
        addMetaEntry(req.file.filename, req.file.originalname);
      }
      return;
    }

    // 其他格式（JPG, JPEG, PNG 等）原样返回
    res.json({
      key: req.file.filename,
      url: "/uploads/" + req.file.filename,
      fsize: req.file.size,
      originalname: req.file.originalname
    });
    addMetaEntry(req.file.filename, req.file.originalname);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 批量上传（兼容多选）
app.post("/uploads", upload.array("files", 200), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ error: "no files" });

    const results = [];
    for (const f of req.files) {
      const fileExt = path.extname(f.originalname).toLowerCase();
      const baseName = path.basename(f.filename, path.extname(f.filename));

      let key = f.filename;
      let url = "/uploads/" + f.filename;
      let fsize = f.size;

      // HEIC 转 JPEG
      if (fileExt === ".heic" || fileExt === ".heif") {
        try {
          const jpegPath = path.join(UPLOAD_DIR, baseName + ".jpg");
          await convertHeicToJpeg(f.path, jpegPath);
          key = baseName + ".jpg";
          url = "/uploads/" + baseName + ".jpg";
          fsize = fs.statSync(jpegPath).size;
          try { fs.unlinkSync(f.path); } catch {}
        } catch (convErr) {
          console.error("HEIC batch convert failed:", convErr);
        }
      }

      // LIVP 解压提取
      if (fileExt === ".livp") {
        try {
          const zip = new AdmZip(f.path);
          const zipEntries = zip.getEntries();
          let photoEntry = null;
          for (const entry of zipEntries) {
            const entryName = entry.entryName.toLowerCase();
            if (entryName.endsWith(".heic") || entryName.endsWith(".heif")) {
              photoEntry = entry;
              break;
            }
          }
          if (photoEntry) {
            const heicTempPath = path.join(UPLOAD_DIR, baseName + "_temp.heic");
            fs.writeFileSync(heicTempPath, photoEntry.getData());
            const jpegPath = path.join(UPLOAD_DIR, baseName + ".jpg");
            await convertHeicToJpeg(heicTempPath, jpegPath);
            try { fs.unlinkSync(heicTempPath); } catch {}
            try { fs.unlinkSync(f.path); } catch {}
            key = baseName + ".jpg";
            url = "/uploads/" + baseName + ".jpg";
            fsize = fs.statSync(jpegPath).size;
          }
        } catch (livpErr) {
          console.error("LIVP batch extract failed:", livpErr);
        }
      }

      results.push({ key, url, fsize, originalname: f.originalname });
    }

    res.json({ items: results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取所有文件列表
app.get("/files", (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    const items = files
      .filter(f => f !== ".gitkeep" && f !== "shares" && f !== "thumbs")
      .map(f => {
        const stat = fs.statSync(path.join(UPLOAD_DIR, f));
        return {
          key: f,
          url: "/uploads/" + f,
          fsize: stat.size,
          mtime: stat.mtimeMs
        };
      });
    res.json({ items });
  });
});

// 生成缩略图（200px 宽，WebP quality 60）
app.get("/thumbnail/:key", async (req, res) => {
  try {
    const { key } = req.params;
    if (!key) return res.status(400).json({ error: "key required" });

    const sourcePath = path.join(UPLOAD_DIR, key);
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: "not found" });
    }

    // Use WebP for smaller thumbnails
    const thumbName = "thumb_" + path.basename(key, path.extname(key)) + ".webp";
    const thumbPath = path.join(THUMBS_DIR, thumbName);

    // Check if thumbnail already exists in cache
    if (!fs.existsSync(thumbPath)) {
      await sharp(sourcePath)
        .resize(200, undefined, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 60 })
        .toFile(thumbPath);
    }

    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Type", "image/webp");
    res.sendFile(thumbPath);
  } catch (e) {
    // Fallback: return original file if thumbnail fails
    const key = req.params.key;
    const sourcePath = path.join(UPLOAD_DIR, key);
    if (fs.existsSync(sourcePath)) {
      res.sendFile(sourcePath);
    } else {
      res.status(404).json({ error: "not found" });
    }
  }
});

// 删除单张图片
app.post("/delete", (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: "key required" });
    const filePath = path.join(UPLOAD_DIR, key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    // Also remove from metadata
    const meta = loadMeta();
    const idx = meta.findIndex(m => m.key === key);
    if (idx >= 0) {
      meta.splice(idx, 1);
      saveMeta(meta);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 批量删除
app.post("/batch-delete", (req, res) => {
  try {
    const { keys } = req.body;
    if (!keys || !Array.isArray(keys) || keys.length === 0)
      return res.status(400).json({ error: "keys required" });
    let deleted = 0;
    for (const key of keys) {
      const fp = path.join(UPLOAD_DIR, key);
      if (fs.existsSync(fp)) { fs.unlinkSync(fp); deleted++; }
    }
    // Also remove from metadata
    const meta = loadMeta();
    const keySet = new Set(keys);
    const filtered = meta.filter(m => !keySet.has(m.key));
    if (filtered.length !== meta.length) {
      saveMeta(filtered);
    }
    res.json({ success: true, deleted });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== 元数据 API（跨设备同步图片列表和分组） ======

// 获取所有图片元数据
app.get("/meta", (req, res) => {
  try {
    const meta = loadMeta();
    res.json(meta);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 添加/更新图片元数据（上传时调用）
app.post("/meta/add", (req, res) => {
  try {
    const { key, filename, hash } = req.body;
    if (!key) return res.status(400).json({ error: "key required" });

    const meta = loadMeta();
    const existing = meta.find(m => m.key === key);
    if (existing) {
      // Update existing
      if (filename) existing.filename = filename;
      if (hash !== undefined) existing.hash = hash;
    } else {
      meta.push({
        key,
        filename: filename || key,
        hash: hash || "",
        groupIndex: -1,
        timestamp: Date.now(),
        downloaded: false
      });
    }
    saveMeta(meta);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 批量更新分组索引
app.post("/meta/batch-update", (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ error: "updates array required" });
    }

    const meta = loadMeta();
    for (const { key, groupIndex } of updates) {
      const entry = meta.find(m => m.key === key);
      if (entry) {
        entry.groupIndex = groupIndex;
      }
    }
    saveMeta(meta);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 删除元数据
app.post("/meta/delete", (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: "key required" });
    const meta = loadMeta();
    const idx = meta.findIndex(m => m.key === key);
    if (idx >= 0) {
      meta.splice(idx, 1);
      saveMeta(meta);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 批量删除元数据
app.post("/meta/batch-delete", (req, res) => {
  try {
    const { keys } = req.body;
    if (!keys || !Array.isArray(keys)) {
      return res.status(400).json({ error: "keys array required" });
    }
    const meta = loadMeta();
    const keySet = new Set(keys);
    const filtered = meta.filter(m => !keySet.has(m.key));
    saveMeta(filtered);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 同步：获取所有文件 + 元数据合并
app.get("/sync", (req, res) => {
  try {
    const meta = loadMeta();
    const metaMap = {};
    for (const m of meta) {
      metaMap[m.key] = m;
    }

    // List all files on disk
    const diskFiles = fs.readdirSync(UPLOAD_DIR)
      .filter(f => f !== ".gitkeep" && f !== "shares" && f !== "thumbs" && f !== "data")
      .map(f => {
        const stat = fs.statSync(path.join(UPLOAD_DIR, f));
        return { key: f, fsize: stat.size, mtime: stat.mtimeMs };
      });

    // Merge: disk files + stored metadata
    const result = diskFiles.map(f => {
      const m = metaMap[f.key] || {};
      return {
        key: f.key,
        filename: m.filename || f.key,
        hash: m.hash || "",
        groupIndex: m.groupIndex !== undefined ? m.groupIndex : -1,
        timestamp: m.timestamp || f.mtime,
        downloaded: m.downloaded || false,
        fsize: f.fsize
      };
    });

    // Remove stale meta entries (file no longer on disk)
    const diskKeys = new Set(diskFiles.map(f => f.key));
    const cleanedMeta = meta.filter(m => diskKeys.has(m.key));

    // Add new disk files that aren't in meta yet
    for (const f of diskFiles) {
      if (!metaMap[f.key]) {
        cleanedMeta.push({
          key: f.key,
          filename: f.key,
          hash: "",
          groupIndex: -1,
          timestamp: f.mtime,
          downloaded: false
        });
      }
    }

    saveMeta(cleanedMeta);

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== 分享数据 API ======

app.post("/save-share-data", (req, res) => {
  try {
    const { shareId, groups } = req.body;
    if (!shareId || !groups) {
      return res.status(400).json({ error: "shareId and groups required" });
    }
    const filePath = path.join(SHARES_DIR, shareId + ".json");
    const data = { shareId, groups, createdAt: Date.now() };
    fs.writeFileSync(filePath, JSON.stringify(data), "utf-8");
    res.json({ success: true, shareId, url: "/share-data/" + shareId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/share-data/:shareId", (req, res) => {
  try {
    const filePath = path.join(SHARES_DIR, req.params.shareId + ".json");
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "not found" });
    }
    const data = fs.readFileSync(filePath, "utf-8");
    res.json(JSON.parse(data));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/share-data/:shareId", (req, res) => {
  try {
    const filePath = path.join(SHARES_DIR, req.params.shareId + ".json");
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } else {
      res.json({ success: true, note: "not found" });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/cleanup-expired-shares", (req, res) => {
  try {
    const { retainDays = 3 } = req.body;
    const maxAge = retainDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let deleted = 0;
    if (fs.existsSync(SHARES_DIR)) {
      const files = fs.readdirSync(SHARES_DIR);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = path.join(SHARES_DIR, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      }
    }
    res.json({ success: true, deleted });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, "0.0.0.0", () => console.log("API on", PORT));
