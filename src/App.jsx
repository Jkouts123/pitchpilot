import { useCallback, useState } from 'react'
import AgentsHome from './components/AgentsHome'
import DealsView from './components/DealsView'
import LiveCallScreen from './components/LiveCallScreen'
import PostCallSummary from './components/PostCallSummary'
import PreCallScreen from './components/PreCallScreen'

export default function App() {
  const [view, setView] = useState('agents')
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [preCall, setPreCall] = useState(null)
  const [callTranscript, setCallTranscript] = useState('')
  const [precallSessionKey, setPrecallSessionKey] = useState(0)
  const [initialFromDeal, setInitialFromDeal] = useState(null)

  const goHome = useCallback(() => {
    setView('agents')
    setSelectedAgent(null)
    setPreCall(null)
    setCallTranscript('')
    setInitialFromDeal(null)
  }, [])

  const startAgentFlow = useCallback((agent) => {
    setSelectedAgent(agent)
    setInitialFromDeal(null)
    setPrecallSessionKey((k) => k + 1)
    setView('precall')
  }, [])

  const handleCallAgain = useCallback(({ agent, preset, initialFromDeal: fromDeal }) => {
    // accept either `agent` (new) or `preset` (old stored deals) key
    setSelectedAgent(agent ?? preset ?? null)
    setInitialFromDeal(fromDeal)
    setPrecallSessionKey((k) => k + 1)
    setView('precall')
  }, [])

  return (
    <div className="min-h-[100dvh] bg-[#070708] text-zinc-200">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {view !== 'live' && (
        <>
          <nav className="relative z-10 flex items-center justify-between border-b border-zinc-800/60 px-4 py-4 sm:px-8">
            <button type="button" onClick={goHome} className="text-left">
              <span className="font-display text-xl font-semibold tracking-tight text-zinc-100">PitchPilot</span>
              <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">copilot</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (view === 'precall') {
                    setSelectedAgent(null)
                    setInitialFromDeal(null)
                  }
                  setView('agents')
                }}
                className={`rounded-full px-4 py-2 text-xs font-medium ${
                  view === 'agents' || view === 'precall'
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Sales Agents
              </button>
              <button
                type="button"
                onClick={() => setView('deals')}
                className={`rounded-full px-4 py-2 text-xs font-medium ${
                  view === 'deals' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Deals
              </button>
            </div>
          </nav>

          <main className="relative z-10">
            {view === 'agents' && <AgentsHome onStartCall={startAgentFlow} />}
            {view === 'deals' && <DealsView onBack={goHome} onCallAgain={handleCallAgain} />}
            {view === 'precall' && selectedAgent && (
              <PreCallScreen
                key={`${selectedAgent.id}-${precallSessionKey}`}
                preset={selectedAgent}
                initialFromDeal={initialFromDeal}
                onBack={() => {
                  setView('agents')
                  setSelectedAgent(null)
                  setInitialFromDeal(null)
                }}
                onStartCall={(form) => {
                  setPreCall(form)
                  setCallTranscript('')
                  setView('live')
                }}
              />
            )}
            {view === 'summary' && (
              <PostCallSummary
                transcript={callTranscript}
                preCall={preCall ?? {}}
                onSaveNavigate={() => setView('deals')}
                onDone={() => {
                  setPreCall(null)
                  setCallTranscript('')
                  goHome()
                }}
              />
            )}
          </main>
        </>
      )}

      {view === 'live' && preCall && (
        <LiveCallScreen
          preCall={preCall}
          onEndCall={(t) => {
            setCallTranscript(t)
            setView('summary')
          }}
        />
      )}
    </div>
  )
}
