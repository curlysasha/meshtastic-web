import { X, MapPin, Battery, Signal, Cpu, Route, Loader2, AlertCircle, Map as MapIcon, MessageSquare, Maximize2, Zap, Activity, HardDrive } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMeshStore } from '@/store'
import { useTraceroute } from '@/hooks/useApi'
import { cn, getNodeName } from '@/lib/utils'
import { useEffect, useMemo, useRef, useState, useId } from 'react'
import { Map as MapLibreMap, NavigationControl, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const OSM_RASTER_STYLE = {
  version: 8,
  name: 'OSM',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '© OpenStreetMap contributors'
    }
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm'
    }
  ],
} as const

function formatCoord(value: number | undefined, digits = 5) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Unknown'
  return value.toFixed(digits)
}

function MapView({
  latitude,
  longitude,
  zoom = 12,
  interactive = false,
  showAttribution = true,
  className,
}: {
  latitude: number
  longitude: number
  zoom?: number
  interactive?: boolean
  showAttribution?: boolean
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)

  // Create map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapRef.current = new MapLibreMap({
      container: containerRef.current,
      style: OSM_RASTER_STYLE as any,
      center: [longitude, latitude],
      zoom,
      interactive,
      attributionControl: showAttribution ? undefined : false,
      maxZoom: 18,
    })
    if (interactive) {
      mapRef.current.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    }

    const markerEl = document.createElement('div')
    markerEl.className = 'w-3 h-3 rounded-full bg-primary ring-2 ring-white shadow-[0_0_0_4px_rgba(0,0,0,0.15)]'
    markerRef.current = new Marker({ element: markerEl, anchor: 'center' })
      .setLngLat([longitude, latitude])
      .addTo(mapRef.current)

    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync view when coords/zoom change
  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.setCenter([longitude, latitude])
    mapRef.current.setZoom(zoom)
    mapRef.current.resize()
    markerRef.current?.setLngLat([longitude, latitude])
  }, [latitude, longitude, zoom])

  return (
    <div ref={containerRef} className={cn('relative rounded-lg overflow-hidden', className)} />
  )
}

type TraceMapPoint = {
  id: string
  name: string
  lat: number
  lon: number
  role: 'source' | 'dest' | 'hop'
  hasCoords: boolean
  direction: 'forward' | 'back'
  order: number
  shortName?: string
}

type TraceMapSegment = {
  coords: [number, number][]
  direction: 'forward' | 'back'
  approximate?: boolean
  distanceKm?: number
}

function TraceRouteMap({
  points,
  segments,
  interactive = false,
  showAttribution = true,
  className,
}: {
  points: TraceMapPoint[]
  segments: TraceMapSegment[]
  totalDistanceKm?: number
  directionDistance?: { forward?: number; back?: number }
  interactive?: boolean
  showAttribution?: boolean
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const id = useId().replace(/:/g, '')

  const geoData = useMemo(() => {
    const features: any[] = []

    segments.forEach((seg) => {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: seg.coords,
        },
        properties: { direction: seg.direction, approximate: !!seg.approximate },
      })
    })

    points.forEach((p) => {
      if (!p.hasCoords) return
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: { role: p.role, name: p.name },
      })
    })

    return { type: 'FeatureCollection' as const, features }
  }, [points, segments])

  const bounds = useMemo(() => {
    const coords = points.filter((p) => p.hasCoords).map((p) => [p.lon, p.lat]) as [number, number][]
    if (coords.length === 0) return null
    const lons = coords.map((c) => c[0])
    const lats = coords.map((c) => c[1])
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    return {
      sw: [minLon, minLat] as [number, number],
      ne: [maxLon, maxLat] as [number, number],
    }
  }, [points])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const firstWithCoords = points.find(p => p.hasCoords)
    const map = new MapLibreMap({
      container: containerRef.current,
      style: OSM_RASTER_STYLE as any,
      center: firstWithCoords ? [firstWithCoords.lon, firstWithCoords.lat] : [0, 0],
      zoom: 8,
      interactive,
      attributionControl: showAttribution ? undefined : false,
    })
    if (interactive) {
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    }
    mapRef.current = map

    const onLoad = () => {
      map.addSource(`${id}-trace`, {
        type: 'geojson',
        data: geoData,
      })

      map.addLayer({
        id: `${id}-line-forward`,
        type: 'line',
        source: `${id}-trace`,
        filter: ['all', ['==', ['get', 'direction'], 'forward'], ['!', ['get', 'approximate']]],
        paint: {
          'line-color': '#2563eb',
          'line-width': 3,
          'line-opacity': 0.85,
        },
      })

      map.addLayer({
        id: `${id}-line-back`,
        type: 'line',
        source: `${id}-trace`,
        filter: ['all', ['==', ['get', 'direction'], 'back'], ['!', ['get', 'approximate']]],
        paint: {
          'line-color': '#16a34a',
          'line-width': 3,
          'line-opacity': 0.7,
        },
      })

      map.addLayer({
        id: `${id}-line-approx`,
        type: 'line',
        source: `${id}-trace`,
        filter: ['==', ['get', 'approximate'], true],
        paint: {
          'line-color': '#94a3b8',
          'line-width': 2.5,
          'line-opacity': 0.8,
          'line-dasharray': [1.5, 1.5],
        },
      })

      map.addLayer({
        id: `${id}-points`,
        type: 'circle',
        source: `${id}-trace`,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': [
            'match',
            ['get', 'role'],
            'source',
            7,
            'dest',
            7,
            5,
          ],
          'circle-color': [
            'match',
            ['get', 'role'],
            'source',
            '#2563eb',
            'dest',
            '#16a34a',
            '#f59e0b',
          ],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      })

      if (bounds) {
        map.fitBounds([bounds.sw, bounds.ne], { padding: 40, duration: 0 })
      }
    }

    if (map.isStyleLoaded()) {
      onLoad()
    } else {
      map.on('load', onLoad)
    }

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const labelMarkersRef = useRef<Marker[]>([])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource(`${id}-trace`) as any
    if (source?.setData) {
      source.setData(geoData)
    }

    // Update markers for labels
    labelMarkersRef.current.forEach((m) => m.remove())
    labelMarkersRef.current = []

    points.forEach((p) => {
      if (!p.hasCoords) return
      const el = document.createElement('div')
      el.className = 'px-1.5 py-0.5 bg-white/90 rounded border border-white/50 shadow-sm text-[12px] font-medium text-slate-900 pointer-events-none whitespace-nowrap'
      el.innerText = p.shortName || p.name

      const marker = new Marker({
        element: el,
        anchor: 'bottom',
        offset: [0, -12], // Position above the circle point
      })
        .setLngLat([p.lon, p.lat])
        .addTo(map)

      labelMarkersRef.current.push(marker)
    })

    if (bounds) {
      map.fitBounds([bounds.sw, bounds.ne], { padding: 40, duration: 300 })
    }
  }, [geoData, bounds, id, points])

  return <div ref={containerRef} className={cn('relative rounded-lg overflow-hidden', className)} />
}

