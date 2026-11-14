const MELODY_NOTES = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
const BASS_NOTES = [130.81, 146.83, 110, 130.81];
const NOTE_INTERVAL_MS = 1_700;

export class AmbientMusicController {
  private context: AudioContext | undefined;
  private oscillators: OscillatorNode[] = [];
  private masterGain: GainNode | undefined;
  private sequenceTimer: number | undefined;
  private noteIndex = 0;

  async toggle(): Promise<boolean> {
    if (this.context) {
      await this.stop();
      return false;
    }

    await this.start();
    return true;
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  private async start(): Promise<void> {
    if (this.context) return;
    if (typeof window.AudioContext !== "function") {
      throw new Error("Web Audio is not supported in this browser.");
    }

    const context = new window.AudioContext();
    this.context = context;

    try {
      await context.resume();
      if (this.context !== context) return;

      const master = context.createGain();
      master.gain.value = 0.12;
      master.connect(context.destination);

      const melodyGain = context.createGain();
      melodyGain.gain.value = 0.25;
      melodyGain.connect(master);

      const bassGain = context.createGain();
      bassGain.gain.value = 0.3;
      bassGain.connect(master);

      const melody = context.createOscillator();
      melody.type = "sine";
      melody.frequency.value = MELODY_NOTES[0];
      melody.connect(melodyGain);

      const bass = context.createOscillator();
      bass.type = "triangle";
      bass.frequency.value = BASS_NOTES[0];
      bass.connect(bassGain);

      melody.start();
      bass.start();

      this.masterGain = master;
      this.oscillators = [melody, bass];
      this.noteIndex = 0;
      this.sequenceTimer = window.setInterval(() => {
        this.noteIndex = (this.noteIndex + 1) % MELODY_NOTES.length;
        melody.frequency.setTargetAtTime(MELODY_NOTES[this.noteIndex], context.currentTime, 0.25);
        if (this.noteIndex % 4 === 0) {
          const bassIndex = Math.floor(this.noteIndex / 2) % BASS_NOTES.length;
          bass.frequency.setTargetAtTime(BASS_NOTES[bassIndex], context.currentTime, 0.5);
        }
      }, NOTE_INTERVAL_MS);
    } catch (error) {
      if (this.context === context) this.context = undefined;
      if (context.state !== "closed") await context.close();
      throw error;
    }
  }

  private async stop(): Promise<void> {
    const context = this.context;
    if (!context) return;
    this.context = undefined;

    if (this.sequenceTimer !== undefined) window.clearInterval(this.sequenceTimer);
    this.sequenceTimer = undefined;

    for (const oscillator of this.oscillators) {
      oscillator.stop();
      oscillator.disconnect();
    }
    this.oscillators = [];
    this.masterGain?.disconnect();
    this.masterGain = undefined;

    if (context.state !== "closed") await context.close();
  }
}
