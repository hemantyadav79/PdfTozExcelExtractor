import os
from cryptography.fernet import Fernet

KEY_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".enc_key")

def _get_or_create_key() -> bytes:
    """Retrieve encryption key from environment, or generate and store a persistent local key file."""
    env_key = os.getenv("ENCRYPTION_KEY")
    if env_key:
        return env_key.encode()
        
    if os.path.exists(KEY_FILE_PATH):
        with open(KEY_FILE_PATH, "rb") as f:
            return f.read()
            
    # Generate new key
    key = Fernet.generate_key()
    with open(KEY_FILE_PATH, "wb") as f:
        f.write(key)
    return key

# Initialize Fernet cipher
_key = _get_or_create_key()
cipher = Fernet(_key)

def encrypt_value(value: str) -> str:
    """Encrypt a string value (like an API Key)."""
    if not value:
        return ""
    encrypted_bytes = cipher.encrypt(value.encode())
    return encrypted_bytes.decode()

def decrypt_value(encrypted_value: str) -> str:
    """Decrypt an encrypted string value."""
    if not encrypted_value:
        return ""
    decrypted_bytes = cipher.decrypt(encrypted_value.encode())
    return decrypted_bytes.decode()
