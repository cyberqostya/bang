# BANG! Helper

Mobile-first помощник для настольного Bang: озвучка карт, случайный выстрел,
патроны-жизни и состояния игрока.

## Команды

```bash
npm install
npm run dev
npm run dev:server
npm run build
npm run preview
```

## Где добавлять контент

- Настройки патронов и картинки жизней: `src/config/healthConfig.js`
- Разметка экрана: `src/App.vue`
- WebSocket-сервер: `server/index.js`
- Состояние комнаты: `src/stores/roomStore.js`
- Нижняя панель: `src/components`
- Логика патронов: `src/stores/healthStore.js`
- Визуальный слой: `src/styles/screen.css`
