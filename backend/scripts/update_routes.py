from pathlib import Path

p = Path("backend/src/routes/application.routes.js")
c = p.read_text(encoding="utf-8")
target = 'router.delete("/:id/documents/:documentId", requireAuth, denySystemService, applicationController.deleteDocument);'
replacement = (
    target + '\n\n'
    '// Document AI Pre-Validation (Institute side)\n'
    'router.post("/:id/documents/:documentId/prevalidate", requireAuth, denySystemService, applicationController.prevalidateDocument);\n'
    'router.get("/:id/documents/:documentId/prevalidation", requireAuth, denySystemService, applicationController.getPrevalidation);'
)
assert target in c, "target route not found"
p.write_text(c.replace(target, replacement), encoding="utf-8")
print("Routes updated successfully")
