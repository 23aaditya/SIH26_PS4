"""
Durable SQLite persistence store for AICTE Application Lifecycle Agent executions and actions.
Guarantees idempotency, restart recovery, transaction safety, and auditability.
"""

import sqlite3
import json
import uuid
import time
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from config import settings

logger = logging.getLogger("agent_store")


def get_connection():
    conn = sqlite3.connect(settings.DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn


def execute_with_retry(func, max_retries=3, delay=0.1):
    """Execute SQLite operations with bounded retries on lock contention."""
    last_err = None
    for attempt in range(max_retries):
        try:
            return func()
        except sqlite3.OperationalError as e:
            last_err = e
            if "locked" in str(e).lower() or "busy" in str(e).lower():
                time.sleep(delay * (2 ** attempt))
            else:
                raise
    raise last_err


def init_agent_tables():
    """Initialize agent tables and indexes idempotently."""
    def _init():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=NORMAL;")

            # 1. Executions table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS agent_executions (
                    execution_id TEXT PRIMARY KEY,
                    application_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    correlation_id TEXT UNIQUE,
                    status TEXT NOT NULL,
                    current_step TEXT,
                    payload_json TEXT,
                    context_json TEXT,
                    result_json TEXT,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    completed_at TEXT
                )
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_agent_exec_app
                ON agent_executions (application_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_agent_exec_status
                ON agent_executions (status)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_agent_exec_correlation
                ON agent_executions (correlation_id)
            """)

            # 2. Actions table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS agent_actions (
                    action_id TEXT PRIMARY KEY,
                    execution_id TEXT NOT NULL,
                    application_id TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    requires_approval INTEGER DEFAULT 0,
                    rationale TEXT,
                    input_payload_json TEXT,
                    output_payload_json TEXT,
                    approved_by TEXT,
                    approved_at TEXT,
                    rejection_reason TEXT,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_agent_act_exec
                ON agent_actions (execution_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_agent_act_app
                ON agent_actions (application_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_agent_act_status
                ON agent_actions (status)
            """)

            conn.commit()
            logger.info("Agent execution and action tables verified in SQLite.")
        finally:
            conn.close()

    execute_with_retry(_init)


def get_execution_by_correlation_id(correlation_id: str) -> Optional[Dict[str, Any]]:
    """Check if an execution already exists for this exact correlation ID."""
    if not correlation_id:
        return None

    def _query():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM agent_executions WHERE correlation_id = ? LIMIT 1",
                (correlation_id,),
            )
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    return execute_with_retry(_query)


def get_execution(execution_id: str) -> Optional[Dict[str, Any]]:
    """Fetch an execution by ID."""
    def _query():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM agent_executions WHERE execution_id = ? LIMIT 1",
                (execution_id,),
            )
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    return execute_with_retry(_query)


def create_execution(
    application_id: str,
    event_type: str,
    correlation_id: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create a new agent execution idempotently."""
    if correlation_id:
        existing = get_execution_by_correlation_id(correlation_id)
        if existing:
            logger.info(f"Reusing existing execution {existing['execution_id']} for correlation {correlation_id}")
            return existing

    exec_id = f"exec-{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    payload_str = json.dumps(payload or {})

    def _insert():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO agent_executions (
                    execution_id, application_id, event_type, correlation_id,
                    status, payload_json, context_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'PENDING', ?, '{}', ?, ?)
                """,
                (exec_id, application_id, event_type, correlation_id, payload_str, now_iso, now_iso),
            )
            conn.commit()
            return {
                "execution_id": exec_id,
                "application_id": application_id,
                "event_type": event_type,
                "correlation_id": correlation_id,
                "status": "PENDING",
                "payload_json": payload_str,
                "created_at": now_iso,
                "updated_at": now_iso,
            }
        except sqlite3.IntegrityError:
            if correlation_id:
                return get_execution_by_correlation_id(correlation_id)
            raise
        finally:
            conn.close()

    return execute_with_retry(_insert)


def update_execution(
    execution_id: str,
    status: Optional[str] = None,
    current_step: Optional[str] = None,
    result: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
    error_message: Optional[str] = None,
) -> Dict[str, Any]:
    """Update execution progress, status, and metadata."""
    now_iso = datetime.now(timezone.utc).isoformat()

    def _update():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            updates = ["updated_at = ?"]
            params = [now_iso]

            if status is not None:
                updates.append("status = ?")
                params.append(status)
                if status in ("COMPLETED", "FAILED", "PARTIAL_FAILURE"):
                    updates.append("completed_at = ?")
                    params.append(now_iso)

            if current_step is not None:
                updates.append("current_step = ?")
                params.append(current_step)

            if result is not None:
                updates.append("result_json = ?")
                params.append(json.dumps(result))

            if context is not None:
                updates.append("context_json = ?")
                params.append(json.dumps(context))

            if error_message is not None:
                updates.append("error_message = ?")
                params.append(error_message)

            params.append(execution_id)
            cursor.execute(
                f"UPDATE agent_executions SET {', '.join(updates)} WHERE execution_id = ?",
                params,
            )
            conn.commit()
            return get_execution(execution_id)
        finally:
            conn.close()

    return execute_with_retry(_update)


