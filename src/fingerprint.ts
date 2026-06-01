import Fingerprint2 from 'fingerprintjs2';

// Simple fallback hashing standard to prevent collissions or loading lockups
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to a 32-bit integer
  }
  return 'bk_' + Math.abs(hash).toString(16).padStart(8, '0');
}

export function getDeviceFingerprint(): Promise<string> {
  return new Promise((resolve) => {
    try {
      if (typeof window === 'undefined') {
        resolve('bk_server_fingerprint');
        return;
      }

      // Collect specific device parameters required by specification
      const userAgent = navigator.userAgent || '';
      const screenRes = `${window.screen.width}x${window.screen.height}`;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const language = navigator.language || '';
      const cpuCores = navigator.hardwareConcurrency || 4;
      const deviceMemory = (navigator as any).deviceMemory || 4;

      // Extract canvas & WebGL data safely if possible
      let canvasFp = '';
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.textBaseline = "top";
          ctx.font = "14px 'Arial'";
          ctx.textBaseline = "alphabetic";
          ctx.fillStyle = "#f60";
          ctx.fillRect(125, 1, 62, 20);
          ctx.fillStyle = "#069";
          ctx.fillText("BINARY_KING_TRADING_FINGERPRINT", 2, 15);
          canvasFp = canvas.toDataURL();
        }
      } catch (e) {
        canvasFp = 'canvas_error';
      }

      const combinedData = [
        userAgent,
        screenRes,
        timezone,
        language,
        cpuCores,
        deviceMemory,
        canvasFp
      ].join('|');

      // Attempt loading Fingerprint2
      Fingerprint2.get((components) => {
        try {
          const values = components.map(c => c.value);
          const rawHash = Fingerprint2.x64hash128(values.join(''), 31);
          resolve(rawHash);
        } catch (e) {
          // If Fingerprint2 library fails, fallback to high-fidelity hash of compiled parameters
          resolve(simpleHash(combinedData));
        }
      });
    } catch (err) {
      // Ultimate absolute fallback
      const fallbackStr = typeof window !== 'undefined' 
        ? [navigator.userAgent, window.screen.width, window.screen.height].join('|')
        : 'server_default';
      resolve(simpleHash(fallbackStr));
    }
  });
}
