# Weverse Notice Webhook

A Node.js script that monitors a Weverse community for new notices and sends them to a Discord Webhook.

## Features

- Polls Weverse API for new notices.
- Sends a rich embed to Discord via Webhook.
- Supports multiple images.
- Designed to run on GitHub Actions (Git Scraping).

    *Note: Locally, it will create a `state.json` file to track the last seen notice.*

## RSS 출력

- `npm run rss`로 `public/rss.xml` 생성
- GitHub Actions(`.github/workflows/deploy.yml`)가 매 시간 RSS를 빌드 후 Pages에 배포
- 환경변수:
  - `APP_ID` (필수)
  - `HMAC_KEY` (필수)
  - `COMMUNITY_ID` (기본값 240)
  - `TAB_KEY` (기본값 NOTICE)
  - `RSS_LIMIT` (기본값 20)

## Disclaimer

This is an unofficial tool. Use at your own risk.