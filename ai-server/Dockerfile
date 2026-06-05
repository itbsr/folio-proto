FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxrender1 libxext6 libgl1 git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --timeout 300 -r /app/requirements.txt

RUN git clone --depth 1 https://github.com/cvlab-stonybrook/DewarpNet.git /app/DewarpNet \
    && rm -rf /app/DewarpNet/.git

COPY . /app/ai-server/

WORKDIR /app/ai-server
EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
