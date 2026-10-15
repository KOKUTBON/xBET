FROM nginx:1.25-alpine

COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/gateway-health || exit 1

CMD ["nginx", "-g", "daemon off;"]
