import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from '@/components/Sidebar'
import { ChatArea } from '@/components/ChatArea'
import { NodeInfoPanel } from '@/components/NodeInfoPanel'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useMeshStore } from '@/store'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function AppContent() {
  useWebSocket()
  const selectedNode = useMeshStore((s) => s.selectedNode)

  return (
    <div className="h-screen flex bg-background">
      <Sidebar />
      <ChatArea />
      {selectedNode && <NodeInfoPanel />}
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}
