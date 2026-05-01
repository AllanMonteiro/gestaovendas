import re
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.loyalty.models import Customer, LoyaltyAccount, LoyaltyMove
from apps.loyalty.serializers import CustomerSerializer, LoyaltyAccountSerializer, LoyaltyMoveSerializer


def normalize_phone(value: str) -> str:
    return re.sub(r'\D', '', value or '')


def resolve_customer_by_phone(phone: str) -> Customer | None:
    customer = Customer.objects.filter(phone=phone).first()
    if customer:
        return customer
    # fallback: permite buscar por sufixo (ultimos digitos) para telefones com/sem codigo pais
    if len(phone) >= 8:
        qs = Customer.objects.filter(phone__endswith=phone).order_by('-id')[:2]
        if len(qs) == 1:
            return qs[0]
    return None


class LoyaltyCustomerView(APIView):
    def get(self, request):
        customer_id = request.query_params.get('customer_id')
        customer = None
        if customer_id:
            try:
                customer = Customer.objects.filter(id=int(customer_id)).first()
            except (TypeError, ValueError):
                return Response({'detail': 'customer_id invalid'}, status=400)
        if not customer:
            phone = normalize_phone(request.query_params.get('phone') or '')
            if not phone:
                return Response({'detail': 'phone or customer_id required'}, status=400)
            customer = resolve_customer_by_phone(phone)
        if not customer:
            return Response({'detail': 'not found'}, status=404)
        account, _ = LoyaltyAccount.objects.get_or_create(customer=customer)
        return Response({
            'customer': CustomerSerializer(customer).data,
            'account': LoyaltyAccountSerializer(account).data,
        })


class LoyaltyEarnView(APIView):
    def post(self, request):
        data = request.data
        phone = normalize_phone(data.get('phone') or '')
        if not phone:
            return Response({'detail': 'phone required'}, status=400)
        if len(phone) < 8:
            return Response({'detail': 'phone invalid'}, status=400)
        customer, _ = Customer.objects.get_or_create(phone=phone)
        account, _ = LoyaltyAccount.objects.get_or_create(customer=customer)
        try:
            points = int(data.get('points', 0))
        except (TypeError, ValueError):
            return Response({'detail': 'points invalid'}, status=400)
        if points <= 0:
            return Response({'detail': 'points must be > 0'}, status=400)
        account.points_balance += points
        account.save(update_fields=['points_balance'])
        move = LoyaltyMove.objects.create(customer=customer, points=points, type=LoyaltyMove.TYPE_EARN, reason=data.get('reason', ''), order_id=data.get('order_id'))
        return Response({'account': LoyaltyAccountSerializer(account).data, 'move': LoyaltyMoveSerializer(move).data})


class LoyaltyRedeemView(APIView):
    def post(self, request):
        data = request.data
        phone = normalize_phone(data.get('phone') or '')
        if not phone:
            return Response({'detail': 'phone required'}, status=400)
        customer = resolve_customer_by_phone(phone)
        if not customer:
            return Response({'detail': 'customer not found'}, status=404)
        account, _ = LoyaltyAccount.objects.get_or_create(customer=customer)
        try:
            points = int(data.get('points', 0))
        except (TypeError, ValueError):
            return Response({'detail': 'points invalid'}, status=400)
        if points <= 0:
            return Response({'detail': 'points must be > 0'}, status=400)
        if account.points_balance < points:
            return Response({'detail': 'insufficient points'}, status=400)
        account.points_balance -= points
        account.save(update_fields=['points_balance'])
        move = LoyaltyMove.objects.create(customer=customer, points=-points, type=LoyaltyMove.TYPE_REDEEM, reason=data.get('reason', ''), order_id=data.get('order_id'))
        return Response({'account': LoyaltyAccountSerializer(account).data, 'move': LoyaltyMoveSerializer(move).data})


class LoyaltyMovesView(APIView):
    def get(self, request):
        phone = normalize_phone(request.query_params.get('phone') or '')
        if not phone:
            return Response([], status=200)
        customer = resolve_customer_by_phone(phone)
        if not customer:
            return Response([], status=200)
        moves = LoyaltyMove.objects.filter(customer=customer).order_by('-created_at')
        return Response(LoyaltyMoveSerializer(moves, many=True).data)
