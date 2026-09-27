import json
import re
import logging
from typing import Dict, Any, Optional
from sqlmodel import Session

from app.database.models import ProviderSetting
from app.security.encryption import decrypt_value

logger = logging.getLogger("app.ai.manager")

class AIProviderException(Exception):
    pass

class AIProvider:
    """Base class for all local and cloud AI extraction models."""
    
    def __init__(self, model_name: str, api_key: Optional[str] = None, base_url: Optional[str] = None, additional_params: Optional[Dict[str, Any]] = None):
        self.model_name = model_name
        self.api_key = api_key
        self.base_url = base_url
        self.additional_params = additional_params or {}

    def extract(self, document_content: str) -> Dict[str, Any]:
        """
        Takes raw document text and extracts bank statement information.
        Returns a dictionary representing the standard bank schema.
        """
        raise NotImplementedError("Each provider must implement the 'extract' method.")

    def clean_json_response(self, raw_response: str) -> Dict[str, Any]:
        """
        Cleans LLM response formatting (e.g. removes markdown code blocks, backticks,
        preceding or trailing text) and returns a parsed dictionary.
        """
        cleaned = raw_response.strip()
        
        # Remove markdown wrapping if present
        if cleaned.startswith("```"):
            # Remove opening codeblock like ```json or ```
            cleaned = re.sub(r"^```[a-zA-Z]*\n", "", cleaned)
            # Remove closing codeblock
            cleaned = re.sub(r"\n```$", "", cleaned)
            cleaned = cleaned.strip()

        # Extract only content between the first { and the last }
        try:
            start_idx = cleaned.find("{")
            end_idx = cleaned.rfind("}")
            if start_idx != -1 and end_idx != -1:
                cleaned = cleaned[start_idx : end_idx + 1]
        except Exception:
            pass

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.warning(f"Standard json.loads failed. Attempting json_repair fallback. Error: {e}")
            try:
                import json_repair
                repaired = json_repair.loads(cleaned)
                if isinstance(repaired, dict):
                    logger.info("Successfully repaired and parsed JSON using json_repair.")
                    return repaired
                else:
                    logger.error(f"json_repair parsed successfully but output is {type(repaired)}, not a dictionary.")
            except Exception as e_repair:
                logger.error(f"json_repair fallback also failed: {e_repair}")
                
            raise AIProviderException(
                f"Model response did not yield valid JSON. Decoding failed: {str(e)}"
            )

def get_provider(provider_name: str, db: Session, user_id: Any) -> AIProvider:
    """
    Factory function to fetch settings from DB, decrypt credentials, 
    and return the initialized AIProvider subclass.
    """
    # Import inside factory to avoid circular dependencies
    from app.ai.local_provider import LocalProvider
    from app.ai.cloud_providers import (
        OpenAIProvider,
        ClaudeProvider,
        GeminiProvider,
        OpenRouterProvider,
        GroqProvider
    )
    
    # Query database for setting
    setting = db.query(ProviderSetting).filter(
        ProviderSetting.user_id == user_id,
        ProviderSetting.provider_name == provider_name
    ).first()
    
    # Decrypt API Key if present
    api_key = None
    base_url = None
    model_name = None
    params = {}
    
    if setting:
        if setting.api_key_encrypted:
            try:
                api_key = decrypt_value(setting.api_key_encrypted)
            except Exception as e:
                logger.error(f"Failed to decrypt api key for {provider_name}: {e}")
        base_url = setting.base_url
        model_name = setting.model_name
        
        # Self-healing patch: Automatically repair deprecated/incorrect model names in database
        updated = False
        if model_name in [
            "google/gemini-flash-1.5-exp",
            "google/gemini-flash-1.5",
            "google/gemini-3.5-flash",  # this was a bug — model doesn't exist
        ]:
            model_name = "google/gemini-2.5-flash"
            updated = True
        elif model_name == "llama-3.3-70b-specdec":
            model_name = "llama-3.3-70b-versatile"
            updated = True
            
        if updated:
            try:
                setting.model_name = model_name
                db.add(setting)
                db.commit()
                db.refresh(setting)
                logger.info(f"Automatically patched decommissioned/incorrect model in database to {model_name}.")
            except Exception as e:
                logger.error(f"Failed to auto-patch database setting: {e}")
                
        params = setting.additional_params or {}
    
    # Map name to class
    provider_map = {
        "Ollama": LocalProvider,
        "LMStudio": LocalProvider,
        "OpenAI": OpenAIProvider,
        "Claude": ClaudeProvider,
        "Gemini": GeminiProvider,
        "OpenRouter": OpenRouterProvider,
        "Groq": GroqProvider
    }
    
    provider_cls = provider_map.get(provider_name)
    if not provider_cls:
        raise ValueError(f"Unknown AI Provider: {provider_name}")
        
    # Provide intelligent fallback defaults if settings are not defined in DB
    if not model_name:
        defaults = {
            "Ollama": "qwen2.5:7b",
            "LMStudio": "qwen",
            "OpenAI": "gpt-4o-mini",
            "Claude": "claude-3-5-sonnet-20241022",
            "Gemini": "gemini-1.5-flash",
            "OpenRouter": "google/gemini-2.5-flash",  # Fixed: was incorrectly gemini-3.5-flash
            "Groq": "llama-3.3-70b-versatile"
        }
        model_name = defaults.get(provider_name, "default")
        
    if provider_name == "Ollama" and not base_url:
        from app.config import settings
        base_url = settings.OLLAMA_BASE_URL
        
    return provider_cls(
        model_name=model_name,
        api_key=api_key,
        base_url=base_url,
        additional_params=params
    )
