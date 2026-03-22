FROM python:3.12-slim

WORKDIR /app

# Sistemske odvisnosti
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Python odvisnosti
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Koda
COPY . .

EXPOSE 8000
