import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode
} from 'react'

export type Language = 'English' | 'Hindi'

const translations = {
    English: {
        common: {
            english: 'English',
            hindi: 'हिन्दी',
            loading: 'Loading...',
            viewAll: 'View all',
            noData: 'No data available',
            profile: 'Profile',
            signOut: 'Sign out'
        },

        nav: {
            dashboard: 'Dashboard',
            consent:'Consent & access', care: 'Care history', followUp: 'Follow-ups',
            appointments: 'Appointments',
            records: 'Health Records',
            prescriptions: 'Prescriptions',
            diagnostics: 'Diagnostics',
            medicines: 'Medicines',
            insurance: 'Insurance',
            facilities: 'Facilities'
        },

        dashboard: {
            greeting: 'Welcome',
            subtitle: 'Your connected care journey',
            nextStep: 'Next Step',
            upcomingAppointment: 'Upcoming Appointment',
            healthRecords: 'Health Records',
            prescriptions: 'Prescriptions',
            diagnostics: 'Diagnostics',
            medicines: 'Medicines',
            noAppointment: 'No upcoming appointments',
            noRecords: 'No health records uploaded yet',
            noPrescriptions: 'No prescriptions yet',
            noDiagnostics: 'No diagnostic orders yet',
            noMedicines: 'No medicines recorded yet'
        },

        patient: {
            patientId: 'Patient ID',
            demoAbha: 'Demo ABHA',
            preferredLanguage: 'Preferred Language'
        }
    },

    Hindi: {
        common: { english: 'English', hindi: 'हिन्दी', loading: 'जानकारी आ रही है…', viewAll: 'सब देखें', noData: 'अभी जानकारी नहीं है', profile: 'मेरी जानकारी', signOut: 'बाहर निकलें' },
        nav: {
            dashboard: 'मुख्य पेज',
            consent:'जानकारी साझा करना', care: 'इलाज का सफर', followUp: 'दोबारा हाल जानना',
            appointments: 'डॉक्टर से मिलने का समय',
            records: 'मेरी मेडिकल रिपोर्ट',
            prescriptions: 'डॉक्टर की पर्ची',
            diagnostics: 'जाँच / टेस्ट',
            medicines: 'मेरी दवाइयाँ',
            insurance: 'बीमा',
            facilities: 'अस्पताल / क्लिनिक'
        },

        dashboard: {
            greeting: 'नमस्ते',
            subtitle: 'आपके इलाज की पूरी जानकारी यहाँ मिलेगी',
            nextStep: 'अब आपको क्या करना है',
            upcomingAppointment: 'डॉक्टर से अगली मुलाकात',
            healthRecords: 'मेरी मेडिकल रिपोर्ट',
            prescriptions: 'डॉक्टर की पर्ची',
            diagnostics: 'मेरी जाँच',
            medicines: 'मेरी दवाइयाँ',

            noAppointment: 'अभी डॉक्टर से मिलने का कोई समय तय नहीं है',
            noRecords: 'अभी कोई मेडिकल रिपोर्ट नहीं है',
            noPrescriptions: 'अभी डॉक्टर की कोई पर्ची नहीं है',
            noDiagnostics: 'अभी कोई जाँच बाकी नहीं है',
            noMedicines: 'अभी कोई दवाई दर्ज नहीं है'
        },

        patient: {
            patientId: 'मेरी पहचान संख्या',
            demoAbha: 'डेमो ABHA नंबर',
            preferredLanguage: 'भाषा'
        }
    }
} as const

type LanguageContextValue = {
    language: Language
    setLanguage: (language: Language) => void
    t: (section: string, key: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({
    children
}: {
    children: ReactNode
}) {
    const [language, setLanguageState] = useState<Language>(() => {
        const savedLanguage = localStorage.getItem(
            'swasthyasetu-language'
        )

        return savedLanguage === 'Hindi' ? 'Hindi' : 'English'
    })

    const setLanguage = (newLanguage: Language) => {
        setLanguageState(newLanguage)

        localStorage.setItem(
            'swasthyasetu-language',
            newLanguage
        )
    }

    useEffect(() => {
        document.documentElement.lang =
            language === 'Hindi' ? 'hi' : 'en'
    }, [language])

    function t(section: string, key: string): string {
        const currentLanguage = translations[language] as Record<
            string,
            Record<string, string>
        >

        return currentLanguage[section]?.[key] ?? key
    }

    return (
        <LanguageContext.Provider
            value={{
                language,
                setLanguage,
                t
            }}
        >
            {children}
        </LanguageContext.Provider>
    )
}

export function useLanguage() {
    const context = useContext(LanguageContext)

    if (!context) {
        throw new Error(
            'useLanguage must be used inside LanguageProvider'
        )
    }

    return context
}