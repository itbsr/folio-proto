ARG WEIGHTS=dewarpnet-weights:latest
FROM ${WEIGHTS}

COPY . /app/ai-server/

WORKDIR /app/ai-server
EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
