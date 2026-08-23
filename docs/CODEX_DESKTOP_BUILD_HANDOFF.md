# Краткий handoff для Codex: desktop-сборка Vista Point

Этот файл — стартовый контекст для отдельного чата о Windows-сборке. Перед действиями всё равно прочитать `AGENTS.md` и `Vista_Point_Codex_Project_Guidelines.md`, затем проверить фактическое состояние рабочей копии. Не считать приведённый ниже статус вечным.

## Цель

Получить Windows x64 приложение Vista Point на Tauri 2 и русский NSIS-установщик `*-setup.exe`:

- установка для текущего пользователя;
- автономный WebView2 в установщике;
- работа кампаний без сети и аккаунта;
- ручное обновление только после подтверждения пользователя;
- проверка обновления криптографической подписью;
- GitHub workflow создаёт черновик релиза, публикация выполняется отдельно автором.

Основные файлы: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `.github/workflows/desktop-release.yml`. Подробное решение: `docs/DESKTOP_DISTRIBUTION.md`.

## Неподвижные ограничения

- Не коммитить, не создавать ветки, PR, GitHub Release и не публиковать ничего без прямого разрешения автора.
- Не добавлять приватный ключ подписи или пароль в репозиторий, логи, сообщения и скриншоты.
- Не включать пользовательские кампании в сборку или репозиторий.
- Не делать обновления обязательными: основное приложение остаётся offline-first.
- До финального продукта версия начинается с `0`. Нумерация `A.B.C`: `A=1` только для финального продукта, `B` — крупное функциональное обновление, `C` — малое обновление.

## Текущая конфигурация

- Версия проекта: `0.1.0` для milestone-коммита; повышение до `0.1.1` оформляется отдельным коммитом после тега `v0.1.0`.
- Tauri: Windows x64, bundle target `nsis`.
- NSIS: `currentUser`, русский язык.
- WebView2: `offlineInstaller`.
- Updater endpoint: `https://github.com/7ENQIU/Vista-Point/releases/latest/download/latest.json`.
- `createUpdaterArtifacts: true`.
- В `plugins.updater.pubkey` записан публичный ключ рабочего зашифрованного updater-ключа; приватный ключ хранится вне репозитория у автора.
- Workflow `Подготовить desktop-релиз` запускается вручную и создаёт draft release.
- Локально собраны подписанные NSIS и `.sig` для `0.1.0` и `0.1.1`; их копии и контрольные суммы находятся только в игнорируемом `src-tauri/target/updater-test/`.
- Фирменный bootstrapper выбора версий ещё не реализован; делать его после end-to-end проверки первой пары опубликованных подписанных сборок.

## Последний аудит окружения

На 2026-08-23 готовы Node.js 24, npm 11, Git, Rust/Cargo 1.97, target `x86_64-pc-windows-msvc`, WebView2, Visual Studio Build Tools 2022, MSVC, Windows SDK и npm-зависимости. `npm exec tauri info`, `npm run desktop:dev` и две подписанные локальные сборки прошли. При последней проверке именно среда Codex всё ещё получала от `gh auth status` сообщение о недействительном токене; перед GitHub-действиями проверить заново.

Минимальная диагностика:

```powershell
node --version
npm --version
git --version
gh auth status
rustc --version
cargo --version
rustup show active-toolchain
rustup target list --installed
npm exec tauri info
```

Ожидается:

- Node.js 24 и npm 11 или совместимые версии;
- активный GitHub-аккаунт `7ENQIU` с рабочим токеном;
- Rust toolchain `stable-x86_64-pc-windows-msvc`;
- Visual Studio Build Tools 2022 с workload `Desktop development with C++`;
- компоненты MSVC v143 x64/x86 и Windows 10/11 SDK;
- WebView2 Runtime.

Если MSVC/SDK отсутствуют: попросить открыть Visual Studio Installer → Build Tools 2022 → «Изменить» → `Desktop development with C++`, MSVC v143 и Windows 11 SDK. После установки перезапустить терминал/Codex и снова выполнить `npm exec tauri info`.

