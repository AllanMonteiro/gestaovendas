from django.test import TestCase
from rest_framework.test import APIClient
from apps.loyalty.models import Customer, LoyaltyAccount


class LoyaltyApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_redeem_unknown_customer_returns_404(self):
        response = self.client.post('/api/loyalty/redeem', {
            'phone': '559999000111',
            'points': 10,
            'reason': 'teste',
        }, format='json')
        self.assertEqual(response.status_code, 404)

    def test_redeem_insufficient_points_returns_400(self):
        customer = Customer.objects.create(phone='559999000000', name='Cliente')
        LoyaltyAccount.objects.create(customer=customer, points_balance=5)
        response = self.client.post('/api/loyalty/redeem', {
            'phone': '559999000000',
            'points': 10,
            'reason': 'teste',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('detail'), 'insufficient points')

    def test_lookup_supports_phone_suffix_when_unique(self):
        customer = Customer.objects.create(phone='5591999887766', name='Cliente')
        LoyaltyAccount.objects.create(customer=customer, points_balance=22)
        response = self.client.get('/api/loyalty/customer?phone=999887766')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['customer']['phone'], '5591999887766')
        self.assertEqual(response.data['account']['points_balance'], 22)

    def test_lookup_supports_customer_id(self):
        customer = Customer.objects.create(phone='559188877766', name='Cliente ID')
        LoyaltyAccount.objects.create(customer=customer, points_balance=31)
        response = self.client.get(f'/api/loyalty/customer?customer_id={customer.id}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['customer']['id'], customer.id)
        self.assertEqual(response.data['account']['points_balance'], 31)
