from decimal import Decimal
from django.db import transaction
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.catalog.models import Category, Product, ProductPrice
from apps.catalog.serializers import CategorySerializer, ProductCompactSerializer, ProductSerializer, ProductPriceSerializer
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


class CategoryApplyPriceView(APIView):
    @staticmethod
    def _to_decimal(value, default='0'):
        raw = value if value is not None else default
        return Decimal(str(raw))

    @transaction.atomic
    def post(self, request, id):
        if auth_is_required() and not user_has_permission(request.user, 'catalog.manage'):
            return Response({'detail': 'Forbidden'}, status=403)

        category = Category.objects.filter(id=id).first()
        if category is None:
            return Response({'detail': 'Category not found'}, status=404)

        price_value = request.data.get('price', category.price if category.price is not None else '0')
        price = self._to_decimal(price_value)
        category.price = price
        category.save(update_fields=['price'])

        product_ids = list(Product.objects.filter(category_id=category.id).values_list('id', flat=True))
        existing_prices_by_product_id: dict[int, list[ProductPrice]] = {}
        for product_price in ProductPrice.objects.filter(product_id__in=product_ids).order_by('product_id', 'store_id'):
            existing_prices_by_product_id.setdefault(product_price.product_id, []).append(product_price)

        prices_to_update: list[ProductPrice] = []
        prices_to_create: list[ProductPrice] = []

        for product_id in product_ids:
            existing_prices = existing_prices_by_product_id.get(product_id, [])
            if existing_prices:
                for product_price in existing_prices:
                    product_price.price = price
                    prices_to_update.append(product_price)
                continue

            prices_to_create.append(
                ProductPrice(
                    product_id=product_id,
                    store_id=1,
                    price=price,
                    cost=Decimal('0'),
                    freight=Decimal('0'),
                    other=Decimal('0'),
                    tax_pct=Decimal('0'),
                    overhead_pct=Decimal('0'),
                    margin_pct=Decimal('0'),
                )
            )

        if prices_to_update:
            ProductPrice.objects.bulk_update(prices_to_update, ['price'])
        if prices_to_create:
            ProductPrice.objects.bulk_create(prices_to_create)

        return Response({
            'status': 'ok',
            'category_id': category.id,
            'price': str(price),
            'updated_products': len(product_ids),
        })


class ProductListView(generics.ListCreateAPIView):
    serializer_class = ProductSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            if auth_is_required() and not user_has_permission(self.request.user, 'catalog.manage'):
                return [permissions.IsAdminUser()]
            return [permissions.IsAuthenticated()] if auth_is_required() else [permissions.AllowAny()]
        return [permissions.AllowAny()]

    def get_serializer_class(self):
        if self.request.method == 'GET' and self.request.query_params.get('compact', '').strip().lower() in {'1', 'true', 'yes', 'on'}:
            return ProductCompactSerializer
        return ProductSerializer

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
        price = ProductPrice.objects.filter(product_id=id).order_by('store_id').first()
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
        qs = ProductPrice.objects.all().order_by('product_id', 'store_id')
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
