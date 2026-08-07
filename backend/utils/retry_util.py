import time
import functools
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def with_retry(max_retries=3, initial_delay=1.0, backoff_factor=2.0, exceptions=(Exception,)):
    """
    API 요청 등이 실패할 경우 재시도하는 데코레이터.
    최대 max_retries만큼 재시도하며,
    실패할 때마다 initial_delay * (backoff_factor ** retry_count) 만큼 대기합니다.
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            delay = initial_delay
            last_exception = None
            
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        logger.warning(f"[Retry {attempt+1}/{max_retries}] {func.__name__} failed with {e}. Waiting {delay}s...")
                        time.sleep(delay)
                        delay *= backoff_factor
            
            logger.error(f"[{func.__name__}] Failed after {max_retries} attempts.")
            raise last_exception
        return wrapper
    return decorator
