import { useState } from 'react'
import type { Campaign } from '../domain/campaign/types'
import { formatCampaignDateTime } from '../domain/campaign/calendar'
import { ru } from '../shared/i18n/ru'

export function LogicActivationQueue({ campaign, isSaving, onApply, onDismiss }: {
  campaign: Campaign
  isSaving: boolean
  onApply: (id: string) => Promise<void>
  onDismiss: (id: string) => Promise<void>
}) {
  const [confirmingId, setConfirmingId] = useState('')
  const pending = campaign.logicActivations
    .filter((activation) => activation.status === 'pending')
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt))

  return <section className="logic-queue" aria-labelledby="logic-queue-heading">
    <div className="logic-heading"><div><p className="overline">Trigger Queue</p><h2 id="logic-queue-heading">{ru.logicQueue}</h2><p>{ru.logicQueueHint}</p></div><span>{pending.length}</span></div>
    {pending.length === 0 ? <p className="entity-empty">{ru.logicQueueEmpty}</p> : <div className="logic-queue-list">{pending.map((activation) => {
      const rule = campaign.logicRules.find((item) => item.id === activation.ruleId)
      const due = Date.parse(activation.dueAt) <= Date.parse(campaign.worldTime)
      return <article className="logic-activation-card" key={activation.id}>
        <div><h3>{rule?.name ?? 'Удалённое правило'}</h3><p><strong>{ru.logicActivationDue}:</strong> {formatCampaignDateTime(activation.dueAt, campaign.calendar)}</p><p><strong>{ru.logicActivationSource}:</strong> {activation.evaluationExplanation}</p></div>
        <details><summary>{ru.evaluateRule}</summary><ul>{activation.conditionExplanations.map((item) => <li key={item}>{item}</li>)}</ul><h4>{ru.effectPreview}</h4><ul>{activation.effectExplanations.map((item) => <li key={item}>{item}</li>)}</ul></details>
        {!due && <p className="form-hint">{ru.logicActivationNotDue}</p>}
        {confirmingId === activation.id ? <div className="logic-confirm"><p>{ru.applyRuleQuestion}</p><button className="button button-primary" disabled={isSaving || !due || rule?.executionMode === 'suggest_only'} onClick={() => void onApply(activation.id).then(() => setConfirmingId(''))} type="button">{ru.logicActivationApply}</button><button className="button button-ghost" onClick={() => setConfirmingId('')} type="button">{ru.cancel}</button></div> : <div className="logic-rule-actions"><button className="button button-primary" disabled={!due || rule?.executionMode === 'suggest_only'} onClick={() => setConfirmingId(activation.id)} type="button">{ru.logicActivationApply}</button><button className="danger-link" disabled={isSaving} onClick={() => void onDismiss(activation.id)} type="button">{ru.logicActivationDismiss}</button></div>}
      </article>
    })}</div>}
  </section>
}
