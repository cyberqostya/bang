# Deploy на одном VDS

Ниже план для `Ubuntu 24.04`, домена `cyberqostya.ru`, одного сервера с:
- `nginx` для статики и reverse proxy
- `pm2` для автоподнятия backend
- `certbot` для SSL

## 1. Что получится в итоге

- фронт: раздается `nginx` из `dist`
- backend: Node WebSocket сервер на `127.0.0.1:3001`
- домен:
  - `https://cyberqostya.ru`
  - `wss://cyberqostya.ru/game-ws`
- рестарт после падения: `pm2`
- логи:
  - обычные успешные логи не пишем в файл
  - crash/error логи пишем в один файл

## 2. DNS

У регистратора домена создай записи:

- `A` -> `cyberqostya.ru` -> `IP_сервера`
- `A` -> `www.cyberqostya.ru` -> `IP_сервера`

Подожди, пока домен начнет резолвиться.

## 3. Подготовка сервера

Под root:

```bash
apt update && apt upgrade -y
apt install -y nginx certbot python3-certbot-nginx git curl
```

Поставь Node.js 22 через `nvm` под отдельным пользователем, например `deploy`:

```bash
adduser deploy
usermod -aG sudo deploy
su - deploy
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
npm install -g pm2
```

## 4. Структура каталогов

Под пользователем `deploy`:

```bash
mkdir -p /var/www/bang
mkdir -p /var/www/bang/shared/logs
git clone <URL_твоего_репозитория> /var/www/bang/current
cd /var/www/bang/current
npm ci
npm run build
```

Важно:
- `ecosystem.config.cjs` уже настроен на путь `/var/www/bang/current`
- crash/error логи будут складываться в `/var/www/bang/shared/logs/pm2-error.log`

## 5. Запуск backend через pm2

```bash
cd /var/www/bang/current
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

После `pm2 startup` он покажет команду, которую нужно выполнить под `root`. Выполни ее, потом еще раз:

```bash
pm2 save
```

Проверка:

```bash
pm2 status
pm2 logs bang-server --err --lines 100
```

## 6. Nginx конфиг

Создай файл:

```bash
sudo nano /etc/nginx/sites-available/cyberqostya.ru
```

Вставь:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name cyberqostya.ru www.cyberqostya.ru;

    root /var/www/bang/current/dist;
    index index.html;

    location /game-ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
    }

    location /assets/ {
        access_log off;
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Включи сайт:

```bash
sudo ln -s /etc/nginx/sites-available/cyberqostya.ru /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 7. SSL сертификат

Когда DNS уже смотрит на сервер:

```bash
sudo certbot --nginx -d cyberqostya.ru -d www.cyberqostya.ru
```

Проверка автообновления:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

## 8. Как обновлять проект

Под пользователем `deploy`:

```bash
cd /var/www/bang/current
git pull
source ~/.bashrc
nvm use 22
npm ci
npm run build
pm2 restart bang-server
```

## 9. Где смотреть ошибки

Crash/error логи backend:

```bash
tail -n 200 /var/www/bang/shared/logs/pm2-error.log
```

Логи nginx:

```bash
sudo tail -n 200 /var/log/nginx/error.log
```

Если всё хорошо:
- обычные stdout-логи backend не сохраняются в файл
- это уменьшает расход памяти и диска

## 10. Что уже настроено в проекте

Уже добавлено:
- `ecosystem.config.cjs` для `pm2`
- `server/index.js` ловит `uncaughtException` и `unhandledRejection`
- `server/logger.js` пишет ошибки в `stderr` с timestamp
- при падении процесса `pm2` автоматически поднимет его снова

## 11. Полезные команды

```bash
pm2 status
pm2 restart bang-server
pm2 stop bang-server
pm2 delete bang-server
pm2 logs bang-server --err
sudo systemctl reload nginx
sudo nginx -t
```
