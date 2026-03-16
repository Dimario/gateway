# TODO

## HTTPS
- [ ] Настроить nginx как reverse proxy
- [ ] Выпустить самоподписанный сертификат (`openssl req -x509 ...`)
- [ ] Добавить SSL-конфиг в nginx (`ssl_certificate`, `ssl_certificate_key`)
- [ ] Пробросить порт 443 в ufw, закрыть 80
- [ ] Обновить CORS и Socket.io на `wss://`

## Домен
- [ ] Купить домен или настроить кастомный DNS на роутере (например `gateway.local`)
- [ ] Прописать A-запись на IP сервера
- [ ] Обновить `server_name` в nginx конфиге
- [ ] Рассмотреть Let's Encrypt если домен публичный (`certbot --nginx`)

## CI/CD
- [ ] Добавить GitHub Actions workflow: пуш в `main` → деплой на сервер
- [ ] Настроить SSH-ключ в GitHub Secrets (`SSH_HOST`, `SSH_USER`, `SSH_KEY`)
- [ ] Workflow: `git pull` + `docker compose up -d --build` на сервере
- [ ] Добавить health check после деплоя для проверки что сервис поднялся
