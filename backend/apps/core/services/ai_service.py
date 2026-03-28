class AIService:
    """
    Serviço base para futura integração com IA.
    Troque a implementação por OpenAI, Gemini, Claude, etc.
    """

    def __init__(self, provider=None):
        self.provider = provider or "stub"

    def healthcheck(self):
        return {
            "status": "ok",
            "provider": self.provider,
        }

    def generate(self, prompt: str) -> dict:
        return {
            "provider": self.provider,
            "prompt": prompt,
            "response": "Implementacao de IA ainda nao configurada."
        }
