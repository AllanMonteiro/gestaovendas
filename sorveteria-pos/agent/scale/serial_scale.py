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
        self._last_error: Optional[str] = None
        self._connected = False
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
        while self._running:
            try:
                with serial.Serial(self.port, self.baud, timeout=self.timeout) as ser:
                    with self._lock:
                        self._connected = True
                        self._last_error = None
                    while self._running:
                        line = ser.readline().decode(errors='ignore').strip()
                        if not line:
                            continue
                        grams = self._parse_grams(line)
                        if grams is not None:
                            with self._lock:
                                self._last_grams = grams
                                self._connected = True
                                self._last_error = None
            except Exception as e:
                with self._lock:
                    self._connected = False
                    self._last_error = str(e)
                print(f"Serial Error on {self.port}: {e}")
                if self._running:
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

    def status(self):
        with self._lock:
            return {
                'connected': self._connected,
                'port': self.port,
                'baud': self.baud,
                'last_grams': self._last_grams,
                'last_error': self._last_error,
            }

    def simulate(self, grams: int):
        with self._lock:
            self._last_grams = grams
            self._connected = True
            self._last_error = None
