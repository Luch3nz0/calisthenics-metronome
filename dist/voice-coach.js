export class VoiceCoach {
    lastSpokenAt = new Map();
    muted = false;
    setMuted(nextMuted) {
        this.muted = nextMuted;
        if (nextMuted)
            this.stop();
    }
    get isMuted() {
        return this.muted;
    }
    speak({ key, message, minIntervalMs = 1600, interrupt = false }) {
        if (this.muted || !('speechSynthesis' in window) || message.trim() === '')
            return false;
        const now = performance.now();
        const previous = this.lastSpokenAt.get(key) ?? -Infinity;
        if (now - previous < minIntervalMs)
            return false;
        if (interrupt)
            window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = 'en-US';
        utterance.rate = 1;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
        this.lastSpokenAt.set(key, now);
        return true;
    }
    stop() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    }
}
