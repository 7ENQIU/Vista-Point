import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { buildLogicCanvas, type LogicCanvasNode } from '../application/campaigns/buildLogicCanvas'
import type { Campaign } from '../domain/campaign/types'
import { previewLogicRule, type SetLogicRuleInput } from '../domain/campaign/logicRules'
import {
  LocalCanvasViewportRepository,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  type CanvasViewport,
} from '../infrastructure/storage/LocalCanvasViewportRepository'
import { LogicRuleCanvasEditor } from './LogicRuleCanvasEditor'

interface LogicCanvasProps {
  campaign: Campaign
  onApplyRule?: (ruleId: string) => Promise<void>
  onOpenEntity?: (entityId: string) => void
  onSaveRule?: (input: SetLogicRuleInput) => Promise<void>
  onRemoveRule?: (ruleId: string) => Promise<void>
}

function shortened(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}

const kindLabels: Record<LogicCanvasNode['kind'], string> = {
  event: 'Событие',
  condition: 'Условие',
  result: 'Результат',
}

interface CanvasPanState {
  pointerId: number
  startClientX: number
  startClientY: number
  startViewport: CanvasViewport
}

function centeredViewport(width: number, height: number): CanvasViewport {
  return { centerX: width / 2, centerY: height / 2, zoom: 1 }
}

function clampViewport(viewport: CanvasViewport, width: number, height: number): CanvasViewport {
  const zoom = Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, viewport.zoom))
  const visibleWidth = width / zoom
  const visibleHeight = height / zoom
  const centerX = visibleWidth >= width ? width / 2 : Math.min(width - visibleWidth / 2, Math.max(visibleWidth / 2, viewport.centerX))
  const centerY = visibleHeight >= height ? height / 2 : Math.min(height - visibleHeight / 2, Math.max(visibleHeight / 2, viewport.centerY))
  return { centerX, centerY, zoom }
}

