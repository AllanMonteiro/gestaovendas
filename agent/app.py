import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from utils.config import settings
from printers.templates import format_receipt
from printers.escpos_receipt import print_escpos
from scale.serial_scale import SerialScale

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

scale = SerialScale(settings.scale_port, settings.scale_baud, settings.scale_timeout_ms)
if settings.scale_enabled:
    scale.start()


class PrintPayload(BaseModel):
    payload: dict


@app.get('/health')
async def health():
    return {'status': 'ok'}


@app.post('/print/receipt')
async def print_receipt(body: dict):
    lines = format_receipt(body, width=42)
    print_escpos(lines)
    return {'status': 'printed'}


@app.post('/print/kitchen')
async def print_kitchen(body: dict):
    lines = format_receipt(body, width=42)
    print_escpos(lines)
    return {'status': 'printed'}


@app.post('/scale/config')
async def scale_config(body: dict):
    return {'status': 'ok'}


@app.websocket('/ws/print')
async def ws_print(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            job_type = data.get('type')
            payload = data.get('payload', {})
            lines = format_receipt(payload, width=42)
            print_escpos(lines)
            await ws.send_json({'status': 'ok', 'type': job_type})
    except WebSocketDisconnect:
        return


@app.websocket('/ws/scale')
async def ws_scale(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            grams = scale.last_grams()
            if grams is not None:
                await ws.send_json({'grams': grams, 'stable': True, 'at': asyncio.get_event_loop().time()})
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        return


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(app, host=settings.host, port=settings.port)
