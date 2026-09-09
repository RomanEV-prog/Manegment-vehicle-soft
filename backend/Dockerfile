FROM python:3.12-slim

WORKDIR /app

# Sistemske odvisnosti
# WeasyPrint potrebuje pango/cairo/gdk-pixbuf — brez njih generacija PDF pade z
# OSError: cannot load library 'gobject-2.0-0' (poročila vrnejo 500).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

# Python odvisnosti
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Koda
COPY . .

EXPOSE 8000
