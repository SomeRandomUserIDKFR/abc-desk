/**
 * ABC Desk's player boundary.
 *
 * The current backend delegates to abcjs, but the application only depends on
 * this focused interface so a purpose-built scheduler can replace it later.
 */
export function createDeskPlayer({ abcjs, audioSelector, cursorControl }) {
  const supportsAudio = abcjs.synth.supportsAudio();
  let controller = null;

  return {
    supportsAudio,

    load() {
      if (!supportsAudio || controller) return;
      controller = new abcjs.synth.SynthController();
      controller.load(audioSelector, cursorControl, {
        displayLoop: true,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true,
        displayWarp: true,
      });
    },

    get loaded() {
      return Boolean(controller);
    },

    setTune(visualObj, audioParams) {
      if (!controller) return;
      controller.setTune(visualObj, false, audioParams);
      this.invalidate();
      controller.visualObj = visualObj;
      controller.options = audioParams;
      controller.disable(false);
    },

    disable(value) {
      controller?.disable(value);
    },

    invalidate() {
      if (!controller) return;
      try {
        if (typeof controller.pause === "function") controller.pause();
      } catch {
        /* cleanup is best effort */
      }
      if (controller.timer) {
        try {
          controller.timer.reset();
          controller.timer.stop();
        } catch {
          /* cleanup is best effort */
        }
        controller.timer = null;
      }
      if (controller.midiBuffer) {
        try {
          controller.midiBuffer.stop();
        } catch {
          /* cleanup is best effort */
        }
        controller.midiBuffer = null;
      }
      controller.isLoaded = false;
      controller.isLoading = false;
      controller.isStarted = false;
    },

    async createWav(visualObj, audioParams) {
      const synth = new abcjs.synth.CreateSynth();
      try {
        await synth.init({ visualObj, options: audioParams });
        await synth.prime();
        return { url: synth.download(), stop: () => synth.stop?.() };
      } catch (error) {
        synth.stop?.();
        throw error;
      }
    },
  };
}