def create_action(
    execution_id: str,
    application_id: str,
    action_type: str,
    input_payload: Optional[Dict[str, Any]] = None,
    requires_approval: bool = False,
    rationale: Optional[str] = None,
) -> Dict[str, Any]:
    """Create an action item under an execution."""
    act_id = f"act-{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    initial_status = "WAITING_FOR_APPROVAL" if requires_approval else "PLANNED"
    input_str = json.dumps(input_payload or {})

    def _insert():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO agent_actions (
                    action_id, execution_id, application_id, action_type,
                    status, requires_approval, rationale, input_payload_json,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    act_id,
                    execution_id,
                    application_id,
                    action_type,
                    initial_status,
                    1 if requires_approval else 0,
                    rationale,
                    input_str,
                    now_iso,
                    now_iso,
                ),
            )
            conn.commit()
            return {
                "action_id": act_id,
                "execution_id": execution_id,
                "application_id": application_id,
                "action_type": action_type,
                "status": initial_status,
                "requires_approval": requires_approval,
                "rationale": rationale,
                "input_payload": input_payload or {},
                "created_at": now_iso,
                "updated_at": now_iso,
            }
        finally:
            conn.close()

    return execute_with_retry(_insert)


def get_action(action_id: str) -> Optional[Dict[str, Any]]:
    """Fetch an action by ID."""
    def _query():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM agent_actions WHERE action_id = ? LIMIT 1",
                (action_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            d = dict(row)
            d["requires_approval"] = bool(d.get("requires_approval"))
            d["input_payload"] = json.loads(d.get("input_payload_json") or "{}")
            d["output_payload"] = json.loads(d.get("output_payload_json") or "{}") if d.get("output_payload_json") else None
            return d
        finally:
            conn.close()

    return execute_with_retry(_query)


def get_actions_for_execution(execution_id: str) -> List[Dict[str, Any]]:
    """Fetch all actions associated with an execution in chronological order."""
    def _query():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM agent_actions WHERE execution_id = ? ORDER BY created_at ASC",
                (execution_id,),
            )
            rows = cursor.fetchall()
            results = []
            for row in rows:
                d = dict(row)
                d["requires_approval"] = bool(d.get("requires_approval"))
                d["input_payload"] = json.loads(d.get("input_payload_json") or "{}")
                d["output_payload"] = json.loads(d.get("output_payload_json") or "{}") if d.get("output_payload_json") else None
                results.append(d)
            return results
        finally:
            conn.close()

    return execute_with_retry(_query)


def get_actions_for_application(
    application_id: str,
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetch all actions for an application, optionally filtered by status."""
    def _query():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            if status:
                cursor.execute(
                    "SELECT * FROM agent_actions WHERE application_id = ? AND status = ? ORDER BY created_at DESC",
                    (application_id, status),
                )
            else:
                cursor.execute(
                    "SELECT * FROM agent_actions WHERE application_id = ? ORDER BY created_at DESC",
                    (application_id,),
                )
            rows = cursor.fetchall()
            results = []
            for row in rows:
                d = dict(row)
                d["requires_approval"] = bool(d.get("requires_approval"))
                d["input_payload"] = json.loads(d.get("input_payload_json") or "{}")
                d["output_payload"] = json.loads(d.get("output_payload_json") or "{}") if d.get("output_payload_json") else None
                results.append(d)
            return results
        finally:
            conn.close()

    return execute_with_retry(_query)


def update_action(
    action_id: str,
    status: Optional[str] = None,
    output_payload: Optional[Dict[str, Any]] = None,
    error_message: Optional[str] = None,
    approved_by: Optional[str] = None,
    rejection_reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Update action status, output, and approval info."""
    now_iso = datetime.now(timezone.utc).isoformat()

    def _update():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            updates = ["updated_at = ?"]
            params = [now_iso]

            if status is not None:
                updates.append("status = ?")
                params.append(status)

            if output_payload is not None:
                updates.append("output_payload_json = ?")
                params.append(json.dumps(output_payload))

            if error_message is not None:
                updates.append("error_message = ?")
                params.append(error_message)

            if approved_by is not None:
                updates.append("approved_by = ?")
                params.append(approved_by)
                updates.append("approved_at = ?")
                params.append(now_iso)

            if rejection_reason is not None:
                updates.append("rejection_reason = ?")
                params.append(rejection_reason)

            params.append(action_id)
            cursor.execute(
                f"UPDATE agent_actions SET {', '.join(updates)} WHERE action_id = ?",
                params,
            )
            conn.commit()
            return get_action(action_id)
        finally:
            conn.close()

    return execute_with_retry(_update)


def reconcile_startup_executions() -> int:
    """Clean up dangling RUNNING executions on server startup."""
    def _reconcile():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE agent_executions
                SET status = 'PARTIAL_FAILURE',
                    error_message = 'Interrupted by server restart',
                    updated_at = ?
                WHERE status = 'RUNNING'
                """,
                (datetime.now(timezone.utc).isoformat(),),
            )
            count = cursor.rowcount
            conn.commit()
            return count
        finally:
            conn.close()

    return execute_with_retry(_reconcile)
