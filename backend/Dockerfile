FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y build-essential libpq-dev gcc git && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy project code (build context is the `backend/` directory)
COPY . .

# Use gunicorn in production; for dev you may run manage.py runserver
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000"]
