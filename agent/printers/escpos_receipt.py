from typing import List
from escpos.printer import Usb, Network, Serial, Win32Raw
from utils.config import settings


def auto_discover_printer() -> str:
    try:
        import win32print
        printers = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)
        ignore_list = ['microsoft', 'onenote', 'anydesk', 'fax', 'pdf', 'xps', 'webex', 'send to']
        for p in printers:
            name = p[2]
            if not any(ignore in name.lower() for ignore in ignore_list):
                return name
    except Exception as e:
        print(f"Auto-discover error: {e}")
    return ""


def print_escpos(lines: List[str]):
    printer = None
    if settings.printer_conn == 'net':
        printer = Network(settings.printer_net_host, settings.printer_net_port)
    elif settings.printer_conn == 'win32':
        p_name = settings.printer_name
        if p_name.lower() == 'auto':
            p_name = auto_discover_printer()
            if not p_name:
                print("Error: Could not autodiscover a valid Windows printer.")
                return
            print(f"Auto-discovered printer: {p_name}")
        
        try:
            printer = Win32Raw(p_name)
        except Exception as e:
            print(f"Failed to connect to printer '{p_name}': {e}")
            return
    elif settings.printer_conn == 'com':
        printer = Serial(settings.printer_com_port)
    else:
        # Default to Usb but we recommend knowing the vendor/product id
        printer = Usb(0x0000, 0x0000, 0)  # Vendor/Product IDs may need update

    # ensure the connection is established and the text is added
    if printer is None:
        print("Error: Printer not found or configured incorrectly.")
        return

    for line in lines:
        printer.text(line + '\n')
    printer.cut()
    printer.close()
