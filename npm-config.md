
# Needed Nginx Proxy Manager configuration (or another reverse proxy solution)
This integration was designed to work behind a reverse proxy, and more specifically an NPM.
Some options must be set in the reverse proxy for CORS to work.
Some CORS options are also set in the nextcloud application php files.

You need to create 3 custom locations :
- /index.php/login/v2
- /index.php/csrftoken
- /index.php/apps/sogo_attach/folders

For the first one (`/index.php/login/v2`), add theses lines :
```add_header Access-Control-Allow-Origin "https://mail.example.com" always;
add_header Access-Control-Allow-Credentials "true" always;
add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With, requesttoken, OC-Chunked" always;
add_header Vary "Origin" always;
if ($request_method = OPTIONS) {
    return 204;
}
```


And for `/index.php/csrftoken` and `/index.php/apps/sogo_attach/folders` :
```add_header Access-Control-Allow-Origin "https://mail.example.com" always;
add_header Access-Control-Allow-Credentials "true" always;
add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With, requesttoken, OC-Chunked" always;
add_header Vary "Origin" always;
if ($request_method = OPTIONS) {
    return 204;
}
```
PS : you obviously need to remplace in each custom location `https://mail.example.com` by your mail server URL.
