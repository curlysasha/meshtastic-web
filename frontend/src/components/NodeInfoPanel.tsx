import { X, MapPin, Battery, Signal, Cpu, Route, Loader2, AlertCircle, Map as MapIcon } from 'lucide-react'
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
  ]
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
      attributionControl: showAttribution,
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
}

type TraceMapSegment = {
  coords: [number, number][]
  direction: 'forward' | 'back'
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
  interactive?: boolean
  showAttribution?: boolean
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const id = useId().replace(/:/g, '')

  const geoData = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: [
        ...segments.map((seg) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: seg.coords,
          },
          properties: { direction: seg.direction },
        })),
        ...points.map((p) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
          properties: { role: p.role, name: p.name },
        })),
      ],
    }),
    [points, segments]
  )

  const bounds = useMemo(() => {
    const coords = points.map((p) => [p.lon, p.lat]) as [number, number][]
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
    const map = new MapLibreMap({
      container: containerRef.current,
      style: OSM_RASTER_STYLE as any,
      center: points.length ? [points[0].lon, points[0].lat] : [0, 0],
      zoom: 8,
      interactive,
      attributionControl: showAttribution,
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
        filter: ['==', ['get', 'direction'], 'forward'],
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
        filter: ['==', ['get', 'direction'], 'back'],
        paint: {
          'line-color': '#16a34a',
          'line-width': 3,
          'line-opacity': 0.7,
          'line-dasharray': [2, 2],
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

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource(`${id}-trace`) as any
    if (source?.setData) {
      source.setData(geoData)
    }
    if (bounds) {
      map.fitBounds([bounds.sw, bounds.ne], { padding: 40, duration: 300 })
    }
  }, [geoData, bounds, id])

  return <div ref={containerRef} className={cn('relative rounded-lg overflow-hidden', className)} />
}

export function NodeInfoPanel() {
  const { selectedNode, setSelectedNode, tracerouteResult, setTracerouteResult, nodes, status } = useMeshStore()
  const traceroute = useTraceroute()
  const [tracerouteTimeout, setTracerouteTimeout] = useState(false)
  const [tracerouteCountdown, setTracerouteCountdown] = useState(60)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [tracerouteInProgress, setTracerouteInProgress] = useState(false)
  const [isMapOpen, setIsMapOpen] = useState(false)
  const [isTraceMapOpen, setIsTraceMapOpen] = useState(false)

  if (!selectedNode) return null

  const handleTraceroute = () => {
    if (selectedNode.id) {
      // Clear old traceroute result and timeout state
      setTracerouteResult(null)
      setTracerouteTimeout(false)
      setTracerouteCountdown(60)
      setTracerouteInProgress(true)

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
        if (!tracerouteResult || tracerouteResult.from !== selectedNode.id) {
          setTracerouteTimeout(true)
          setTracerouteInProgress(false)
        }
      }, 60000)

      countdownIntervalRef.current = setInterval(() => {
        setTracerouteCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current as ReturnType<typeof setInterval>)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
  }

  // Clear timeout when result arrives
  useEffect(() => {
    if (tracerouteResult && tracerouteResult.from === selectedNode.id) {
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
    }
  }, [tracerouteResult, selectedNode.id])

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
    }
  }, [])

  // Check if traceroute result is for the currently selected node
  const isTracerouteForThisNode = tracerouteResult && tracerouteResult.from === selectedNode.id

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

  const getRouteNodeName = (num: number) => {
    const node = nodes.find((n) => n.num === num)
    return node ? getNodeName(node) : `!${num.toString(16).padStart(8, '0')}`
  }

  const getNodeCoords = (node?: typeof nodes[number] | null) => {
    if (!node?.position) return null
    const { latitude, longitude } = node.position
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null
    return { lat: latitude, lon: longitude }
  }

  const traceMapData = useMemo(() => {
    if (!isTracerouteForThisNode || !tracerouteResult) return null

    const myNode = nodes.find(
      (n) => n.id === status.my_node_id || (status.my_node_num && n.num === status.my_node_num)
    )

    const buildPath = (routeNums: number[], direction: 'forward' | 'back') => {
      const sequence: Array<{ node: typeof nodes[number] | null; role: TraceMapPoint['role'] }> = []
      if (myNode) sequence.push({ node: myNode, role: 'source' })

      for (const num of routeNums) {
        const hopNode = nodes.find((n) => n.num === num) || null
        sequence.push({ node: hopNode, role: 'hop' })
      }

      sequence.push({ node: selectedNode, role: 'dest' })

      const points: TraceMapPoint[] = []
      const segments: TraceMapSegment[] = []
      let unknown = 0

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
        })
        return coords
      }

      let lastCoord: { lat: number; lon: number } | null = null

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
          lastCoord = null
          return
        }
        const coords = addPoint(entry.node, entry.role)
        if (coords && lastCoord) {
          segments.push({
            coords: [
              [lastCoord.lon, lastCoord.lat],
              [coords.lon, coords.lat],
            ],
            direction,
          })
        }
        lastCoord = coords
      })

      return { points, segments, unknown }
    }

    const forward = buildPath(tracerouteResult.route, 'forward')
    const backNums = tracerouteResult.route_back?.length
      ? tracerouteResult.route_back.slice().reverse()
      : []
    const back = backNums.length ? buildPath(backNums, 'back') : { points: [], segments: [], unknown: 0 }

    return {
      pointsForward: forward.points,
      pointsBack: back.points,
      segments: [...forward.segments, ...back.segments],
      unknown: forward.unknown + back.unknown,
    }
  }, [
    isTracerouteForThisNode,
    tracerouteResult,
    nodes,
    status.my_node_id,
    status.my_node_num,
    selectedNode,
  ])

  // Build full route with source and destination
  const buildFullRoute = (intermediateHops: number[]) => {
    const myNode = nodes.find(n => n.id === status.my_node_id)
    const fullRoute: Array<{num: number, name: string, isSource?: boolean, isDest?: boolean}> = []

    // Add source (my node)
    if (myNode) {
      fullRoute.push({ num: myNode.num, name: getNodeName(myNode), isSource: true })
    }

    // Add intermediate hops
    intermediateHops.forEach(hopNum => {
      fullRoute.push({ num: hopNum, name: getRouteNodeName(hopNum) })
    })

    // Add destination
    fullRoute.push({ num: selectedNode.num, name: getNodeName(selectedNode), isDest: true })

    return fullRoute
  }

  return (
    <div className="w-80 bg-card border-l border-border flex flex-col h-full">
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
        <div className="mb-4">
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
              {/* Direct connection message */}
              {tracerouteResult.route.length === 0 && (
                <div className="p-3 bg-secondary/50 rounded-lg">
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Signal className="w-4 h-4" />
                    <span>Direct connection (no intermediate hops)</span>
                  </div>
                </div>
              )}

              {/* Forward route */}
              {tracerouteResult.route.length > 0 && (
                <div className="p-3 bg-secondary/50 rounded-lg">
                  <div className="text-xs text-muted-foreground uppercase mb-2 flex items-center gap-2">
                    <span>→ Route to destination</span>
                  </div>
                  <div className="space-y-1">
                    {buildFullRoute(tracerouteResult.route).map((hop, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">{i + 1}.</span>
                        <span className={hop.isSource ? "font-semibold text-primary" : hop.isDest ? "font-semibold text-primary" : ""}>
                          {hop.name}
                        </span>
                        {hop.isSource && <span className="text-xs text-muted-foreground">(you)</span>}
                        {hop.isDest && <span className="text-xs text-muted-foreground">(target)</span>}
                        {!hop.isSource && !hop.isDest &&
                          typeof tracerouteResult.snr_towards[i - 1] === 'number' &&
                          !Number.isNaN(tracerouteResult.snr_towards[i - 1]) && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            SNR: {tracerouteResult.snr_towards[i - 1].toFixed(1)} dB
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Return route (if different) */}
              {tracerouteResult.route_back && tracerouteResult.route_back.length > 0 && (
                <div className="p-3 bg-secondary/50 rounded-lg">
                  <div className="text-xs text-muted-foreground uppercase mb-2 flex items-center gap-2">
                    <span>← Return route</span>
                  </div>
                  <div className="space-y-1">
                    {buildFullRoute(tracerouteResult.route_back.slice().reverse()).map((hop, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">{i + 1}.</span>
                        <span className={hop.isSource ? "font-semibold text-primary" : hop.isDest ? "font-semibold text-primary" : ""}>
                          {hop.name}
                        </span>
                        {hop.isSource && <span className="text-xs text-muted-foreground">(you)</span>}
                        {hop.isDest && <span className="text-xs text-muted-foreground">(target)</span>}
                        {!hop.isSource && !hop.isDest &&
                          typeof tracerouteResult.snr_back[tracerouteResult.route_back.length - i] === 'number' &&
                          !Number.isNaN(tracerouteResult.snr_back[tracerouteResult.route_back.length - i]) && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            SNR: {tracerouteResult.snr_back[tracerouteResult.route_back.length - i].toFixed(1)} dB
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Map preview */}
              {traceMapData && (traceMapData.pointsForward.length + traceMapData.pointsBack.length) >= 2 && (
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
                  <div className="rounded-lg overflow-hidden border border-border/60">
                    <TraceRouteMap
                      points={[...traceMapData.pointsForward, ...traceMapData.pointsBack]}
                      segments={traceMapData.segments}
                      interactive={false}
                      showAttribution={false}
                      className="h-48"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-3 h-1.5 bg-blue-600 rounded-sm" /> прямой маршрут
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-3 h-1.5 bg-green-600 rounded-sm border border-border" /> обратный маршрут (пунктир)
                      </span>
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
                    <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
                    <Dialog.Content className="fixed left-1/2 top-1/2 w-[92vw] max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card p-4 shadow-xl border border-border focus:outline-none">
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
                        <TraceRouteMap
                          points={[...traceMapData.pointsForward, ...traceMapData.pointsBack]}
                          segments={traceMapData.segments}
                          interactive
                          showAttribution
                          className="h-[520px]"
                        />
                      <div className="mt-3 text-xs text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <span className="inline-block w-3 h-1.5 bg-blue-600 rounded-sm" /> прямой маршрут
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="inline-block w-3 h-1.5 bg-green-600 rounded-sm border border-border" /> обратный маршрут (пунктир)
                          </span>
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

                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
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
                                  <span className="font-medium">{p.name}</span>
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
                                  <span className="font-medium">{p.name}</span>
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
