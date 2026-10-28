import { collaborationService } from "../services/collaboration.service.js";

export const collaborationController = {
  async getMyWorkSummary(req, res, next) {
    try {
      const summary = await collaborationService.getMyWorkSummary(req.user);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },

  async getMyWorkList(req, res, next) {
    try {
      const workList = await collaborationService.getMyWorkList(req.user, req.query);
      res.json(workList);
    } catch (err) {
      next(err);
    }
  },

  async getWorkTree(req, res, next) {
    try {
      const tree = await collaborationService.getGlobalWorkTree(req.user);
      res.json(tree);
    } catch (err) {
      next(err);
    }
  },

  async getApplicationWorkTree(req, res, next) {
    try {
      const team = await collaborationService.getApplicationTeamAndContacts(req.params.id, req.user);
      res.json(team);
    } catch (err) {
      next(err);
    }
  },

  async getApplicationContacts(req, res, next) {
    try {
      const team = await collaborationService.getApplicationTeamAndContacts(req.params.id, req.user);
      res.json(team.smartContacts);
    } catch (err) {
      next(err);
    }
  },

  async getApplicationMessages(req, res, next) {
    try {
      const messages = await collaborationService.getApplicationMessages(req.params.id, req.user);
      res.json(messages);
    } catch (err) {
      next(err);
    }
  },

  async sendApplicationMessage(req, res, next) {
    try {
      const message = await collaborationService.sendApplicationMessage(req.params.id, req.user, req.body);
      res.status(201).json(message);
    } catch (err) {
      next(err);
    }
  },

  async getEligibleDelegationUsers(req, res, next) {
    try {
      const appId = req.query.applicationId || req.params.id;
      const eligible = await collaborationService.getEligibleDelegationUsers(appId, req.user);
      res.json(eligible);
    } catch (err) {
      next(err);
    }
  },

  async getDelegations(req, res, next) {
    try {
      const delegations = await collaborationService.getDelegations(req.user, req.query);
      res.json(delegations);
    } catch (err) {
      next(err);
    }
  },

  async createDelegation(req, res, next) {
    try {
      const delegation = await collaborationService.createDelegation(req.user, req.body);
      res.status(201).json(delegation);
    } catch (err) {
      next(err);
    }
  },

  async acceptDelegation(req, res, next) {
    try {
      const updated = await collaborationService.updateDelegationStatus(req.params.id, req.user, "accept", req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async declineDelegation(req, res, next) {
    try {
      const updated = await collaborationService.updateDelegationStatus(req.params.id, req.user, "decline", req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async startDelegation(req, res, next) {
    try {
      const updated = await collaborationService.updateDelegationStatus(req.params.id, req.user, "start", req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async completeDelegation(req, res, next) {
    try {
      const updated = await collaborationService.updateDelegationStatus(req.params.id, req.user, "complete", req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async cancelDelegation(req, res, next) {
    try {
      const updated = await collaborationService.updateDelegationStatus(req.params.id, req.user, "cancel", req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async getTeamWorkload(req, res, next) {
    try {
      const workload = await collaborationService.getSupervisorTeamWorkload(req.user);
      res.json(workload);
    } catch (err) {
      next(err);
    }
  },

  async getAvailability(req, res, next) {
    try {
      const availability = await collaborationService.getAvailability(req.user);
      res.json(availability);
    } catch (err) {
      next(err);
    }
  },

  async updateAvailability(req, res, next) {
    try {
      const updated = await collaborationService.updateAvailability(req.user, req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
};
