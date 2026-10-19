
import multer from "multer";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, unlink } from "node:fs/promises";
import { fileTypeFromFile } from "file-type";
import sharp from "sharp";

import mongoose from "mongoose";
import Item from "../models/Item.js";

const temporaryDirectory = path.resolve("tmp", "uploads");

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const outputFormats = {
  "image/jpeg": { format: "jpeg", extension: ".jpg" },
  "image/png": { format: "png", extension: ".png" },
  "image/webp": { format: "webp", extension: ".webp" },
};

await mkdir(temporaryDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, temporaryDirectory);
  },

  filename: (_req, _file, callback) => {
    callback(null, randomUUID());
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 0,
    parts: 1,
  },

  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(
        new Error("Only JPEG, PNG, and WebP images are allowed")
      );
    }

    callback(null, true);
  },
});

export async function validateUploadedImage(req, res, next) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Please select an image to upload",
    });
  }

  let outputPath;

  try {
    const detectedType = await fileTypeFromFile(req.file.path);

    if (
      !detectedType ||
      !allowedMimeTypes.has(detectedType.mime) ||
      detectedType.mime !== req.file.mimetype
    ) {
      return res.status(400).json({
        success: false,
        message: "The uploaded file is not a supported image",
      });
    }

    const output = outputFormats[detectedType.mime];
    const filename = `${randomUUID()}${output.extension}`;
    outputPath = path.join(temporaryDirectory, `processed-${filename}`);

    await sharp(req.file.path, {
      limitInputPixels: 40_000_000,
      failOn: "error",
    })
      .rotate()
      .toFormat(output.format)
      .toFile(outputPath);

    req.processedImage = {
      filename,
      path: outputPath,
      mimeType: detectedType.mime,
    };

    await unlink(req.file.path).catch(() => {});
    return next();
  } catch {
    if (outputPath) {
      await unlink(outputPath).catch(() => {});
    }

    return res.status(400).json({
      success: false,
      message: "The uploaded file is not a valid, processable image",
    });
  } finally {
    if (req.file?.path) {
      await unlink(req.file.path).catch(() => {});
    }
  }
}

export async function removeUploadedFile(filePath) {
  if (filePath) {
    await unlink(filePath).catch(() => {});
  }
}

export async function authorizeItemImageUpload(req, res, next) {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid item ID",
    });
  }

  try {
    const item = await Item.findById(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    const userId = req.user?._id ?? req.user?.id;
    const ownerId = item.owner?._id ?? item.owner;

    if (!userId || !ownerId || ownerId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to upload an image for this item",
      });
    }

    req.item = item;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function handleImageUploadError(error, req, res, next) {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: "Image must not exceed 5 MB",
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid image upload request",
    });
  }

  if (error.message === "Only JPEG, PNG, and WebP images are allowed") {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  return next(error);
}

export default upload;
