import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    host = os.getenv('AGENT_HOST', '127.0.0.1')
    port = int(os.getenv('AGENT_PORT', '9876'))
    printer_mode = os.getenv('PRINTER_MODE', 'escpos')
    printer_vendor = os.getenv('PRINTER_VENDOR', 'generic')
    printer_conn = os.getenv('PRINTER_CONN', 'win32') # Can be 'usb', 'net', 'win32', or 'com'
    printer_name = os.getenv('PRINTER_NAME', 'auto') # Name of the shared/installed printer for win32 (or 'auto')
    printer_com_port = os.getenv('PRINTER_COM_PORT', 'COM4') # COM port for serial printer
    printer_net_host = os.getenv('PRINTER_NET_HOST', '192.168.0.50')
    printer_net_port = int(os.getenv('PRINTER_NET_PORT', '9100'))
    receipt_width_mm = int(os.getenv('RECEIPT_WIDTH_MM', '80'))
    printer_bold = os.getenv('PRINTER_BOLD', 'true').lower() == 'true'
    printer_double_strike = os.getenv('PRINTER_DOUBLE_STRIKE', 'true').lower() == 'true'
    scale_enabled = os.getenv('SCALE_ENABLED', 'true').lower() == 'true'
    scale_port = os.getenv('SCALE_PORT', 'COM3')
    scale_baud = int(os.getenv('SCALE_BAUD', '9600'))
    scale_timeout_ms = int(os.getenv('SCALE_TIMEOUT_MS', '800'))
    scale_protocol = os.getenv('SCALE_PROTOCOL', 'generic')


settings = Settings()
