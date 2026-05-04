from django.urls import path
from . import views

urlpatterns = [
    path('', views.index),
    path('api/timeline_data', views.timeline_data),
    path('api/data', views.get_data),
]
