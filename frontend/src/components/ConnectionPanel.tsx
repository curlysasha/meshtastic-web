import { useState } from 'react'
import { Wifi, Usb, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConnect, useDisconnect } from '@/hooks/useApi'
import { useMeshStore } from '@/store'
import { cn } from '@/lib/utils'

export function ConnectionPanel() {
  const [type, setType] = useState<'tcp' | 'serial'>('tcp')
  const [address, setAddress] = useState('192.168.1.1')
  const status = useMeshStore((s) => s.status)

  const connect = useConnect()
  const disconnect = useDisconnect()

  const handleConnect = () => {
    connect.mutate({ type, address })
  }

  const handleDisconnect = () => {
    disconnect.mutate()
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
          {status.connected ? 'Connected' : 'Disconnected'}
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
              TCP
            </Button>
            <Button
              variant={type === 'serial' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setType('serial')}
              className="flex-1"
            >
              <Usb className="w-4 h-4 mr-1" />
              Serial
            </Button>
          </div>

          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={type === 'tcp' ? '192.168.1.1:4403' : '/dev/ttyUSB0'}
            className="mb-3"
          />

          <Button
            onClick={handleConnect}
            disabled={connect.isPending || !address}
            className="w-full"
          >
            {connect.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Connect
          </Button>

          {connect.isError && (
            <p className="text-red-500 text-xs mt-2">{connect.error.message}</p>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            <div>{status.connection_type?.toUpperCase()}: {status.address}</div>
            <div>Node: {status.my_node_id}</div>
          </div>
          <Button
            variant="outline"
            onClick={handleDisconnect}
            disabled={disconnect.isPending}
            className="w-full"
            size="sm"
          >
            Disconnect
          </Button>
        </div>
      )}
    </div>
  )
}
