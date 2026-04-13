'use client'

import { useMemo, useEffect, useRef } from 'react'
import { VideoEditorPage } from '@/features/video-editor'
import { useWorkspaceStageRuntime } from '../WorkspaceStageRuntimeContext'
import { useWorkspaceEpisodeStageData } from '../hooks/useWorkspaceEpisodeStageData'
import { useWorkspaceProvider } from '../WorkspaceProvider'
import { createProjectFromPanels } from '@/features/video-editor'

interface StoryboardPanel {
  id: string
  storyboardId: string
  panelIndex?: number
  videoUrl?: string
  imageUrl?: string
  lipSyncVideoUrl?: string
  description?: string
  duration?: number
}

interface VoiceLineRaw {
  id: string
  speaker: string
  content: string
  audioUrl?: string | null
  matchedStoryboardId?: string | null
  matchedPanelIndex?: number | null
}

export default function EditorStageRoute() {
  const runtime = useWorkspaceStageRuntime()
  const { projectId, episodeId, refreshData } = useWorkspaceProvider()
  const { storyboards, voiceLines } = useWorkspaceEpisodeStageData()
  const mountedRef = useRef(false)

  useEffect(() => {
    if (mountedRef.current) {
      refreshData()
    }
    mountedRef.current = true
  }, [refreshData])

  const panels = useMemo(() => {
    const allPanels: StoryboardPanel[] = []
    for (const sb of storyboards) {
      if (sb.panels) {
        for (const panel of sb.panels) {
          allPanels.push({
            id: panel.id,
            storyboardId: sb.id,
            panelIndex: panel.panelIndex,
            videoUrl: panel.videoUrl ?? undefined,
            imageUrl: panel.imageUrl ?? undefined,
            lipSyncVideoUrl: panel.lipSyncVideoUrl ?? undefined,
            description: panel.description ?? undefined,
            duration: panel.duration ?? undefined,
          })
        }
      }
    }
    return allPanels
  }, [storyboards])

  const typedVoiceLines = useMemo(() => {
    return (voiceLines as VoiceLineRaw[]).map((vl) => ({
      id: vl.id,
      speaker: vl.speaker,
      content: vl.content,
      audioUrl: vl.audioUrl,
      matchedStoryboardId: vl.matchedStoryboardId,
      matchedPanelIndex: vl.matchedPanelIndex,
    }))
  }, [voiceLines])

  const initialProject = useMemo(() => {
    return createProjectFromPanels(episodeId || '', panels, typedVoiceLines)
  }, [episodeId, panels, typedVoiceLines])

  if (!episodeId) return null

  return (
    <VideoEditorPage
      projectId={projectId}
      episodeId={episodeId}
      initialProject={initialProject}
      onBack={() => runtime.onStageChange('videos')}
    />
  )
}