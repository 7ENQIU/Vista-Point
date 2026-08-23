import { useEffect, useState } from 'react'

type UpdateState = 'idle' | 'checking' | 'available' | 'installing' | 'current' | 'error'
type PendingUpdate = Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater')['check']>>

function isDesktopApp(): boolean {
  return '__TAURI_INTERNALS__' in window
}
export function DesktopUpdateCard() {
  const [state, setState] = useState<UpdateState>('idle')
  const [currentVersion, setCurrentVersion] = useState('web')
  const [nextVersion, setNextVersion] = useState('')
  const [progress, setProgress] = useState(0)
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate>()
  const desktop = isDesktopApp()

  useEffect(() => {
    if (!desktop) return
    void import('@tauri-apps/api/app').then(({ getVersion }) => getVersion()).then(setCurrentVersion).catch(() => setCurrentVersion('неизвестна'))
  }, [desktop])

  async function checkForUpdate() {
    setState('checking')
    setProgress(0)
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()
      setPendingUpdate(update)
      if (!update) {
        setState('current')
        return
      }
      setNextVersion(update.version)
      setState('available')
    } catch {
      setState('error')
    }
  }

  async function installUpdate() {
    if (!pendingUpdate) return
    setState('installing')
    let downloaded = 0
    let total = 0
    try {
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0
        if (event.event === 'Progress') downloaded += event.data.chunkLength
        setProgress(total > 0 ? Math.min(100, Math.round(downloaded / total * 100)) : 0)
      })
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch {
      setState('error')
    }
  }

  return (
    <section className="desktop-update-card" aria-labelledby="desktop-update-heading">
      <div>
        <p className="overline">Версия приложения</p>
        <h2 id="desktop-update-heading">Обновления Vista Point</h2>
        <p>{desktop ? `Установлена версия ${currentVersion}. Кампании остаются на этом компьютере.` : 'Проверка обновлений доступна в установленной версии для Windows.'}</p>
      </div>
      <div className="desktop-update-actions">
        {state === 'available' ? (
          <button className="button button-primary" onClick={() => void installUpdate()} type="button">Установить {nextVersion}</button>
        ) : (
          <button className="button button-secondary" disabled={!desktop || state === 'checking' || state === 'installing'} onClick={() => void checkForUpdate()} type="button">
            {state === 'checking' ? 'Проверяем…' : 'Проверить обновления'}
          </button>
        )}
        <span aria-live="polite">
          {state === 'current' && 'Установлена актуальная версия.'}
          {state === 'available' && `Доступна версия ${nextVersion}.`}
          {state === 'installing' && `Загрузка и установка${progress ? ` — ${progress}%` : '…'}`}
          {state === 'error' && 'Не удалось проверить обновление. Локальная работа не прервана.'}
        </span>
      </div>
    </section>
  )
}
