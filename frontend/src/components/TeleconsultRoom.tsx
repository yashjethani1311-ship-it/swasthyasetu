import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  User,
  Clock,
  Maximize2,
  Minimize2,
  MonitorUp,
  Volume2
} from 'lucide-react'
import { Badge, Button, Card } from './kit'
import { useLanguage } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'

export type TeleconsultStatus =
  | 'IDLE'
  | 'PERMISSIONS'
  | 'WAITING_ROOM'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ENDED'

export interface TeleconsultRoomProps {
  role: 'PATIENT' | 'DOCTOR'
  appointmentId: string
  doctorName?: string
  patientName?: string
  recipientName?: string
  scheduledAt?: string
  initialStatus?: TeleconsultStatus
  onClose?: () => void
  onEndCall?: () => void
  children?: ReactNode
}

export function TeleconsultRoom({
  role,
  appointmentId,
  doctorName = 'Doctor',
  patientName = 'Patient',
  recipientName,
  scheduledAt,
  initialStatus = 'WAITING_ROOM',
  onClose,
  onEndCall,
  children
}: TeleconsultRoomProps) {
  const actualOnClose = onClose ?? onEndCall
  const { language } = useLanguage()
  const hindi = language === 'Hindi'

  const [status, setStatus] = useState<TeleconsultStatus>(initialStatus)
  const [micEnabled, setMicEnabled] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [permissionError, setPermissionError] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [callDuration, setCallDuration] = useState(0)

  // 044 Backend Teleconsult Session State
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionNotice, setSessionNotice] = useState('')
  const [backendAuthError, setBackendAuthError] = useState('')
  const [providerUnavailable, setProviderUnavailable] = useState(false)

  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)

  // 044: Initialize teleconsult session via t4_open
  useEffect(() => {
    let active = true
    async function initSession() {
      if (!appointmentId) return
      try {
        const { data, error } = await supabase.rpc('t4_open', {
          p_appointment: appointmentId
        })
        if (!active) return
        if (error) {
          const msg = error.message || ''
          if (msg.includes('participant required') || msg.includes('expired')) {
            setBackendAuthError(
              hindi
                ? 'टेलीकंसल्टेशन नियुक्ति भागीदार सत्यापन विफल या नियुक्ति समाप्त हो चुकी है।'
                : 'Teleconsult appointment participant authorization required or window expired.'
            )
          } else {
            setBackendAuthError(msg)
          }
        } else if (data) {
          setSessionId(data.session_id)
          setSessionNotice(data.notice || '')
          if (data.provider_state === 'UNCONFIGURED' || data.state === 'UNCONFIGURED') {
            setProviderUnavailable(true)
          }
        }
      } catch (e: any) {
        if (active) setBackendAuthError(e?.message || 'Teleconsult session contract unavailable')
      }
    }
    void initSession()
    return () => {
      active = false
    }
  }, [appointmentId, hindi])

  // Start local camera/mic stream when component loads
  useEffect(() => {
    let active = true

    async function initMedia() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setPermissionError(
            hindi
              ? 'आपके ब्राउज़र में कैमरा/माइक्रोफ़ोन समर्थन उपलब्ध नहीं है।'
              : 'Camera and microphone are not supported in this browser environment.'
          )
          return
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        })

        if (!active) {
          stream.getTracks().forEach(t => t.stop())
          return
        }

        mediaStreamRef.current = stream
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }
      } catch (err) {
        console.warn('Media devices access error:', err)
        setPermissionError(
          hindi
            ? 'कैमरा या माइक्रोफ़ोन की अनुमति अस्वीकृत या उपलब्ध नहीं है।'
            : 'Camera or microphone permission was denied or unavailable.'
        )
      }
    }

    void initMedia()

    return () => {
      active = false
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop())
        mediaStreamRef.current = null
      }
    }
  }, [hindi])

  // Timer for duration when in active call
  useEffect(() => {
    if (status !== 'CONNECTED') return
    const timer = setInterval(() => setCallDuration(d => d + 1), 1000)
    return () => clearInterval(timer)
  }, [status])

  function toggleMic() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !micEnabled
      })
    }
    setMicEnabled(!micEnabled)
  }

  function toggleVideo() {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getVideoTracks().forEach(t => {
        t.enabled = !videoEnabled
      })
    }
    setVideoEnabled(!videoEnabled)
  }

  async function handleConnect() {
    setStatus('CONNECTING')
    if (sessionId) {
      try {
        const reqKey = crypto.randomUUID()
        const { data, error } = await supabase.rpc('t4_join_intent', {
          p_session: sessionId,
          p_request: reqKey
        })
        if (error || data?.status === 'PROVIDER_UNAVAILABLE') {
          setProviderUnavailable(true)
        }
      } catch {
        setProviderUnavailable(true)
      }
    }
  }

  async function handleEndCall() {
    if (sessionId) {
      try {
        await supabase.rpc('t4_request_end', { p_session: sessionId })
      } catch {
        // Safe fail-through
      }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
    }
    setStatus('ENDED')
    if (actualOnClose) actualOnClose()
  }

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className={`space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6 ${fullscreen ? 'fixed inset-0 z-50 overflow-y-auto bg-background p-6' : ''}`}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Video className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                {hindi ? 'टेलीकंसल्टेशन कमरा' : 'In-App Teleconsultation'}
              </h2>
              <Badge tone={status === 'CONNECTED' ? 'success' : status === 'ENDED' ? 'neutral' : 'warning'}>
                {status === 'WAITING_ROOM'
                  ? (hindi ? 'प्रतीक्षा कक्ष' : 'Waiting Room')
                  : status === 'CONNECTING'
                    ? (hindi ? 'जुड़ रहे हैं' : 'Connecting')
                    : status === 'CONNECTED'
                      ? (hindi ? 'सक्रिय परामर्श' : 'Live Call')
                      : status === 'RECONNECTING'
                        ? (hindi ? 'पुनः संपर्क' : 'Reconnecting')
                        : (hindi ? 'समाप्त' : 'Ended')}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {role === 'PATIENT' ? `Doctor: Dr. ${doctorName}` : `Patient: ${patientName}`}
              {scheduledAt && ` · ${new Date(scheduledAt).toLocaleString()}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === 'CONNECTED' && (
            <span className="font-tabular text-xs font-semibold text-success flex items-center gap-1.5 px-2 py-1 bg-success/10 rounded-lg">
              <span className="size-2 rounded-full bg-success animate-pulse" />
              {formatTime(callDuration)}
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setFullscreen(!fullscreen)}
            title={fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
          {onClose && (
            <Button size="sm" variant="outline" onClick={onClose}>
              {hindi ? 'बंद करें' : 'Close'}
            </Button>
          )}
        </div>
      </div>

      {/* Main room layout */}
      <div className={`grid gap-4 ${children ? 'lg:grid-cols-[1.2fr_1fr]' : 'grid-cols-1'}`}>
        {/* Video & Stream Section */}
        <div className="flex flex-col gap-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-950 border border-border/40 shadow-inner flex flex-col items-center justify-center p-6 text-center text-slate-100">
            {/* Real local video picture-in-picture */}
            <div className="absolute top-3 right-3 z-20 h-28 w-40 overflow-hidden rounded-lg border-2 border-slate-700 bg-slate-900 shadow-md">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`size-full object-cover ${videoEnabled ? '' : 'hidden'}`}
              />
              {!videoEnabled && (
                <div className="size-full flex flex-col items-center justify-center bg-slate-800 text-slate-400 text-xs">
                  <VideoOff className="size-5 mb-1" />
                  <span>{hindi ? 'कैमरा बंद' : 'Camera off'}</span>
                </div>
              )}
              <div className="absolute bottom-1 left-1.5 bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-white">
                {hindi ? 'आप' : 'You'}
              </div>
            </div>

            {/* Stage Center State */}
            {status === 'WAITING_ROOM' && (
              <div className="max-w-md space-y-3 z-10">
                <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/20 text-primary">
                  <Clock className="size-6 animate-spin" />
                </div>
                <h3 className="text-base font-bold text-white">
                  {role === 'PATIENT'
                    ? (hindi ? 'डॉक्टर का इंतज़ार है' : 'Doctor Not Joined Yet')
                    : (hindi ? 'मरीज प्रतीक्षा कक्ष में है' : 'Waiting Room Active')}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {role === 'PATIENT'
                    ? (hindi
                        ? 'कृपया प्रतीक्षा करें। डॉक्टर के सत्र शुरू करते ही वीडियो परामर्श कनेक्ट हो जाएगा।'
                        : 'Your camera and microphone are ready. When the doctor enters the room, the consultation will commence.')
                    : (hindi
                        ? 'परामर्श सत्र शुरू करने के लिए नीचे "सत्र शुरू करें" पर क्लिक करें।'
                        : 'Review patient snapshot on the right and click "Connect Session" to admit patient.')}
                </p>
                {backendAuthError && (
                  <div className="rounded bg-destructive/20 border border-destructive/40 p-2 text-[11px] text-destructive-foreground">
                    {backendAuthError}
                  </div>
                )}
                <div className="pt-2 flex flex-col items-center gap-1.5">
                  <Button size="sm" onClick={handleConnect}>
                    {hindi ? 'सत्र कनेक्ट करें' : 'Connect Session'}
                  </Button>
                  <span className="text-[11px] text-slate-400">
                    {hindi ? 'रिमोट परामर्श प्रदाता कॉन्फ़िगर नहीं है (लोकल प्रीव्यू सक्रिय)' : 'Remote consultation provider is not configured (local preview active)'}
                  </span>
                </div>
              </div>
            )}

            {status === 'CONNECTING' && (
              <div className="max-w-md space-y-3 z-10">
                <RefreshCw className="size-8 animate-spin mx-auto text-primary" />
                <h3 className="text-sm font-semibold text-white">
                  {hindi ? 'सुरक्षित कनेक्शन स्थापित हो रहा है…' : 'Negotiating Peer Connection…'}
                </h3>
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-200 text-left space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="size-3.5 text-amber-400" />
                    <span>{hindi ? 'प्रदाता अनुपलब्ध' : 'Provider Notice'}</span>
                  </div>
                  <p>
                    {hindi
                      ? 'रिमोट परामर्श प्रदाता कॉन्फ़िगर नहीं है (WebRTC Signaling adapter required)। स्थानीय कैमरा पूर्वावलोकन सत्यापित है; दूरस्थ प्रतिभागी के लाइव स्ट्रीम के लिए समर्पित मीडिया सर्वर आवश्यक है।'
                      : 'Remote consultation provider is not configured. Local media preview is verified; WebRTC peer signaling/TURN adapter required for remote party transmission.'}
                  </p>
                </div>
                <div className="pt-2 flex justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setStatus('WAITING_ROOM')}>
                    {hindi ? 'प्रतीक्षा कक्ष में वापस' : 'Back to Waiting Room'}
                  </Button>
                  <Button size="sm" variant="subtle" onClick={() => setStatus('RECONNECTING')}>
                    {hindi ? 'पुनः प्रयास' : 'Retry'}
                  </Button>
                </div>
              </div>
            )}

            {status === 'RECONNECTING' && (
              <div className="max-w-md space-y-3 z-10">
                <RefreshCw className="size-8 animate-spin mx-auto text-warning" />
                <h3 className="text-sm font-semibold text-white">
                  {hindi ? 'पुनः संपर्क का प्रयास हो रहा है…' : 'Reconnecting to Video Gateway…'}
                </h3>
                <p className="text-xs text-slate-400">
                  {hindi ? 'सिग्नलिंग सर्वर उपलब्ध नहीं है।' : 'Signaling provider unavailable.'}
                </p>
                <Button size="sm" onClick={() => setStatus('WAITING_ROOM')}>
                  {hindi ? 'प्रतीक्षा कक्ष' : 'Return to Waiting Room'}
                </Button>
              </div>
            )}

            {status === 'ENDED' && (
              <div className="max-w-md space-y-2 z-10">
                <div className="mx-auto grid size-10 place-items-center rounded-full bg-slate-800 text-slate-300">
                  <PhoneOff className="size-5" />
                </div>
                <h3 className="text-sm font-semibold text-white">
                  {hindi ? 'परामर्श समाप्त हो गया' : 'Consultation Ended'}
                </h3>
                <p className="text-xs text-slate-400">
                  {hindi
                    ? 'टेलीकंसल्टेशन कॉल समाप्त कर दिया गया है। पर्ची और सलाह देखने के लिए रिकॉर्ड पर जाएँ।'
                    : 'The session has been terminated. Prescriptions and advice are recorded in care history.'}
                </p>
                {actualOnClose && (
                  <Button size="sm" onClick={actualOnClose} className="mt-2">
                    {hindi ? 'वापस जाएँ' : 'Back to Appointments'}
                  </Button>
                )}
              </div>
            )}

            {permissionError && (
              <div className="absolute bottom-3 left-3 right-3 z-20 rounded-lg bg-destructive/90 p-2.5 text-left text-xs text-destructive-foreground">
                {permissionError}
              </div>
            )}
          </div>

          {/* In-Call Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary/30 p-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={micEnabled ? 'outline' : 'danger'}
                onClick={toggleMic}
                title={micEnabled ? 'Mute Mic' : 'Unmute Mic'}
              >
                {micEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                <span className="hidden sm:inline ml-1">{micEnabled ? (hindi ? 'म्यूट' : 'Mute') : (hindi ? 'अनम्यूट' : 'Unmute')}</span>
              </Button>

              <Button
                size="sm"
                variant={videoEnabled ? 'outline' : 'danger'}
                onClick={toggleVideo}
                title={videoEnabled ? 'Turn off video' : 'Turn on video'}
              >
                {videoEnabled ? <Video className="size-4" /> : <VideoOff className="size-4" />}
                <span className="hidden sm:inline ml-1">{videoEnabled ? (hindi ? 'कैमरा बंद' : 'Stop Video') : (hindi ? 'कैमरा चालू' : 'Start Video')}</span>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground px-2">
                <ShieldCheck className="size-3.5 text-success" />
                <span>{hindi ? 'नो रिकॉर्डिंग (डिफ़ॉल्ट)' : 'No recording by default'}</span>
              </div>

              {status !== 'ENDED' ? (
                <Button size="sm" variant="danger" onClick={handleEndCall}>
                  <PhoneOff className="size-4 mr-1" />
                  <span>{hindi ? 'कॉल समाप्त' : 'End Call'}</span>
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setStatus('WAITING_ROOM')}>
                  <RefreshCw className="size-4 mr-1" />
                  <span>{hindi ? 'दोबारा जुड़ें' : 'Rejoin'}</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Clinical Workspace alongside for Doctor */}
        {children && (
          <div className="flex flex-col min-h-0 overflow-y-auto space-y-4 max-h-[620px] rounded-xl border border-border p-4 bg-background">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
