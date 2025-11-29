# Weverse Notice Webhook

A Node.js script that monitors a Weverse community for new notices and sends them to a Discord Webhook.

## Features

- Polls Weverse API for new notices.
- Sends a rich embed to Discord via Webhook.
- Supports multiple images.
- Designed to run on GitHub Actions (Git Scraping).

    *Note: Locally, it will create a `state.json` file to track the last seen notice.*

## Disclaimer

This is an unofficial tool. Use at your own risk.