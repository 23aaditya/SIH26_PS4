import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOADS_FOLDER = path.resolve(process.env.UPLOAD_DIR || "./uploads");

// Ensure upload directory exists
if (!fs.existsSync(UPLOADS_FOLDER)) {
  fs.mkdirSync(UPLOADS_FOLDER, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const appId = req.params?.id || req.params?.applicationId || req.body?.applicationId;
    let targetFolder = UPLOADS_FOLDER;
    if (appId) {
      targetFolder = path.join(UPLOADS_FOLDER, "applications", appId.replace(/[^a-zA-Z0-9_-]/g, ""));
    }
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }
    cb(null, targetFolder);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const sanitizedOriginal = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `${uniqueSuffix}-${sanitizedOriginal}`);
  },
});

function fileFilter(_req, file, cb) {
  const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed formats: ${allowedExtensions.join(", ")}`));
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB maximum
  },
});

export { UPLOADS_FOLDER };
