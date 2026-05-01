import json
import logging
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings

from apps.sales.consumers import broadcast_delivery_event
from apps.core.integrations.ai_client import AIClient
from .models import WhatsAppSession
from .parser_ai import parse_order_hybrid
from .services_ai import create_delivery_order_from_parsed
from .client import WhatsAppClient

logger = logging.getLogger(__name__)


def _delivery_customer_name(order):
    meta = getattr(order, "delivery_meta", None)
    if meta and meta.customer_name:
        return meta.customer_name
    customer = getattr(order, "customer", None)
    return getattr(customer, "name", None)


def _delivery_status(order):
    meta = getattr(order, "delivery_meta", None)
    return getattr(meta, "status", None) or "novo"

@csrf_exempt
def webhook(request):
    # Lookup token on each request to ensure fresh settings from Render env
    verify_token = getattr(settings, "WHATSAPP_VERIFY_TOKEN", "seu_token_secreto")

    if request.method == "GET":
        mode = request.GET.get("hub.mode")
        token = request.GET.get("hub.verify_token")
        challenge = request.GET.get("hub.challenge")

        if mode == "subscribe" and token == verify_token:
            logger.info("WhatsApp webhook verified successfully.")
            return HttpResponse(challenge)
        return HttpResponse("Verification failed", status=403)

    if request.method != "POST":
        return HttpResponse("Method not allowed", status=405)

    try:
        raw_body = request.body.decode("utf-8")
        logger.info(f"Incoming WhatsApp Webhook Payload: {raw_body}")
        body = json.loads(raw_body)
        
        # Meta Cloud API Payload Structure
        entries = body.get("entry", [])
        if not entries:
            return JsonResponse({"ok": True, "msg": "no entries"})

        entry = entries[0]
        changes = entry.get("changes", [])
        if not changes:
            return JsonResponse({"ok": True, "msg": "no changes"})

        value = changes[0].get("value", {})
        messages = value.get("messages", [])

        if not messages:
            return JsonResponse({"ok": True, "msg": "no messages"})

        whatsapp = WhatsAppClient()

        for msg in messages:
            phone = msg.get("from")
            text = msg.get("text", {}).get("body", "")

            if not text:
                continue

            try:
                # 1. Conversation State Management
                session, _ = WhatsAppSession.objects.get_or_create(phone=phone)
                
                # 2. Hybrid Analysis: Use AI in Conversational Mode
                ai = AIClient()
                result = ai.converse_order(text, session.context or {})
                
                if not result or result.get("status") == "invalid":
                    # Fallback to standard hybrid parsing if AI fails or returns invalid
                    parsed = parse_order_hybrid(text)
                    if not parsed.get("items"):
                        # If nothing found, just ignore or ask for clarification
                        if whatsapp.is_configured():
                            whatsapp.send_message(phone, "Desculpe, não entendi. Pode repetir seu pedido ou perguntar algo específico? 🍧")
                        continue
                    
                    # If hybrid found items, mock a 'complete' result
                    result = {
                        "status": "complete",
                        "updated_order": parsed,
                        "response_text": "Certo! Estou processando seu pedido profissionalmente."
                    }

                status = result.get("status")
                updated_order = result.get("updated_order", {})
                response_text = result.get("response_text", "")

                if status == "incomplete":
                    # Save state and ask question
                    session.context = updated_order
                    session.save()
                    if whatsapp.is_configured():
                        whatsapp.send_message(phone, response_text)
                
                elif status == "complete":
                    # Creation with PIX, Catalog matching, and Logistics
                    order = create_delivery_order_from_parsed(phone=phone, parsed=updated_order)
                    logger.info(f"Conversational Order {order.id} created from WhatsApp {phone}")

                    # Automated Confirmation Response
                    if whatsapp.is_configured():
                        whatsapp.send_order_confirmation(order)
                    
                    # 3. Cleanup: Delete session after completion
                    session.delete()

                    # Real-time Broadcast to Dashboard
                    broadcast_delivery_event('order_created', {
                        'id': order.id,
                        'customer_name': _delivery_customer_name(order),
                        'total': str(order.total),
                        'status': _delivery_status(order)
                    })

            except Exception as ai_err:
                logger.error(f"Error processing message for {phone}: {ai_err}")
                if whatsapp.is_configured():
                    whatsapp.send_message(phone, "Recebi sua mensagem mas tive um pequeno tropeço técnico. Meu atendente humano já vai falar com você! 🍨")

        return JsonResponse({"ok": True})

    except Exception as e:
        logger.exception("Fatal error in Professional WhatsApp Webhook")
        return JsonResponse({"error": str(e)}, status=500)
