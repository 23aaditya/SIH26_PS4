"""
Groq LLM Integration Module for AICTE Scrutiny Assistant (Phase 3).
Provides isolated, qualitative, advisory LLM scrutiny alongside deterministic statutory rules.
"""
from models.schemas import LLMFinding, LLMAnalysisResult
from llm.scrutiny_agent import scrutiny_agent

__all__ = ["LLMFinding", "LLMAnalysisResult", "scrutiny_agent"]
