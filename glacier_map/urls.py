from django.urls import path, include

urlpatterns = [
    path('', include('map_status.urls')),
]
