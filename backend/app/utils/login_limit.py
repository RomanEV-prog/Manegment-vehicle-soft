"""
Omejitev neuspelih prijav (zaščita pred ugibanjem gesel).

Po MAX_FAILURES neuspelih poskusih za isti e-naslov ali isti IP v oknu WINDOW
prijava vrne 429, dokler okno ne poteče. Števec je v pomnilniku procesa — pri
več workerjih je dejanska meja največ MAX_FAILURES × število workerjev, kar za
ta namen zadošča in ne potrebuje dodatne infrastrukture.
"""

import time

MAX_FAILURES = 10
WINDOW_SECONDS = 15 * 60

_failures: dict[str, list[float]] = {}


def _keys(email: str, ip: str | None) -> list[str]:
    keys = [f"email:{email.strip().lower()}"]
    if ip:
        keys.append(f"ip:{ip}")
    return keys


def _recent(key: str, now: float) -> list[float]:
    stamps = [t for t in _failures.get(key, []) if now - t < WINDOW_SECONDS]
    if stamps:
        _failures[key] = stamps
    else:
        _failures.pop(key, None)
    return stamps


def retry_after(email: str, ip: str | None) -> int | None:
    """Sekunde do ponovnega poskusa, če je prijava blokirana; sicer None."""
    now = time.monotonic()
    for key in _keys(email, ip):
        stamps = _recent(key, now)
        if len(stamps) >= MAX_FAILURES:
            return int(WINDOW_SECONDS - (now - stamps[0])) + 1
    return None


def record_failure(email: str, ip: str | None) -> None:
    now = time.monotonic()
    for key in _keys(email, ip):
        _failures.setdefault(key, []).append(now)


def record_success(email: str) -> None:
    _failures.pop(f"email:{email.strip().lower()}", None)


def reset() -> None:
    _failures.clear()
