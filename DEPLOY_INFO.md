# 🌐 News-analyzer - Информация о деплое

## ✅ Проект обновлён!

Все улучшения из `crypto_news_monitor.py` портированы в веб-версию.

---

## 🔗 Где смотреть:

### Локально (dev):
```
http://localhost:5173
```

**Dev сервер уже запущен!** Откройте в браузере.

---

## 🚀 Деплой на продакшн

### Вариант 1: Vercel (быстро и бесплатно)

```bash
cd /Users/kd/Developer/GitHub/News-analyzer

# Установить Vercel CLI (один раз)
npm install -g vercel

# Deploy
vercel

# Следуйте инструкциям:
# - Set up and deploy? Yes
# - Which scope? Ваш аккаунт
# - Link to existing project? No
# - Project name: news-analyzer (или другое)
# - Directory: ./
# - Build command: npm run build
# - Output directory: dist
```

**Результат:** Вам дадут ссылку типа `https://news-analyzer-xyz.vercel.app`

---

### Вариант 2: GitHub Pages

```bash
cd /Users/kd/Developer/GitHub/News-analyzer

# 1. Убедитесь что у вас настроен git remote
git remote -v

# 2. Deploy
npm run deploy
```

**Результат:** `https://[ваш-username].github.io/News-analyzer`

---

### Вариант 3: Netlify

```bash
cd /Users/kd/Developer/GitHub/News-analyzer

# Build
npm run build

# Папка dist/ готова
# Зайдите на https://netlify.com
# Drag & drop папку dist/
```

---

## 📱 Скриншот (как будет выглядеть):

```
┌────────────────────────────────────────────────────┐
│        🔍 Crypto News Analyzer                     │
│   Анализ TreeNews с AI-фильтрацией и ценами        │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ 🔑 OpenAI API Key  [sk-proj-...............]        │
│ ⏰ Период анализа  [2] часов                       │
│                    [🚀 Анализировать]               │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ 📊 Статистика                                       │
│ ├─ 159 новостей проанализировано                   │
│ ├─ 6 значимых событий                              │
│ └─ 32,000 токенов использовано                     │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ 📜 #1                                               │
│ REGULATION | $SOL: U.S. spot Solana ETFs draw     │
│ $200M in inflows during debut week                 │
│                                                     │
│ [🟢 +0.8%] [⏱ 23h ago]                            │
│ 🔗 Источник                                         │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ 🔥 #2                                               │
│ TOKENOMICS | $KITE: Kite Foundation announces     │
│ airdrop for early supporters                       │
│                                                     │
│ [🟢🟢 +8.1%] [⏱ 18h ago]                          │
│ 🔗 Источник                                         │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ 🐋 #3                                               │
│ ON-CHAIN | $GHOST: Whale buys 1.12M after 10      │
│ months dormancy                                     │
│                                                     │
│ [🔴🔴 -5.7%] [⏱ 3h ago]                           │
│ 🔗 Источник                                         │
└────────────────────────────────────────────────────┘
```

---

## 🎯 Что нового:

✅ Улучшенный AI промпт (из Python бота)
✅ Категории с эмодзи
✅ Тикеры токенов ($BTC, $ETH...)
✅ Изменение цен с Binance
✅ Цветные шарики 🟢🔴
✅ Время с момента публикации
✅ Фильтрация шума (sentiment, predictions, regional tokens)
✅ Красивый темный UI
✅ Responsive дизайн

---

## 📌 Важно

- **API ключ НЕ сохраняется** на сервере (только в браузере)
- **Безопасно делиться** ссылкой - каждый использует свой ключ
- **Можно делать публичным** - нет приватного кода

---

## 🔗 Ссылки для деплоя:

**После деплоя у вас будет:**
- Vercel: `https://news-analyzer-[random].vercel.app`
- GitHub Pages: `https://[username].github.io/News-analyzer`  
- Netlify: `https://[random].netlify.app`

**Можете делиться этой ссылкой с кем угодно!** 🎉