Если GitHub CLI не авторизован:

```powershell
gh auth login -h github.com -p https -w
```

## Порядок первой локальной сборки

1. Проверить `git status --short` и сохранить все чужие/предыдущие незавершённые изменения.
2. Проверить зависимости через `npm ls --depth=0`; не переустанавливать их без причины.
3. Выполнить:

   ```powershell
   npm run check
   npm exec tauri info
   ```

4. До создания релиза запустить desktop-приложение:

   ```powershell
   npm run desktop:dev
   ```

5. Вручную проверить запуск, создание/открытие кампании, перезапуск с сохранением данных, светлую/тёмную темы, работу без сети и понятное состояние проверки обновлений.
6. До первой сборки updater-артефактов создать ключ подписи в безопасной папке вне репозитория:

   ```powershell
   npm exec tauri signer generate -- -w <безопасный-путь-вне-репозитория>
   ```

7. Вставить только публичный ключ в `plugins.updater.pubkey` файла `src-tauri/tauri.conf.json`. Приватный ключ и пароль хранить отдельно; добавить их в GitHub Secrets только по явному разрешению автора:

   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

8. Передав путь/содержимое приватного ключа Tauri только через предусмотренные переменные окружения, не записывая секрет в файлы проекта. Затем выполнить:

   ```powershell
   npm run desktop:build
   ```

9. Ожидаемый установщик находится в `src-tauri/target/release/bundle/nsis/`. Проверить также updater-артефакт, файл подписи и отсутствие секретов в составе изменений.
10. Установить результат в тестовую папку и проверить запуск без Node.js, Rust и Build Tools. Отдельно проверить на чистой Windows-машине/виртуальной машине автономную установку WebView2.

## Подготовка GitHub-релиза

Выполнять только после прямого разрешения автора.

1. Выбрать версию по правилам `A.B.C`.
2. Синхронно обновить версию в `package.json`, `package-lock.json`, `src-tauri/Cargo.toml` и `src-tauri/tauri.conf.json`.
3. Обновить `CHANGELOG.md` и при необходимости README/desktop-документацию.
4. Выполнить `npm run check` и локальную `npm run desktop:build` с подписью.
5. Проверить `git diff --check`, точный состав изменений и отсутствие кампаний/секретов.
6. Только после согласования оформить тематический коммит и отправить его в GitHub.
7. Вручную запустить workflow `Подготовить desktop-релиз`, указав тег вида `v0.2.0` и русское название.
8. Проверить draft release: NSIS `.exe`, updater archive, `.sig`, `latest.json`, версии, checksum/подпись и текст изменений.
9. Публиковать draft только отдельным подтверждённым действием.

Важно: endpoint `/releases/latest/` не использует draft и prerelease как обычный стабильный выпуск. End-to-end проверка обновления требует контролируемо опубликованных последовательных версий либо отдельного тестового канала.

## Критерий готовности

- `npm run check` прошёл;
- `npm exec tauri info` не сообщает об отсутствии MSVC/SDK;
- `npm run desktop:dev` запускается;
- подписанная `npm run desktop:build` создаёт NSIS и updater-артефакты;
- установка и повторный запуск сохраняют локальные данные;
- приложение работает без сети;
- чистая Windows не требует ручной установки Node.js/Rust/Build Tools;
- обновление отклоняет неверную подпись и устанавливается только после подтверждения;
- секреты и пользовательские данные отсутствуют в Git и артефактах.

## Текст для начала нового чата

> Работай по `docs/CODEX_DESKTOP_BUILD_HANDOFF.md`. Сначала прочитай обязательные инструкции проекта и проверь окружение, не меняя файлы и GitHub. Затем сообщи, готов ли ПК к Tauri-сборке. Если готов — собери и проверь локальный Windows-установщик. Коммиты, push, workflow и релиз выполняй только после моего отдельного разрешения.
