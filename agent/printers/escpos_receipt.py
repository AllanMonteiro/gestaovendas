from typing import List
from escpos.printer import Usb, Network
from utils.config import settings


def print_escpos(lines: List[str]):
    printer = None
    if settings.printer_conn == 'net':
        printer = Network(settings.printer_net_host, settings.printer_net_port)
    else:
        printer = Usb(0x0000, 0x0000, 0)  # Vendor/Product IDs may need update

    for line in lines:
        printer.text(line + '\n')
    printer.cut()
    printer.close()
