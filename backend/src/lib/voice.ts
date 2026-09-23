export function speakText(
    text: string,
    language: 'English' | 'Hindi'
) {
    if (!('speechSynthesis' in window)) {
        alert(
            language === 'Hindi'
                ? 'इस फोन या ब्राउज़र में आवाज़ की सुविधा उपलब्ध नहीं है।'
                : 'Voice assistance is not available in this browser.'
        )
        return
    }

    window.speechSynthesis.cancel()

    const speech = new SpeechSynthesisUtterance(text)

    speech.lang = language === 'Hindi' ? 'hi-IN' : 'en-IN'
    speech.rate = 0.9
    speech.pitch = 1

    window.speechSynthesis.speak(speech)
}

export function stopSpeaking() {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
    }
}