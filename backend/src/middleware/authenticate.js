import prisma from "../db/prisma.js";
import { staffAuthService } from "../services/staffAuth.service.js";

export const SESSION_COOKIE_NAME = "aicte_auth_uid";

export async function authenticate(req, res, next) {
  try {
    const headerUid = req.headers["x-user-id"];
    const cookieUid = req.cookies?.[SESSION_COOKIE_NAME];
    const authHeader = req.headers.authorization;
    const bearerUid = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const activeWorkspace = req.headers["x-committee-workspace"] || req.query?.committeeWorkspace;

    const targetUid = headerUid || cookieUid || bearerUid;

    if (targetUid) {
      // 1. First check if it's an AICTE Staff member (by ID, employeeCode, or email)
      const staffAuth = await staffAuthService.resolveStaffAuthority(targetUid, activeWorkspace);
      if (staffAuth) {
        req.user = {
          id: staffAuth.employeeCode,
          staffId: staffAuth.id,
          employeeCode: staffAuth.employeeCode,
          name: staffAuth.name,
          email: staffAuth.email,
          role: staffAuth.role,
          accountType: "aicte",
          platformRoles: staffAuth.platformRoles,
          permissions: staffAuth.permissions,
        };
        req.staff = staffAuth;
        return next();
      }

      // 2. Check standard User table (e.g. Institution users)
      const user = await prisma.user.findUnique({
        where: { id: targetUid },
        include: { institution: true },
      });

      if (user && user.active) {
        // If user is aicte, also attempt to load staff authority
        let staffProfile = null;
        if (user.accountType === "aicte" || user.id.startsWith("DEMO-AIC-")) {
          staffProfile = await staffAuthService.resolveStaffAuthority(user.email || user.id, activeWorkspace);
        }

        req.user = {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          accountType: user.accountType,
          institutionId: user.institutionId,
          regionId: user.regionId,
          institutionName: user.institution?.institutionName,
          platformRoles: staffProfile?.platformRoles || [],
          permissions: staffProfile?.permissions || [],
        };
        req.staff = staffProfile;
        return next();
      }
    }

    // Default to demo persona in local hackathon mode if none provided
    // but only when hitting non-auth endpoints
    if (!req.path.includes("/auth/")) {
      const defaultUser = await prisma.user.findUnique({
        where: { id: "inst-user-1" },
        include: { institution: true },
      });

      if (defaultUser) {
        req.user = {
          id: defaultUser.id,
          name: defaultUser.name,
          email: defaultUser.email,
          role: defaultUser.role,
          accountType: defaultUser.accountType,
          institutionId: defaultUser.institutionId,
          regionId: defaultUser.regionId,
          institutionName: defaultUser.institution?.institutionName,
          permissions: [],
        };
      }
    }

    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);
    next(error);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required. Please sign in." });
    return;
  }
  next();
}
