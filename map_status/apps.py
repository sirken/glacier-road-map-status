from django.apps import AppConfig


class MapStatusConfig(AppConfig):
    name = 'map_status'

    def ready(self):
        from .views import migrate_db
        migrate_db()
