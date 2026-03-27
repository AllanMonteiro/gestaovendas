import threading
import time
import re
from typing import Optional
import serial


class SerialScale:
    def __init__(self, port: str, baud: int, timeout_ms: int):
        self.port = port
        self.baud = baud
        self.timeout = timeout_ms / 1000
        self._lock = threading.Lock()
        self._last_grams: Optional[int] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=1)

    def _run(self):
        try:
            with serial.Serial(self.port, self.baud, timeout=self.timeout) as ser:
                while self._running:
                    line = ser.readline().decode(errors='ignore').strip()
                    if not line:
                        continue
                    grams = self._parse_grams(line)
                    if grams is not None:
                        with self._lock:
                            self._last_grams = grams
        except Exception as e:
            print(f"Serial Error on {self.port}: {e}")
            time.sleep(2)

    def _parse_grams(self, line: str) -> Optional[int]:
        match = re.search(r'(\d+(?:\.\d+)?)', line)
        if not match:
            return None
        value = float(match.group(1))
        if value < 10:
            return int(value * 1000)
        return int(value)

    def last_grams(self) -> Optional[int]:
        with self._lock:
            return self._last_grams