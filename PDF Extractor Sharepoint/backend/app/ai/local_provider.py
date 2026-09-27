import httpx
import logging
from typing import Dict, Any, Optional

from app.ai.manager import AIProvider, AIProviderException
from app.ai.prompt_templates import SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger("app.ai.local_provider")

class LocalProvider(AIProvider):
    """
    Handles local execution of AI extraction.
    Compatible with Ollama and LM Studio API specifications.
    """
    
    def extract(self, document_content: str) -> Dict[str, Any]:
        user_prompt = build_user_prompt(document_content)
        
        # Check if Ollama or LM Studio (based on URL/Configuration)
        is_ollama = "11434" in (self.base_url or "") or "ollama" in (self.base_url or "").lower() or not self.base_url
        
        if is_ollama:
            url = f"{self.base_url or 'http://localhost:11434'}/api/chat"
            payload = {
                "model": self.model_name,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                "stream": False,
                "options": {
                    "temperature": 0.0,  # Deterministic output for financial data
                },
                "format": "json"  # Forces Ollama to reply with valid JSON
            }
        else:
            # LM Studio / Local OpenAI Compatible Mock
            url = f"{self.base_url or 'http://localhost:1234'}/v1/chat/completions"
            payload = {
                "model": self.model_name,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.0,
                "response_format": {"type": "json_object"}
            }

        try:
            logger.info(f"Sending extraction request to local AI ({self.model_name}) at {url}...")
            # Set high timeout (e.g. 180s) because local LLM extraction of huge documents can take time on CPU/GPU
            with httpx.Client(timeout=180.0) as client:
                response = client.post(url, json=payload)
                response.raise_for_status()
                
                resp_json = response.json()
                
                if is_ollama:
                    text_out = resp_json.get("message", {}).get("content", "")
                else:
                    text_out = resp_json.get("choices", [{}])[0].get("message", {}).get("content", "")
                    
                if not text_out:
                    raise AIProviderException("Local AI response content is empty.")
                    
                # Standardize parsing & cleaning
                return self.clean_json_response(text_out)
                
        except httpx.HTTPError as e:
            logger.error(f"Local AI HTTP connection failed: {e}")
            raise AIProviderException(f"Failed to communicate with local AI server: {str(e)}")
        except Exception as e:
            logger.error(f"Extraction error: {e}")
            raise AIProviderException(f"Error during local model parsing: {str(e)}")
