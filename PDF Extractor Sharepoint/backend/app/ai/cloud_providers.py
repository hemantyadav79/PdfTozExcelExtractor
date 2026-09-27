import httpx
import logging
from typing import Dict, Any

from app.ai.manager import AIProvider, AIProviderException
from app.ai.prompt_templates import SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger("app.ai.cloud_providers")

class OpenAIProvider(AIProvider):
    def extract(self, document_content: str) -> Dict[str, Any]:
        if not self.api_key:
            raise AIProviderException("OpenAI API Key is not configured.")

        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model_name or "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_user_prompt(document_content)}
            ],
            "temperature": 0.0,
            "response_format": {"type": "json_object"}
        }

        try:
            with httpx.Client(timeout=90.0) as client:
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                result = response.json()
                text_out = result["choices"][0]["message"]["content"]
                return self.clean_json_response(text_out)
        except Exception as e:
            logger.error(f"OpenAI extraction failed: {e}")
            raise AIProviderException(f"OpenAI API Error: {str(e)}")

class ClaudeProvider(AIProvider):
    def extract(self, document_content: str) -> Dict[str, Any]:
        if not self.api_key:
            raise AIProviderException("Anthropic API Key is not configured.")

        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model_name or "claude-3-5-sonnet-20240620",
            "max_tokens": 4000,
            "system": SYSTEM_PROMPT,
            "messages": [
                {"role": "user", "content": build_user_prompt(document_content)}
            ],
            "temperature": 0.0
        }

        try:
            with httpx.Client(timeout=90.0) as client:
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                result = response.json()
                text_out = result["content"][0]["text"]
                return self.clean_json_response(text_out)
        except Exception as e:
            logger.error(f"Claude extraction failed: {e}")
            raise AIProviderException(f"Claude API Error: {str(e)}")

class GeminiProvider(AIProvider):
    def extract(self, document_content: str) -> Dict[str, Any]:
        if not self.api_key:
            raise AIProviderException("Gemini API Key is not configured.")

        # Strip prefixes or default to standard model name
        model = self.model_name or "gemini-1.5-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
        headers = {"Content-Type": "application/json"}
        
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": f"{SYSTEM_PROMPT}\n\n{build_user_prompt(document_content)}"}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.0,
                "responseMimeType": "application/json"
            }
        }

        try:
            with httpx.Client(timeout=90.0) as client:
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                result = response.json()
                text_out = result["candidates"][0]["content"]["parts"][0]["text"]
                return self.clean_json_response(text_out)
        except Exception as e:
            logger.error(f"Gemini extraction failed: {e}")
            raise AIProviderException(f"Gemini API Error: {str(e)}")

class OpenRouterProvider(AIProvider):
    def extract(self, document_content: str) -> Dict[str, Any]:
        if not self.api_key:
            raise AIProviderException("OpenRouter API Key is not configured.")

        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model_name or "google/gemini-2.5-flash",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_user_prompt(document_content)}
            ],
            "temperature": 0.0,
            "response_format": {"type": "json_object"},
            "max_tokens": 4000
        }

        try:
            with httpx.Client(timeout=90.0) as client:
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                result = response.json()
                text_out = result["choices"][0]["message"]["content"]
                return self.clean_json_response(text_out)
        except Exception as e:
            logger.error(f"OpenRouter extraction failed: {e}")
            raise AIProviderException(f"OpenRouter API Error: {str(e)}")

class GroqProvider(AIProvider):
    def extract(self, document_content: str) -> Dict[str, Any]:
        if not self.api_key:
            raise AIProviderException("Groq API Key is not configured.")

        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model_name or "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_user_prompt(document_content)}
            ],
            "temperature": 0.0,
            "response_format": {"type": "json_object"}
        }

        try:
            with httpx.Client(timeout=90.0) as client:
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                result = response.json()
                text_out = result["choices"][0]["message"]["content"]
                return self.clean_json_response(text_out)
        except Exception as e:
            logger.error(f"Groq extraction failed: {e}")
            raise AIProviderException(f"Groq API Error: {str(e)}")

