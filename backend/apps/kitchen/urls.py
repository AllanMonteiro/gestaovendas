from django.urls import path
from apps.kitchen import views

urlpatterns = [
    path('kitchen/queue', views.KitchenQueueView.as_view()),
    path('kitchen/<uuid:order_id>/ready', views.KitchenReadyView.as_view()),
    path('kitchen/<uuid:order_id>/back-to-prep', views.KitchenBackToPrepView.as_view()),
    path('kitchen/<uuid:order_id>/print', views.KitchenPrintView.as_view()),
]