function GlobalNetworkMap({
  nodes,
  onSelectNode,
  className,
  showAttribution = true,
  showLabels = true
}: {
  nodes: any[],
  onSelectNode: (node: any) => void,
  className?: string,
  showAttribution?: boolean,
  showLabels?: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const isUserInteracting = useRef(false)

  const nodesWithCoords = useMemo(() => {
    return nodes.filter(n => n.position?.latitude && n.position?.longitude)
  }, [nodes])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Calculate a proper initial center: bounding box center if possible
    let center: [number, number] = [0, 0]
    if (nodesWithCoords.length > 0) {
      const lats = nodesWithCoords.map(n => n.position.latitude)
      const lons = nodesWithCoords.map(n => n.position.longitude)
      center = [
        (Math.min(...lons) + Math.max(...lons)) / 2,
        (Math.min(...lats) + Math.max(...lats)) / 2
      ]
    }

    mapRef.current = new MapLibreMap({
      container: containerRef.current,
      style: OSM_RASTER_STYLE as any,
      center,
      zoom: 12, // Decent starting point
      interactive: true,
      attributionControl: showAttribution ? undefined : false,
    })

    mapRef.current.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, []) // Initial load only

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear old markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    nodesWithCoords.forEach(node => {
      const el = document.createElement('div')
      el.className = 'group cursor-pointer flex flex-col items-center'

      // Marker Dot
      const dot = document.createElement('div')
      dot.className = 'w-3 h-3 rounded-full bg-primary ring-2 ring-white shadow-md transition-transform group-hover:scale-125'
      el.appendChild(dot)

      // Label
      if (showLabels) {
        const label = document.createElement('div')
        label.className = 'mt-1 px-2 py-1 bg-white/90 rounded-md border border-white/50 shadow-sm text-[13px] font-bold text-slate-900 group-hover:bg-primary group-hover:text-white transition-colors whitespace-nowrap'
        label.textContent = node.user?.shortName || node.user?.longName || node.id
        el.appendChild(label)
      }

      el.onclick = () => onSelectNode(node)

      const marker = new Marker({ element: el, anchor: 'top' })
        .setLngLat([node.position.longitude, node.position.latitude])
        .addTo(map)

      markersRef.current.push(marker)
    })

    // Fit bounds if we have nodes - ONLY if user hasn't taken control
    if (nodesWithCoords.length > 0 && !isUserInteracting.current) {
      if (nodesWithCoords.length > 1) {
        const lats = nodesWithCoords.map(n => n.position.latitude)
        const lons = nodesWithCoords.map(n => n.position.longitude)
        map.fitBounds([
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)]
        ], {
          padding: 50,
          duration: 500
        })
      } else {
        map.setCenter([nodesWithCoords[0].position.longitude, nodesWithCoords[0].position.latitude])
        map.setZoom(13)
      }
    }
  }, [nodesWithCoords, onSelectNode])

  return <div ref={containerRef} className={cn('relative w-full h-full', className)} />
}

