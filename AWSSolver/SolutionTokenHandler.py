import hashlib
import itertools
import base64

def _check(difficulty: int, hex_hash: str) -> bool:
    return int(hex_hash, 16) >> (len(hex_hash) * 4 - difficulty) == 0

def sha256_hashcash(input_string: str) -> str:
    data = input_string.encode("utf-8")
    hash_bytes = hashlib.sha256(data).digest()
    parts = []
    for i in range(0, len(hash_bytes), 4):
        uint32 = int.from_bytes(hash_bytes[i:i+4], byteorder="big")
        parts.append(f"{uint32:08x}")
    
    return "".join(parts)

def compute_scrypt(challenge_b64: str, checksum: str, difficulty: int) -> str:
    salt = checksum.encode("utf-8")
    
    for nonce in itertools.count(0):
        password = (challenge_b64 + checksum + str(nonce)).encode("utf-8")
        hash_hex = hashlib.scrypt(password, salt=salt, n=128, r=8, p=1, dklen=16).hex()
        
        if _check(difficulty, hash_hex):
            return str(nonce)

def compute_pow(input_str: str, checksum: str,difficulty: int,) -> str:
    base = input_str + checksum
    nonce = 0
    
    while True:
        hash_hex = sha256_hashcash(base + str(nonce))
        if _check(difficulty, hash_hex):
            return str(nonce)
        nonce += 1

def get_filter_bytes(difficulty: int) -> int:

    sizes = {
        1: 1024,
        2: 10 * 1024,
        3: 100 * 1024,
        4: 1 * 1048576,
        5: 10 * 1048576,
    }
    return sizes.get(difficulty, 0)

def compute_bandwidth(challenge_b64: str, checksum: str, difficulty: int) -> str:
    n = get_filter_bytes(difficulty)
    null_bytes = bytes(n)
    b64 = base64.b64encode(null_bytes).decode("utf-8")
    return b64

CHALLENGES = {
    "h72f957df656e80ba55f5d8ce2e8c7ccb59687dba3bfb273d54b08a261b2f3002": compute_scrypt,
    "h7b0c470f0cfe3a80a9e26526ad185f484f6817d0832712a4a37a908786a6a67f": compute_pow,
    "ha9faaffd31b4d5ede2a2e19d2d7fd525f66fee61911511960dcbb52d3c48ce25": compute_bandwidth
}

