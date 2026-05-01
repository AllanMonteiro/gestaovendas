from __future__ import annotations

import requests


class EntregasExpressasClient:
    def __init__(self, endpoint_url: str, auth_token: str | None = None):
        self.endpoint_url = endpoint_url.strip()
        self.auth_token = (auth_token or '').strip()

    def send_order(self, payload: dict) -> dict:
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
        if self.auth_token:
            headers['Authorization'] = f'Bearer {self.auth_token}'

        response = requests.post(
            self.endpoint_url,
            headers=headers,
            json=payload,
            timeout=20,
        )
        response.raise_for_status()

        if not response.content:
            return {}

        try:
            return response.json()
        except ValueError:
            return {'raw_response': response.text}
