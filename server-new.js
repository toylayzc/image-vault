const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = 3000;

// 上传目录
const UPLOAD_DIR = "/www/wwwroot/api/uploads";
const SHARES_DIR = path.join(UPLOAD_DIR, "shares");

// 确保 shares 目录存在
if (!fs.existsSync(SHARES_DIR)) {
  fs.mkdirSync(SHARES_DIR, { recursive: true });
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
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB 限制
});

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => res.json({ status: "ok", message: "API running" }));

// 上传图片
app.post("/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no file" });
    res.json({
      key: req.file.filename,
      url: "/uploads/" + req.file.filename,
      fsize: req.file.size,
      originalname: req.file.originalname
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 批量上传（兼容多选）
app.post("/uploads", upload.array("files", 200), (req, res) => {
  try {
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ error: "no files" });
    const results = req.files.map(f => ({
      key: f.filename,
      url: "/uploads/" + f.filename,
      fsize: f.size,
      originalname: f.originalname
    }));
    res.json({ items: results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取所有文件列表（给前端做去重和展示用）
app.get("/files", (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    const items = files
      .filter(f => f !== ".gitkeep" && f !== "shares")
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

// 删除单张图片
app.post("/delete", (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: "key required" });
    const filePath = path.join(UPLOAD_DIR, key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } else {
      res.json({ success: true, note: "not found" });
    }
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
    res.json({ success: true, deleted });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ====== 分享数据 API ======

// 保存分享数据（使用自定义文件名）
app.post("/save-share-data", (req, res) => {
  try {
    const { shareId, groups } = req.body;
    if (!shareId || !groups) {
      return res.status(400).json({ error: "shareId and groups required" });
    }
    const filePath = path.join(SHARES_DIR, shareId + ".json");
    const data = {
      shareId,
      groups,
      createdAt: Date.now()
    };
    fs.writeFileSync(filePath, JSON.stringify(data), "utf-8");
    res.json({ success: true, shareId, url: "/share-data/" + shareId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取分享数据
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

// 删除分享数据
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

// 清理过期分享（由前端定时调用或手动触发）
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
