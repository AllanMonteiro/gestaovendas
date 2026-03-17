from decimal import Decimal
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.catalog.models import Category, Product, ProductPrice
from apps.catalog.serializers import CategorySerializer, ProductSerializer, ProductPriceSerializer
from apps.accounts.permissions import auth_is_required, user_has_permission


def local_admin_permissions():
    if auth_is_required():
        return []
    return [permissions.AllowAny]


class CategoryListView(generics.ListCreateAPIView):
    queryset = Category.objects.filter(active=True).order_by('sort_order', 'name')
    serializer_class = CategorySerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            if auth_is_required() and not user_has_permission(self.request.user, 'catalog.manage'):
                return [permissions.IsAdminUser()]
            return [permissions.IsAuthenticated()] if auth_is_required() else [permissions.AllowAny()]
        return [permissions.AllowAny()]


class CategoryUpsertView(generics.CreateAPIView, generics.UpdateAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    def get_permissions(self):
        if auth_is_required() and not user_has_permission(self.request.user, 'catalog.manage'):
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()] if auth_is_required() else [permissions.AllowAny()]


class ProductListView(generics.ListCreateAPIView):
    serializer_class = ProductSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            if auth_is_required() and not user_has_permission(self.request.user, 'catalog.manage'):
                return [permissions.IsAdminUser()]
            return [permissions.IsAuthenticated()] if auth_is_required() else [permissions.AllowAny()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        qs = Product.objects.select_related('category').all()
        category_id = self.request.query_params.get('category_id')
        query = self.request.query_params.get('q')
        if category_id:
            qs = qs.filter(category_id=category_id)
        if query:
            qs = qs.filter(name__icontains=query)
        return qs.order_by('name')


class ProductUpsertView(generics.CreateAPIView, generics.UpdateAPIView):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer

    def get_permissions(self):
        if auth_is_required() and not user_has_permission(self.request.user, 'catalog.manage'):
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()] if auth_is_required() else [permissions.AllowAny()]


class ProductPriceView(APIView):
    @staticmethod
    def _to_decimal(value, default='0'):
        raw = value if value is not None else default
        return Decimal(str(raw))

    def get(self, request, id):
        price = ProductPrice.objects.filter(product_id=id).first()
        if not price:
            return Response({'detail': 'Price not found'}, status=404)
        return Response(ProductPriceSerializer(price).data)

    def put(self, request, id):
        if auth_is_required() and not user_has_permission(request.user, 'catalog.manage'):
            return Response({'detail': 'Forbidden'}, status=403)
        defaults = {
            'store_id': int(request.data.get('store_id', 1)),
            'price': self._to_decimal(request.data.get('price', '0')),
            'cost': self._to_decimal(request.data.get('cost', '0')),
            'freight': self._to_decimal(request.data.get('freight', '0')),
            'other': self._to_decimal(request.data.get('other', '0')),
            'tax_pct': self._to_decimal(request.data.get('tax_pct', '0')),
            'overhead_pct': self._to_decimal(request.data.get('overhead_pct', '0')),
            'margin_pct': self._to_decimal(request.data.get('margin_pct', '0')),
        }
        price, _ = ProductPrice.objects.get_or_create(product_id=id, store_id=defaults['store_id'], defaults=defaults)
        serializer = ProductPriceSerializer(price, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ProductPriceListView(APIView):
    def get(self, request):
        qs = ProductPrice.objects.all().order_by('product_id')
        product_ids_raw = request.query_params.get('product_ids')
        if product_ids_raw:
            try:
                product_ids = [int(value) for value in product_ids_raw.split(',') if value.strip()]
            except ValueError:
                return Response({'detail': 'Invalid product_ids'}, status=400)
            if product_ids:
                qs = qs.filter(product_id__in=product_ids)
            else:
                qs = qs.none()
        return Response(ProductPriceSerializer(qs, many=True).data)
