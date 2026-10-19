
import { randomUUID } from "node:crypto";
import { getCloudinary } from "../config/cloudinary.js";

let cloudinaryOperations = {
  upload: uploadWithCloudinary,
  destroy: deleteWithCloudinary,
};

function uploadWithCloudinary(filePath, options) {
  return getCloudinary().uploader.upload(filePath, options);
}

function deleteWithCloudinary(publicId, options) {
  return getCloudinary().uploader.destroy(publicId, options);
}

// Allows tests to inject fake operations without contacting Cloudinary.
export function setCloudinaryOperationsForTesting(operations) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Cloudinary overrides are only allowed in tests.");
  }

  cloudinaryOperations = {
    upload: operations.upload,
    destroy: operations.destroy,
  };
}

export function resetCloudinaryOperationsForTesting() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Cloudinary overrides are only allowed in tests.");
  }

  cloudinaryOperations = {
    upload: uploadWithCloudinary,
    destroy: deleteWithCloudinary,
  };
}

export async function uploadImageToCloudinary(filePath) {
  if (!filePath) {
    throw new Error("A processed image path is required.");
  }

  const result = await cloudinaryOperations.upload(filePath, {
    folder: "findora/items",
    public_id: randomUUID(),
    resource_type: "image",
    overwrite: false,
    use_filename: false,
    unique_filename: false,
  });

  const isValidCloudinaryUrl = (value) => {
    try {
      const url = new URL(value);

      return (
        url.protocol === "https:" &&
        url.hostname === "res.cloudinary.com"
      );
    } catch {
      return false;
    }
  };

  // Validate Cloudinary's response before saving its image reference.
  if (
    !result ||
    typeof result.secure_url !== "string" ||
    !isValidCloudinaryUrl(result.secure_url) ||
    typeof result.public_id !== "string" ||
    !result.public_id.trim()
  ) {
    // Clean up an uploaded image if Cloudinary returned an invalid response.
    if (result?.public_id) {
      await cloudinaryOperations
        .destroy(result.public_id, {
          resource_type: "image",
          invalidate: true,
        })
        .catch(() => {});
    }

    throw new Error("Cloudinary returned an invalid image reference.");
  }

  return {
    imageUrl: result.secure_url,
    imagePublicId: result.public_id,
  };
}

export async function deleteCloudinaryImage(publicId) {
  if (!publicId) {
    return;
  }

  return cloudinaryOperations.destroy(publicId, {
    resource_type: "image",
    invalidate: true,
  });
}
