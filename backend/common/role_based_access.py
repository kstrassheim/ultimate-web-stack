import functools
import inspect  # Add this import
from fastapi import HTTPException
from typing import List, Callable
from common.log import logger  # Make sure logger is imported

def required_roles(required_roles: List[str], check_all: bool = False):
    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Get the token from dependencies
            token = kwargs.get('token')
            
            if not token:
                http_ex = HTTPException(status_code=401, detail="Token is missing or invalid")
                logger.error(http_ex)
                raise http_ex
                
            roles = getattr(token, "roles", None)
            if roles is None:
                http_ex = HTTPException(status_code=403, detail="Roles are missing in the token")
                logger.error(http_ex)
                raise http_ex

            normalized_roles = [role.lower() for role in roles]
            normalized_required_roles = [role.lower() for role in required_roles]
            
            # Check if user has required roles
            has_access = False
            if check_all:
                # User must have ALL required roles
                has_access = all(role in normalized_roles for role in normalized_required_roles)
            else:
                # User must have ANY of the required roles
                has_access = any(role in normalized_roles for role in normalized_required_roles)
                
            if not has_access:
                http_ex = HTTPException(status_code=403, detail="You do not have access to this resource")

                logger.error(f"403 - Access denied: {http_ex.detail} (Status: {http_ex.status_code})")  # )
                raise http_ex
                
            logger.info(f"Role check - Role check successful for {required_roles}")
            return await func(*args, **kwargs)
        
        # Correctly set the signature using inspect module
        if hasattr(inspect, 'signature'):
            # Modern Python versions
            wrapper.__signature__ = inspect.signature(func)
        
        return wrapper
    return decorator