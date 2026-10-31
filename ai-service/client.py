import json
import logging
import httpx
from typing import Dict, Any, Tuple, Optional, List
from config import settings

logger = logging.getLogger("ai_scrutiny_client")

class BackendClient:
    def __init__(self):
        self.base_url = settings.EXPRESS_BACKEND_URL.rstrip("/")
        self.headers = {
            "X-Service-Authorization": f"Bearer {settings.AI_BACKEND_SECRET}",
        }

    async def get_application(self, application_id: str) -> Dict[str, Any]:
        """Fetch the full application dossier from Express backend."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self.base_url}/aicte/applications/{application_id}",
                headers=self.headers,
            )
            resp.raise_for_status()
            return resp.json()

    async def download_document(self, document_id: str) -> Tuple[bytes, str]:
        """Download a document stream from Express backend."""
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(
                f"{self.base_url}/documents/{document_id}/download",
                headers=self.headers,
            )
            resp.raise_for_status()
            content_disposition = resp.headers.get("content-disposition", "")
            filename = "document.pdf"
            if "filename=" in content_disposition:
                filename = content_disposition.split("filename=")[-1].strip('"\' ')
            return resp.content, filename

    async def get_application_reports(self, application_id: str) -> List[Dict[str, Any]]:
        """Fetch all reports for an application from Express backend."""
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.get(
                    f"{self.base_url}/aicte/applications/{application_id}/reports",
                    headers=self.headers,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return data if isinstance(data, list) else []
        except Exception as e:
            logger.warning(f"Could not fetch reports for application {application_id}: {e}")
        return []

    async def find_existing_report_by_version(
        self, application_id: str, version_hash: str
    ) -> Optional[str]:
        """
        Check if an AI_SCRUTINY_PRE_CHECK report for this exact version hash already exists on Express.
        Guarantees retry-safe execution without creating duplicate ReviewReport records.
        """
        try:
            reports = await self.get_application_reports(application_id)
            for r in reports:
                    if r.get("reportType") == "AI_SCRUTINY_PRE_CHECK":
                        meta_str = r.get("metadataJson")
                        if meta_str:
                            try:
                                meta = json.loads(meta_str)
                                if meta.get("versionHash") == version_hash:
                                    logger.info(
                                        f"Found existing AI report {r.get('id')} matching version hash {version_hash[:10]}..."
                                    )
                                    return r.get("id")
                            except Exception:
                                pass
        except Exception as e:
            logger.warning(f"Could not check existing reports on backend: {e}")

        return None

    async def submit_pre_check_report(self, application_id: str, report_data: Dict[str, Any]) -> Dict[str, Any]:
        """Submit the AI Scrutiny pre-check advisory report to Express backend."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.base_url}/aicte/applications/{application_id}/reports",
                headers={**self.headers, "Content-Type": "application/json"},
                json=report_data,
            )
            resp.raise_for_status()
            return resp.json()

    async def create_internal_notification(
        self,
        application_id: str,
        recipient_id: str,
        title: str,
        message: str,
        priority: str = "normal",
        action_url: Optional[str] = None,
        deduplication_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Send an internal officer notification through Express backend."""
        payload = {
            "applicationId": application_id,
            "recipientUserId": recipient_id,
            "title": title,
            "message": message,
            "priority": priority,
            "actionUrl": action_url,
            "deduplicationKey": deduplication_key,
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.base_url}/agent/notifications",
                headers={**self.headers, "Content-Type": "application/json"},
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

backend_client = BackendClient()
