'use client'

// 기능명세 3뷰 셸 클라이언트 컴포넌트 (03-03-PLAN.md Task 3)
//
// - shadcn Tabs로 트리·디렉토리·도큐먼트 3탭 구성 (D-09)
// - 마운트 시 initialItems → useFeaturesStore.setItems (SSR → 클라이언트 상태 동기화)
// - useSseWatcher + SseBanner로 features.json 외부 변경 보호 (D-03)
// - isDirtyRef: 현재 구현에서는 편집 없음 → 항상 false (미래 편집 기능을 위해 구조 확보)

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { SseBanner } from '@/components/prd/SseBanner'
import { useSseWatcher } from '@/components/prd/useSseWatcher'
import { useFeaturesStore } from '@/stores/featuresStore'
import type { Features } from '@/schemas/graph/features'
import { FeatureTree } from './FeatureTree'
import { FeatureDirectory } from './FeatureDirectory'
import { FeatureDocument } from './FeatureDocument'

type FeatureItem = NonNullable<Features['items']>[number]

interface FeaturesShellProps {
  projectId: string
  initialItems: FeatureItem[]
}

export function FeaturesShell({ projectId, initialItems }: FeaturesShellProps) {
  const view = useFeaturesStore((s) => s.view)
  const setView = useFeaturesStore((s) => s.setView)
  const setItems = useFeaturesStore((s) => s.setItems)

  // D-03: 외부 변경 배너 상태
  const [bannerVisible, setBannerVisible] = useState(false)

  // 편집 없음 → isDirtyRef는 항상 false (미래 편집 기능 확보용 구조)
  const isDirtyRef = useRef(false)

  // 마운트 시 서버에서 받은 초기 데이터를 스토어에 주입
  useEffect(() => {
    setItems(initialItems)
  }, [initialItems, setItems])

  // 디스크에서 다시 불러오기
  const reloadFromDisk = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/features`
      )
      if (!res.ok) return
      const json = (await res.json()) as Features
      setItems(json.items ?? [])
      setBannerVisible(false)
    } catch {
      // 네트워크 오류 — 배너 유지
    }
  }, [projectId, setItems])

  // SSE 외부 변경 감지 (D-03)
  const handleExternalChange = useCallback(() => {
    setBannerVisible(true)
  }, [])

  const handleCleanChange = useCallback(() => {
    // isDirty=false 경로: 편집 중이 아닐 때 즉시 반영
    void reloadFromDisk()
  }, [reloadFromDisk])

  useSseWatcher({
    projectId,
    isDirtyRef,
    onExternalChange: handleExternalChange,
    onCleanChange: handleCleanChange,
  })

  return (
    <div className="flex h-full flex-col">
      {/* D-03 외부 변경 배너 */}
      <SseBanner
        visible={bannerVisible}
        onReload={() => void reloadFromDisk()}
        onKeepEditing={() => setBannerVisible(false)}
      />

      {/* 3탭 뷰 */}
      <Tabs
        value={view}
        onValueChange={(v) => setView(v as typeof view)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-4 mt-2 self-start">
          <TabsTrigger value="tree">트리</TabsTrigger>
          <TabsTrigger value="directory">디렉토리</TabsTrigger>
          <TabsTrigger value="document">도큐먼트</TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="min-h-0 flex-1 overflow-auto">
          <FeatureTree projectId={projectId} />
        </TabsContent>
        <TabsContent value="directory" className="min-h-0 flex-1 overflow-auto">
          <FeatureDirectory projectId={projectId} />
        </TabsContent>
        <TabsContent value="document" className="min-h-0 flex-1 overflow-auto">
          <FeatureDocument />
        </TabsContent>
      </Tabs>
    </div>
  )
}
