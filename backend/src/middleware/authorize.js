/**
 * Authorization Middleware for AICTE Role-Based Authority System
 */

export function requirePermission(permissionCode) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const permissions = req.staff?.permissions || req.user?.permissions || [];
    const isSuperAdmin = req.staff?.platformRoles?.includes("SUPER_ADMIN") || req.user?.platformRoles?.includes("SUPER_ADMIN");

    if (isSuperAdmin || permissions.includes(permissionCode)) {
      return next();
    }

    return res.status(403).json({
      error: `Access denied. Required authority permission: '${permissionCode}'`,
      code: "INSUFFICIENT_PERMISSIONS",
      requiredPermission: permissionCode,
    });
  };
}

export function requireCommitteeMembership(committeeCode) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const isSuperAdmin = req.staff?.platformRoles?.includes("SUPER_ADMIN") || req.user?.platformRoles?.includes("SUPER_ADMIN");
    if (isSuperAdmin) {
      return next();
    }

    const memberships = req.staff?.committeeMemberships || [];
    const hasMembership = memberships.some(
      (m) => m.committeeCode === committeeCode && m.status === "ACTIVE"
    );

    if (hasMembership) {
      return next();
    }

    return res.status(403).json({
      error: `Access denied. Active membership in committee '${committeeCode}' is required.`,
      code: "NOT_A_COMMITTEE_MEMBER",
      requiredCommittee: committeeCode,
    });
  };
}

export function requirePlatformRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const userRoles = req.staff?.platformRoles || req.user?.platformRoles || [];
    const isSuperAdmin = userRoles.includes("SUPER_ADMIN");

    if (isSuperAdmin || allowedRoles.some((r) => userRoles.includes(r))) {
      return next();
    }

    return res.status(403).json({
      error: `Access denied. One of following roles required: ${allowedRoles.join(", ")}`,
      code: "INSUFFICIENT_ROLE",
      allowedRoles,
    });
  };
}
