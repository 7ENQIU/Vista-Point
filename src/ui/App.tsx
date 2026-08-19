import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { createAndSaveCampaign } from '../application/campaigns/createAndSaveCampaign'
import { importCampaignFile } from '../application/campaigns/importCampaignFile'
import type { CampaignBackup, CampaignRepository } from '../application/ports/CampaignRepository'
import { parseCampaignFile } from '../domain/campaign/campaignFile'
import type { Campaign } from '../domain/campaign/types'
import { IndexedDbCampaignRepository } from '../infrastructure/storage/IndexedDbCampaignRepository'
import { ru } from '../shared/i18n/ru'
import { downloadCampaign } from './downloadCampaign'

interface CampaignOverviewProps {
  campaign: Campaign
  repository: CampaignRepository
  onBack: () => void
  onRestored: (campaign: Campaign) => void
}

function CampaignOverview({ campaign, repository, onBack, onRestored }: CampaignOverviewProps) {
  const [backups, setBackups] = useState<CampaignBackup[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isRestoring, setIsRestoring] = useState(false)
  const counters = [
    [ru.entities, campaign.entities.length],
    [ru.relationships, campaign.relationships.length],
    [ru.events, campaign.eventLog.length],
  ] as const

  useEffect(() => {
    repository.listBackups(campaign.id).then(setBackups).catch(() => setError(ru.storageError))
  }, [campaign.id, repository])

  async function restorePrevious() {
    const latest = backups[0]
    if (!latest || !window.confirm(ru.restoreConfirm)) return

    setError('')
    setMessage('')
    setIsRestoring(true)
    try {
      const restored = await repository.restoreBackup(latest.id)
      const refreshedBackups = await repository.listBackups(restored.id)
      setBackups(refreshedBackups)
      onRestored(restored)
      setMessage(ru.restoreSuccess)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <main className="workspace">
      <button className="text-button" onClick={onBack} type="button">
        ← {ru.back}
      </button>
      <section className="campaign-header">
        <p className="eyebrow">{ru.overview}</p>
        <h1>{campaign.name}</h1>
        <p>{campaign.description || 'Описание пока не добавлено.'}</p>
        <div className="campaign-actions">
          <button onClick={() => downloadCampaign(campaign)} type="button">
            {ru.exportBackup}
          </button>
          <button disabled={!backups.length || isRestoring} onClick={restorePrevious} type="button">
            {isRestoring ? 'Восстанавливаем…' : ru.restorePrevious}
          </button>
        </div>
        <p className="backup-count">{ru.localBackups}: {backups.length}</p>
        {message && <p className="success" role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <section className="metric-grid" aria-label="Состояние кампании">
        {counters.map(([label, value]) => (
          <article className="metric" key={label}>
            <span>{value}</span>
            <p>{label}</p>
          </article>
        ))}
        <article className="metric metric-wide">
          <span className="metric-date">{new Date(campaign.worldTime).toLocaleString('ru-RU')}</span>
          <p>{ru.worldTime}</p>
        </article>
      </section>
      <aside className="notice">{ru.skeletonNotice}</aside>
    </main>
  )
}

function upsertCampaign(campaigns: Campaign[], campaign: Campaign): Campaign[] {
  return [campaign, ...campaigns.filter((item) => item.id !== campaign.id)]
}

export default function App() {
  const repository = useMemo<CampaignRepository>(() => new IndexedDbCampaignRepository(), [])
  const importInput = useRef<HTMLInputElement>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selected, setSelected] = useState<Campaign>()
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    repository
      .list()
      .then(setCampaigns)
      .catch(() => setError(ru.storageError))
      .finally(() => setIsLoading(false))
  }, [repository])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setIsSaving(true)
    try {
      const campaign = await createAndSaveCampaign(repository, { name })
      setCampaigns((current) => upsertCampaign(current, campaign))
      setName('')
      setSelected(campaign)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setError('')
    setMessage('')
    setIsImporting(true)
    try {
      const source = await file.text()
      const preview = parseCampaignFile(source)
      const existing = await repository.getById(preview.id)
      if (existing && !window.confirm(ru.importConfirm)) return

      const result = await importCampaignFile(repository, source)
      setCampaigns((current) => upsertCampaign(current, result.campaign))
      setMessage(result.replaced ? ru.importReplaced : ru.importSuccess)
      setSelected(result.campaign)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ru.storageError)
    } finally {
      setIsImporting(false)
    }
  }

  function handleRestored(campaign: Campaign) {
    setCampaigns((current) => upsertCampaign(current, campaign))
    setSelected(campaign)
  }

  if (selected) {
    return (
      <CampaignOverview
        campaign={selected}
        onBack={() => setSelected(undefined)}
        onRestored={handleRestored}
        repository={repository}
      />
    )
  }

  return (
    <main className="shell">
      <header className="hero">
        <div className="brand-mark" aria-hidden="true">VP</div>
        <div>
          <p className="eyebrow">{ru.appName}</p>
          <h1>{ru.tagline}</h1>
          <div className="badges">
            <span>{ru.localBadge}</span>
            <span>{ru.offlineBadge}</span>
          </div>
        </div>
      </header>

      <section className="content-grid">
        <div>
          <div className="section-title">
            <h2>{ru.campaigns}</h2>
            <span>{campaigns.length}</span>
          </div>
          <div className="list-actions">
            <button
              className="secondary-button"
              disabled={isImporting}
              onClick={() => importInput.current?.click()}
              type="button"
            >
              {isImporting ? ru.importing : ru.importCampaign}
            </button>
            <input
              ref={importInput}
              accept=".json,.vista-point.json,application/json"
              className="visually-hidden"
              onChange={handleImport}
              type="file"
            />
          </div>
          {message && <p className="success" role="status">{message}</p>}
          {error && <p className="page-error" role="alert">{error}</p>}
          {isLoading ? (
            <p className="muted">{ru.loading}</p>
          ) : campaigns.length === 0 ? (
            <div className="empty-state">
              <h3>{ru.emptyTitle}</h3>
              <p>{ru.emptyText}</p>
            </div>
          ) : (
            <div className="campaign-list">
              {campaigns.map((campaign) => (
                <article className="campaign-card" key={campaign.id}>
                  <div>
                    <h3>{campaign.name}</h3>
                    <p>Изменено {new Date(campaign.updatedAt).toLocaleString('ru-RU')}</p>
                  </div>
                  <button onClick={() => setSelected(campaign)} type="button">{ru.open}</button>
                </article>
              ))}
            </div>
          )}
        </div>

        <form className="create-card" onSubmit={handleSubmit}>
          <p className="eyebrow">{ru.newCampaign}</p>
          <label htmlFor="campaign-name">{ru.campaignName}</label>
          <input
            autoComplete="off"
            id="campaign-name"
            onChange={(event) => setName(event.target.value)}
            placeholder={ru.campaignPlaceholder}
            value={name}
          />
          <button className="primary-button" disabled={isSaving} type="submit">
            {isSaving ? ru.creating : ru.create}
          </button>
          <p className="privacy-note">Никаких аккаунтов и сетевой отправки данных.</p>
        </form>
      </section>
    </main>
  )
}
