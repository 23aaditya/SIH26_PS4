import prisma from "../db/prisma.js";

export const notificationController = {
  async list(req, res, next) {
    try {
      if (!req.user) {
        res.json([]);
        return;
      }

      const notifs = await prisma.notification.findMany({
        where: { recipientUserId: req.user.id },
        orderBy: { createdAt: "desc" },
      });

      res.json(notifs);
    } catch (error) {
      next(error);
    }
  },

  async markRead(req, res, next) {
    try {
      const { id } = req.body;
      if (!id) {
        res.status(400).json({ error: "Notification id required" });
        return;
      }

      const updated = await prisma.notification.update({
        where: { id },
        data: { read: true },
      });

      res.json({ success: true, notification: updated });
    } catch (error) {
      next(error);
    }
  },

  async markAllRead(req, res, next) {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      await prisma.notification.updateMany({
        where: { recipientUserId: req.user.id, read: false },
        data: { read: true },
      });

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
};
