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

# Verification Token from Settings
VERIFY_TOKEN = getattr(settings, "WHATSAPP_VERIFY_TOKEN", "seu_token")

@csrf_exempt
def webhook(request):
    if request.method == "GET":
        mode = request.GET.get("hub.mode")
        token = request.GET.get("hub.verify_token")
        challenge = request.GET.get("hub.challenge")

        if mode == "subscribe" and token == VERIFY_TOKEN:
            logger.info("WhatsApp webhook verified successfully.")
            return HttpResponse(challenge)
        return HttpResponse("Verification failed", status=403)

    if request.method != "POST":
        return HttpResponse("Method not allowed", status=405)

    try:
        body = json.loads(request.body.decode("utf-8"))
        
        # Meta Cloud API Payload Structure
        entry = body.get("entry", [])[0]
        changes = entry.get("changes", [])[0]
        value = changes.get("value", {})
        messages = value.get("messages", [])

        if not messages:
            return JsonResponse({"ok": True, "msg": "no messages"})

        for msg in messages:
            phone = msg.get("from")
            text = msg.get("text", {}).get("body", "")

            if not text:
                continue

            # 1. Conversation State Management
            session, _ = WhatsAppSession.objects.get_or_create(phone=phone)
            
            # 2. Hybrid Analysis: Use AI in Conversational Mode
            ai = AIClient()
            result = ai.converse_order(text, session.context or {})
            
            if not result or result.get("status") == "invalid":
                # Fallback to standard hybrid parsing if AI fails or returns invalid
                parsed = parse_order_hybrid(text)
                if not parsed.get("items"):
                    return JsonResponse({"ok": True, "msg": "standard message ignored"})
                
                # If hybrid found items, mock a 'complete' result
                result = {
                    "status": "complete",
                    "updated_order": parsed,
                    "response_text": "Certo! Estou processando seu pedido profissionalmente."
                }

            status = result.get("status")
            updated_order = result.get("updated_order", {})
            response_text = result.get("response_text", "")

            whatsapp = WhatsAppClient()

            if status == "incomplete":
                # Save state and ask question
                session.context = updated_order
                session.save()
                if whatsapp.is_configured():
                    whatsapp.send_message(phone, response_text)
                return JsonResponse({"ok": True, "status": "incomplete"})

            if status == "complete":
                # Creation with PIX, Catalog matching, and Logistics
                order = create_delivery_order_from_parsed(phone=phone, parsed=updated_order)
                logger.info(f"Conversational Order {order.id} created from WhatsApp {phone}")

                # Automated Confirmation Response
                if whatsapp.is_configured():
                    whatsapp.send_order_confirmation(order)
                
                # 3. Cleanup: Keeping it lightweight by deleting the session after completion
                session.delete()

                # Real-time Broadcast to Dashboard
                broadcast_delivery_event('order_created', {
                    'id': order.id,
                    'customer_name': order.customer_name,
                    'total': str(order.total),
                    'status': order.status
                })

                return JsonResponse({
                    "ok": True, 
                    "order_id": order.id,
                    "status": "complete"
                })

        return JsonResponse({"ok": True})

    except Exception as e:
        logger.exception("Error in Professional WhatsApp Webhook")
        return JsonResponse({"error": str(e)}, status=400)

    except Exception as e:
        logger.exception("Error in Professional WhatsApp Webhook")
        return JsonResponse({"error": str(e)}, status=400)
