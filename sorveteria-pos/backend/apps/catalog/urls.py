from django.urls import path
from apps.catalog import views

urlpatterns = [
    path('categories', views.CategoryListView.as_view()),
    path('categories/<int:pk>', views.CategoryUpsertView.as_view()),
    path('categories/<int:id>/apply-price', views.CategoryApplyPriceView.as_view()),
    path('products', views.ProductListView.as_view()),
    path('products/prices', views.ProductPriceListView.as_view()),
    path('products/<int:pk>', views.ProductUpsertView.as_view()),
    path('products/<int:id>/price', views.ProductPriceView.as_view()),
    path('products/<int:id>/stock-entries', views.ProductStockEntryListCreateView.as_view()),
    path('products/<int:id>/stock-entries/<int:entry_id>', views.ProductStockEntryDetailView.as_view()),
]