export function LogicCanvas({ campaign, onApplyRule, onOpenEntity, onSaveRule, onRemoveRule }: LogicCanvasProps) {
  const projection = useMemo(() => buildLogicCanvas(campaign), [campaign])
  const viewportRepository = useMemo(() => {
    try { return new LocalCanvasViewportRepository(window.localStorage) } catch { return undefined }
  }, [])
  const [viewport, setViewport] = useState<CanvasViewport>(() => clampViewport(
    viewportRepository?.load(campaign.id, 'logic') ?? centeredViewport(projection.width, projection.height),
    projection.width, projection.height,
  ))
  const viewportRef = useRef(viewport)
  const svgRef = useRef<SVGSVGElement>(null)
  const [viewportStatus, setViewportStatus] = useState('')
  const [panState, setPanState] = useState<CanvasPanState>()
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [isMaximized, setIsMaximized] = useState(false)
  const maximizedScrollRef = useRef({ x: 0, y: 0 })
  const [editingRuleId, setEditingRuleId] = useState<string>()
  const [confirmingRuleId, setConfirmingRuleId] = useState('')
  const [applyingRuleId, setApplyingRuleId] = useState('')
  const [applyError, setApplyError] = useState('')
  const selectedNode = projection.nodes.find((node) => node.id === selectedNodeId)
  const selectedRule = selectedNode ? campaign.logicRules.find((rule) => rule.id === selectedNode.ruleId) : undefined
  const selectedPreview = selectedRule ? previewLogicRule(campaign, selectedRule) : undefined
  const preparedChangeCount = selectedPreview?.effects.filter((effect) => effect.changed).length ?? 0

  useEffect(() => { viewportRef.current = viewport }, [viewport])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      changeZoom(event.deltaY < 0 ? 0.1 : -0.1)
    }
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [campaign.id, projection.height, projection.width, viewportRepository])

  useEffect(() => {
    if (confirmingRuleId && confirmingRuleId !== selectedRule?.id) setConfirmingRuleId('')
    setApplyError('')
  }, [selectedRule?.id])

  useEffect(() => {
    const loaded = viewportRepository?.load(campaign.id, 'logic')
    const next = clampViewport(loaded ?? centeredViewport(projection.width, projection.height), projection.width, projection.height)
    viewportRef.current = next
    setViewport(next)
    setViewportStatus(loaded ? 'Положение логического канваса восстановлено.' : '')
  }, [campaign.id, viewportRepository])

  useEffect(() => {
    setViewport((current) => {
      const next = clampViewport(current, projection.width, projection.height)
      viewportRef.current = next
      return next
    })
  }, [projection.height, projection.width])

  useEffect(() => {
    if (!isMaximized) return
    document.body.classList.add('has-maximized-canvas')
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      setIsMaximized(false)
    }
    window.addEventListener('keydown', close)
    return () => {
      document.body.classList.remove('has-maximized-canvas')
      window.removeEventListener('keydown', close)
      const { x, y } = maximizedScrollRef.current
      window.requestAnimationFrame(() => window.scrollTo(x, y))
    }
  }, [isMaximized])

  function toggleMaximized() {
    setIsMaximized((current) => {
      if (!current) maximizedScrollRef.current = { x: window.scrollX, y: window.scrollY }
      return !current
    })
  }

  function persistViewport(next: CanvasViewport, message = 'Положение логического канваса сохранено локально.') {
    const normalized = clampViewport(next, projection.width, projection.height)
    viewportRef.current = normalized
    setViewport(normalized)
    try {
      if (!viewportRepository) throw new Error('Local storage is unavailable')
      viewportRepository.save(campaign.id, 'logic', normalized)
      setViewportStatus(message)
    } catch { setViewportStatus('Не удалось сохранить положение канваса на этом устройстве.') }
  }

  function changeZoom(delta: number) {
    persistViewport({ ...viewportRef.current, zoom: viewportRef.current.zoom + delta })
  }

  function resetViewport() {
    const next = centeredViewport(projection.width, projection.height)
    viewportRef.current = next
    setViewport(next)
    try {
      if (!viewportRepository) throw new Error('Local storage is unavailable')
      viewportRepository.clear(campaign.id, 'logic')
      setViewportStatus('Обзор логического канваса восстановлен.')
    } catch { setViewportStatus('Обзор восстановлен без сохранения настройки.') }
  }

  function startPan(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || (event.target as Element).closest('.logic-canvas-node')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setPanState({ pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, startViewport: viewportRef.current })
  }

  function movePan(event: ReactPointerEvent<SVGSVGElement>) {
    if (!panState || panState.pointerId !== event.pointerId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const next = clampViewport({
      ...panState.startViewport,
      centerX: panState.startViewport.centerX - (event.clientX - panState.startClientX) * (projection.width / panState.startViewport.zoom) / bounds.width,
      centerY: panState.startViewport.centerY - (event.clientY - panState.startClientY) * (projection.height / panState.startViewport.zoom) / bounds.height,
    }, projection.width, projection.height)
    viewportRef.current = next
    setViewport(next)
  }

  function finishPan(event: ReactPointerEvent<SVGSVGElement>) {
    if (!panState || panState.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setPanState(undefined)
    persistViewport(viewportRef.current)
  }

  async function applySelectedRule() {
    if (!selectedRule || !onApplyRule) return
    setApplyingRuleId(selectedRule.id)
    setApplyError('')
    try {
      await onApplyRule(selectedRule.id)
      setConfirmingRuleId('')
    } catch (caught) {
      setApplyError(caught instanceof Error ? caught.message : 'Не удалось применить правило.')
    } finally { setApplyingRuleId('') }
  }

  const viewWidth = projection.width / viewport.zoom
  const viewHeight = projection.height / viewport.zoom
  const viewBox = `${viewport.centerX - viewWidth / 2} ${viewport.centerY - viewHeight / 2} ${viewWidth} ${viewHeight}`

  return (
    <section className={`campaign-graph-section logic-canvas-section${isMaximized ? ' is-maximized' : ''}`} aria-labelledby="logic-canvas-heading">
      <div className="graph-heading">
        <div>
          <p className="overline">Предикативная логика</p>
          <h2 id="logic-canvas-heading">Граф логики</h2>
          <p>События запускают проверку условий, а результаты показывают подготовленные последствия. Этот режим ничего не применяет автоматически.</p>
        </div>
        <div className="graph-layout-actions">
          {onSaveRule && <button onClick={() => setEditingRuleId('')} type="button">+ Новое правило</button>}
          <div className="logic-viewport-actions" role="group" aria-label="Масштаб логического канваса">
            <button aria-label="Уменьшить масштаб" disabled={viewport.zoom <= MIN_CANVAS_ZOOM} onClick={() => changeZoom(-0.1)} type="button">−</button>
            <button aria-label="Вернуть обзор" onClick={resetViewport} type="button">{Math.round(viewport.zoom * 100)}%</button>
            <button aria-label="Увеличить масштаб" disabled={viewport.zoom >= MAX_CANVAS_ZOOM} onClick={() => changeZoom(0.1)} type="button">+</button>
          </div>
          <button aria-pressed={isMaximized} onClick={toggleMaximized} type="button">
            {isMaximized ? 'Свернуть канвас' : 'На весь экран'}
          </button>
        </div>
      </div>

      {projection.nodes.length === 0 && editingRuleId === undefined ? (
        <div className="graph-empty logic-canvas-empty">
          <span aria-hidden="true">◇</span>
          <div><h3>Логических правил пока нет</h3><p>Создайте первое событие, условие и подготовленный результат прямо на канвасе.</p></div>
        </div>
      ) : (
        <div className="graph-layout logic-canvas-layout">
          <div className="graph-scroll" tabIndex={0} aria-label="Область графа логики. Tab переключает режим канваса.">
            <svg
              ref={svgRef}
              className={`campaign-graph logic-canvas${panState ? ' is-panning' : ''}`}
              onPointerCancel={finishPan} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={finishPan}
              role="img" viewBox={viewBox}
            >
              <title>Граф логики проекта «{campaign.name}»</title>
              <desc>Правила кампании в виде цепочек событий, условий и результатов.</desc>
              <defs><marker id="logic-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4"><path d="M 0 0 L 8 4 L 0 8 z" /></marker></defs>
              <g aria-hidden="true">
                {projection.edges.map((edge) => <g className={`logic-canvas-edge is-${edge.state}`} key={edge.id}>
                  <path d={edge.path} markerEnd="url(#logic-arrow)" />
                  <text x={projection.nodes.find((node) => node.id === edge.sourceId)!.x + 174} y={projection.nodes.find((node) => node.id === edge.sourceId)!.y - 8}>{edge.label}</text>
                </g>)}
              </g>
              {projection.nodes.map((node) => <g
                aria-label={`${kindLabels[node.kind]}: ${node.title}`}
                aria-pressed={selectedNodeId === node.id}
                className={`logic-canvas-node is-${node.kind} is-${node.state}${selectedNodeId === node.id ? ' is-selected' : ''}`}
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedNodeId(node.id) } }}
                role="button"
                tabIndex={0}
                transform={`translate(${node.x - node.width / 2} ${node.y - node.height / 2})`}
              >
                <rect height={node.height} rx="12" width={node.width} />
                <text className="logic-node-kind" x="16" y="22">{kindLabels[node.kind]}</text>
                <text className="logic-node-title" x="16" y="46">{shortened(node.title, 28)}</text>
                <text className="logic-node-subtitle" x="16" y="67">{shortened(node.subtitle, 36)}</text>
              </g>)}
            </svg>
            {viewportStatus && <p className="logic-viewport-status" role="status">{viewportStatus}</p>}
          </div>
          <aside className="graph-inspector" aria-live="polite">
            {editingRuleId !== undefined && onSaveRule ? <LogicRuleCanvasEditor
              campaign={campaign}
              key={editingRuleId || 'new'}
              onCancel={() => setEditingRuleId(undefined)}
              onRemove={onRemoveRule}
              onSave={onSaveRule}
              rule={editingRuleId ? campaign.logicRules.find((rule) => rule.id === editingRuleId) : undefined}
            /> : selectedNode ? <>
              <div className="graph-inspector-heading"><div><span>{kindLabels[selectedNode.kind]}</span><h3>{selectedNode.title}</h3></div><button className="text-button" onClick={() => setSelectedNodeId('')} type="button">Снять фокус</button></div>
              <p>{selectedNode.subtitle}</p>
              <div className="logic-canvas-details">{selectedNode.details.map((detail, index) => <p key={`${selectedNode.id}:${index}`}>{detail}</p>)}</div>
              {selectedNode.relatedEntityIds.length > 0 && <div className="logic-canvas-entities">{[...new Set(selectedNode.relatedEntityIds)].map((entityId) => {
                const entity = campaign.entities.find((item) => item.id === entityId)
                return <button className="link-button" key={entityId} onClick={() => onOpenEntity?.(entityId)} type="button">{entity?.name ?? 'Архивная сущность'}</button>
              })}</div>}
              {selectedRule && selectedPreview && <div className="logic-apply-preview">
                <div className="logic-apply-preview-heading"><strong>Предпросмотр применения</strong><span className={selectedPreview.evaluation.satisfied ? 'logic-pass' : 'logic-fail'}>{selectedPreview.evaluation.satisfied ? 'Условия выполнены' : 'Условия не выполнены'}</span></div>
                <p>{selectedPreview.evaluation.explanation}</p>
                <ul>{selectedPreview.effects.map((effect) => <li className={effect.changed ? '' : 'is-unchanged'} key={effect.effectId}><span>{effect.changed ? 'Изменение' : 'Без изменений'}</span>{effect.explanation}</li>)}</ul>
                {applyError && <p className="form-inline-error" role="alert">{applyError}</p>}
                {selectedRule.executionMode === 'suggest_only' ? <p className="logic-apply-note">Это правило работает только как предложение и не может изменять кампанию.</p> : confirmingRuleId === selectedRule.id ? <div className="logic-apply-confirm">
                  <p>Применить подготовленные изменения? Перед записью условия будут проверены повторно по актуальным данным.</p>
                  <div><button className="button button-primary" disabled={applyingRuleId === selectedRule.id || !selectedPreview.canApply || preparedChangeCount === 0} onClick={() => void applySelectedRule()} type="button">{applyingRuleId === selectedRule.id ? 'Применяем…' : `Применить изменений: ${preparedChangeCount}`}</button><button className="button button-ghost" disabled={applyingRuleId === selectedRule.id} onClick={() => setConfirmingRuleId('')} type="button">Отмена</button></div>
                </div> : <>
                  <button className="button button-primary button-block" disabled={!onApplyRule || !selectedPreview.canApply || preparedChangeCount === 0} onClick={() => setConfirmingRuleId(selectedRule.id)} type="button">Перейти к подтверждению</button>
                  {!selectedRule.enabled && <p className="logic-apply-note">Сначала включите правило.</p>}
                  {selectedRule.enabled && !selectedPreview.evaluation.satisfied && <p className="logic-apply-note">Применение станет доступно, когда корневая группа условий выполнится.</p>}
                  {selectedPreview.canApply && preparedChangeCount === 0 && <p className="logic-apply-note">Все подготовленные значения уже установлены.</p>}
                </>}
              </div>}
              {onSaveRule && <button className="button button-secondary button-block" onClick={() => setEditingRuleId(selectedNode.ruleId)} type="button">Редактировать правило</button>}
              <p className="logic-canvas-safety">Выбор узла и предпросмотр ничего не меняют. Применение требует отдельного подтверждения мастера.</p>
            </> : <div className="graph-inspector-empty"><span aria-hidden="true">◇</span><h3>Выберите узел логики</h3><p>Инспектор покажет объяснение проверки и связанные сущности.</p></div>}
          </aside>
        </div>
      )}
    </section>
  )
}
