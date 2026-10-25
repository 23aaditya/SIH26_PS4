import { deadlineService } from "../services/deadline.service.js";

export const adminController = {
  async processDeadlines(req, res, next) {
    try {
      if (req.user && req.user.accountType === "institution") {
        res.status(403).json({
          error: "Unauthorized: Only administrators or AICTE officers can trigger deadline processing.",
        });
        return;
      }

      const report = await deadlineService.processDeadlines();

      res.json({
        success: true,
        message: "Citizens Charter statutory deadlines evaluated successfully.",
        report,
      });
    } catch (error) {
      next(error);
    }
  },
};
