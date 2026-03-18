FROM php:8.2-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libonig-dev \
        libzip-dev \
    && docker-php-ext-install mbstring zip \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

COPY docker/apache-adachat.conf /etc/apache2/conf-available/adachat.conf
RUN a2enconf adachat

COPY . /var/www/html

RUN mkdir -p /var/www/html/ai_data/kv_cache /var/www/html/ai_data/rag_vector_db \
    && chown -R www-data:www-data /var/www/html/ai_data

EXPOSE 80

CMD ["apache2-foreground"]
