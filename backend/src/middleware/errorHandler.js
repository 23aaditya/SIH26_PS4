import { ZodError } from "zod";
import multer from "multer";

export function errorHandler(err, _req, res, _next) {
  console.error("Express Error Handler:", err);

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: err.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({
        success: false,
        error: "File exceeds the maximum allowed size of 10 MB.",
        message: "File exceeds the maximum allowed size of 10 MB.",
      });
      return;
    }
    res.status(400).json({ error: `File upload error: ${err.message}` });
    return;
  }

  if (err.missingFields || err.missingDocuments || err.validationErrors) {
    res.status(400).json({
      success: false,
      message: err.message,
      error: err.message,
      missingFields: err.missingFields || undefined,
      missingDocuments: err.missingDocuments || undefined,
      validationErrors: err.validationErrors || undefined,
    });
    return;
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || "Internal server error";

  res.status(statusCode).json({
    success: false,
    error: message,
    message,
    code: err.code || undefined,
    activeDeficiency: err.activeDeficiency || undefined,
  });
}
