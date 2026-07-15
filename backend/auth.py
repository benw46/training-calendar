import os

import requests
from fastapi import Header, HTTPException

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")


def require_auth(authorization: str = Header(None)):
    """Verifies the caller's Supabase session by asking Supabase itself
    whether the token is valid — simpler and more robust for a single-user
    app than maintaining our own JWT-verification/JWKS logic locally.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ")
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": SUPABASE_ANON_KEY},
            timeout=10,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Auth check failed: {exc}")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    return resp.json()
