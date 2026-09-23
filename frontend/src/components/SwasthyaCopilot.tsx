import { useState } from 'react'
import {
  Bot,
  Send,
  Loader2,
  AlertCircle,
  ExternalLink,
  HelpCircle,
  Volume2,
  CheckCircle2,
  Sparkles
} from 'lucide-react'
import { Badge, Button, Card } from './kit'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/i18n'
import { speakText } from '@/lib/voice'
import { navigate } from '@/lib/route'
import { safeFormatDate } from '@/lib/utils'
import { VoiceInputButton } from '@/components/voice/VoiceInputButton'

export type CopilotItem = {
  source_id: string
  date: string
  text: string
  display_text?: string
  kind: string
}

export type CopilotResponse = {
  answer?: { text: string; citations: { source_id: string; date: string }[] }
  intent?: string
  selected_tool?: string | null
  language?: string
  outcome?: string
  items: CopilotItem[]
  generated_at?: string
  notice?: string
  error?: string
  audit_reference?: string | number
  provenance?: string
  freshness?: string
  uncertainty?: string
}

function readableText(text?: string) {
  if (!text || /[{}\[\]`]|\b(?:get_\w+|a3_\w+|AUTHORIZED_DATABASE_RPC|[A-Z]+(?:_[A-Z]+)+)|Audit\s*#|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(text)) return ''
  return text
}

export function SwasthyaCopilot({
  patientId,
  workflow = 'CONSULTATION',
  title,
  subtitle,
  suggestions = [],
  onSourceClick,
}: {
  patientId?: string | null
  workflow?: 'CONSULTATION' | 'PATIENT_HOME' | 'RECORDS' | 'EMERGENCY' | 'CARE_HISTORY' | 'WORKER_FIELD'
  title?: string
  subtitle?: string
  suggestions?: string[]
  onSourceClick?: (sourceId: string) => void
}) {
  const { language } = useLanguage()
  const hindi = language === 'Hindi'

  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CopilotResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [discoveredDoctors, setDiscoveredDoctors] = useState<any[]>([])
  const [discoveredFacilities, setDiscoveredFacilities] = useState<any[]>([])
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; text: string; timestamp: string }>>([])

  const defaultSuggestions = suggestions.length
    ? suggestions
    : hindi
      ? [
          'हाल ही में लिखी गई दवाइयों की सूची',
          'डॉक्टर की पिछली सलाह और जाँच के नतीजे',
          'क्या दोबारा मिलना या फॉलो-अप बाकी है?'
        ]
      : [
          'Summarize active prescribed medicines and instructions',
          'Check recent lab orders and review statuses',
          'Identify pending follow-ups or open care gaps'
        ]

  async function handleAsk(queryToAsk?: string) {
    const q = (queryToAsk ?? question).trim()
    if (!q || loading) return

    if (workflow === 'CONSULTATION' && !patientId) {
      setErrorMessage(
        hindi
          ? 'क्लिनिकल रिकॉर्ड की समीक्षा के लिए कृपया ऊपर ओपीडी कतार या खोज से एक मरीज चुनें।'
          : 'Please select a patient from the OPD queue or search above to review clinical records with Copilot.'
      )
      return
    }

    const userMsg = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      text: q,
      timestamp: new Date().toISOString()
    }
    const currentTurns = [...chatMessages, userMsg]
    setChatMessages(currentTurns)
    setQuestion('')
    setLoading(true)
    setErrorMessage('')
    setResult(null)
    setDiscoveredDoctors([])
    setDiscoveredFacilities([])

    const recentContextMessages = currentTurns.slice(-6).map(m => ({
      role: m.role,
      content: m.text
    }))

    try {
      const response = await supabase.functions.invoke('role-ai', {
        body: {
          tool: 'get_patient_snapshot',
          scope: patientId ? { patient_id: patientId } : {},
          question: q,
          language,
          context: {
            messages: recentContextMessages,
            previous_tool: result?.selected_tool,
            previous_intent: result?.intent
          },
        }
      })

      if (response.error) {
        let serverMsg = ''
        try {
          if ('context' in response.error && response.error.context && typeof (response.error.context as any).json === 'function') {
            const errJson = await (response.error.context as any).json()
            serverMsg = errJson?.error || errJson?.message || ''
          }
        } catch {}
        throw new Error(serverMsg || response.error.message || 'AI_UNAVAILABLE')
      }

      const data = response.data as CopilotResponse
      if (data?.error) {
        throw new Error(data.error)
      }

      setResult(data)
      const assistantMsg = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        text: data.answer?.text || '',
        timestamp: new Date().toISOString()
      }
      setChatMessages(prev => [...prev, assistantMsg])

      if (data.selected_tool === 'd1_practices') {
        setDiscoveredDoctors(data.items.map(item => { try { return JSON.parse(item.text) } catch { return null } }).filter(Boolean))
      } else if (data.selected_tool === 'd1_facilities' || data.selected_tool === 'discover_pharmacies') {
        setDiscoveredFacilities(data.items.map(item => { try { return JSON.parse(item.text) } catch { return null } }).filter(Boolean))
      }
    } catch (err: any) {
      console.warn('Copilot request failed:', err)
      const errStr = String(err?.message || err || '')
      if (errStr.includes('PATIENT_CONSENT_REQUIRED') || errStr.includes('consent') || errStr.includes('Consent')) {
        setErrorMessage(
          hindi
            ? 'एआई सहायता के लिए मरीज की सहमति आवश्यक है या समाप्त हो गई है। रिकॉर्ड देखने के लिए कृपया मरीज से अनुमति का अनुरोध करें।'
            : 'Patient consent for AI assistance is required or has expired. Please request patient consent before reviewing longitudinal records.'
        )
      } else if (errStr.includes('PATIENT_ACCESS_REQUIRED') || (errStr.includes('AI_TOOL_NOT_AUTHORIZED') && workflow === 'CONSULTATION')) {
        setErrorMessage(
          hindi
            ? 'इस मरीज के मेडिकल रिकॉर्ड देखने के लिए अधिकृत एक्सेस या सहमति आवश्यक है।'
            : 'Access authorization or patient consent is required to review this patient\'s records.'
        )
      } else if (errStr.includes('PATIENT_DELEGATION_REQUIRED')) {
        setErrorMessage(
          hindi
            ? 'इस मरीज की सहायता के लिए अधिकृत प्रतिनिधि या कार्यकर्ता सहमति आवश्यक है।'
            : 'Caregiver or worker delegation authorization is required for this patient.'
        )
      } else if (errStr.includes('NO_PATIENT_SELECTED') || errStr.includes('PATIENT_REQUIRED') || errStr.includes('PATIENT_SCOPE_REQUIRED')) {
        setErrorMessage(
          hindi ? 'कृपया पहले एक मरीज चुनें।' : 'Please select a patient first.'
        )
      } else {
        setErrorMessage(
          hindi
            ? 'AI सेवा इस अनुरोध को पूरा नहीं कर सकी। कृपया बाद में कोशिश करें। आपके मूल रिकॉर्ड उपलब्ध हैं।'
            : 'The AI service could not complete this request. Please retry later. Your source records remain accessible.'
        )
      }
    } finally {
      setLoading(false)
    }
  }

  function listenResults() {
    const textToSpeak = readableText(result?.answer?.text)
    if (!textToSpeak) return
    speakText(textToSpeak, language)
  }

  return (
    <Card className="border-primary/20 bg-card shadow-xs">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Bot className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display font-semibold text-foreground text-base">
                {title ?? (hindi ? 'स्वास्थ सहायक (AI Copilot)' : 'SwasthyaCopilot')}
              </h3>
              <Badge tone="teal" className="text-[10px]">
                Grounding Only
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {subtitle ??
                (hindi
                  ? 'सत्यापित मेडिकल रिकॉर्ड से उद्धरण। यह नया निदान या खुराक तय नहीं करता।'
                  : 'Extractive selection from verified records only. Never invents diagnoses or prescriptions.')}
            </p>
          </div>
        </div>
      </div>

      {/* CONVERSATION HISTORY */}
      {chatMessages.length > 2 && (
        <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1 border-b border-border pb-3">
          {chatMessages.slice(0, -2).map((msg) => (
            <div
              key={msg.id}
              className={`p-2.5 rounded-xl text-xs ${
                msg.role === 'user'
                  ? 'bg-primary/10 text-foreground ml-auto max-w-[85%] font-medium'
                  : 'bg-surface-subtle text-foreground mr-auto max-w-[95%]'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1 text-[10px] text-muted-foreground font-semibold">
                {msg.role === 'user' ? (hindi ? 'आप' : 'You') : (hindi ? 'स्वास्थ्य सहायक' : 'SwasthyaCopilot')}
              </div>
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* QUESTION INPUT */}
      <div className="mt-4 space-y-3">
        <div className="relative">
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleAsk()
              }
            }}
            placeholder={
              hindi
                ? 'स्वास्थ्य, डॉक्टर, जाँच, या मरीज के रिकॉर्ड के बारे में पूछें…'
                : 'Ask a question about health, doctors, labs, or medical records…'
            }
            rows={2}
            className="w-full rounded-xl border border-border bg-background p-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="size-3 text-primary" />
              {hindi ? 'प्राकृतिक स्वास्थ्य सहायक' : 'Natural Health Assistant'}
            </span>

            <div className="flex items-center gap-1.5">
              <VoiceInputButton
                currentValue={question}
                onTranscript={setQuestion}
                language={language}
                disabled={loading}
              />
              <Button
                size="sm"
                loading={loading}
                disabled={!question.trim() || loading}
                onClick={() => void handleAsk()}
              >
                <Send className="size-3.5 mr-1" />
                {hindi ? 'पूछें' : 'Ask'}
              </Button>
            </div>
          </div>
        </div>

        {/* QUICK SUGGESTIONS */}
        {!result && !loading && (
          <div className="space-y-1.5 pt-1">
            <p className="label-xs text-muted-foreground flex items-center gap-1">
              <HelpCircle className="size-3" />
              {hindi ? 'सुझाए गए सवाल:' : 'Suggested queries:'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {defaultSuggestions.map((sug, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setQuestion(sug)
                    void handleAsk(sug)
                  }}
                  className="rounded-lg border border-border bg-surface-subtle px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition text-left"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* LOADING STATE */}
        {loading && (
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-subtle p-4 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary shrink-0" />
            <span>
              {hindi
                ? 'सत्यापित रिकॉर्ड्स और स्वास्थ्य जानकारी की जाँच हो रही है…'
                : 'Retrieving context and preparing verified health response…'}
            </span>
          </div>
        )}

        {/* ERROR / UNAVAILABLE STATE */}
        {errorMessage && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-xs">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="size-4 text-warning-foreground shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">
                  {hindi ? 'AI मॉडल उपलब्ध नहीं है' : 'Unable to answer this request'}
                </p>
                <p className="mt-1 text-muted-foreground leading-relaxed">
                  {errorMessage}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* RESULTS & CITATIONS */}
        {result && (
          <div className="mt-3 space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-success" />
                {hindi ? 'स्वास्थ्य सहायक का उत्तर' : 'Assistant Response'}
              </span>

              {(result.items.length > 0 || !!result.answer?.text) && (
                <button
                  type="button"
                  onClick={listenResults}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Volume2 className="size-3.5" />
                  {hindi ? 'सुनें' : 'Listen'}
                </button>
              )}
            </div>

            {/* Answer Text */}
            {result.answer?.text && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-sm leading-relaxed text-foreground">
                <p className="whitespace-pre-wrap">{readableText(result.answer.text) || (hindi ? 'उत्तर तैयार नहीं हो सका। कृपया फिर कोशिश करें।' : 'The answer could not be prepared. Please try again.')}</p>
              </div>
            )}

            {/* Discovered Doctors / Practices */}
            {discoveredDoctors.length > 0 && (
              <div className="space-y-2 mt-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {hindi ? 'उपलब्ध सत्यापित विशेषज्ञ' : 'Available Verified Specialists'}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {discoveredDoctors.map((p: any, i: number) => (
                    <div key={`${p.practice_id || p.doctor_id}-${i}`} className="rounded-lg border border-border bg-card p-3 text-xs space-y-1">
                      <p className="font-semibold text-foreground">{p.doctor_name}</p>
                      <p className="text-[11px] text-primary font-medium">{p.specialization}</p>
                      <p className="text-[11px] text-muted-foreground">{p.practice_name} {p.city ? `· ${p.city}` : ''}</p>
                      <div className="mt-2 pt-1 border-t border-border flex items-center justify-between">
                        <span className="font-semibold text-foreground">₹{p.consultation_fee ?? '0'}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/appointments?doctor_id=${p.doctor_id}&practice_id=${p.practice_id || ''}`)}
                        >
                          {hindi ? 'समय तय करें' : 'Book'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Discovered Facilities / Pharmacies */}
            {discoveredFacilities.length > 0 && (
              <div className="space-y-2 mt-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {hindi ? 'उपलब्ध सत्यापित केंद्र / फार्मेसी' : 'Available Verified Centers & Pharmacies'}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {discoveredFacilities.map((f: any, i: number) => {
                    const hasDistance = f.distance_km != null && !isNaN(Number(f.distance_km)) && Number(f.distance_km) > 0
                    const typeLabel = f.type === 'HOSPITAL' ? (hindi ? 'अस्पताल' : 'Hospital') : f.type === 'DIAGNOSTIC_LAB' ? (hindi ? 'लैब / जाँच केंद्र' : 'Diagnostic Lab') : f.type === 'PHARMACY' ? (hindi ? 'दवा की दुकान' : 'Pharmacy') : (f.type || (hindi ? 'स्वास्थ्य केंद्र' : 'Facility'))
                    return (
                      <div key={`${f.facility_id || f.id || i}-${i}`} className="rounded-lg border border-border bg-card p-3 text-xs space-y-1">
                        <div className="flex items-start justify-between gap-1">
                          <p className="font-semibold text-foreground">{f.facility_name || f.name || 'Verified Center'}</p>
                          <Badge tone="teal" className="text-[10px] shrink-0">{typeLabel}</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {[f.city, f.district, f.state].filter(Boolean).join(', ')}
                        </p>
                        {hasDistance && (
                          <p className="text-[11px] text-primary font-medium">
                            {hindi ? `दूरी: ~${Number(f.distance_km).toFixed(1)} किमी` : `Approx. ${Number(f.distance_km).toFixed(1)} km`}
                          </p>
                        )}
                        {f.contact_phone && (
                          <p className="text-[11px] text-muted-foreground">
                            {hindi ? 'फोन: ' : 'Phone: '}{f.contact_phone}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* General Source Records / Citations */}
            {result.items.length === 0 ? (
              !result.answer?.text && (
                <div className="rounded-xl border border-dashed border-border bg-surface-subtle p-4 text-center text-xs text-muted-foreground">
                  {result.outcome === 'AI_UNAVAILABLE' ? 'AI is temporarily unavailable. Your original records remain available.' : result.outcome === 'UNSUPPORTED_REQUEST'
                    ? hindi
                      ? 'इस प्रश्न के लिए अधिकृत डॉक्टर से परामर्श आवश्यक है। कोई नैदानिक निष्कर्ष नहीं बनाया गया।'
                      : 'This request requires clinician consultation. No diagnostic or prescription action was generated.'
                    : hindi
                      ? 'अधिकृत रिकॉर्ड में इस सवाल के समर्थन में कोई प्रविष्टि नहीं मिली।'
                      : 'No supporting records were found in the authorized history for this question.'}
                </div>
              )
            ) : discoveredDoctors.length === 0 && discoveredFacilities.length === 0 && (
              <details className="space-y-2 group">
                <summary className="cursor-pointer text-xs font-semibold text-foreground flex items-center justify-between py-1 hover:text-primary transition select-none">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-success" />
                    {hindi ? `सत्यापित साक्ष्य (${result.items.length})` : `View sources (${result.items.length})`}
                  </span>
                  <span className="text-[10px] text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="space-y-2 pt-1">
                  {result.items.map((item, i) => (
                    <article
                      key={`${item.source_id}-${i}`}
                      className="rounded-xl border border-border bg-card p-3 shadow-2xs hover:border-primary/30 transition"
                    >
                      <p className="text-xs whitespace-pre-wrap">{readableText(item.display_text) || (hindi ? 'रिकॉर्ड विवरण उपलब्ध नहीं है।' : 'Readable record details are unavailable.')}</p>
                      <div className="mt-2 flex items-center justify-between border-t border-border pt-1.5 text-[11px]">
                        <span className="text-muted-foreground">
                          {safeFormatDate(item.date)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (onSourceClick) onSourceClick(item.source_id)
                            else {
                              const el = document.getElementById(`source-${item.source_id}`)
                              el?.scrollIntoView({ behavior: 'smooth' })
                            }
                          }}
                          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                        >
                          <span>{hindi ? 'स्रोत देखें' : 'View source'}</span>
                          <ExternalLink className="size-3" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            )}


          </div>
        )}
      </div>
    </Card>
  )
}
