import { useState, useEffect } from 'react'
import { Wifi, Usb, Loader2, Bluetooth } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConnect, useDisconnect } from '@/hooks/useApi'
import { useMeshStore } from '@/store'
import { cn } from '@/lib/utils'

export function ConnectionPanel() {
  const [type, setType] = useState<'tcp' | 'serial' | 'ble'>(() => {
    return (localStorage.getItem('meshtastic_connection_type') as 'tcp' | 'serial' | 'ble') || 'tcp'
  })
  const [address, setAddress] = useState(() => {
    return localStorage.getItem('meshtastic_last_address') || '192.168.1.1'
  })
  const [serialPorts, setSerialPorts] = useState<Array<{ device: string; description?: string; hwid?: string }>>([])
  const [serialScanning, setSerialScanning] = useState(false)
  const [serialError, setSerialError] = useState<string | null>(null)
  const [bleDevices, setBleDevices] = useState<Array<{ name: string; address: string }>>([])
  const [bleScanning, setBleScanning] = useState(false)
  const { t } = useTranslation()
  const status = useMeshStore((s) => s.status)

  const connect = useConnect()
  const disconnect = useDisconnect()

  // Save last used address and type to localStorage
  useEffect(() => {
    if (status.connected && status.address) {
      localStorage.setItem('meshtastic_last_address', status.address)
      if (status.connection_type) {
        localStorage.setItem('meshtastic_connection_type', status.connection_type)
      }
    }
  }, [status.connected, status.address, status.connection_type])

  const handleConnect = () => {
    connect.mutate({ type, address })
  }

  const handleDisconnect = () => {
    disconnect.mutate()
  }

  const handleBleScan = async () => {
    setBleScanning(true)
    try {
      const response = await fetch('/api/ble-scan')
      const data = await response.json()
      setBleDevices(data.devices || [])
    } catch (error) {
      console.error('BLE scan error:', error)
    } finally {
      setBleScanning(false)
    }
  }

  const handleSerialScan = async () => {
    setSerialScanning(true)
    try {
      setSerialError(null)
      const response = await fetch('/api/serial-ports')
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Serial scan failed')
      }
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(text || 'Serial scan returned non-JSON response (is backend running?)')
      }
      const data = await response.json()
      const ports = data.ports || []
      setSerialPorts(ports)
      if (!address && ports.length > 0) {
        setAddress(ports[0].device)
      }
    } catch (error) {
      console.error('Serial scan error:', error)
      setSerialError(error instanceof Error ? error.message : 'Serial scan failed')
      setSerialPorts([])
    } finally {
      setSerialScanning(false)
    }
  }

  return (
    <div className="p-4 border-b border-border">
      <div className="flex items-center gap-2 mb-3">
        <div
          className={cn(
            'w-2 h-2 rounded-full',
            status.connected ? 'bg-green-500' : 'bg-red-500'
          )}
        />
        <span className="text-sm font-medium">
          {status.connected ? t('connection.connected') : t('connection.disconnected')}
        </span>
      </div>

      {!status.connected ? (
        <>
          <div className="flex gap-2 mb-3">
            <Button
              variant={type === 'tcp' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setType('tcp')}
              className="flex-1"
            >
              <Wifi className="w-4 h-4 mr-1" />
              {t('connection.tcp')}
            </Button>
            <Button
              variant={type === 'serial' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setType('serial')}
              className="flex-1"
            >
              <Usb className="w-4 h-4 mr-1" />
              {t('connection.serial')}
            </Button>
            <Button
              variant={type === 'ble' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setType('ble')}
              className="flex-1"
            >
              <Bluetooth className="w-4 h-4 mr-1" />
              BLE
            </Button>
          </div>

          {type === 'ble' ? (
            <>
              <Button
                onClick={handleBleScan}
                disabled={bleScanning}
                variant="outline"
                size="sm"
                className="w-full mb-3"
              >
                {bleScanning ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                {bleScanning ? t('common.scanning') : 'Scan BLE Devices'}
              </Button>

              {bleDevices.length > 0 ? (
                <select
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full mb-3 px-3 py-2 border border-border rounded-md bg-background text-sm"
                >
                  <option value="">Select a device...</option>
                  {bleDevices.map((device) => (
                    <option key={device.address} value={device.address}>
                      {device.name} ({device.address})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted-foreground mb-3">
                  Click "Scan BLE Devices" to find available devices
                </p>
              )}
            </>
          ) : type === 'serial' ? (
            <>
              <div className="flex gap-2 mb-3">
                <Button
                  onClick={handleSerialScan}
                  disabled={serialScanning}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  {serialScanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {serialScanning ? t('common.scanning') : 'Scan Serial Ports'}
                </Button>
              </div>

              {serialPorts.length > 0 ? (
                <select
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full mb-3 px-3 py-2 border border-border rounded-md bg-background text-sm"
                >
                  <option value="">Select a port...</option>
                  {serialPorts.map((port) => (
                    <option key={port.device} value={port.device}>
                      {port.device}
                      {port.description ? ` — ${port.description}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted-foreground mb-3">
                  Click "Scan Serial Ports" to find connected USB/serial radios
                </p>
              )}

              {serialError ? (
                <p className="text-xs text-red-500 mb-3">{serialError}</p>
              ) : null}

              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="COM3 / /dev/ttyUSB0"
                className="mb-3"
              />
            </>
          ) : (
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="192.168.1.1:4403"
              className="mb-3"
            />
          )}

          <Button
            onClick={handleConnect}
            disabled={connect.isPending || !address}
            className="w-full"
          >
            {connect.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            {t('connection.connect')}
          </Button>

          {connect.isError && (
            <p className="text-red-500 text-xs mt-2">{connect.error.message}</p>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div className="text-[11px] leading-relaxed">
            <div className="flex justify-between items-center text-muted-foreground/80 mb-1 border-b border-border/40 pb-1">
              <span>{t('connection.details')}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-muted-foreground uppercase text-[9px] tracking-wider whitespace-nowrap">{t('connection.type')}</span>
                <span className="font-medium uppercase truncate">{status.connection_type || t('common.unknown')}</span>
              </div>
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-muted-foreground uppercase text-[9px] tracking-wider whitespace-nowrap">{t('connection.node')}</span>
                <span className="font-mono text-primary truncate">{status.my_node_id || t('common.waiting')}</span>
              </div>
              <div className="flex items-center gap-1 col-span-2 border-t border-border/20 pt-1 mt-0.5 min-w-0">
                <span className="text-muted-foreground uppercase text-[9px] tracking-wider whitespace-nowrap">{t('connection.address')}</span>
                <span className="font-medium truncate">{status.address || t('common.none')}</span>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleDisconnect}
            disabled={disconnect.isPending}
            className="w-full h-8 text-xs hover:bg-destructive/10 hover:text-destructive transition-colors"
            size="sm"
          >
            {t('connection.disconnect')}
          </Button>
        </div>
      )}
    </div>
  )
}
