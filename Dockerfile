# Khatt-e-Parr — static site, no backend.
#
# The app is a self-contained page: React, Leaflet and all fonts are bundled
# inside index.html. At runtime it only talks to OpenStreetMap (map tiles and
# Nominatim search), so this image serves plain files and nothing else.
FROM nginx:1.27-alpine

# Listens on 8080 (see nginx.conf) so the container can run as a non-root user.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY brand.js   /usr/share/nginx/html/brand.js

# nginx's own unprivileged user, already present in the base image.
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx \
 && touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid
USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
