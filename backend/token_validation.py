import functools
import inspect
from fastapi import Security, Depends
from common import azure_scheme, scopes

def inject_security():
    """Decorator that automatically injects the security token."""
    def dependency():
        return Security(azure_scheme, scopes=scopes)
    
    def decorator(func):
        # Create an injectable dependency that assigns to 'token'
        async def token_dependency(token = Security(azure_scheme, scopes=scopes)):
            return token
        
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Add the token to kwargs if it's not there
            if 'token' not in kwargs and hasattr(wrapper, 'token_value'):
                kwargs['token'] = wrapper.token_value
            return await func(*args, **kwargs)
        
        # Use proper Depends syntax
        setattr(wrapper, "dependencies", [Depends(token_dependency)])
        
        return wrapper
    return decorator