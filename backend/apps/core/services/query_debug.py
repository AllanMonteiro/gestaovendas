from django.db import connection
import time


class QueryDebugger:

    @staticmethod
    def log_queries(func):
        def wrapper(*args, **kwargs):
            start = time.time()
            result = func(*args, **kwargs)
            total_time = time.time() - start

            print(f"[QUERY DEBUG] Tempo: {total_time:.3f}s")
            print(f"[QUERY DEBUG] Total queries: {len(connection.queries)}")

            return result

        return wrapper
