import os
import json
import logging
import requests
import google.generativeai as genai
from django.conf import settings

logger = logging.getLogger(__name__)

class AIClient:
    def __init__(self):
        self.provider = os.getenv("AI_PROVIDER", "gemini").lower()
        self.api_key = os.getenv("AI_API_KEY")
        self.base_url = os.getenv("AI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.model_name = os.getenv("AI_MODEL", "gemini-1.5-flash")

    def is_configured(self):
        return bool(self.api_key)

    def converse_order(self, text: str, current_state: dict) -> dict:
        """
        Maintains conversation context to complete the order. 
        Returns { status: string, updated_order: dict, response_text: string }.
        """
        if not self.is_configured():
            return None

        system_prompt = f"""
        Você é um atendente virtual de uma sorveteria e açaí via WhatsApp.
        Seu objetivo é extrair o pedido completo do cliente através de uma conversa.
        O estado atual do pedido é: {json.dumps(current_state)}

        Instruções:
        1. Analise o novo texto do cliente e atualize o estado do pedido.
        2. Campos obrigatórios para finalizar: customer_name, address, items (com nome e quantidade).
        3. Se algo estiver faltando, pergunte educadamente. Se for açaí, pergunte o tamanho se não houver.
        4. O 'status' deve ser:
           - 'complete': se todos os campos obrigatórios estiverem preenchidos.
           - 'incomplete': se faltar algo. Gere uma 'response_text' com a pergunta.
           - 'invalid': se não for sobre pedido.

        Retorne APENAS um JSON:
        {{
          "status": "complete | incomplete | invalid",
          "updated_order": {{ 
            "customer_name": "...", 
            "address": "...", 
            "items": [..],
            "payment_method": "...",
            "notes": "..."
          }},
          "response_text": "Sua resposta curta e amigável ao cliente"
        }}
        """

        if self.provider == "gemini":
            return self._extract_gemini(text, system_prompt)
        else:
            return self._extract_openai(text, system_prompt)

    def _extract_openai(self, text: str, system_prompt: str) -> dict:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model_name,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
        }

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=45)
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            return json.loads(content)
        except Exception as e:
            logger.error(f"Error extracting order with OpenAI: {e}")
            return None

    def _extract_gemini(self, text: str, system_prompt: str) -> dict:
        try:
            genai.configure(api_key=self.api_key)
            model = genai.GenerativeModel(self.model_name)
            prompt = f"{system_prompt}\n\nTexto do pedido: \"{text}\""
            response = model.generate_content(prompt)
            
            clean_text = response.text.strip()
            # Basic markdown cleaning
            if "```" in clean_text:
                clean_text = clean_text.split("```")[1]
                if clean_text.startswith("json"):
                    clean_text = clean_text[4:]
            
            return json.loads(clean_text)
        except Exception as e:
            logger.error(f"Error extracting order with Gemini: {e}")
            return None
