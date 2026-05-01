import crcmod

def generate_static_pix(pix_key: str, amount: float, merchant_name: str, city: str):
    """
    Generates a static PIX BRCode (EMV Standard).
    """
    def f_id(id_val: str, value: str):
        return f"{id_val}{len(value):02d}{value}"

    # Build the payload
    payload = [
        f_id("00", "01"),  # Payload Format Indicator
        f_id("26", f_id("00", "br.gov.bcb.pix") + f_id("01", pix_key)),  # Merchant Account Information
        f_id("52", "0000"),  # Merchant Category Code
        f_id("53", "986"),   # Transaction Currency (BRL)
        f_id("54", f"{amount:.2f}"),  # Transaction Amount
        f_id("58", "BR"),    # Country Code
        f_id("59", merchant_name[:25]),  # Merchant Name
        f_id("60", city[:15]),           # Merchant City
        f_id("62", f_id("05", "***")),   # Additional Data Field Template (Reference)
    ]
    
    payload_str = "".join(payload) + "6304"
    
    # Calculate CRC16
    crc16 = crcmod.predefined.Crc('crc-16-ccitt-false')
    crc16.update(payload_str.encode('utf-8'))
    checksum = crc16.hexdigest().upper()
    
    return f"{payload_str}{checksum}"