export function NodeInfoPanel() {
  const {
    selectedNode, setSelectedNode,
    isNetworkMapOpen, setIsNetworkMapOpen,
    tracerouteResult, setTracerouteResult,
    nodes, status, setActiveTab
  } = useMeshStore()
  const traceroute = useTraceroute()
  const [tracerouteTimeout, setTracerouteTimeout] = useState(false)
  const [tracerouteCountdown, setTracerouteCountdown] = useState(60)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [tracerouteInProgress, setTracerouteInProgress] = useState(false)
  const tracerouteInProgressRef = useRef(false)
  const [isMapOpen, setIsMapOpen] = useState(false)
  const [isTraceMapOpen, setIsTraceMapOpen] = useState(false)
  const [routeViewMode, setRouteViewMode] = useState<'forward' | 'back'>('forward')
  const [isGlobalMapModalOpen, setIsGlobalMapModalOpen] = useState(false)

  const handleClose = () => {
    setSelectedNode(null)
    setIsNetworkMapOpen(false)
  }

  const handleTraceroute = () => {
    if (selectedNode?.id) {
      // Clear old traceroute result and timeout state
      setTracerouteResult(null)
      setTracerouteTimeout(false)
      setTracerouteCountdown(60)
      setTracerouteInProgress(true)
      tracerouteInProgressRef.current = true

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
      }

      traceroute.mutate(selectedNode.id)

      // Set timeout for 60 seconds
      timeoutRef.current = setTimeout(() => {
        if (!tracerouteInProgressRef.current) return
        setTracerouteTimeout(true)
        setTracerouteInProgress(false)
        tracerouteInProgressRef.current = false
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current)
          countdownIntervalRef.current = null
        }
      }, 60000)

      countdownIntervalRef.current = setInterval(() => {
        setTracerouteCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current as ReturnType<typeof setInterval>)
            countdownIntervalRef.current = null
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
  }

  // Clear timeout when result arrives
  useEffect(() => {
    if (tracerouteResult && selectedNode && tracerouteResult.from === selectedNode.id) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
      setTracerouteTimeout(false)
      setTracerouteCountdown(60)
      setTracerouteInProgress(false)
      tracerouteInProgressRef.current = false
    }
  }, [tracerouteResult, selectedNode?.id])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
      }
      setTracerouteInProgress(false)
      tracerouteInProgressRef.current = false
    }
  }, [])

  // Check if traceroute result is for the currently selected node
  const isTracerouteForThisNode = tracerouteResult && selectedNode && tracerouteResult.from === selectedNode.id

  const formatLastHeard = (timestamp?: number) => {
    if (!timestamp) return 'Unknown'
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return date.toLocaleDateString()
  }

  const getNodeCoords = (node?: typeof nodes[number] | null) => {
    if (!node?.position) return null
    const { latitude, longitude } = node.position
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null
    return { lat: latitude, lon: longitude }
  }

  const formatKm = (value?: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
    return value >= 1 ? `${value.toFixed(1)} км` : `${(value * 1000).toFixed(0)} м`
  }

  const haversineKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const R = 6371
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const dLat = toRad(b.lat - a.lat)
    const dLon = toRad(b.lon - a.lon)
    const lat1 = toRad(a.lat)
    const lat2 = toRad(b.lat)
    const aVal =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const cVal = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal))
    return R * cVal
  }




  const meshStats = useMemo(() => {
    const total = nodes.length
    if (total === 0) return null

    const withBattery = nodes.filter(n => n.deviceMetrics?.batteryLevel !== undefined)
    const avgBattery = withBattery.length > 0
      ? Math.round(withBattery.reduce((acc, n) => acc + (n.deviceMetrics?.batteryLevel || 0), 0) / withBattery.length)
      : null

    const hwModels: Record<string, number> = {}
    nodes.forEach(n => {
      const model = n.user?.hwModel || 'Unknown'
      hwModels[model] = (hwModels[model] || 0) + 1
    })
    const sortedHw = Object.entries(hwModels)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    const withCoords = nodes.filter(n => n.position?.latitude && n.position?.longitude).length
    const online = nodes.filter(n => {
      const now = Math.floor(Date.now() / 1000)
      return n.lastHeard && (now - n.lastHeard < 3600) // Online if heard in last hour
    }).length

    return { total, avgBattery, sortedHw, withCoords, online }
  }, [nodes])

  const traceMapData = useMemo(() => {
    if (!isTracerouteForThisNode || !tracerouteResult || !selectedNode) return null

    // Improved node finding helper
    const findNodeByIdOrNum = (id?: string | null, num?: number | null) => {
      if (!id && !num) return null
      return nodes.find((n) =>
        (id && n.id?.toLowerCase() === id.toLowerCase()) ||
        (num !== undefined && num !== null && num !== 0 && n.num === num)
      )
    }

    const myNodeFromStore = findNodeByIdOrNum(status.my_node_id, status.my_node_num)
    const myNode = myNodeFromStore || (status.my_node_id ? {
      id: status.my_node_id,
      num: status.my_node_num || 0,
      user: { longName: 'Me (Local Node)', shortName: 'Me', hwModel: '', id: status.my_node_id },
      num_actual: status.my_node_num
    } : null)

    const buildPath = (routeNums: number[], direction: 'forward' | 'back') => {
      const startNode = direction === 'forward' ? myNode : selectedNode
      const endNode = direction === 'forward' ? selectedNode : myNode

      const sequence: Array<{ node: typeof nodes[number] | null; role: TraceMapPoint['role'] }> = []
      sequence.push({ node: startNode || null, role: 'source' })

      for (const num of routeNums) {
        const hopNode = findNodeByIdOrNum(null, num) || null
        sequence.push({ node: hopNode, role: 'hop' })
      }

      sequence.push({ node: endNode || null, role: 'dest' })

      const points: TraceMapPoint[] = []
      const segments: TraceMapSegment[] = []
      let unknown = 0
      let distance = 0

      let hopIndex = 0

      const addPoint = (node: typeof nodes[number], role: TraceMapPoint['role']) => {
        const coords = getNodeCoords(node)
        const id = node.id || node.num.toString()
        const existing = points.find((p) => p.id === id && p.direction === direction)
        if (existing) return existing.hasCoords ? { lat: existing.lat, lon: existing.lon } : null

        if (!coords) {
          points.push({
            id,
            name: getNodeName(node),
            lat: 0,
            lon: 0,
            role,
            hasCoords: false,
            direction,
            order: hopIndex,
            shortName: node.user?.shortName,
          })
          unknown += 1
          return null
        }
        points.push({
          id,
          name: getNodeName(node),
          lat: coords.lat,
          lon: coords.lon,
          role,
          hasCoords: true,
          direction,
          order: hopIndex,
          shortName: node.user?.shortName,
        })
        return coords
      }

      let lastKnown: { lat: number; lon: number } | null = null
      let gap = false

      sequence.forEach((entry) => {
        hopIndex += 1
        if (!entry.node) {
          const placeholderId = `unknown-${direction}-${hopIndex}`
          points.push({
            id: placeholderId,
            name: `Unknown hop ${hopIndex}`,
            lat: 0,
            lon: 0,
            role: 'hop',
            hasCoords: false,
            direction,
            order: hopIndex,
          })
          unknown += 1
          gap = true
        } else {
          const coords = addPoint(entry.node, entry.role)
          if (coords) {
            if (lastKnown && !gap) {
              segments.push({
                coords: [
                  [lastKnown.lon, lastKnown.lat],
                  [coords.lon, coords.lat],
                ],
                direction,
                approximate: false,
              })
              const segmentDistance = haversineKm(lastKnown, coords)
              distance += segmentDistance
            } else if (lastKnown && gap) {
              segments.push({
                coords: [
                  [lastKnown.lon, lastKnown.lat],
                  [coords.lon, coords.lat],
                ],
                direction,
                approximate: true,
              })
              const segmentDistance = haversineKm(lastKnown, coords)
              distance += segmentDistance
            }
            lastKnown = coords
            gap = false
          } else {
            gap = true
          }
        }
      })

      return { points, segments, unknown, distance }
    }

    const forwardResult = buildPath(tracerouteResult.route || [], 'forward')
    const backResult = buildPath(tracerouteResult.route_back || [], 'back')

    return {
      pointsForward: forwardResult.points,
      pointsBack: backResult.points,
      segments: [...forwardResult.segments, ...backResult.segments],
      unknown: forwardResult.unknown + backResult.unknown,
      distance: {
        forward: forwardResult.distance,
        back: backResult.distance,
        total: forwardResult.distance + (backResult.distance || 0),
      },
    }
  }, [isTracerouteForThisNode, tracerouteResult, nodes, status.my_node_id, status.my_node_num, selectedNode])

  if (!selectedNode && !isNetworkMapOpen) return null

  // Common Header
  const header = (
    <div className="p-4 border-b border-border flex items-center justify-between bg-card/50 backdrop-blur-md sticky top-0 z-30">
      <div className="flex items-center gap-2">
        {selectedNode ? (
          <>
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              {selectedNode.user?.shortName || '?'}
            </div>
            <div>
              <h3 className="font-semibold text-sm leading-tight">
                {selectedNode.user?.longName || 'Unknown Node'}
              </h3>
              <p className="text-[10px] text-muted-foreground font-mono">
                {selectedNode.id}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <MapIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm leading-tight">Network Map</h3>
              <p className="text-[10px] text-muted-foreground">
                {nodes.length} nodes in mesh
              </p>
            </div>
          </>
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={handleClose}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  )

  if (isNetworkMapOpen) {
    return (
      <div className="w-[360px] flex-shrink-0 border-l border-border bg-card flex flex-col h-full shadow-2xl z-20 overflow-hidden">
        {header}
        <ScrollArea className="flex-1 p-4">
          {/* Mini Map with Expand Button */}
          <div className="mb-6 group relative">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs text-muted-foreground uppercase flex items-center gap-1">
                <MapIcon className="w-3 h-3" />
                Network Map
              </h3>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-border/50 shadow-sm bg-secondary/20 mb-3">
              <GlobalNetworkMap
                nodes={nodes}
                onSelectNode={(node) => {
                  setSelectedNode(node)
                  setIsNetworkMapOpen(false)
                }}
                className="h-[200px]"
                showAttribution={false}
                showLabels={false}
              />
            </div>
            <Button
              variant="outline"
              className="w-full flex items-center justify-center gap-2 h-10 rounded-xl"
              onClick={() => setIsGlobalMapModalOpen(true)}
            >
              <Maximize2 className="w-4 h-4" />
              <span>Open Global Map</span>
            </Button>
          </div>

          {/* Mesh Intelligence Stats */}
          {meshStats && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
              {/* Quick Overview */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Active Nodes</span>
                  </div>
                  <div className="text-xl font-bold">{meshStats.online} <span className="text-[10px] font-normal text-muted-foreground">/ {meshStats.total}</span></div>
                </div>
                <div className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/10">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Avg Energy</span>
                  </div>
                  <div className="text-xl font-bold">{meshStats.avgBattery ?? '—'}%</div>
                </div>
              </div>

              {/* Hardware Diversity */}
              <div className="bg-secondary/20 rounded-xl p-4 border border-border/30">
                <h4 className="text-[11px] font-bold text-muted-foreground uppercase mb-3 flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5" />
                  Hardware diversity
                </h4>
                <div className="space-y-3">
                  {meshStats.sortedHw.map(([model, count]) => {
                    const percent = Math.round((count / meshStats.total) * 100);
                    return (
                      <div key={model}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="truncate pr-2">{model}</span>
                          <span className="text-muted-foreground">{count} ({percent}%)</span>
                        </div>
                        <div className="h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-1000"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Connectivity Health */}
              <div className="bg-secondary/20 rounded-xl p-4 border border-border/30">
                <h4 className="text-[11px] font-bold text-muted-foreground uppercase mb-3">Connectivity Health</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Coordinate Coverage</span>
                    <span className="text-xs font-mono">{Math.round((meshStats.withCoords / meshStats.total) * 100)}%</span>
                  </div>
                  <div className="flex items-center justify-between font-medium">
                    <span className="text-xs">Network Relevancy</span>
                    <span className="text-xs font-mono">{Math.round((meshStats.online / meshStats.total) * 100)}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>

        {/* Global Map Modal */}
        <Dialog.Root open={isGlobalMapModalOpen} onOpenChange={setIsGlobalMapModalOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100]" />
            <Dialog.Content className="fixed left-4 top-4 right-4 bottom-4 flex flex-col rounded-2xl bg-card shadow-2xl border border-border focus:outline-none z-[101] overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border bg-card/80 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <MapIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <Dialog.Title className="text-lg font-bold">Global Mesh Network</Dialog.Title>
                    <Dialog.Description className="text-sm text-muted-foreground">
                      {nodes.length} nodes registered • {nodes.filter(n => n.position).length} with position
                    </Dialog.Description>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full">
                    <X className="w-5 h-5" />
                  </Button>
                </Dialog.Close>
              </div>
              <div className="flex-1 relative bg-secondary/20">
                <GlobalNetworkMap
                  nodes={nodes}
                  onSelectNode={(node) => {
                    setSelectedNode(node)
                    setIsGlobalMapModalOpen(false)
                    setIsNetworkMapOpen(false)
                  }}
                />
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    )
  }

  // Final check for selectedNode before rendering details
  if (!selectedNode) return null


  return (
    <div className="w-[360px] bg-card border-l border-border flex flex-col h-full">
      <div className="h-14 px-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold">Node Info</h2>
        <Button variant="ghost" size="icon" onClick={() => setSelectedNode(null)}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        {/* Basic Info */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-1">{getNodeName(selectedNode)}</h3>
          <p className="text-sm text-muted-foreground font-mono">{selectedNode.id}</p>
          {selectedNode.user?.hwModel && (
            <p className="text-xs text-muted-foreground mt-1">
              {selectedNode.user.hwModel}
            </p>
          )}
        </div>

        {/* Last Heard */}
        <div className="mb-4">
          <div className="text-xs text-muted-foreground uppercase mb-1">Last Heard</div>
          <p className="text-sm">{formatLastHeard(selectedNode.lastHeard)}</p>
        </div>

        {/* Device Metrics */}
        {selectedNode.deviceMetrics && (
          <div className="mb-4 p-3 bg-secondary/50 rounded-lg space-y-2">
            <div className="text-xs text-muted-foreground uppercase mb-2">
              Device Metrics
            </div>

            {selectedNode.deviceMetrics.batteryLevel !== undefined && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Battery className="w-4 h-4" />
                  Battery
                </span>
                <span>{selectedNode.deviceMetrics.batteryLevel}%</span>
              </div>
            )}

            {typeof selectedNode.deviceMetrics.voltage === 'number' && !Number.isNaN(selectedNode.deviceMetrics.voltage) && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Cpu className="w-4 h-4" />
                  Voltage
                </span>
                <span>{selectedNode.deviceMetrics.voltage.toFixed(2)}V</span>
              </div>
            )}

            {typeof selectedNode.deviceMetrics.channelUtilization === 'number' && !Number.isNaN(selectedNode.deviceMetrics.channelUtilization) && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Channel Util</span>
                <span>{selectedNode.deviceMetrics.channelUtilization.toFixed(1)}%</span>
              </div>
            )}

            {typeof selectedNode.deviceMetrics.airUtilTx === 'number' && !Number.isNaN(selectedNode.deviceMetrics.airUtilTx) && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Air Util TX</span>
                <span>{selectedNode.deviceMetrics.airUtilTx.toFixed(1)}%</span>
              </div>
            )}
          </div>
        )}

        {/* Position */}
        {selectedNode.position && (
          <div className="mb-4 p-3 bg-secondary/50 rounded-lg">
            <div className="text-xs text-muted-foreground uppercase mb-2 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              Position
            </div>
            <div className="text-sm space-y-1">
              <div>Lat: {selectedNode.position.latitude?.toFixed(6)}</div>
              <div>Lon: {selectedNode.position.longitude?.toFixed(6)}</div>
              {selectedNode.position.altitude && (
                <div>Alt: {selectedNode.position.altitude}m</div>
              )}
            </div>
            <Dialog.Root open={isMapOpen} onOpenChange={setIsMapOpen}>
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  className="mt-3 w-full cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-primary rounded-lg"
                >
                  <MapView
                    latitude={selectedNode.position.latitude}
                    longitude={selectedNode.position.longitude}
                    zoom={13}
                    showAttribution={false}
                    className="h-40 w-full"
                  />
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
                <Dialog.Content className="fixed left-1/2 top-1/2 w-[90vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card p-4 shadow-xl border border-border focus:outline-none">
                  <Dialog.Title className="sr-only">{getNodeName(selectedNode)}</Dialog.Title>
                  <Dialog.Description className="sr-only">
                    Координаты: {formatCoord(selectedNode.position.latitude)}, {formatCoord(selectedNode.position.longitude)}
                  </Dialog.Description>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-base font-semibold">{getNodeName(selectedNode)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Координаты: {formatCoord(selectedNode.position.latitude)}, {formatCoord(selectedNode.position.longitude)}
                      </div>
                    </div>
                    <Dialog.Close asChild>
                      <Button variant="ghost" size="icon">
                        <X className="w-4 h-4" />
                      </Button>
                    </Dialog.Close>
                  </div>
                  <MapView
                    latitude={selectedNode.position.latitude}
                    longitude={selectedNode.position.longitude}
                    zoom={15}
                    interactive
                    className="h-[420px] w-full"
                  />
                  <div className="mt-3 text-xs text-muted-foreground">
                    Источник карты: OpenStreetMap (raster tiles, без API-ключей)
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        )}

        {/* SNR */}
        {typeof selectedNode.snr === 'number' && !Number.isNaN(selectedNode.snr) && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-sm">
              <Signal className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">SNR:</span>
              <span>{selectedNode.snr.toFixed(1)} dB</span>
            </div>
          </div>
        )}

        {/* Traceroute */}
        <div className="mb-4 space-y-3">
          <Button
            onClick={() => {
              if (selectedNode.id) {
                setActiveTab({ type: 'dm', nodeId: selectedNode.id, name: getNodeName(selectedNode) })
              }
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            size="lg"
          >
            <MessageSquare className="w-5 h-5 mr-2" />
            Открыть чат
          </Button>

          <Button
            onClick={handleTraceroute}
            disabled={traceroute.isPending}
            variant="outline"
            className="w-full"
          >
            {traceroute.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Route className="w-4 h-4 mr-2" />
            )}
            Traceroute
          </Button>

          {/* Timeout message */}
          {tracerouteInProgress && (!tracerouteResult || !isTracerouteForThisNode) && !tracerouteTimeout && (
            <div className="mt-3 p-3 bg-secondary/40 border border-border/50 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Waiting for traceroute response…</span>
              </div>
              <span className="text-xs text-muted-foreground">Timeout in {tracerouteCountdown}s</span>
            </div>
          )}

          {tracerouteTimeout && !isTracerouteForThisNode && (
            <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                <span>No response received (timeout after 60s)</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Node may be offline or unreachable
              </p>
            </div>
          )}

          {/* Traceroute result */}
          {isTracerouteForThisNode && (
            <div className="mt-3 space-y-3">
              {/* Map preview */}

              {/* Map preview */}
              {traceMapData && (
                <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground uppercase">
                      Route on map
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setIsTraceMapOpen(true)}>
                      <MapIcon className="w-4 h-4 mr-2" />
                      Open map
                    </Button>
                  </div>
                  {traceMapData.segments.length > 0 ? (
                    <div className="rounded-lg overflow-hidden border border-border/60">
                      <TraceRouteMap
                        points={[...traceMapData.pointsForward, ...traceMapData.pointsBack]}
                        segments={traceMapData.segments}
                        totalDistanceKm={traceMapData.distance.total}
                        directionDistance={traceMapData.distance}
                        interactive={false}
                        showAttribution={false}
                        className="h-48"
                      />
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border/60 bg-card/80 p-3 text-xs text-muted-foreground">
                      Нет координат для отображения маршрута на карте, но список хопов ниже.
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-4">
                    <span>Вперёд: {formatKm(traceMapData.distance.forward)}</span>
                    <span>Назад: {traceMapData.distance.back ? formatKm(traceMapData.distance.back) : '—'}</span>
                    <span className="font-medium text-foreground">Суммарно: {formatKm(traceMapData.distance.total)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-3 h-1.5 bg-blue-600 rounded-sm" /> прямой маршрут
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-3 h-1.5 bg-green-600 rounded-sm border border-border" /> обратный маршрут
                      </span>
                      {traceMapData.segments.some((s) => s.approximate) && (
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block w-3 h-1.5 bg-slate-400 rounded-sm border border-border" /> участок с неизвестными хопами
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded-full bg-blue-600" /> начало
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded-full bg-green-600" /> цель
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded-full bg-amber-500" /> hop
                      </span>
                    </div>
                    {(traceMapData.pointsForward.some((p) => !p.hasCoords) || traceMapData.pointsBack.some((p) => !p.hasCoords)) && (
                      <div className="text-[11px] text-amber-600">
                        Узлы без координат отмечены в списке ниже — линии обрываются на них.
                      </div>
                    )}
                  </div>

                  {/* Legend list */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="bg-card border border-border/60 rounded-lg divide-y divide-border/60">
                      <div className="px-3 py-2 font-semibold flex items-center gap-2">
                        <span className="inline-block w-3 h-1.5 bg-blue-600 rounded-sm" />
                        Прямой маршрут
                      </div>
                      {traceMapData.pointsForward.map((p, idx) => (
                        <div
                          key={`${p.id}-${p.direction}-${idx}`}
                          className="flex items-center justify-between px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'inline-block w-2.5 h-2.5 rounded-full',
                                p.role === 'source'
                                  ? 'bg-blue-600'
                                  : p.role === 'dest'
                                    ? 'bg-green-600'
                                    : 'bg-amber-500'
                              )}
                              aria-hidden
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">{p.name}</span>
                              <span className="text-muted-foreground/70 text-[11px]">
                                Hop {idx + 1} • {p.id}
                              </span>
                            </div>
                          </div>
                          <div className="text-right text-[11px] text-muted-foreground">
                            {p.hasCoords ? (
                              `${formatCoord(p.lat, 4)}, ${formatCoord(p.lon, 4)}`
                            ) : (
                              <span className="text-amber-600">нет координат</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-card border border-border/60 rounded-lg divide-y divide-border/60">
                      <div className="px-3 py-2 font-semibold flex items-center gap-2">
                        <span className="inline-block w-3 h-1.5 bg-green-600 rounded-sm" />
                        Обратный маршрут
                      </div>
                      {traceMapData.pointsBack.map((p, idx) => (
                        <div
                          key={`${p.id}-${p.direction}-${idx}`}
                          className="flex items-center justify-between px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'inline-block w-2.5 h-2.5 rounded-full',
                                p.role === 'source'
                                  ? 'bg-blue-600'
                                  : p.role === 'dest'
                                    ? 'bg-green-600'
                                    : 'bg-amber-500'
                              )}
                              aria-hidden
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">{p.name}</span>
                              <span className="text-muted-foreground/70 text-[11px]">
                                Hop {idx + 1} • {p.id}
                              </span>
                            </div>
                          </div>
                          <div className="text-right text-[11px] text-muted-foreground">
                            {p.hasCoords ? (
                              `${formatCoord(p.lat, 4)}, ${formatCoord(p.lon, 4)}`
                            ) : (
                              <span className="text-amber-600">нет координат</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {traceMapData.unknown > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Некоторые узлы не прислали координаты — маршрут показан с пропусками.
                    </p>
                  )}

                  <Dialog.Root open={isTraceMapOpen} onOpenChange={setIsTraceMapOpen}>
                    <Dialog.Portal>
                      <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
                      <Dialog.Content className="fixed left-1/2 top-1/2 w-[92vw] max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card p-4 shadow-xl border border-border focus:outline-none z-50">
                        <Dialog.Title className="sr-only">Маршрут сообщения</Dialog.Title>
                        <Dialog.Description className="sr-only">
                          Отображение маршрута трассировки на карте
                        </Dialog.Description>
                        <div className="flex items-center justify-between mb-3">
                          <div className="font-semibold text-base flex items-center gap-2">
                            <MapIcon className="w-4 h-4" />
                            Маршрут сообщения
                          </div>
                          <Dialog.Close asChild>
                            <Button variant="ghost" size="icon">
                              <X className="w-4 h-4" />
                            </Button>
                          </Dialog.Close>
                        </div>
                        <div className="flex justify-center mb-2">
                          <div className="flex bg-muted p-1 rounded-md">
                            <button
                              onClick={() => setRouteViewMode('forward')}
                              className={cn(
                                "px-3 py-1 text-xs font-medium rounded-sm transition-all",
                                routeViewMode === 'forward' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              Туда (Forward)
                            </button>
                            <button
                              onClick={() => setRouteViewMode('back')}
                              className={cn(
                                "px-3 py-1 text-xs font-medium rounded-sm transition-all",
                                routeViewMode === 'back' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              Обратно (Back)
                            </button>
                          </div>
                        </div>
                        <TraceRouteMap
                          points={routeViewMode === 'forward' ? traceMapData.pointsForward : traceMapData.pointsBack}
                          segments={traceMapData.segments.filter(s => s.direction === routeViewMode)}
                          totalDistanceKm={traceMapData.distance.total}
                          directionDistance={traceMapData.distance}
                          interactive
                          showAttribution
                          className="h-[520px]"
                        />
                        <div className="mt-3 text-xs text-muted-foreground flex flex-wrap gap-4">
                          <span>Вперёд: {formatKm(traceMapData.distance.forward)}</span>
                          <span>Назад: {traceMapData.distance.back ? formatKm(traceMapData.distance.back) : '—'}</span>
                          <span className="font-medium text-foreground">Суммарно: {formatKm(traceMapData.distance.total)}</span>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-block w-3 h-1.5 bg-blue-600 rounded-sm" /> прямой маршрут
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-block w-3 h-1.5 bg-green-600 rounded-sm border border-border" /> обратный маршрут
                            </span>
                            {traceMapData.segments.some((s) => s.approximate) && (
                              <span className="inline-flex items-center gap-1">
                                <span className="inline-block w-3 h-1.5 bg-slate-400 rounded-sm border border-border" /> участок с неизвестными хопами
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-block w-3 h-3 rounded-full bg-blue-600" /> начало
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-block w-3 h-3 rounded-full bg-green-600" /> цель
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-block w-3 h-3 rounded-full bg-amber-500" /> hop
                            </span>
                          </div>
                          {traceMapData.unknown > 0 && (
                            <div className="text-[11px] text-amber-600">
                              Есть узлы без координат — линии обрываются на них.
                            </div>
                          )}
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-3 text-xs">
                          {routeViewMode === 'forward' && (
                            <div className="bg-card border border-border/60 rounded-lg divide-y divide-border/60">
                              <div className="px-3 py-2 font-semibold flex items-center gap-2">
                                <span className="inline-block w-3 h-1.5 bg-blue-600 rounded-sm" />
                                Прямой маршрут
                              </div>
                              {traceMapData.pointsForward.map((p, idx) => (
                                <div key={`${p.id}-${p.direction}-${idx}`} className="flex items-center justify-between px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={cn(
                                        'inline-block w-2.5 h-2.5 rounded-full',
                                        p.role === 'source'
                                          ? 'bg-blue-600'
                                          : p.role === 'dest'
                                            ? 'bg-green-600'
                                            : 'bg-amber-500'
                                      )}
                                      aria-hidden
                                    />
                                    <div className="flex flex-col">
                                      <span className="font-medium">
                                        {p.name}
                                        {p.shortName && <span className="ml-1 text-muted-foreground font-normal">({p.shortName})</span>}
                                      </span>
                                      <span className="text-muted-foreground/70 text-[11px]">
                                        Hop {idx + 1} • {p.id}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right text-[11px] text-muted-foreground">
                                    {p.hasCoords
                                      ? `${formatCoord(p.lat, 4)}, ${formatCoord(p.lon, 4)}`
                                      : <span className="text-amber-600">нет координат</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {routeViewMode === 'back' && (
                            <div className="bg-card border border-border/60 rounded-lg divide-y divide-border/60">
                              <div className="px-3 py-2 font-semibold flex items-center gap-2">
                                <span className="inline-block w-3 h-1.5 bg-green-600 rounded-sm" />
                                Обратный маршрут
                              </div>
                              {traceMapData.pointsBack.map((p, idx) => (
                                <div key={`${p.id}-${p.direction}-${idx}`} className="flex items-center justify-between px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={cn(
                                        'inline-block w-2.5 h-2.5 rounded-full',
                                        p.role === 'source'
                                          ? 'bg-blue-600'
                                          : p.role === 'dest'
                                            ? 'bg-green-600'
                                            : 'bg-amber-500'
                                      )}
                                      aria-hidden
                                    />
                                    <div className="flex flex-col">
                                      <span className="font-medium">
                                        {p.name}
                                        {p.shortName && <span className="ml-1 text-muted-foreground font-normal">({p.shortName})</span>}
                                      </span>
                                      <span className="text-muted-foreground/70 text-[11px]">
                                        Hop {idx + 1} • {p.id}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right text-[11px] text-muted-foreground">
                                    {p.hasCoords
                                      ? `${formatCoord(p.lat, 4)}, ${formatCoord(p.lon, 4)}`
                                      : <span className="text-amber-600">нет координат</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {traceMapData.unknown > 0 && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Есть узлы без координат — линии обрываются на них.
                          </p>
                        )}
                      </Dialog.Content>
                    </Dialog.Portal>
                  </Dialog.Root>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
