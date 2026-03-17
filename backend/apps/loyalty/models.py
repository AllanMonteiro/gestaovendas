from django.db import models


class Customer(models.Model):
    name = models.CharField(max_length=120, null=True, blank=True)
    last_name = models.CharField(max_length=120, null=True, blank=True)
    neighborhood = models.CharField(max_length=120, null=True, blank=True)
    phone = models.CharField(max_length=20, unique=True)

    class Meta:
        indexes = [
            models.Index(fields=['phone']),
        ]


class LoyaltyAccount(models.Model):
    customer = models.OneToOneField(Customer, on_delete=models.CASCADE)
    points_balance = models.IntegerField(default=0)


class LoyaltyMove(models.Model):
    TYPE_EARN = 'EARN'
    TYPE_REDEEM = 'REDEEM'
    TYPE_ADJUST = 'ADJUST'
    TYPE_REVERT = 'REVERT'
    TYPE_CHOICES = [
        (TYPE_EARN, 'Earn'),
        (TYPE_REDEEM, 'Redeem'),
        (TYPE_ADJUST, 'Adjust'),
        (TYPE_REVERT, 'Revert'),
    ]

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)
    points = models.IntegerField()
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    reason = models.TextField()
    order = models.ForeignKey('sales.Order', null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['customer', 'created_at']),
        ]
