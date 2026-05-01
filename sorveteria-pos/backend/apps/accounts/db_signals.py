from django.db.backends.signals import connection_created


def _set_public_search_path(sender, connection, **kwargs):
    if connection.vendor != 'postgresql':
        return
    with connection.cursor() as cursor:
        cursor.execute('SET search_path TO public')


connection_created.connect(_set_public_search_path)