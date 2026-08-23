import { useState, type FormEvent } from 'react'
import type { CampaignEntity, Visibility } from '../domain/campaign/types'
import type {
  EditableEntityStatus,
  UpdateEntityInput,
} from '../domain/campaign/updateEntity'
import { ru } from '../shared/i18n/ru'

interface EntityEditorProps {
  entity: CampaignEntity
  isSaving: boolean
  onCancel: () => void
  onSave: (input: UpdateEntityInput) => Promise<void>
}

function splitList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

export function EntityEditor({ entity, isSaving, onCancel, onSave }: EntityEditorProps) {
  const [name, setName] = useState(entity.name)
  const [aliases, setAliases] = useState(entity.aliases.join(', '))
  const [summary, setSummary] = useState(entity.summary)
  const [description, setDescription] = useState(entity.description)
  const [status, setStatus] = useState<EditableEntityStatus>(
    entity.status === 'active' ? 'active' : 'draft',
  )
  const [visibility, setVisibility] = useState<Visibility>(entity.visibility)
  const [tags, setTags] = useState(entity.tags.join(', '))
  const [characterTags, setCharacterTags] = useState(entity.characterTags.join(', '))
  const [locationLevel, setLocationLevel] = useState(entity.locationLevel ?? 1)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSave({
      name,
      aliases: splitList(aliases),
      summary,
      description,
      status,
      visibility,
      tags: splitList(tags),
      characterTags: splitList(characterTags),
      locationLevel: entity.type === 'location' ? locationLevel : undefined,
    })
  }

  return (
    <form className="entity-editor" onSubmit={handleSubmit}>
      <div className="entity-editor-heading">
        <div>
          <p className="overline">{ru.entityCard}</p>
          <h2>{ru.editEntity}</h2>
        </div>
      </div>

      <p className="entity-editor-type">{ru.entityTypes[entity.type]}</p>

      {entity.type === 'location' && <div className="entity-special-field">
        <label htmlFor="edit-location-level">{ru.locationLevel}</label>
        <input id="edit-location-level" min="1" onChange={(event) => setLocationLevel(Number(event.target.value))} type="number" value={locationLevel} />
        <p className="form-hint">{ru.locationLevelHint}</p>
      </div>}

      {entity.type === 'npc' && <div className="entity-special-field">
        <label htmlFor="edit-character-tags">{ru.characterTags}</label>
        <input autoComplete="off" id="edit-character-tags" onChange={(event) => setCharacterTags(event.target.value)} placeholder={ru.characterTagsPlaceholder} value={characterTags} />
        <p className="form-hint">{ru.characterTagsHint}</p>
      </div>}

      <label htmlFor="edit-entity-name">{ru.entityName}</label>
      <input
        autoComplete="off"
        id="edit-entity-name"
        onChange={(event) => setName(event.target.value)}
        value={name}
      />

      <label htmlFor="edit-entity-aliases">{ru.entityAliases}</label>
      <input
        autoComplete="off"
        id="edit-entity-aliases"
        onChange={(event) => setAliases(event.target.value)}
        placeholder={ru.entityAliasesPlaceholder}
        value={aliases}
      />

      <label htmlFor="edit-entity-summary">{ru.entitySummary}</label>
      <textarea
        id="edit-entity-summary"
        onChange={(event) => setSummary(event.target.value)}
        placeholder={ru.entitySummaryPlaceholder}
        rows={3}
        value={summary}
      />

      <label htmlFor="edit-entity-description">{ru.entityDescription}</label>
      <textarea
        id="edit-entity-description"
        onChange={(event) => setDescription(event.target.value)}
        placeholder={ru.entityDescriptionPlaceholder}
        rows={6}
        value={description}
      />

      <div className="entity-editor-pair">
        <div>
          <label htmlFor="edit-entity-status">{ru.entityStatus}</label>
          <select
            id="edit-entity-status"
            onChange={(event) => setStatus(event.target.value as EditableEntityStatus)}
            value={status}
          >
            <option value="draft">{ru.lifecycleStatuses.draft}</option>
            <option value="active">{ru.lifecycleStatuses.active}</option>
          </select>
        </div>
        <div>
          <label htmlFor="edit-entity-visibility">{ru.entityVisibility}</label>
          <select
            id="edit-entity-visibility"
            onChange={(event) => setVisibility(event.target.value as Visibility)}
            value={visibility}
          >
            <option value="game_master">{ru.visibility.game_master}</option>
            <option value="party">{ru.visibility.party}</option>
            <option value="public">{ru.visibility.public}</option>
          </select>
        </div>
      </div>

      <label htmlFor="edit-entity-tags">{ru.entityTags}</label>
      <input
        autoComplete="off"
        id="edit-entity-tags"
        onChange={(event) => setTags(event.target.value)}
        placeholder={ru.entityTagsPlaceholder}
        value={tags}
      />

      <div className="entity-editor-actions">
        <button className="button button-primary" disabled={isSaving} type="submit">
          {isSaving ? ru.saving : ru.saveChanges}
        </button>
        <button className="button button-ghost" disabled={isSaving} onClick={onCancel} type="button">
          {ru.cancel}
        </button>
      </div>
    </form>
  )
}
