import { useEffect, useState } from 'react'
import { Bot, ShieldCheck } from 'lucide-react'
import { Card } from '@/components/kit'
import { SwasthyaCopilot } from '@/components/SwasthyaCopilot'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'

export function HealthAiPage() {
  const { profile } = useAuth()
  const { language } = useLanguage()
  const hindi = language === 'Hindi'
  const [patientId, setPatientId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!profile?.id) return
    void supabase
      .from('patient_profiles')
      .select('id')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) setError(queryError.message)
        setPatientId(data?.id ?? null)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [profile?.id])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="flex items-start gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Bot className="size-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">
            {hindi ? 'स्वास्थ्य एआई' : 'Health AI'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hindi
              ? 'अपने सहमति वाले, सत्यापित स्वास्थ्य रिकॉर्ड से जानकारी खोजें।'
              : 'Ask questions using your consented, verified health records.'}
          </p>
        </div>
      </section>

      <Card className="flex items-start gap-3 border-info/25 bg-info/5">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-info" />
        <p className="text-sm text-muted-foreground">
          {hindi
            ? 'यह सहायक नया निदान, दवा या खुराक नहीं बनाता। हर उत्तर के साथ मूल रिकॉर्ड का स्रोत दिखाया जाएगा।'
            : 'This assistant does not create diagnoses, medicines, or dose changes. Grounded source excerpts are shown with every response.'}
        </p>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Loading secure patient context…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!loading && !error && patientId && (
        <SwasthyaCopilot
          patientId={patientId}
          workflow="PATIENT_HOME"
          title={hindi ? 'स्वास्थ्य रिकॉर्ड सहायक' : 'Health record assistant'}
          suggestions={hindi
            ? ['मेरी हाल की जाँच और उनकी स्थिति', 'मेरी सक्रिय दवाइयाँ', 'क्या कोई फॉलो-अप बाकी है?']
            : ['Show my recent tests and their review status', 'List my active prescribed medicines', 'Are any follow-ups still pending?']}
        />
      )}
      {!loading && !error && !patientId && (
        <Card>
          <p className="text-sm text-muted-foreground">
            {hindi ? 'स्वास्थ्य रिकॉर्ड संदर्भ उपलब्ध नहीं है।' : 'A patient record context is not available for this account.'}
          </p>
        </Card>
      )}
    </div>
  )
}
