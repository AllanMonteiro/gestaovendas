import win32print

try:
    printers = win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)
    print("Available Printers:")
    for printer in printers:
        print(f" - {printer[2]}")
    print("\nUpdate your agent/.env with:")
    print("PRINTER_CONN=win32")
    print("PRINTER_NAME=\"<one of the names above>\"")
except Exception as e:
    print(f"Error enumerating printers: {e}")
