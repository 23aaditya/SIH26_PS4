import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";

const router = Router();

router.post("/login", authController.login);
router.post("/aicte/login", authController.aicteLogin);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.get("/me", authController.me);
router.post("/switch-demo", authController.switchDemo);
router.post("/register", authController.register);
router.post("/logout", authController.logout);

export default router;
