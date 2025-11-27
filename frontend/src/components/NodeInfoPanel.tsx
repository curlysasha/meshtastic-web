import { X, MapPin, Battery, Signal, Cpu, Route, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMeshStore } from '@/store'
import { useTraceroute } from '@/hooks/useApi'
import { getNodeName } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'

export function NodeInfoPanel() {
  const { selectedNode, setSelectedNode, tracerouteResult, setTracerouteResult, nodes, status } = useMeshStore()
  const traceroute = useTraceroute()
  const [tracerouteTimeout, setTracerouteTimeout] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (!selectedNode) return null

  const handleTraceroute = () => {
    if (selectedNode.id) {
      // Clear old traceroute result and timeout state
      setTracerouteResult(null)
      setTracerouteTimeout(false)

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      traceroute.mutate(selectedNode.id)

      // Set timeout for 45 seconds
      timeoutRef.current = setTimeout(() => {
        if (!tracerouteResult || tracerouteResult.from !== selectedNode.id) {
          setTracerouteTimeout(true)
        }
      }, 45000)
    }
  }

  // Clear timeout when result arrives
  useEffect(() => {
    if (tracerouteResult && tracerouteResult.from === selectedNode.id) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      setTracerouteTimeout(false)
    }
  }, [tracerouteResult, selectedNode.id])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
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

            {selectedNode.deviceMetrics.voltage !== undefined && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Cpu className="w-4 h-4" />
                  Voltage
                </span>
                <span>{selectedNode.deviceMetrics.voltage.toFixed(2)}V</span>
              </div>
            )}

            {selectedNode.deviceMetrics.channelUtilization !== undefined && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Channel Util</span>
                <span>{selectedNode.deviceMetrics.channelUtilization.toFixed(1)}%</span>
              </div>
            )}

            {selectedNode.deviceMetrics.airUtilTx !== undefined && (
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
          </div>
        )}

        {/* SNR */}
        {selectedNode.snr !== undefined && (
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
          {tracerouteTimeout && !isTracerouteForThisNode && (
            <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                <span>No response received (timeout after 45s)</span>
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
                        {!hop.isSource && !hop.isDest && tracerouteResult.snr_towards[i - 1] !== undefined && (
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
                        {!hop.isSource && !hop.isDest && tracerouteResult.snr_back[tracerouteResult.route_back.length - i] !== undefined && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            SNR: {tracerouteResult.snr_back[tracerouteResult.route_back.length - i].toFixed(1)} dB
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
