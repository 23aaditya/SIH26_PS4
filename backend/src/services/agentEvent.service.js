/**
 * Service to dispatch lifecycle events to the AI Scrutiny and Lifecycle Agent microservice.
 * Non-blocking, resilient, and authenticated with machine-to-machine service token.
 */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
const AI_BACKEND_SECRET = process.env.AI_BACKEND_SECRET || "aicte_agent_secret_prod_2026_x89f_secure_token";

export const agentEventService = {
  /**
   * Dispatch an application lifecycle event to the Python AI service.
   * Runs asynchronously without blocking client request response.
   */
  async dispatchLifecycleEvent(eventType, applicationId, payload = {}, actor = null, correlationId = null) {
    const corrId = correlationId || `${applicationId}:${eventType.toLowerCase()}:${Date.now()}`;
    const body = {
      event_type: eventType,
      application_id: applicationId,
      payload,
      actor: actor || "SYSTEM_WORKFLOW",
      correlation_id: corrId,
    };

    try {
      // Fire-and-forget async fetch
      fetch(`${AI_SERVICE_URL}/api/v1/agent/events?sync=true`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
        },
        body: JSON.stringify(body),
      })
        .then(async (resp) => {
          if (!resp.ok) {
            const txt = await resp.text();
            console.warn(`[AgentEventService] AI service returned HTTP ${resp.status} for event ${eventType}: ${txt.substring(0, 200)}`);
          } else {
            const data = await resp.json();
            console.log(`[AgentEventService] Event ${eventType} for ${applicationId} handled: exec ${data.execution_id} (${data.status})`);
          }
        })
        .catch((err) => {
          console.warn(`[AgentEventService] Failed to deliver event ${eventType} to AI service: ${err.message}`);
        });

      return { dispatched: true, correlationId: corrId };
    } catch (e) {
      console.warn(`[AgentEventService] Immediate dispatch error for ${eventType}:`, e.message);
      return { dispatched: false, error: e.message };
    }
  },
};
